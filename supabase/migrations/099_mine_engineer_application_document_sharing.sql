-- Apply ONCE to the shared Supabase database, after Mine migrations 083-098.
-- Pending snapshots are private. Only selected snapshots become company-readable.
BEGIN;

-- These optional fields are already used by Mine's profile/preview UI but
-- were missing from its checked-in migrations. Preserve existing values.
ALTER TABLE public.mine_profiles
  ADD COLUMN IF NOT EXISTS display_name_furigana text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS address_furigana text,
  ADD COLUMN IF NOT EXISTS commute_time_minutes integer,
  ADD COLUMN IF NOT EXISTS dependents_count integer,
  ADD COLUMN IF NOT EXISTS has_spouse boolean,
  ADD COLUMN IF NOT EXISTS spouse_support_obligation boolean,
  ADD COLUMN IF NOT EXISTS personal_request text,
  ADD COLUMN IF NOT EXISTS motivation text,
  ADD COLUMN IF NOT EXISTS special_skills text;

CREATE TABLE public.mine_engineer_application_share_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mine_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  token_digest text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  application_id uuid REFERENCES public.applications(id),
  documents jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.mine_engineer_application_share_requests(engineer_user_id, expires_at);

CREATE TABLE public.application_mine_document_shares (
  application_id uuid PRIMARY KEY REFERENCES public.applications(id) ON DELETE RESTRICT,
  mine_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  shared_rirekisho boolean NOT NULL,
  shared_shokumu_keirekisho boolean NOT NULL,
  rirekisho_snapshot jsonb,
  shokumu_keirekisho_snapshot jsonb,
  consented_at timestamptz NOT NULL DEFAULT now(),
  CHECK (shared_rirekisho = (rirekisho_snapshot IS NOT NULL)),
  CHECK (shared_shokumu_keirekisho = (shokumu_keirekisho_snapshot IS NOT NULL))
);
ALTER TABLE public.mine_engineer_application_share_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_mine_document_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mine_engineer_application_share_requests FROM anon, authenticated;
REVOKE ALL ON public.application_mine_document_shares FROM anon, authenticated;
GRANT SELECT ON public.application_mine_document_shares TO authenticated;

CREATE POLICY application_mine_documents_read ON public.application_mine_document_shares
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id
    AND (a.applicant_id = (SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.opportunities o WHERE o.id = a.opportunity_id
        AND o.posted_by = (SELECT auth.uid())
    )))
);

-- Preserve instructor/training INSERT policies; engineering submissions use consent.
CREATE POLICY applications_engineer_consent_required ON public.applications
AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  (SELECT private.current_user_role()) <> 'ENGINEER'
);

-- An explicit allowlist prevents private profile fields added later from leaking.
-- Labels are persisted too, so preview and recipient see the same document.
CREATE FUNCTION private.mine_application_documents(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
WITH profile AS (
  SELECT p.*, u.email FROM public.mine_profiles p
  JOIN auth.users u ON u.id = p.user_id WHERE p.user_id = p_user_id
), qualifications AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    '資格', name, '取得日', obtained_date, '発行機関', organization,
    '級', level, 'スコア', score) ORDER BY obtained_date NULLS LAST, id), '[]'::jsonb) AS items
  FROM public.mine_qualifications WHERE user_id = p_user_id
)
SELECT jsonb_build_object(
  'rirekisho', jsonb_build_object('version', 1, 'title', '履歴書', 'content', jsonb_build_object(
    '基本情報', jsonb_build_object('氏名', p.display_name, 'ふりがな', p.display_name_furigana,
      '生年月日', p.date_of_birth, '性別', p.gender, '国籍', p.nationality,
      '郵便番号', p.postal_code, '住所', COALESCE(p.address, p.residential_area),
      '住所ふりがな', p.address_furigana, '電話番号', p.phone_number, 'メール', p.email),
    '学歴', (SELECT COALESCE(jsonb_agg(jsonb_build_object('学校', school_name, '学位', degree,
      '開始', start_date, '終了', end_date) ORDER BY start_date NULLS LAST, id), '[]'::jsonb)
      FROM public.mine_educations WHERE user_id = p_user_id),
    '職歴', (SELECT COALESCE(jsonb_agg(jsonb_build_object('会社', company_name, '役職', position,
      '開始', start_date, '終了', end_date, '在職中', is_current) ORDER BY start_date NULLS LAST, id), '[]'::jsonb)
      FROM public.mine_work_experiences WHERE user_id = p_user_id),
    '資格', q.items, '志望動機', p.motivation, '自己紹介', p.self_introduction,
    '特技', p.special_skills, '本人希望', p.personal_request,
    '通勤時間（分）', p.commute_time_minutes, '扶養人数', p.dependents_count,
    '配偶者あり', p.has_spouse, '配偶者扶養義務', p.spouse_support_obligation)),
  'shokumu', jsonb_build_object('version', 1, 'title', '職務経歴書', 'content', jsonb_build_object(
    '氏名', p.display_name, '職務要約', p.professional_summary, '自己紹介', p.self_introduction,
    '職務経歴', (SELECT COALESCE(jsonb_agg(jsonb_build_object('会社', company_name, '役職', position,
      '雇用形態', employment_type, '開始', start_date, '終了', end_date,
      '在職中', is_current, '職務内容', description) ORDER BY start_date DESC NULLS LAST, id), '[]'::jsonb)
      FROM public.mine_work_experiences WHERE user_id = p_user_id),
    '資格', q.items,
    'スキル', (SELECT COALESCE(jsonb_agg(jsonb_build_object('スキル', c.name,
      'レベル', l.label_ja, '経験年数', s.years_of_experience) ORDER BY c.name), '[]'::jsonb)
      FROM public.mine_user_skills s JOIN public.mine_skill_catalog c ON c.id = s.skill_id
      LEFT JOIN public.mine_skill_levels l ON l.level = s.skill_level
      WHERE s.user_id = p_user_id AND c.is_active),
    '職種', (SELECT COALESCE(jsonb_agg(o.name ORDER BY o.name), '[]'::jsonb)
      FROM public.mine_user_occupations u JOIN public.mine_occupations o ON o.id = u.occupation_id
      WHERE u.user_id = p_user_id)))
) FROM profile p CROSS JOIN qualifications q;
$$;
REVOKE ALL ON FUNCTION private.mine_application_documents(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_mine_engineer_application_share_token(p_opportunity_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_mine uuid; v_token text;
BEGIN
  -- Serializes issuance for this engineer; a newer link replaces pending links.
  PERFORM 1 FROM public.users WHERE id = auth.uid() AND role = 'ENGINEER' AND status = 'ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active engineer required' USING ERRCODE = '42501'; END IF;
  SELECT mine_user_id INTO v_mine FROM public.mine_engineer_account_links WHERE engineer_user_id = auth.uid();
  IF v_mine IS NULL THEN RAISE EXCEPTION 'linked Mine account required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.opportunities WHERE id = p_opportunity_id
    AND side = 'ENGINEER' AND status = 'published' AND NOT unpublished_by_admin
    AND deleted_at IS NULL AND contract_type IN ('employment', 'project', 'hourly')) THEN
    RAISE EXCEPTION 'opportunity unavailable' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.applications WHERE opportunity_id = p_opportunity_id AND applicant_id = auth.uid()) THEN
    RAISE EXCEPTION 'application already exists' USING ERRCODE = '23505';
  END IF;
  DELETE FROM public.mine_engineer_application_share_requests
    WHERE engineer_user_id = auth.uid() AND (expires_at < clock_timestamp()
      OR (opportunity_id = p_opportunity_id AND consumed_at IS NULL));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.mine_engineer_application_share_requests(engineer_user_id, mine_user_id, opportunity_id, token_digest, expires_at)
    VALUES (auth.uid(), v_mine, p_opportunity_id, md5(v_token), clock_timestamp() + interval '10 minutes');
  RETURN v_token;
END;
$$;

CREATE FUNCTION public.get_mine_engineer_application_share_request(p_token text)
RETURNS TABLE(opportunity_id uuid, opportunity_title text, company_name text,
  expires_at timestamptz, documents jsonb, application_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.mine_engineer_application_share_requests;
BEGIN
  SELECT req.* INTO r FROM public.mine_engineer_application_share_requests req
    JOIN public.mine_engineer_account_links l ON l.engineer_user_id = req.engineer_user_id AND l.mine_user_id = req.mine_user_id
    WHERE req.mine_user_id = auth.uid() AND req.token_digest = md5(COALESCE(p_token, ''))
      AND req.expires_at > clock_timestamp() FOR UPDATE OF req;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid or expired request' USING ERRCODE = '22023'; END IF;
  IF r.consumed_at IS NULL AND r.documents IS NULL THEN
    r.documents := private.mine_application_documents(auth.uid());
    IF r.documents IS NULL THEN RAISE EXCEPTION 'Mine profile required' USING ERRCODE = '22023'; END IF;
    UPDATE public.mine_engineer_application_share_requests req SET documents = r.documents WHERE req.id = r.id;
  END IF;
  RETURN QUERY SELECT o.id, o.title::text, cp.company_name::text, r.expires_at, r.documents, r.application_id
    FROM public.opportunities o LEFT JOIN public.company_profiles cp ON cp.id = o.posted_by WHERE o.id = r.opportunity_id;
END;
$$;

CREATE FUNCTION public.complete_mine_engineer_application_share_request(
  p_token text, p_shared_rirekisho boolean, p_shared_shokumu_keirekisho boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.mine_engineer_application_share_requests; v_id uuid;
BEGIN
  IF p_shared_rirekisho IS NULL OR p_shared_shokumu_keirekisho IS NULL THEN
    RAISE EXCEPTION 'explicit selections required' USING ERRCODE = '22023';
  END IF;
  SELECT req.* INTO r FROM public.mine_engineer_application_share_requests req
    JOIN public.mine_engineer_account_links l ON l.engineer_user_id = req.engineer_user_id AND l.mine_user_id = req.mine_user_id
    WHERE req.mine_user_id = auth.uid() AND req.token_digest = md5(COALESCE(p_token, ''))
      AND req.expires_at > clock_timestamp() FOR UPDATE OF req, l;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid or expired request' USING ERRCODE = '22023'; END IF;
  -- A lost response may be retried without creating another application or changing consent.
  IF r.consumed_at IS NOT NULL THEN RETURN r.application_id; END IF;
  IF r.documents IS NULL THEN RAISE EXCEPTION 'preview required' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.users WHERE id = r.engineer_user_id AND role = 'ENGINEER' AND status = 'ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active engineer required' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.opportunities WHERE id = r.opportunity_id
    AND side = 'ENGINEER' AND status = 'published' AND NOT unpublished_by_admin AND deleted_at IS NULL
    AND contract_type IN ('employment', 'project', 'hourly') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'opportunity unavailable' USING ERRCODE = '22023'; END IF;
  -- Locks may have waited behind another transaction; check the wall clock again.
  IF r.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'expired request' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.applications(opportunity_id, applicant_id, status)
    VALUES (r.opportunity_id, r.engineer_user_id, 'applied') RETURNING id INTO v_id;
  INSERT INTO public.application_mine_document_shares(application_id, mine_user_id,
    shared_rirekisho, shared_shokumu_keirekisho, rirekisho_snapshot, shokumu_keirekisho_snapshot)
    VALUES(v_id, auth.uid(), p_shared_rirekisho, p_shared_shokumu_keirekisho,
      CASE WHEN p_shared_rirekisho THEN r.documents->'rirekisho' END,
      CASE WHEN p_shared_shokumu_keirekisho THEN r.documents->'shokumu' END);
  UPDATE public.mine_engineer_application_share_requests SET consumed_at = clock_timestamp(),
    application_id = v_id, documents = NULL WHERE id = r.id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_mine_engineer_application_share_token(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_mine_engineer_application_share_request(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_mine_engineer_application_share_request(text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_mine_engineer_application_share_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mine_engineer_application_share_request(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mine_engineer_application_share_request(text, boolean, boolean) TO authenticated;
COMMIT;
