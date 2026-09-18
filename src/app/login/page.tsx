import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginCard } from "@/components/auth/LoginCard";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STATUS, getDashboardPathForRole, getUserAccount } from "@/lib/auth/account";
import { getSafeNextPath } from "@/lib/auth/safe-next";

export const metadata: Metadata = {
  title: "ログイン | ENGINEER MATCH",
  description: "ENGINEER MATCHにログインして、続きから始めましょう。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const nextPath = getSafeNextPath((await searchParams).next);
  // Server-side check: an already-authenticated user opening /login is sent
  // straight to their dashboard. getUser() (not getSession()) revalidates
  // against Supabase Auth rather than trusting the cookie as-is.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const account = await getUserAccount(supabase, user.id);

    if (!account) {
      // Authenticated but no public.users row: a brand-new OAuth signup
      // pending role selection (migration 071, draft — not yet applied).
      // Send them straight to the picker instead of showing the login form
      // to an already-authenticated user.
      redirect("/auth/select-role");
    }

    if (account.status === ACTIVE_STATUS) {
      const dashboardPath = getDashboardPathForRole(account.role);
      if (dashboardPath) {
        redirect(nextPath ?? dashboardPath);
      }
      // No dashboard for this role yet (e.g. INSTRUCTOR) — fall through and
      // render the login page rather than redirecting nowhere.
    }
    // Inactive/suspended/withdrawn account: don't redirect to a dashboard.
    // Falls through to render the login form normally.
  }

  return <LoginCard nextPath={nextPath ?? undefined} />;
}
