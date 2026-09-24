import type { Metadata } from "next";
import { MineApplicationDocuments } from "@/components/applications/MineApplicationDocuments";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ApplicationDetailView } from "@/components/applications/ApplicationDetailView";
import { ENGINEER_NAV } from "@/constants/dashboard";
import {
  APPLICATION_NOT_FOUND_LABELS,
  DETAIL_META,
  SIGN_IN_REQUIRED_LABELS,
} from "@/constants/applications";
import { createClient } from "@/lib/supabase/server";
import { getMyApplicationDetail } from "@/lib/engineer/applications";
import { getEngineerHeaderIdentity } from "@/lib/engineer/profile";

interface ApplicationDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ApplicationDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const detail = authUser ? await getMyApplicationDetail(supabase, authUser.id, id) : null;

  return {
    title: detail?.opportunityTitle
      ? `${detail.opportunityTitle} | ENGINEER MATCH`
      : "応募詳細 | ENGINEER MATCH",
  };
}

function InfoState({ title, description, ctaLabel, ctaHref }: {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center shadow-sm">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Link
        href={ctaHref}
        className="mt-2 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

export default async function EngineerApplicationDetailPage({
  params,
}: ApplicationDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const [detail, identity] = await Promise.all([
    authUser ? getMyApplicationDetail(supabase, authUser.id, id) : Promise.resolve(null),
    getEngineerHeaderIdentity(supabase, authUser),
  ]);

  return (
    <DashboardShell
      navItems={ENGINEER_NAV}
      activeHref="/engineer/applications"
      pageTitle="応募詳細"
      userName={identity.name}
      userInitials={identity.initials}
      userEmail={identity.email}
    >
      <div>
        <Link
          href={DETAIL_META.backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {DETAIL_META.backLabel}
        </Link>
      </div>

      {!authUser ? (
        <InfoState
          title={SIGN_IN_REQUIRED_LABELS.title}
          description={SIGN_IN_REQUIRED_LABELS.description}
          ctaLabel={SIGN_IN_REQUIRED_LABELS.ctaLabel}
          ctaHref={SIGN_IN_REQUIRED_LABELS.ctaHref}
        />
      ) : !detail ? (
        <InfoState
          title={APPLICATION_NOT_FOUND_LABELS.title}
          description={APPLICATION_NOT_FOUND_LABELS.description}
          ctaLabel={APPLICATION_NOT_FOUND_LABELS.ctaLabel}
          ctaHref={DETAIL_META.backHref}
        />
      ) : (
        <><ApplicationDetailView detail={detail} /><MineApplicationDocuments applicationId={detail.id} /></>
      )}
    </DashboardShell>
  );
}
