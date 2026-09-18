import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STATUS, getDashboardPathForRole, getUserAccount } from "@/lib/auth/account";
import { getSafeNextPath } from "@/lib/auth/safe-next";

/**
 * OAuth (Google / GitHub) PKCE callback. Deliberately a separate route from
 * /auth/callback, which is dedicated to the password-recovery flow and whose
 * redirect target is intentionally fixed (see the comment there) — reusing
 * it here would either break that fixed redirect or require distinguishing
 * flows via a redirectTo query param, which that same comment documents as
 * unreliable against Supabase's redirect_to allow-list matching.
 *
 * As of migration 071 (draft, not yet applied), handle_new_user() lets a
 * brand-new OAuth identity's auth.users row be created without a matching
 * public.users row (no role is ever guessed from provider metadata) — so
 * `code` below is the normal case for a first-time OAuth signup too, not
 * just returning users. `error`/`error_description` from GoTrue is now only
 * expected for genuine provider/auth failures unrelated to role.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const providerError = searchParams.get("error");
  const nextPath = getSafeNextPath(searchParams.get("next"));

  function toLogin(oauthError: string) {
    const params = new URLSearchParams({ oauthError });
    if (nextPath) params.set("next", nextPath);
    return NextResponse.redirect(`${origin}/login?${params.toString()}`);
  }

  if (providerError) {
    console.error("[auth/oauth/callback] provider returned error:", providerError);
    return toLogin("failed");
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("[auth/oauth/callback] exchangeCodeForSession failed:", error);
    return toLogin("failed");
  }

  const account = await getUserAccount(supabase, data.user.id);

  if (!account) {
    // Authenticated (auth.users row exists) but no public.users row yet:
    // brand-new OAuth signup pending role selection. Keep the session — the
    // onboarding RPC (finalize_oauth_role, migration 071) needs auth.uid()
    // — and send them to pick ENGINEER or COMPANY. This is not a failure
    // state, so it does not go through toLogin()/oauthError.
    return NextResponse.redirect(`${origin}/auth/select-role`);
  }

  if (account.status !== ACTIVE_STATUS) {
    // SUSPENDED/WITHDRAWN must look identical to a failed login here too,
    // matching LoginCard's own anti-enumeration handling for this case.
    await supabase.auth.signOut();
    return toLogin("suspended");
  }

  if (account.role === "INSTRUCTOR") {
    // Valid account, active status -- there is just no dashboard built for
    // this role yet. Keep the session, same as the password login path.
    return toLogin("instructor");
  }

  const dashboardPath = getDashboardPathForRole(account.role);
  if (!dashboardPath) {
    console.error("[auth/oauth/callback] unrecognized role from public.users:", account.role);
    await supabase.auth.signOut();
    return toLogin("unsupported_role");
  }

  return NextResponse.redirect(`${origin}${nextPath ?? dashboardPath}`);
}
