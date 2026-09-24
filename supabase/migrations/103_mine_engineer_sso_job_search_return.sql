-- Allow Mine SSO to return either to a job detail or to the Engineer Match job-search list.
CREATE OR REPLACE FUNCTION public.create_mine_engineer_sso_token(p_return_path TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_mine UUID := auth.uid(); v_engineer UUID; v_token TEXT;
BEGIN
  IF v_mine IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF p_return_path <> '/engineer/jobs'
     AND p_return_path !~ '^/engineer/jobs/[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION 'invalid return path' USING ERRCODE = '22023';
  END IF;
  SELECT engineer_user_id INTO v_engineer
  FROM public.mine_engineer_account_links
  WHERE mine_user_id = v_mine;
  IF v_engineer IS NULL THEN
    RAISE EXCEPTION 'Engineer Match account is not linked' USING ERRCODE = '42501';
  END IF;
  v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', '')
    || pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', '');
  INSERT INTO public.mine_engineer_sso_requests
    (mine_user_id, engineer_user_id, token_digest, return_path, expires_at)
  VALUES
    (v_mine, v_engineer, pg_catalog.md5(v_token), p_return_path,
     pg_catalog.clock_timestamp() + INTERVAL '2 minutes');
  RETURN v_token;
END; $$;

REVOKE ALL ON FUNCTION public.create_mine_engineer_sso_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_mine_engineer_sso_token(TEXT) TO authenticated;
