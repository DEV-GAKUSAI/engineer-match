-- Secure, one-time Mine-to-Engineer Match session handoff.
CREATE TABLE public.mine_engineer_sso_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mine_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engineer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  return_path TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.mine_engineer_sso_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX mine_engineer_sso_requests_active_idx ON public.mine_engineer_sso_requests (token_digest, expires_at) WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_mine_engineer_sso_token(p_return_path TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_mine UUID := auth.uid(); v_engineer UUID; v_token TEXT;
BEGIN
  IF v_mine IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF p_return_path !~ '^/engineer/jobs/[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'invalid return path' USING ERRCODE = '22023'; END IF;
  SELECT engineer_user_id INTO v_engineer FROM public.mine_engineer_account_links WHERE mine_user_id = v_mine;
  IF v_engineer IS NULL THEN RAISE EXCEPTION 'Engineer Match account is not linked' USING ERRCODE = '42501'; END IF;
  v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', '') || pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', '');
  INSERT INTO public.mine_engineer_sso_requests (mine_user_id, engineer_user_id, token_digest, return_path, expires_at)
  VALUES (v_mine, v_engineer, pg_catalog.md5(v_token), p_return_path, pg_catalog.clock_timestamp() + INTERVAL '2 minutes');
  RETURN v_token;
END; $$;

CREATE OR REPLACE FUNCTION public.consume_mine_engineer_sso_token(p_token TEXT)
RETURNS TABLE(engineer_user_id UUID, return_path TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY UPDATE public.mine_engineer_sso_requests
  SET consumed_at = pg_catalog.clock_timestamp()
  WHERE token_digest = pg_catalog.md5(COALESCE(p_token, '')) AND consumed_at IS NULL AND expires_at > pg_catalog.clock_timestamp()
  RETURNING mine_engineer_sso_requests.engineer_user_id, mine_engineer_sso_requests.return_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'handoff token is invalid or expired' USING ERRCODE = '22023'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.create_mine_engineer_sso_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_mine_engineer_sso_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_mine_engineer_sso_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_mine_engineer_sso_token(TEXT) TO service_role;
