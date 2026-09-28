-- Mine -> Engineer Match: automatic engineer account on first handoff.
--
-- Before this migration, the one-time SSO handoff (100/103) worked only for
-- Mine users that had already linked an Engineer Match account through the
-- manual /mine-link login (098). A Mine-only user reached Engineer Match's
-- login form instead of being signed in.
--
-- Identity model (owner decision, 2026-09-28): Mine and Engineer Match share
-- one Supabase project, so auth.users.email is unique across both apps and a
-- second account with the user's real address cannot exist. Instead of a
-- synthetic internal account (Kenshu Link's model -- Kenshu is a separate
-- project), the Mine account itself becomes the Engineer Match engineer:
-- public.users.role INDIVIDUAL -> ENGINEER, linked to itself. Companies see
-- the real email, and no second auth user is ever created, so duplicate
-- accounts are impossible by construction. Browser sessions stay separate:
-- each app keeps its own host-only session cookies.
--
-- No engineer_profiles row is created: a normal Engineer Match signup has
-- none either, and trg_engineer_profiles_required_fields (075) rejects a row
-- without real prefecture / experience / work style / hourly rates.
--
-- Security properties:
--   * create_mine_engineer_sso_token() takes the Mine user from auth.uid()
--     only and still validates the return path server-side. An unlinked user
--     additionally needs an enabled 'engineer_match' consent row.
--   * consume_mine_engineer_sso_token() stays service_role-only. It consumes
--     the ticket first; provisioning errors are caught inside a sub-block so
--     the consumption still commits -- a ticket is never reusable, even after
--     a failed attempt. Failure is signalled by returning no row.
--   * A per-Mine-user advisory lock serialises concurrent handoffs; the link
--     insert is ON CONFLICT DO NOTHING and re-read, so repeated or parallel
--     handoffs converge on one link.
--   * Only INDIVIDUAL (upgraded) or ENGINEER (kept) accounts can be
--     provisioned; COMPANY / INSTRUCTOR / ADMIN are refused, and the account
--     must be ACTIVE with a verified email.

ALTER TABLE public.mine_engineer_sso_requests
    ALTER COLUMN engineer_user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.create_mine_engineer_sso_token(p_return_path TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mine UUID := auth.uid();
  v_engineer UUID;
  v_token TEXT;
BEGIN
  IF v_mine IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_return_path IS NULL
     OR (p_return_path <> '/engineer/jobs'
         AND p_return_path !~ '^/engineer/jobs/[0-9a-fA-F-]{36}$') THEN
    RAISE EXCEPTION 'invalid return path' USING ERRCODE = '22023';
  END IF;

  SELECT l.engineer_user_id INTO v_engineer
  FROM public.mine_engineer_account_links l
  WHERE l.mine_user_id = v_mine;

  IF v_engineer IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.mine_service_preferences p
    WHERE p.user_id = v_mine
      AND p.service_code = 'engineer_match'
      AND p.is_enabled = TRUE
  ) THEN
    RAISE EXCEPTION 'Engineer Match connection consent required' USING ERRCODE = '42501';
  END IF;

  v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', '')
    || pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', '');

  -- engineer_user_id may be NULL here: the account is provisioned when
  -- Engineer Match consumes the ticket.
  INSERT INTO public.mine_engineer_sso_requests
    (mine_user_id, engineer_user_id, token_digest, return_path, expires_at)
  VALUES
    (v_mine, v_engineer, pg_catalog.md5(v_token), p_return_path,
     pg_catalog.clock_timestamp() + INTERVAL '2 minutes');

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_mine_engineer_sso_token(p_token TEXT)
RETURNS TABLE(engineer_user_id UUID, return_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_mine UUID;
  v_engineer UUID;
  v_return TEXT;
  v_email TEXT;
  v_confirmed TIMESTAMPTZ;
  v_meta JSONB;
  v_role TEXT;
  v_status TEXT;
  v_name TEXT;
BEGIN
  -- 1. Consume the ticket exactly once. The row lock taken by UPDATE makes a
  --    concurrent second consumer wait and then match zero rows.
  UPDATE public.mine_engineer_sso_requests r
  SET consumed_at = pg_catalog.clock_timestamp()
  WHERE r.token_digest = pg_catalog.md5(COALESCE(p_token, ''))
    AND r.consumed_at IS NULL
    AND r.expires_at > pg_catalog.clock_timestamp()
  RETURNING r.mine_user_id, r.engineer_user_id, r.return_path
  INTO v_mine, v_engineer, v_return;

  IF v_mine IS NULL THEN
    RAISE EXCEPTION 'handoff token is invalid or expired' USING ERRCODE = '22023';
  END IF;

  -- 2. Resolve or provision the engineer account.
  IF v_engineer IS NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('mine_engineer_link:' || v_mine::TEXT, 0));

    -- Another handoff may have linked this user while the ticket was open.
    SELECT l.engineer_user_id INTO v_engineer
    FROM public.mine_engineer_account_links l
    WHERE l.mine_user_id = v_mine;
  END IF;

  IF v_engineer IS NULL THEN
    BEGIN
      SELECT u.email, u.email_confirmed_at, u.raw_user_meta_data
      INTO v_email, v_confirmed, v_meta
      FROM auth.users u
      WHERE u.id = v_mine;

      IF v_email IS NULL OR v_confirmed IS NULL THEN
        RAISE EXCEPTION 'verified email required' USING ERRCODE = '42501';
      END IF;

      SELECT pu.role, pu.status INTO v_role, v_status
      FROM public.users pu
      WHERE pu.id = v_mine
      FOR UPDATE;

      IF NOT FOUND THEN
        SELECT pg_catalog.left(pg_catalog.btrim(mp.display_name), 50) INTO v_name
        FROM public.mine_profiles mp
        WHERE mp.user_id = v_mine;

        v_name := pg_catalog.left(COALESCE(
          NULLIF(v_name, ''),
          NULLIF(pg_catalog.btrim(v_meta ->> 'name'), ''),
          NULLIF(pg_catalog.btrim(v_meta ->> 'full_name'), ''),
          pg_catalog.split_part(v_email, '@', 1)
        ), 50);

        INSERT INTO public.users (id, role, name, email)
        VALUES (v_mine, 'ENGINEER', v_name, pg_catalog.lower(v_email));
      ELSIF v_status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'account is not active' USING ERRCODE = '42501';
      ELSIF v_role = 'INDIVIDUAL' THEN
        UPDATE public.users SET role = 'ENGINEER' WHERE id = v_mine;
      ELSIF v_role IS DISTINCT FROM 'ENGINEER' THEN
        RAISE EXCEPTION 'account role % cannot become an engineer', v_role
          USING ERRCODE = '42501';
      END IF;

      INSERT INTO public.mine_engineer_account_links (mine_user_id, engineer_user_id)
      VALUES (v_mine, v_mine)
      ON CONFLICT (mine_user_id) DO NOTHING;

      SELECT l.engineer_user_id INTO v_engineer
      FROM public.mine_engineer_account_links l
      WHERE l.mine_user_id = v_mine;
    EXCEPTION WHEN OTHERS THEN
      -- Roll back only the provisioning; the ticket consumption above
      -- still commits.
      RAISE WARNING 'Mine to Engineer Match provisioning failed: %', SQLERRM;
      RETURN;
    END;
  END IF;

  -- 3. Only an active engineer account may receive a session.
  IF NOT EXISTS (
    SELECT 1 FROM public.users pu
    WHERE pu.id = v_engineer AND pu.role = 'ENGINEER' AND pu.status = 'ACTIVE'
  ) THEN
    RETURN;
  END IF;

  engineer_user_id := v_engineer;
  return_path := v_return;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_mine_engineer_sso_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_mine_engineer_sso_token(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_mine_engineer_sso_token(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_mine_engineer_sso_token(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_mine_engineer_sso_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_mine_engineer_sso_token(TEXT) TO service_role;
