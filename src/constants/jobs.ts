/**
 * Engineer Job Search module content (Japanese).
 * Real Supabase-backed data (see src/lib/engineer/opportunities.ts) against
 * public.opportunities + opportunity_employment/project/hourly +
 * opportunity_required_skills + company_profiles. Option values below are
 * DB enum values and must match the CHECK constraints in
 * supabase/migrations/005-010 exactly.
 *
 * Fields with no DB backing in the original UI-only mock (location,
 * ITSS level, experience years, preferred skills, work-conditions table,
 * benefits, selection flow, employment condition disclosure) have been
 * dropped rather than fabricated.
 */

// ============================================================
// Shared vocabulary (DB enum values + display labels)
// ============================================================

import { WORK_STYLE_OPTIONS } from "@/constants/contract-type";

export {
  CONTRACT_TYPE_OPTIONS,
  CONTRACT_TYPE_LABEL,
  CONTRACT_TYPE_BADGE_STYLES,
  WORK_STYLE_OPTIONS,
  WORK_STYLE_LABEL,
  WORK_STYLE_BADGE_STYLES,
} from "@/constants/contract-type";
export type WorkStyleFilterValue = (typeof WORK_STYLE_OPTIONS)[number]["value"] | "";

export const SORT_OPTIONS = [
  { value: "newest", label: "新しい順" },
  { value: "oldest", label: "古い順" },
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

// ============================================================
// Search header / filters
// ============================================================

export const SEARCH_HEADER = {
  title: "求人・案件検索",
  description: "あなたに合った求人・案件を検索できます。",
  searchPlaceholder: "求人タイトルで検索",
  searchButtonLabel: "検索",
  searchLabel: "求人・案件を検索",
} as const;

export const FILTER_LABELS = {
  title: "絞り込み条件",
  searchLabel: "求人を検索",
  searchPlaceholder: "求人タイトル・仕事内容で検索",
  contractTypeLabel: "契約形態",
  contractTypeAllLabel: "すべての契約形態",
  sortLabel: "並び替え",
  resetLabel: "条件をリセット",
  skillLabel: "必須スキル",
  skillPlaceholder: "スキル名で検索",
  skillSelectedCountSuffix: "件選択中",
  skillEmptyMessage: "登録されているスキルがありません。",
  workStyleLabel: "勤務形態",
  workStyleAllLabel: "すべての勤務形態",
  workStyleUnavailableNote:
    "契約形態が「就職」「時間単価」または「すべて」の場合に選択できます。",
} as const;

// ============================================================
// Job list / job card
// ============================================================

export const JOB_LIST_META = {
  resultsSuffix: "件の求人・案件が見つかりました",
  bookmarkLabel: "お気に入りに追加",
  bookmarkedLabel: "お気に入り済み",
  detailButtonLabel: "詳細を見る",
  updatedPrefix: "更新：",
} as const;

export const LOADING_STATE_LABELS = {
  message: "求人・案件を読み込んでいます…",
} as const;

export const ERROR_STATE_LABELS = {
  title: "求人・案件の読み込みに失敗しました。",
  description: "しばらくしてから再度お試しください。",
  retryLabel: "再読み込み",
} as const;

export const EMPTY_STATE_LABELS = {
  title: "条件に一致する求人・案件が見つかりませんでした。",
  description: "検索キーワードや絞り込み条件を変更してお試しください。",
  resetLabel: "条件をリセット",
} as const;

export const NO_JOBS_STATE_LABELS = {
  title: "現在公開されている求人・案件はありません。",
  description: "しばらくしてから再度ご確認ください。",
} as const;

export const SIGN_IN_REQUIRED_LABELS = {
  title: "ログインが必要です。",
  description: "求人・案件の閲覧にはログインが必要です。",
  ctaLabel: "ログイン",
  ctaHref: "/login",
} as const;

// ============================================================
// Job detail
// ============================================================

export const JOB_DETAIL_META = {
  backLabel: "求人一覧に戻る",
  backHref: "/engineer/jobs",
} as const;

export const JOB_DETAIL_SECTION_LABELS = {
  descriptionTitle: "仕事内容",
  requiredSkillsTitle: "必須スキル",
  customRequiredSkillsNoteTitle: "その他の必須スキル",
  companyInfoTitle: "企業情報",
} as const;

export const COMPANY_INFO_LABELS = {
  businessLabel: "事業内容",
  industryLabel: "業種",
  employeesLabel: "従業員数",
  prefectureLabel: "所在地",
  establishedYearLabel: "設立年",
  websiteLabel: "コーポレートサイト",
} as const;

export const JOB_NOT_FOUND_LABELS = {
  title: "求人・案件が見つかりませんでした。",
  description: "掲載が終了しているか、URLが正しくない可能性があります。",
  ctaLabel: "求人一覧に戻る",
} as const;

// ============================================================
// Apply sidebar
// ============================================================

export const APPLY_SIDEBAR_LABELS = {
  applyLabel: "応募する",
  applying: "Mineを開いています…",
  alreadyAppliedLabel: "応募済み",
  favoriteLabel: "お気に入り",
  favoritedLabel: "お気に入り済み",
  updatedLabel: "更新日",
  appliedMessage: "応募を受け付けました。",
  mineLinkRequiredMessage: "応募するには、Mineアカウントの連携が必要です。Mineのサービス画面からEngineer Matchを連携してください。",
  mineConsentStartErrorMessage: "Mineの書類共有画面を開けませんでした。もう一度お試しください。",
  duplicateApplicationMessage: "この求人・案件にはすでに応募済みです。",
  applyErrorMessage: "応募処理に失敗しました。しばらくしてから再度お試しください。",
  favoriteErrorMessage: "お気に入り処理に失敗しました。しばらくしてから再度お試しください。",
  signInRequiredMessage: "応募にはログインが必要です。",
} as const;
