import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * public.opportunities shape, per 005_opportunities.sql. COMPANY-posted job
 * postings are always side='ENGINEER' with contract_type in
 * ('employment','project','hourly') — 'training' is the TRAINING side, not
 * used by the company job-posting flow.
 */
export interface Opportunity {
  id: string;
  side: "ENGINEER" | "TRAINING";
  contract_type: "employment" | "project" | "hourly" | "training";
  title: string;
  description: string;
  status: "draft" | "published" | "closed";
  posted_by: string;
  unpublished_by_admin: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /**
   * Review #27: free-text supplement for required skills that don't exist
   * in the public.skills master. Never written to public.skills or
   * opportunity_required_skills -- display-only, no search/filter impact.
   */
  custom_required_skills_note: string | null;
  target_role_code: string | null;
}

export type CompanyContractType = "employment" | "project" | "hourly";
export type JobStatus = Opportunity["status"];

/** 006_opportunity_employment.sql */
export interface OpportunityEmployment {
  opportunity_id: string;
  work_style: "REMOTE" | "ONSITE" | "HYBRID";
  salary_min: number;
  salary_max: number;
}

/** 007_opportunity_project.sql */
export interface OpportunityProject {
  opportunity_id: string;
  deadline: string;
  budget: number;
  headcount: number;
  is_online: boolean | null;
}

/**
 * 008_opportunity_hourly.sql, plus work_style added by
 * 063_opportunity_hourly_work_style.sql (Phase 5 決定事項②). work_style is
 * nullable: existing rows created before that migration have no safe,
 * non-guessed mapping from is_online and are left NULL (legacy). is_online
 * itself is unchanged and kept for backward compatibility -- never read as
 * a proxy for work_style.
 */
export interface OpportunityHourly {
  opportunity_id: string;
  period_start: string;
  period_end: string;
  time_start: string;
  time_end: string;
  hourly_rate: number;
  is_online: boolean;
  work_style: "REMOTE" | "ONSITE" | "HYBRID" | null;
  headcount: number;
}

/** public.skills, per 003_master_tables.sql */
export interface Skill {
  id: string;
  name: string;
}

export interface OpportunityListItem {
  id: string;
  title: string;
  contract_type: CompanyContractType;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  workStyle: OpportunityEmployment["work_style"] | OpportunityHourly["work_style"];
  salaryMin: number | null;
  salaryMax: number | null;
  budget: number | null;
  hourlyRate: number | null;
  requiredSkillNames: string[];
  applicantCount: number;
}

interface OpportunityListSourceRow {
  id: string;
  title: string;
  contract_type: CompanyContractType;
  status: JobStatus;
  created_at: string;
  updated_at: string;
}

export interface OpportunityDetail {
  opportunity: Opportunity;
  employment: OpportunityEmployment | null;
  project: OpportunityProject | null;
  hourly: OpportunityHourly | null;
  requiredSkillIds: string[];
  preferredSkillIds: string[];
}

export interface EmploymentInput {
  work_style: OpportunityEmployment["work_style"];
  salary_min: number;
  salary_max: number;
}

export interface ProjectInput {
  deadline: string;
  budget: number;
  headcount: number;
  /**
   * The live DB enforces opportunity_project.is_online NOT NULL — contrary
   * to 007_opportunity_project.sql's `is_online BOOLEAN` (no NOT NULL). This
   * write-side type follows the real live constraint; the UI (CreateJobForm)
   * always sends true/false, never null.
   */
  is_online: boolean;
}

export interface HourlyInput {
  period_start: string;
  period_end: string;
  time_start: string;
  time_end: string;
  hourly_rate: number;
  is_online: boolean;
  /** Required for every new create/edit save going forward (RD 決定事項②); only ever NULL on rows that predate 063_opportunity_hourly_work_style.sql. */
  work_style: "REMOTE" | "ONSITE" | "HYBRID";
  headcount: number;
}

export interface OpportunityInput {
  title: string;
  description: string;
  contract_type: CompanyContractType;
  status: JobStatus;
  employment: EmploymentInput | null;
  project: ProjectInput | null;
  hourly: HourlyInput | null;
  requiredSkillIds: string[];
  targetRoleCode: string;
  preferredSkillIds: string[];
  /** Review #27: optional free text, trimmed; empty/whitespace collapses to null server-side. */
  customRequiredSkillsNote: string | null;
}

const LIST_FETCH_BATCH_SIZE = 500;
const LIST_HYDRATION_BATCH_SIZE = 100;
const ID_QUERY_BATCH_SIZE = 100;

async function listOpportunitySkillLinks(
  supabase: SupabaseClient,
  opportunityIds: string[],
): Promise<{ opportunity_id: string; skill_id: string }[]> {
  const links: { opportunity_id: string; skill_id: string }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("opportunity_required_skills")
      .select("opportunity_id, skill_id")
      .in("opportunity_id", opportunityIds)
      .order("opportunity_id")
      .order("skill_id")
      .range(offset, offset + LIST_FETCH_BATCH_SIZE - 1);

    if (error) {
      console.error("[company-jobs] failed to list required skills:", error);
      return [];
    }

    const batch = (data ?? []) as { opportunity_id: string; skill_id: string }[];
    links.push(...batch);
    if (batch.length < LIST_FETCH_BATCH_SIZE) break;
    offset += batch.length;
  }

  return links;
}

async function listOpportunityApplications(
  supabase: SupabaseClient,
  opportunityIds: string[],
): Promise<{ id: string; opportunity_id: string }[]> {
  const applications: { id: string; opportunity_id: string }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("applications")
      .select("id, opportunity_id")
      .in("opportunity_id", opportunityIds)
      .order("opportunity_id")
      .order("id")
      .range(offset, offset + LIST_FETCH_BATCH_SIZE - 1);

    if (error) {
      console.error("[company-jobs] failed to count applications:", error);
      return [];
    }

    const batch = (data ?? []) as { id: string; opportunity_id: string }[];
    applications.push(...batch);
    if (batch.length < LIST_FETCH_BATCH_SIZE) break;
    offset += batch.length;
  }

  return applications;
}

async function hydrateOpportunityListBatch(
  supabase: SupabaseClient,
  rows: OpportunityListSourceRow[],
): Promise<OpportunityListItem[]> {
  const opportunityIds = rows.map((row) => row.id);
  const [employmentResult, projectResult, hourlyResult, skillLinks, applications] =
    await Promise.all([
      supabase
        .from("opportunity_employment")
        .select("opportunity_id, work_style, salary_min, salary_max")
        .in("opportunity_id", opportunityIds),
      supabase
        .from("opportunity_project")
        .select("opportunity_id, budget")
        .in("opportunity_id", opportunityIds),
      supabase
        .from("opportunity_hourly")
        .select("opportunity_id, work_style, hourly_rate")
        .in("opportunity_id", opportunityIds),
      listOpportunitySkillLinks(supabase, opportunityIds),
      listOpportunityApplications(supabase, opportunityIds),
    ]);

  const employmentByOpportunity = new Map(
    (employmentResult.data ?? []).map((item) => [item.opportunity_id as string, item]),
  );
  const projectByOpportunity = new Map(
    (projectResult.data ?? []).map((item) => [item.opportunity_id as string, item]),
  );
  const hourlyByOpportunity = new Map(
    (hourlyResult.data ?? []).map((item) => [item.opportunity_id as string, item]),
  );

  const skillIds = [...new Set(skillLinks.map((link) => link.skill_id))];
  const skillNameById = new Map<string, string>();
  for (let index = 0; index < skillIds.length; index += ID_QUERY_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("skills")
      .select("id, name")
      .in("id", skillIds.slice(index, index + ID_QUERY_BATCH_SIZE));

    if (error) {
      console.error("[company-jobs] failed to resolve required skill names:", error);
      continue;
    }
    for (const skill of data ?? []) {
      skillNameById.set(skill.id as string, skill.name as string);
    }
  }

  const skillNamesByOpportunity = new Map<string, string[]>();
  for (const link of skillLinks) {
    const name = skillNameById.get(link.skill_id);
    if (!name) continue;
    const names = skillNamesByOpportunity.get(link.opportunity_id) ?? [];
    names.push(name);
    skillNamesByOpportunity.set(link.opportunity_id, names);
  }

  const applicantCountByOpportunity = new Map<string, number>();
  for (const application of applications) {
    applicantCountByOpportunity.set(
      application.opportunity_id,
      (applicantCountByOpportunity.get(application.opportunity_id) ?? 0) + 1,
    );
  }

  return rows.map((row) => {
    const employment = employmentByOpportunity.get(row.id);
    const project = projectByOpportunity.get(row.id);
    const hourly = hourlyByOpportunity.get(row.id);

    return {
      ...row,
      workStyle: employment
        ? (employment.work_style as OpportunityEmployment["work_style"])
        : ((hourly?.work_style as OpportunityHourly["work_style"] | undefined) ?? null),
      salaryMin: employment ? (employment.salary_min as number) : null,
      salaryMax: employment ? (employment.salary_max as number) : null,
      budget: project ? (project.budget as number) : null,
      hourlyRate: hourly ? (hourly.hourly_rate as number) : null,
      requiredSkillNames: skillNamesByOpportunity.get(row.id) ?? [],
      applicantCount: applicantCountByOpportunity.get(row.id) ?? 0,
    };
  });
}

/** Own postings, any status — list/detail pages need to see drafts too, unlike public browse. */
export async function listCompanyOpportunities(
  supabase: SupabaseClient,
  userId: string,
): Promise<OpportunityListItem[]> {
  const rows: OpportunityListSourceRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("opportunities")
      .select("id, title, contract_type, status, created_at, updated_at")
      .eq("posted_by", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + LIST_FETCH_BATCH_SIZE - 1);

    if (error) {
      console.error("[company-jobs] failed to list opportunities:", error);
      return [];
    }

    const batch = (data ?? []) as OpportunityListSourceRow[];
    rows.push(...batch);
    if (batch.length < LIST_FETCH_BATCH_SIZE) break;
    offset += batch.length;
  }

  const items: OpportunityListItem[] = [];
  for (let index = 0; index < rows.length; index += LIST_HYDRATION_BATCH_SIZE) {
    items.push(
      ...(await hydrateOpportunityListBatch(
        supabase,
        rows.slice(index, index + LIST_HYDRATION_BATCH_SIZE),
      )),
    );
  }

  return items;
}

/**
 * Count of the caller's own published opportunities, for the withdrawal
 * guard (BR-116 / RD-2026-001 4.11). This is a UX pre-check only -- the
 * withdraw_own_account() RPC (062_self_service_account_withdrawal.sql
 * draft) re-checks the exact same condition server-side before allowing
 * ACTIVE -> WITHDRAWN, so a stale or bypassed client-side read here can
 * never actually let a published-opportunity company withdraw.
 */
export async function countPublishedOpportunities(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("posted_by", userId)
    .eq("status", "published")
    .is("deleted_at", null);

  if (error) {
    console.error("[company-jobs] failed to count published opportunities:", error);
    return 0;
  }

  return count ?? 0;
}

/**
 * Active, admin-curated skills for the required-skills picker.
 *
 * Review #26: excludes every Engineer self-registered skill (created_by IS
 * NOT NULL, 076_engineer_skill_self_registration.sql), not just inactive
 * ones -- a company defining a job's required skills should only see the
 * curated catalog, not one Engineer's free-text submission (typos, junk,
 * near-duplicates) that happens to already exist in public.skills.
 */
export async function listSkills(supabase: SupabaseClient): Promise<Skill[]> {
  const { data, error } = await supabase
    .from("skills")
    .select("id, name, created_by")
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    console.error("[company-jobs] failed to list skills:", error);
    return [];
  }

  return ((data ?? []) as (Skill & { created_by: string | null })[])
    .filter((skill) => skill.created_by === null)
    .map(({ id, name }) => ({ id, name }));
}

/**
 * Fetches one opportunity scoped to its owning company. Returns null for
 * both "doesn't exist" and "exists but belongs to someone else" — the
 * explicit .eq("posted_by", userId) plus RLS both enforce this, and
 * collapsing them into one response avoids leaking which case occurred.
 */
export async function getCompanyOpportunity(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<OpportunityDetail | null> {
  const { data: opportunity, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .eq("posted_by", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[company-jobs] failed to load opportunity:", error);
    return null;
  }
  if (!opportunity) return null;

  let employment: OpportunityEmployment | null = null;
  let project: OpportunityProject | null = null;
  let hourly: OpportunityHourly | null = null;

  if (opportunity.contract_type === "employment") {
    const { data } = await supabase
      .from("opportunity_employment")
      .select("*")
      .eq("opportunity_id", id)
      .maybeSingle();
    employment = data as OpportunityEmployment | null;
  } else if (opportunity.contract_type === "project") {
    const { data } = await supabase
      .from("opportunity_project")
      .select("*")
      .eq("opportunity_id", id)
      .maybeSingle();
    project = data as OpportunityProject | null;
  } else if (opportunity.contract_type === "hourly") {
    const { data } = await supabase
      .from("opportunity_hourly")
      .select("*")
      .eq("opportunity_id", id)
      .maybeSingle();
    hourly = data as OpportunityHourly | null;
  }

  const { data: skillRows } = await supabase
    .from("opportunity_required_skills")
    .select("skill_id")
    .eq("opportunity_id", id);
  const { data: preferredSkillRows } = await supabase
    .from("opportunity_preferred_skills")
    .select("skill_id")
    .eq("opportunity_id", id);

  return {
    opportunity: opportunity as Opportunity,
    employment,
    project,
    hourly,
    requiredSkillIds: (skillRows ?? []).map((row) => row.skill_id as string),
    preferredSkillIds: (preferredSkillRows ?? []).map((row) => row.skill_id as string),
  };
}

/**
 * RD-2026-001 BR-23/BR-27: an opportunity may never reach status='published'
 * while its owning company has no registered company_name (NULL, empty, or
 * whitespace-only all count as unregistered). Draft saves are unaffected —
 * this is only ever checked when the target status is 'published'.
 */
async function hasRegisteredCompanyName(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("company_profiles")
    .select("company_name")
    .eq("id", userId)
    .maybeSingle();
  const name = (data?.company_name as string | null | undefined) ?? "";
  return name.trim().length > 0;
}

/**
 * Today's date as YYYY-MM-DD in Asia/Tokyo -- matches opportunity_project.
 * deadline's DATE-column string format exactly, so it can be compared with a
 * plain string comparison instead of parsing either side into a Date object
 * (which would risk a UTC/local timezone shift making "today" look like
 * yesterday or tomorrow, RD-2026-001 4.4.6 note on deadline validation).
 */
export function getTodayDateStringJST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

/** Fast client-side duplicate of the authoritative save RPC validation. */
function validateOpportunityInput(input: OpportunityInput): boolean {
  if (input.requiredSkillIds.length < 1 || input.requiredSkillIds.length > 10) return false;
  if (!input.targetRoleCode) return false;
  if (input.preferredSkillIds.length > 10) return false;
  if (input.preferredSkillIds.some((skillId) => input.requiredSkillIds.includes(skillId))) return false;
  if (input.description.length > 3000) return false;
  if ((input.customRequiredSkillsNote?.length ?? 0) > 500) return false;
  if (input.contract_type === "project" && input.project) {
    if (input.project.deadline < getTodayDateStringJST()) return false;
  }
  return true;
}

type OpportunitySaveStage =
  | "invalid_input"
  | "company_name_required"
  | "opportunity"
  | null;

function getSubtypePayload(input: OpportunityInput): EmploymentInput | ProjectInput | HourlyInput | null {
  if (input.contract_type === "employment") return input.employment;
  if (input.contract_type === "project") return input.project;
  return input.hourly;
}

function classifyOpportunitySaveError(error: { code?: string; message?: string }): OpportunitySaveStage {
  const message = error.message?.toLowerCase() ?? "";
  if (message.includes("company_name_required") || message.includes("company name")) {
    return "company_name_required";
  }
  if (
    error.code === "22023" ||
    error.code === "22P02" ||
    error.code === "23502" ||
    error.code === "23503" ||
    error.code === "23514"
  ) {
    return "invalid_input";
  }
  return "opportunity";
}

async function saveCompanyOpportunity(
  supabase: SupabaseClient,
  opportunityId: string | null,
  input: OpportunityInput,
) {
  if (!validateOpportunityInput(input) || !getSubtypePayload(input)) {
    return { data: null, error: null, stage: "invalid_input" as OpportunitySaveStage };
  }

  const { data, error } = await supabase.rpc("save_company_opportunity_with_matching", {
    p_opportunity_id: opportunityId,
    p_title: input.title,
    p_description: input.description,
    p_contract_type: input.contract_type,
    p_status: input.status,
    p_subtype: getSubtypePayload(input),
    p_required_skill_ids: input.requiredSkillIds,
    p_custom_required_skills_note: input.customRequiredSkillsNote,
    p_target_role_code: input.targetRoleCode,
    p_preferred_skill_ids: input.preferredSkillIds,
  });

  if (error) {
    return {
      data: null,
      error,
      stage: classifyOpportunitySaveError(error) as OpportunitySaveStage,
    };
  }

  return {
    data: { id: data as string },
    error: null,
    stage: null as OpportunitySaveStage,
  };
}

/** Creates the parent, subtype and required skills in one database transaction. */
export async function createCompanyOpportunity(
  supabase: SupabaseClient,
  input: OpportunityInput,
) {
  return saveCompanyOpportunity(supabase, null, input);
}

/**
 * Atomically updates the owned parent, locked subtype and required skills.
 * The RPC derives ownership from auth.uid(); no owner id crosses this API.
 */
export async function updateCompanyOpportunity(
  supabase: SupabaseClient,
  id: string,
  input: OpportunityInput,
) {
  const result = await saveCompanyOpportunity(supabase, id, input);
  return { error: result.error, stage: result.stage };
}

/**
 * "Delete" a job posting. opportunities has no owner-DELETE RLS policy
 * (024_opportunity_policies.sql: only ADMIN can hard-delete), so this is the
 * only self-service removal action available to a COMPANY account — closing
 * recruitment via a status update, not a real DELETE.
 */
export async function setCompanyOpportunityStatus(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  status: JobStatus,
) {
  if (status === "published" && !(await hasRegisteredCompanyName(supabase, userId))) {
    return {
      data: null,
      error: { message: "求人を公開するには企業プロフィールに会社名を登録してください。" },
    };
  }

  return supabase
    .from("opportunities")
    .update({ status })
    .eq("id", id)
    .eq("posted_by", userId)
    .select("id, status")
    .single();
}
