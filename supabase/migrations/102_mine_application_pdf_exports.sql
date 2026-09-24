-- Immutable, applicant-approved Mine document PDFs for Engineer Match applications.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mine-application-pdfs', 'mine-application-pdfs', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.application_mine_document_shares
  ADD COLUMN IF NOT EXISTS rirekisho_pdf_path text,
  ADD COLUMN IF NOT EXISTS shokumu_keirekisho_pdf_path text;

CREATE OR REPLACE FUNCTION public.set_mine_application_pdf_paths(
  p_application_id uuid, p_rirekisho_path text, p_shokumu_path text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_mine uuid := auth.uid(); v_prefix text;
BEGIN
  IF v_mine IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  v_prefix := v_mine::text || '/' || p_application_id::text || '/';
  IF (p_rirekisho_path IS NOT NULL AND p_rirekisho_path <> v_prefix || 'rirekisho.pdf')
     OR (p_shokumu_path IS NOT NULL AND p_shokumu_path <> v_prefix || 'shokumu-keirekisho.pdf') THEN
    RAISE EXCEPTION 'invalid document path' USING ERRCODE='22023';
  END IF;
  UPDATE public.application_mine_document_shares
  SET rirekisho_pdf_path = COALESCE(rirekisho_pdf_path, p_rirekisho_path),
      shokumu_keirekisho_pdf_path = COALESCE(shokumu_keirekisho_pdf_path, p_shokumu_path)
  WHERE application_id = p_application_id AND mine_user_id = v_mine;
  IF NOT FOUND THEN RAISE EXCEPTION 'application document share not found' USING ERRCODE='42501'; END IF;
  RETURN true;
END; $$;

CREATE POLICY mine_application_pdfs_insert_own ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'mine-application-pdfs' AND (storage.foldername(name))[1] = (select auth.uid())::text);
CREATE POLICY mine_application_pdfs_select_own ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'mine-application-pdfs' AND (storage.foldername(name))[1] = (select auth.uid())::text);

REVOKE ALL ON FUNCTION public.set_mine_application_pdf_paths(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_mine_application_pdf_paths(uuid,text,text) TO authenticated;