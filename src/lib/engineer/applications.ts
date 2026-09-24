import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanyProfile, type CompanyProfile } from "@/lib/company/profile";
import {
  canTransitionApplicationStatus,
  type ApplicationStatusValue,
} from "@/lib/application-status";

/** public.applications, per 011_applications.sql. */
export interface Application {
  id: string;
  opportunity_id: string;
  applicant_id: string;
  status: "applied" | "screening" | "interview" | "accepted" | "rejected" | "withdrawn" | "completed";
  applied_at: string;
  created_at: string;
  updated_at: string;
}

export interface ApplicationListItem extends Application {
  opportunityTitle: string;
  opportunityContractType: "employment" | "project" | "hourly" | "training";
  companyName: string;
}

/** The applicant's own applications, newest first — matches applications_select_own RLS. */
export async function listMyApplications(
  supabase: SupabaseClient,
  userId: string,
): Promise<ApplicationListItem[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("applicant_id", userId)
    .order("applied_at", { ascending: false });

  if (error) {
    console.error("[engineer-applications] failed to list applications:", error);
    return [];
  }

  const applications = (data ?? []) as Application[];
  if (applications.length === 0) return [];

  const opportunityIds = [...new Set(applications.map((app) => app.opportunity_id))];
  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("id, title, contract_type, posted_by")
    .in("id", opportunityIds);

  const opportunityById = new Map((opportunities ?? []).map((row) => [row.id as string, row]));

  const companyIds = [
    ...new Set((opportunities ?? []).map((row) => row.posted_by as string)),
  ];
  const { data: companies } = await supabase
    .from("company_profiles")
    .select("id, company_name")
    .in("id", companyIds);
  const companyNameById = new Map(
    (companies ?? []).map((row) => [row.id as string, row.company_name as string]),
  );

  return applications.map((app) => {
    const opportunity = opportunityById.get(app.opportunity_id);
    return {
      ...app,
      opportunityTitle: opportunity ? (opportunity.title as string) : "",
      opportunityContractType: opportunity
        ? (opportunity.contract_type as ApplicationListItem["opportunityContractType"])
        : "employment",
      companyName: opportunity ? companyNameById.get(opportunity.posted_by as string) || "" : "",
    };
  });
}

/**
 * Count of the caller's own applications currently "in flight" with a
 * company (applied/screening/interview), for the withdrawal warning (BR-117
 * / RD-2026-001 4.11). 'accepted' and 'completed' are deliberately excluded
 * -- Phase 3 only requires warning about applications a company is actively
 * screening, not ones already past that stage -- and this never blocks
 * withdrawal regardless of count, it is informational only.
 */
export async function countOngoingApplications(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("applicant_id", userId)
    .in("status", ["applied", "screening", "interview"]);

  if (error) {
    console.error("[engineer-applications] failed to count ongoing applications:", error);
    return 0;
  }

  return count ?? 0;
}

/** Whether the current user has already applied (any status) to this opportunity. */
export async function getMyApplicationFor(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string,
): Promise<Application | null> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("applicant_id", userId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (error) {
    console.error("[engineer-applications] failed to check existing application:", error);
    return null;
  }

  return data as Application | null;
}

export interface ApplicationDetail extends Application {
  opportunityTitle: string | null;
  opportunityContractType: ApplicationListItem["opportunityContractType"] | null;
  company: CompanyProfile | null;
}

/**
 * A single application, scoped to the caller (applications_select_own RLS).
 * The joined opportunity/company fields come back null once the posting is
 * no longer visible under opportunities_select_active (e.g. the company
 * closed recruitment) — the applicant keeps their application history row,
 * but can no longer read the now-unpublished opportunities row, since
 * opportunities RLS has no "I applied to this" read path. The UI shows
 * whatever is available rather than failing the whole page.
 */
export async function getMyApplicationDetail(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<ApplicationDetail | null> {
  const { data: application, error } = await supabase
    .from("applications")
    .select("*")
    .eq("id", id)
    .eq("applicant_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[engineer-applications] failed to load application:", error);
    return null;
  }
  if (!application) return null;

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("title, contract_type, posted_by")
    .eq("id", application.opportunity_id)
    .maybeSingle();

  const company = opportunity ? await getCompanyProfile(supabase, opportunity.posted_by) : null;

  return {
    ...(application as Application),
    opportunityTitle: opportunity ? (opportunity.title as string) : null,
    opportunityContractType: opportunity
      ? (opportunity.contract_type as ApplicationListItem["opportunityContractType"])
      : null,
    company,
  };
}

/**
 * Applies to an opportunity. Relies on uq_applications_opp_applicant for the
 * duplicate-prevention backstop (Postgres 23505 unique_violation) in addition
 * to the proactive getMyApplicationFor() check the UI performs first.
 */
export async function applyToOpportunity(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string,
) {
  return supabase
    .from("applications")
    .insert({ opportunity_id: opportunityId, applicant_id: userId, status: "applied" })
    .select("*")
    .single();
}

/**
 * Starts a short-lived Mine consent request for the current linked Engineer
 * Match account. This does not create an application yet; Mine creates the
 * application only after the user chooses which documents to share.
 */
export async function createMineApplicationShareRequest(
  supabase: SupabaseClient,
  opportunityId: string,
) {
  return supabase.rpc("create_mine_engineer_application_share_token", {
    p_opportunity_id: opportunityId,
  });
}
export interface WithdrawApplicationResult {
  data: Application | null;
  error: { message: string } | null;
}

/**
 * Withdraws an application. applications has no owner-DELETE RLS policy
 * (025_application_policies.sql: "application history is never physically
 * deleted") — the only self-service cancellation path is
 * applications_update_withdraw, an UPDATE to status='withdrawn'.
 *
 * currentStatus is required and checked against the shared transition graph
 * (src/lib/application-status.ts) before any request is sent — 'accepted'
 * (and the terminal 'rejected'/'withdrawn'/'completed' states) are rejected
 * here client-side. This is UX only: the real boundary is
 * trg_applications_status_transition (DB trigger) and, for the withdrawn
 * target specifically, applications_update_withdraw RLS, both of which
 * reject the same transition even if this check is bypassed.
 */
export async function withdrawApplication(
  supabase: SupabaseClient,
  id: string,
  currentStatus: ApplicationStatusValue,
): Promise<WithdrawApplicationResult> {
  if (!canTransitionApplicationStatus(currentStatus, "withdrawn")) {
    return {
      data: null,
      error: { message: "この応募は現在のステータスから取り消すことはできません。" },
    };
  }

  const { data, error } = await supabase
    .from("applications")
    .update({ status: "withdrawn" })
    .eq("id", id)
    .select("*")
    .single();

  return { data: data as Application | null, error };
}
