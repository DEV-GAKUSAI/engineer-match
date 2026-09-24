import type { Metadata } from "next";
import { MineApplicationDocuments } from "@/components/applications/MineApplicationDocuments";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, MessageSquare, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import {
  ApplicantStatusActions,
  ApplicantStatusProvider,
  LiveApplicantStatusBadge,
} from "@/components/company/applicants/ApplicantStatusBadge";
import { ApplicantReviewSection } from "@/components/company/applicants/ApplicantReviewSection";
import { ApplicantProfileCard } from "@/components/company/applicants/ApplicantProfileCard";
import { ApplicantSkills } from "@/components/company/applicants/ApplicantSkills";
import { ApplicantQualifications } from "@/components/company/applicants/ApplicantQualifications";
import { ApplicantAssessmentSummary } from "@/components/company/applicants/ApplicantAssessmentSummary";
import { WorkExperienceSection } from "@/components/company/profile-sections/WorkExperienceSection";
import { EducationSection } from "@/components/company/profile-sections/EducationSection";
import { PortfolioSection } from "@/components/company/profile-sections/PortfolioSection";
import { LanguagesSection } from "@/components/company/profile-sections/LanguagesSection";
import { PreferredConditionsSection } from "@/components/company/profile-sections/PreferredConditionsSection";
import { ContactDetailsSection } from "@/components/company/profile-sections/ContactDetailsSection";
import { COMPANY_NAV } from "@/constants/dashboard";
import { APPLICANT_DETAIL_META } from "@/constants/company-applicants";
import { CONTRACT_TYPE_LABEL } from "@/constants/jobs";
import { createClient } from "@/lib/supabase/server";
import { getCompanyApplicantDetail } from "@/lib/company/applicants";
import { getCompanyHeaderIdentity } from "@/lib/company/profile";
import { getReviewForApplication } from "@/lib/company/reviews";
import { formatDateJa } from "@/lib/engineer/format";

interface ApplicantDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ApplicantDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const applicant = authUser ? await getCompanyApplicantDetail(supabase, authUser.id, id) : null;

  return {
    title: applicant ? `${applicant.name} | ENGINEER MATCH` : "応募者詳細 | ENGINEER MATCH",
  };
}

export default async function CompanyApplicantDetailPage({
  params,
}: ApplicantDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const [applicant, identity] = await Promise.all([
    authUser ? getCompanyApplicantDetail(supabase, authUser.id, id) : Promise.resolve(null),
    getCompanyHeaderIdentity(supabase, authUser),
  ]);

  if (!applicant || !authUser) {
    notFound();
  }

  const initialReview = await getReviewForApplication(supabase, applicant.id);

  return (
    <DashboardShell
      navItems={COMPANY_NAV}
      activeHref="/company/applicants"
      pageTitle="応募者詳細"
      userName={identity.name}
      userInitials={identity.initials}
      userEmail={identity.email}
    >
      <div>
        <Link
          href={APPLICANT_DETAIL_META.backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {APPLICANT_DETAIL_META.backLabel}
        </Link>
      </div>

      <ApplicantStatusProvider applicationId={applicant.id} initialStatus={applicant.status}>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 items-start gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary"
                aria-hidden="true"
              >
                {applicant.name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="mb-1.5">
                  <LiveApplicantStatusBadge />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {applicant.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {applicant.opportunityTitle} ・ {CONTRACT_TYPE_LABEL[applicant.contractType]}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  応募日：{formatDateJa(applicant.appliedAt)} ・ 最終更新日：
                  {formatDateJa(applicant.updatedAt)}
                </p>
              </div>
            </div>

            <ApplicantStatusActions />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
            <MineApplicationDocuments applicationId={applicant.id} />
            <ApplicantReviewSection
              applicationId={applicant.id}
              opportunityId={applicant.opportunityId}
              companyUserId={authUser.id}
              engineerUserId={applicant.applicantId}
              initialReview={initialReview}
            />
            <ContactDetailsSection phone={applicant.phone} nearestStation={applicant.nearestStation} />
            <ApplicantSkills skills={applicant.technicalSkills} />
            <ApplicantQualifications qualifications={applicant.qualifications} />
            <ApplicantAssessmentSummary
              title={APPLICANT_DETAIL_META.humanSkillTitle}
              icon={Users}
              items={applicant.humanAssessments}
            />
            <ApplicantAssessmentSummary
              title={APPLICANT_DETAIL_META.businessSkillTitle}
              icon={Briefcase}
              items={applicant.businessAssessments}
            />
            <WorkExperienceSection workExperiences={applicant.workExperiences} />
            <EducationSection educations={applicant.educations} />
            <PortfolioSection portfolioProjects={applicant.portfolioProjects} />
            <LanguagesSection languages={applicant.languages} />
            <PreferredConditionsSection
              preferredContractTypes={applicant.preferredContractTypes}
              preferredLocations={applicant.preferredLocations}
              workStyle={applicant.workStyle}
              availableFrom={applicant.availableFrom}
              desiredHourlyRate={applicant.desiredHourlyRateMax}
              minimumHourlyRate={applicant.desiredHourlyRateMin}
              desiredAnnualIncome={applicant.desiredAnnualIncome}
            />
          </div>

          <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:col-span-1 lg:self-start">
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <Link
                href={`/company/messages/${applicant.id}`}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                メッセージを送る
              </Link>
            </div>
            <ApplicantProfileCard applicant={applicant} />
          </div>
        </div>
      </ApplicantStatusProvider>
    </DashboardShell>
  );
}
