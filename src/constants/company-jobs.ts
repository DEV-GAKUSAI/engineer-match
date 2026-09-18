/**
 * Company job management module content (Japanese).
 * Real Supabase-backed CRUD (see src/lib/company/jobs.ts) against
 * public.opportunities + opportunity_employment/project/hourly +
 * opportunity_required_skills. Option values below are DB enum values and
 * must match the CHECK constraints in supabase/migrations/005-010 exactly —
 * Japanese labels are display-only, never sent to Supabase.
 */

// ============================================================
// Shared vocabulary (DB enum values + display labels)
// ============================================================

export {
  CONTRACT_TYPE_OPTIONS,
  CONTRACT_TYPE_LABEL,
  CONTRACT_TYPE_BADGE_STYLES,
  WORK_STYLE_OPTIONS,
  WORK_STYLE_LABEL,
  WORK_STYLE_BADGE_STYLES,
} from "@/constants/contract-type";
export type { CompanyContractType } from "@/constants/contract-type";

export const JOB_STATUS_OPTIONS = [
  { value: "draft", label: "下書き" },
  { value: "published", label: "募集中" },
  { value: "closed", label: "募集終了" },
] as const;
export type JobStatus = (typeof JOB_STATUS_OPTIONS)[number]["value"];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  draft: "下書き",
  published: "募集中",
  closed: "募集終了",
};

export const JOB_STATUS_BADGE_STYLES: Record<JobStatus, string> = {
  published: "bg-green-50 text-green-700",
  draft: "bg-amber-50 text-amber-700",
  closed: "bg-gray-100 text-gray-600",
};

// ============================================================
// Job management — page / list meta
// ============================================================

export const JOB_MANAGEMENT_META = {
  title: "求人・案件管理",
  description: "掲載中の求人・案件を確認・管理できます。",
  createLabel: "新規掲載",
  createHref: "/company/jobs/new",
} as const;

export const JOB_SUMMARY_CARD_META = [
  { key: "published", label: "募集中", icon: "briefcase", statuses: ["published"] as JobStatus[] },
  { key: "closed", label: "公開終了", icon: "archive", statuses: ["closed"] as JobStatus[] },
  { key: "draft", label: "下書き", icon: "filePenLine", statuses: ["draft"] as JobStatus[] },
] as const;

export const JOB_FILTER_LABELS = {
  searchLabel: "求人を検索",
  searchPlaceholder: "求人タイトルで検索",
  statusLabel: "ステータス",
  statusAllLabel: "すべてのステータス",
  contractTypeLabel: "契約形態",
  contractTypeAllLabel: "すべての契約形態",
  sortLabel: "並び替え",
  resetLabel: "条件をリセット",
} as const;

export const SORT_OPTIONS = [
  { value: "newest", label: "新しい順" },
  { value: "oldest", label: "古い順" },
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export const JOB_CARD_LABELS = {
  detailLabel: "詳細",
  editLabel: "編集",
  applicantsLabel: "応募者確認",
  closeLabel: "募集終了",
  applicantCountPrefix: "応募",
  applicantCountSuffix: "名",
  createdPrefix: "作成日：",
  updatedPrefix: "更新日：",
} as const;

export const EMPTY_STATE_LABELS = {
  title: "掲載中の求人・案件はありません。",
  description: "新しい求人・案件を作成して、エンジニアからの応募を募集しましょう。",
  ctaLabel: "新規掲載",
} as const;

export const FILTERED_EMPTY_STATE_LABELS = {
  title: "条件に一致する求人・案件が見つかりませんでした。",
  description: "検索キーワードや絞り込み条件を変更してお試しください。",
  ctaLabel: "条件をリセット",
} as const;

export const CLOSE_RECRUITMENT_DIALOG_LABELS = {
  title: "本当にこの求人の募集を終了しますか？",
  description:
    "募集を終了すると、この求人は新規応募を受け付けなくなります。この求人・案件の削除はサポートされていないため、募集終了のみ行えます。",
  cancelLabel: "キャンセル",
  confirmLabel: "募集を終了する",
  toastMessage: "募集を終了しました。",
  errorMessage: "募集終了処理に失敗しました。しばらくしてから再度お試しください。",
} as const;

// ============================================================
// Job detail
// ============================================================

export const JOB_DETAIL_META = {
  backLabel: "求人一覧に戻る",
  backHref: "/company/jobs",
  jobInfoTitle: "求人情報",
  requiredSkillsTitle: "必須スキル",
  customRequiredSkillsNoteTitle: "その他の必須スキル",
  editLabel: "編集",
  closeLabel: "募集終了",
  createdLabel: "作成日",
  updatedLabel: "更新日",
} as const;

// ============================================================
// Create / edit job form
// ============================================================

export const JOB_FORM_SECTION_LABELS = {
  basicInfo: "基本情報",
  matchingRequirements: "マッチング条件",
  employmentDetails: "就職条件",
  projectDetails: "案件条件",
  hourlyDetails: "時間精算条件",
  requiredSkills: "必須スキル",
  preferredSkills: "歓迎スキル",
} as const;

export const JOB_FORM_FIELDS = {
  title: {
    label: "求人タイトル",
    placeholder: "例：フロントエンドエンジニア（React / TypeScript）",
  },
  description: { label: "仕事内容", placeholder: "業務内容を入力してください" },
  contractType: { label: "契約形態" },
  contractTypeLockedNote: "契約形態は作成後に変更できません。",
  status: { label: "公開ステータス" },
  targetRole: { label: "募集ロール", placeholder: "選択してください" },
  workStyle: { label: "勤務形態" },
  workStylePlaceholder: "選択してください",
  salaryMin: { label: "年収下限（万円）" },
  salaryMax: { label: "年収上限（万円）" },
  deadline: { label: "応募締切" },
  budget: { label: "予算（万円）" },
  headcount: { label: "募集人数" },
  isOnlineProject: { label: "オンライン案件" },
  isOnlineUnspecified: "未指定",
  isOnlineYes: "オンライン可",
  isOnlineNo: "オンライン不可",
  periodStart: { label: "稼働開始日" },
  periodEnd: { label: "稼働終了日" },
  timeStart: { label: "稼働開始時刻" },
  timeEnd: { label: "稼働終了時刻" },
  hourlyRate: { label: "時給（円）" },
  requiredSkills: {
    label: "必須スキル",
    searchPlaceholder: "スキル名で検索",
    emptyMessage: "登録されているスキルがありません。",
    selectedCountSuffix: "件選択中",
  },
  preferredSkills: {
    label: "歓迎スキル",
    searchPlaceholder: "スキル名で検索",
    emptyMessage: "登録されているスキルがありません。",
    selectedCountSuffix: "件選択中",
  },
  customRequiredSkillsNote: {
    label: "その他の必須スキル（任意）",
    helperText: "一覧にないスキルがある場合はこちらに入力してください。",
    placeholder: "例：社内独自ツール、特殊なフレームワークなど",
  },
} as const;

export const JOB_FORM_BUTTON_LABELS = {
  save: "保存",
  saving: "保存中…",
  cancel: "キャンセル",
} as const;

export const CREATE_JOB_META = {
  title: "求人・案件を新規作成",
  description: "求人・案件の詳細情報を入力してください。",
  saveSuccessMessage: "求人を作成しました。",
  cancelHref: "/company/jobs",
} as const;

export const EDIT_JOB_META = {
  title: "求人・案件を編集",
  description: "求人・案件の詳細情報を編集できます。",
  saveSuccessMessage: "変更を保存しました。",
  cancelHref: "/company/jobs",
} as const;

export const JOB_FORM_ERRORS = {
  titleRequired: "求人タイトルを入力してください。",
  titleTooLong: "求人タイトルは100文字以内で入力してください。",
  descriptionRequired: "仕事内容を入力してください。",
  descriptionTooLong: "仕事内容は3000文字以内で入力してください。",
  requiredSkillsMinimum: "必須スキルを1件以上選択してください。",
  requiredSkillsMaximum: "必須スキルは10件まで選択できます。",
  targetRoleRequired: "募集ロールを選択してください。",
  preferredSkillsMaximum: "歓迎スキルは10件まで選択できます。",
  matchingSkillsOverlap: "同じスキルを必須スキルと歓迎スキルの両方に選択することはできません。",
  customRequiredSkillsNoteTooLong: "その他の必須スキルは500文字以内で入力してください。",
  workStyleRequired: "勤務形態を選択してください。",
  salaryRequired: "年収の下限・上限を入力してください。",
  salaryOutOfRange: "年収は1〜9999万円の範囲で入力してください。",
  salaryOrderInvalid: "年収の下限は上限以下にしてください。",
  deadlineRequired: "応募締切を入力してください。",
  deadlineInPast: "応募締切は本日以降の日付にしてください。",
  budgetRequired: "予算を入力してください。",
  budgetInvalid: "予算は1万円以上で入力してください。",
  headcountInvalid: "募集人数は1名以上で入力してください。",
  periodRequired: "稼働開始日・終了日を入力してください。",
  periodInvalid: "稼働終了日は稼働開始日以降の日付にしてください。",
  timeRequired: "稼働開始時刻・終了時刻を入力してください。",
  timeInvalid: "稼働終了時刻は稼働開始時刻より後の時刻にしてください。",
  hourlyRateRequired: "時給を入力してください。",
  hourlyRateInvalid: "時給は1円以上で入力してください。",
  notSignedIn: "ログイン情報を確認できませんでした。再度ログインしてください。",
  saveFailed: "求人の保存に失敗しました。しばらくしてから再度お試しください。",
  partialSaveFailed:
    "求人の基本情報は保存されましたが、契約形態の詳細情報の保存に失敗しました。もう一度保存し直してください。",
  skillsSaveFailed:
    "求人は保存されましたが、必須スキルの保存に失敗しました。もう一度保存し直してください。",
  companyNameRequiredToPublish: "求人を公開するには企業プロフィールに会社名を登録してください。",
  invalidInput:
    "入力内容を確認してください（必須スキル1〜10件、仕事内容3000文字以内、応募締切は本日以降）。",
} as const;
