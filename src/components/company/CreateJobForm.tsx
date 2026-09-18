"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Briefcase, ClipboardList, Loader2, X } from "lucide-react";
import { ProfileSection } from "@/components/engineer/profile/ProfileSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormStatusMessage } from "@/components/ui/FormStatusMessage";
import { createClient } from "@/lib/supabase/client";
import {
  createCompanyOpportunity,
  getTodayDateStringJST,
  type CompanyContractType,
  type HourlyInput,
  type JobStatus,
  type OpportunityDetail,
  type OpportunityEmployment,
  type OpportunityInput,
  type Skill,
} from "@/lib/company/jobs";
import {
  CONTRACT_TYPE_OPTIONS,
  CREATE_JOB_META,
  JOB_FORM_BUTTON_LABELS,
  JOB_FORM_ERRORS,
  JOB_FORM_FIELDS,
  JOB_FORM_SECTION_LABELS,
  JOB_STATUS_OPTIONS,
  WORK_STYLE_OPTIONS,
} from "@/constants/company-jobs";
import { OPPORTUNITY_TARGET_ROLE_OPTIONS } from "@/constants/opportunity-matching";

const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export interface JobFormState {
  title: string;
  description: string;
  contractType: CompanyContractType;
  status: JobStatus;
  workStyle: string;
  salaryMin: string;
  salaryMax: string;
  deadline: string;
  budget: string;
  headcount: string;
  projectIsOnline: string;
  periodStart: string;
  periodEnd: string;
  timeStart: string;
  timeEnd: string;
  hourlyRate: string;
  hourlyIsOnline: string;
  /**
   * Phase 5 決定事項②. Defaults to "REMOTE" only for a brand-new posting
   * (nothing to preserve). For an existing legacy row with work_style still
   * NULL (predates 063_opportunity_hourly_work_style.sql), this is left ""
   * on purpose rather than defaulted -- required-field validation then
   * forces the company to make an explicit choice before the save can go
   * through, instead of a guessed value being silently written just because
   * they happened to edit something else on the same job.
   */
  hourlyWorkStyle: string;
  requiredSkillIds: string[];
  targetRoleCode: string;
  preferredSkillIds: string[];
  /** Review #27: free-text supplement for skills absent from the public.skills master. */
  customRequiredSkillsNote: string;
}

export function buildInitialFormState(detail?: OpportunityDetail | null): JobFormState {
  if (!detail) {
    return {
      title: "",
      description: "",
      contractType: "employment",
      status: "draft",
      workStyle: "REMOTE",
      salaryMin: "",
      salaryMax: "",
      deadline: "",
      budget: "",
      headcount: "1",
      projectIsOnline: "true",
      periodStart: "",
      periodEnd: "",
      timeStart: "",
      timeEnd: "",
      hourlyRate: "",
      hourlyIsOnline: "true",
      hourlyWorkStyle: "REMOTE",
      requiredSkillIds: [],
      targetRoleCode: "",
      preferredSkillIds: [],
      customRequiredSkillsNote: "",
    };
  }

  const { opportunity, employment, project, hourly, requiredSkillIds, preferredSkillIds } = detail;

  return {
    title: opportunity.title,
    description: opportunity.description,
    contractType: opportunity.contract_type as CompanyContractType,
    status: opportunity.status,
    workStyle: employment?.work_style ?? "REMOTE",
    salaryMin: employment ? String(employment.salary_min) : "",
    salaryMax: employment ? String(employment.salary_max) : "",
    deadline: project?.deadline ?? "",
    budget: project ? String(project.budget) : "",
    headcount: project
      ? String(project.headcount)
      : hourly
        ? String(hourly.headcount)
        : "1",
    projectIsOnline: project ? String(project.is_online) : "true",
    periodStart: hourly?.period_start ?? "",
    periodEnd: hourly?.period_end ?? "",
    timeStart: hourly?.time_start?.slice(0, 5) ?? "",
    timeEnd: hourly?.time_end?.slice(0, 5) ?? "",
    hourlyRate: hourly ? String(hourly.hourly_rate) : "",
    hourlyIsOnline: hourly ? String(hourly.is_online) : "true",
    hourlyWorkStyle: hourly?.work_style ?? "",
    requiredSkillIds,
    targetRoleCode: opportunity.target_role_code ?? "",
    preferredSkillIds,
    customRequiredSkillsNote: opportunity.custom_required_skills_note ?? "",
  };
}

export function validateJobForm(state: JobFormState): string | null {
  const title = state.title.trim();
  if (!title) return JOB_FORM_ERRORS.titleRequired;
  if (title.length > 100) return JOB_FORM_ERRORS.titleTooLong;
  if (!state.description.trim()) return JOB_FORM_ERRORS.descriptionRequired;
  if (state.description.length > 3000) return JOB_FORM_ERRORS.descriptionTooLong;

  if (state.requiredSkillIds.length < 1) return JOB_FORM_ERRORS.requiredSkillsMinimum;
  if (state.requiredSkillIds.length > 10) return JOB_FORM_ERRORS.requiredSkillsMaximum;
  if (!state.targetRoleCode) return JOB_FORM_ERRORS.targetRoleRequired;
  if (state.preferredSkillIds.length > 10) return JOB_FORM_ERRORS.preferredSkillsMaximum;
  if (state.preferredSkillIds.some((skillId) => state.requiredSkillIds.includes(skillId))) {
    return JOB_FORM_ERRORS.matchingSkillsOverlap;
  }
  if (state.customRequiredSkillsNote.length > 500) {
    return JOB_FORM_ERRORS.customRequiredSkillsNoteTooLong;
  }

  if (state.contractType === "employment") {
    if (!state.workStyle) return JOB_FORM_ERRORS.workStyleRequired;
    if (!state.salaryMin.trim() || !state.salaryMax.trim()) {
      return JOB_FORM_ERRORS.salaryRequired;
    }
    const min = Number(state.salaryMin);
    const max = Number(state.salaryMax);
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 1 ||
      min > 9999 ||
      max < 1 ||
      max > 9999
    ) {
      return JOB_FORM_ERRORS.salaryOutOfRange;
    }
    if (min > max) return JOB_FORM_ERRORS.salaryOrderInvalid;
    return null;
  }

  if (state.contractType === "project") {
    if (!state.deadline) return JOB_FORM_ERRORS.deadlineRequired;
    if (state.deadline < getTodayDateStringJST()) return JOB_FORM_ERRORS.deadlineInPast;
    if (!state.budget.trim()) return JOB_FORM_ERRORS.budgetRequired;
    const budget = Number(state.budget);
    if (!Number.isInteger(budget) || budget < 1) return JOB_FORM_ERRORS.budgetInvalid;
    const headcount = Number(state.headcount);
    if (!Number.isInteger(headcount) || headcount < 1) {
      return JOB_FORM_ERRORS.headcountInvalid;
    }
    return null;
  }

  // hourly
  if (!state.hourlyWorkStyle) return JOB_FORM_ERRORS.workStyleRequired;
  if (!state.periodStart || !state.periodEnd) return JOB_FORM_ERRORS.periodRequired;
  if (state.periodStart > state.periodEnd) return JOB_FORM_ERRORS.periodInvalid;
  if (!state.timeStart || !state.timeEnd) return JOB_FORM_ERRORS.timeRequired;
  if (state.timeStart >= state.timeEnd) return JOB_FORM_ERRORS.timeInvalid;
  if (!state.hourlyRate.trim()) return JOB_FORM_ERRORS.hourlyRateRequired;
  const rate = Number(state.hourlyRate);
  if (!Number.isInteger(rate) || rate < 1) return JOB_FORM_ERRORS.hourlyRateInvalid;
  const headcount = Number(state.headcount);
  if (!Number.isInteger(headcount) || headcount < 1) {
    return JOB_FORM_ERRORS.headcountInvalid;
  }
  return null;
}

export function buildOpportunityInput(state: JobFormState): OpportunityInput {
  return {
    title: state.title.trim(),
    description: state.description.trim(),
    contract_type: state.contractType,
    status: state.status,
    employment:
      state.contractType === "employment"
        ? {
            work_style: state.workStyle as OpportunityEmployment["work_style"],
            salary_min: Number(state.salaryMin),
            salary_max: Number(state.salaryMax),
          }
        : null,
    project:
      state.contractType === "project"
        ? {
            deadline: state.deadline,
            budget: Number(state.budget),
            headcount: Number(state.headcount),
            is_online: state.projectIsOnline === "true",
          }
        : null,
    hourly:
      state.contractType === "hourly"
        ? {
            period_start: state.periodStart,
            period_end: state.periodEnd,
            time_start: state.timeStart,
            time_end: state.timeEnd,
            hourly_rate: Number(state.hourlyRate),
            is_online: state.hourlyIsOnline === "true",
            work_style: state.hourlyWorkStyle as HourlyInput["work_style"],
            headcount: Number(state.headcount),
          }
        : null,
    requiredSkillIds: state.requiredSkillIds,
    targetRoleCode: state.targetRoleCode,
    preferredSkillIds: state.preferredSkillIds,
    customRequiredSkillsNote: state.customRequiredSkillsNote.trim() || null,
  };
}

interface RequiredSkillsPickerProps {
  skills: Skill[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  idPrefix: string;
  labels:
    | typeof JOB_FORM_FIELDS.requiredSkills
    | typeof JOB_FORM_FIELDS.preferredSkills;
}

function RequiredSkillsPicker({
  skills,
  selectedIds,
  onChange,
  idPrefix,
  labels,
}: RequiredSkillsPickerProps) {
  const [query, setQuery] = useState("");
  const filtered = skills.filter((skill) =>
    !selectedIds.includes(skill.id) && skill.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const atMax = selectedIds.length >= 10;

  function toggle(id: string) {
    const isSelected = selectedIds.includes(id);
    if (!isSelected && atMax) return;
    onChange(
      isSelected ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id],
    );
  }

  if (skills.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {labels.emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={labels.searchPlaceholder}
      />
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label={`${labels.label}の選択済み一覧`}>
          {selectedIds.map((id) => {
            const skill = skills.find((item) => item.id === id);
            if (!skill) return null;
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => toggle(skill.id)}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                {skill.name}
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border p-3">
        <div className="flex flex-col gap-2.5">
          {filtered.map((skill) => {
            const checkboxId = `${idPrefix}-skill-${skill.id}`;
            const isSelected = selectedIds.includes(skill.id);
            return (
              <label
                key={skill.id}
                htmlFor={checkboxId}
                className="flex items-center gap-2 text-sm text-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50"
              >
                <Checkbox
                  id={checkboxId}
                  checked={isSelected}
                  disabled={!isSelected && atMax}
                  onCheckedChange={() => toggle(skill.id)}
                />
                {skill.name}
              </label>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {selectedIds.length}/10{labels.selectedCountSuffix}
      </p>
    </div>
  );
}

interface JobFormFieldsProps {
  state: JobFormState;
  onChange: (patch: Partial<JobFormState>) => void;
  skills: Skill[];
  idPrefix: string;
  isContractTypeLocked: boolean;
}

export function JobFormFields({
  state,
  onChange,
  skills,
  idPrefix,
  isContractTypeLocked,
}: JobFormFieldsProps) {
  return (
    <>
      <ProfileSection icon={Briefcase} title={JOB_FORM_SECTION_LABELS.basicInfo}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-title`}>
              {JOB_FORM_FIELDS.title.label}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${idPrefix}-title`}
              value={state.title}
              onChange={(event) => onChange({ title: event.target.value })}
              placeholder={JOB_FORM_FIELDS.title.placeholder}
              maxLength={100}
              required
            />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-description`}>
              {JOB_FORM_FIELDS.description.label}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id={`${idPrefix}-description`}
              value={state.description}
              onChange={(event) => onChange({ description: event.target.value.slice(0, 3000) })}
              placeholder={JOB_FORM_FIELDS.description.placeholder}
              maxLength={3000}
              rows={5}
              required
            />
            <p className="text-right text-xs text-muted-foreground">
              {state.description.length} / 3000
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-contract-type`}>
              {JOB_FORM_FIELDS.contractType.label}
            </Label>
            {isContractTypeLocked ? (
              <>
                <Input
                  id={`${idPrefix}-contract-type`}
                  value={
                    CONTRACT_TYPE_OPTIONS.find((option) => option.value === state.contractType)
                      ?.label ?? state.contractType
                  }
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  {JOB_FORM_FIELDS.contractTypeLockedNote}
                </p>
              </>
            ) : (
              <select
                id={`${idPrefix}-contract-type`}
                value={state.contractType}
                onChange={(event) =>
                  onChange({ contractType: event.target.value as CompanyContractType })
                }
                className={SELECT_CLASS}
              >
                {CONTRACT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-status`}>{JOB_FORM_FIELDS.status.label}</Label>
            <select
              id={`${idPrefix}-status`}
              value={state.status}
              onChange={(event) => onChange({ status: event.target.value as JobStatus })}
              className={SELECT_CLASS}
            >
              {JOB_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </ProfileSection>

      <ProfileSection title={JOB_FORM_SECTION_LABELS.matchingRequirements}>
        <div className="flex max-w-md flex-col gap-2">
          <Label htmlFor={`${idPrefix}-target-role`}>
            {JOB_FORM_FIELDS.targetRole.label}
            <span className="text-destructive">*</span>
          </Label>
          <select
            id={`${idPrefix}-target-role`}
            value={state.targetRoleCode}
            onChange={(event) => onChange({ targetRoleCode: event.target.value })}
            className={SELECT_CLASS}
          >
            <option value="" disabled>
              {JOB_FORM_FIELDS.targetRole.placeholder}
            </option>
            {OPPORTUNITY_TARGET_ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>
      </ProfileSection>

      {state.contractType === "employment" && (
        <ProfileSection
          icon={ClipboardList}
          title={JOB_FORM_SECTION_LABELS.employmentDetails}
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-work-style`}>
                {JOB_FORM_FIELDS.workStyle.label}
                <span className="text-destructive">*</span>
              </Label>
              <select
                id={`${idPrefix}-work-style`}
                value={state.workStyle}
                onChange={(event) => onChange({ workStyle: event.target.value })}
                className={SELECT_CLASS}
              >
                {WORK_STYLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div />
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-salary-min`}>
                {JOB_FORM_FIELDS.salaryMin.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${idPrefix}-salary-min`}
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                value={state.salaryMin}
                onChange={(event) => onChange({ salaryMin: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-salary-max`}>
                {JOB_FORM_FIELDS.salaryMax.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${idPrefix}-salary-max`}
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                value={state.salaryMax}
                onChange={(event) => onChange({ salaryMax: event.target.value })}
              />
            </div>
          </div>
        </ProfileSection>
      )}

      {state.contractType === "project" && (
        <ProfileSection icon={ClipboardList} title={JOB_FORM_SECTION_LABELS.projectDetails}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-deadline`}>
                {JOB_FORM_FIELDS.deadline.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${idPrefix}-deadline`}
                type="date"
                min={getTodayDateStringJST()}
                value={state.deadline}
                onChange={(event) => onChange({ deadline: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-budget`}>
                {JOB_FORM_FIELDS.budget.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${idPrefix}-budget`}
                type="number"
                inputMode="numeric"
                min={1}
                value={state.budget}
                onChange={(event) => onChange({ budget: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-headcount`}>
                {JOB_FORM_FIELDS.headcount.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${idPrefix}-headcount`}
                type="number"
                inputMode="numeric"
                min={1}
                value={state.headcount}
                onChange={(event) => onChange({ headcount: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-is-online`}>
                {JOB_FORM_FIELDS.isOnlineProject.label}
              </Label>
              <select
                id={`${idPrefix}-is-online`}
                value={state.projectIsOnline}
                onChange={(event) => onChange({ projectIsOnline: event.target.value })}
                className={SELECT_CLASS}
              >
                <option value="true">{JOB_FORM_FIELDS.isOnlineYes}</option>
                <option value="false">{JOB_FORM_FIELDS.isOnlineNo}</option>
              </select>
            </div>
          </div>
        </ProfileSection>
      )}

      {state.contractType === "hourly" && (
        <ProfileSection icon={ClipboardList} title={JOB_FORM_SECTION_LABELS.hourlyDetails}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-period-start`}>
                {JOB_FORM_FIELDS.periodStart.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${idPrefix}-period-start`}
                type="date"
                value={state.periodStart}
                onChange={(event) => onChange({ periodStart: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-period-end`}>
                {JOB_FORM_FIELDS.periodEnd.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${idPrefix}-period-end`}
                type="date"
                value={state.periodEnd}
                onChange={(event) => onChange({ periodEnd: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-time-start`}>
                {JOB_FORM_FIELDS.timeStart.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${idPrefix}-time-start`}
                type="time"
                value={state.timeStart}
                onChange={(event) => onChange({ timeStart: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-time-end`}>
                {JOB_FORM_FIELDS.timeEnd.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${idPrefix}-time-end`}
                type="time"
                value={state.timeEnd}
                onChange={(event) => onChange({ timeEnd: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-hourly-rate`}>
                {JOB_FORM_FIELDS.hourlyRate.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${idPrefix}-hourly-rate`}
                type="number"
                inputMode="numeric"
                min={1}
                value={state.hourlyRate}
                onChange={(event) => onChange({ hourlyRate: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-hourly-headcount`}>
                {JOB_FORM_FIELDS.headcount.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${idPrefix}-hourly-headcount`}
                type="number"
                inputMode="numeric"
                min={1}
                value={state.headcount}
                onChange={(event) => onChange({ headcount: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-hourly-is-online`}>
                {JOB_FORM_FIELDS.isOnlineProject.label}
              </Label>
              <select
                id={`${idPrefix}-hourly-is-online`}
                value={state.hourlyIsOnline}
                onChange={(event) => onChange({ hourlyIsOnline: event.target.value })}
                className={SELECT_CLASS}
              >
                <option value="true">{JOB_FORM_FIELDS.isOnlineYes}</option>
                <option value="false">{JOB_FORM_FIELDS.isOnlineNo}</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-hourly-work-style`}>
                {JOB_FORM_FIELDS.workStyle.label}
                <span className="text-destructive">*</span>
              </Label>
              <select
                id={`${idPrefix}-hourly-work-style`}
                value={state.hourlyWorkStyle}
                onChange={(event) => onChange({ hourlyWorkStyle: event.target.value })}
                className={SELECT_CLASS}
              >
                <option value="" disabled>
                  {JOB_FORM_FIELDS.workStylePlaceholder}
                </option>
                {WORK_STYLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </ProfileSection>
      )}

      <ProfileSection title={JOB_FORM_SECTION_LABELS.requiredSkills}>
        <RequiredSkillsPicker
          skills={skills}
          selectedIds={state.requiredSkillIds}
          onChange={(ids) => onChange({ requiredSkillIds: ids })}
          idPrefix={idPrefix}
          labels={JOB_FORM_FIELDS.requiredSkills}
        />
        <div className="mt-5 flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-custom-required-skills-note`}>
            {JOB_FORM_FIELDS.customRequiredSkillsNote.label}
          </Label>
          <p className="text-xs text-muted-foreground">
            {JOB_FORM_FIELDS.customRequiredSkillsNote.helperText}
          </p>
          <Textarea
            id={`${idPrefix}-custom-required-skills-note`}
            value={state.customRequiredSkillsNote}
            onChange={(event) =>
              onChange({ customRequiredSkillsNote: event.target.value.slice(0, 500) })
            }
            placeholder={JOB_FORM_FIELDS.customRequiredSkillsNote.placeholder}
            maxLength={500}
            rows={3}
          />
          <p className="text-right text-xs text-muted-foreground">
            {state.customRequiredSkillsNote.length} / 500
          </p>
        </div>
      </ProfileSection>

      <ProfileSection title={JOB_FORM_SECTION_LABELS.preferredSkills}>
        <RequiredSkillsPicker
          skills={skills}
          selectedIds={state.preferredSkillIds}
          onChange={(ids) => onChange({ preferredSkillIds: ids })}
          idPrefix={`${idPrefix}-preferred`}
          labels={JOB_FORM_FIELDS.preferredSkills}
        />
      </ProfileSection>
    </>
  );
}

interface JobFormActionsProps {
  isSaving: boolean;
  formMessage: string | null;
  formStatus: "error" | "success" | null;
  cancelHref: string;
  saveLabel: string;
}

export function JobFormActions({
  isSaving,
  formMessage,
  formStatus,
  cancelHref,
  saveLabel,
}: JobFormActionsProps) {
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formMessage) {
      errorRef.current?.focus();
    }
  }, [formMessage]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <FormStatusMessage ref={errorRef} message={formMessage} status={formStatus} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSaving}
          aria-busy={isSaving}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isSaving ? JOB_FORM_BUTTON_LABELS.saving : saveLabel}
        </button>
        <Link
          href={cancelHref}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {JOB_FORM_BUTTON_LABELS.cancel}
        </Link>
      </div>
    </div>
  );
}

interface CreateJobFormProps {
  skills: Skill[];
}

export function CreateJobForm({ skills }: CreateJobFormProps) {
  const router = useRouter();
  const [state, setState] = useState<JobFormState>(() => buildInitialFormState());
  const [isSaving, setIsSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<"error" | "success" | null>(null);

  function updateState(patch: Partial<JobFormState>) {
    setState((prev) => ({ ...prev, ...patch }));
    if (formStatus === "error") {
      setFormMessage(null);
      setFormStatus(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setFormMessage(null);
    setFormStatus(null);

    const validationError = validateJobForm(state);
    if (validationError) {
      setFormMessage(validationError);
      setFormStatus("error");
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setFormMessage(JOB_FORM_ERRORS.notSignedIn);
        setFormStatus("error");
        return;
      }

      const input = buildOpportunityInput(state);
      const { data, error, stage } = await createCompanyOpportunity(supabase, input);

      if (stage === "invalid_input") {
        setFormMessage(JOB_FORM_ERRORS.invalidInput);
        setFormStatus("error");
        return;
      }

      if (stage === "company_name_required") {
        setFormMessage(JOB_FORM_ERRORS.companyNameRequiredToPublish);
        setFormStatus("error");
        return;
      }

      if (stage === "opportunity" || !data) {
        console.error("[job-form] create failed:", error, "stage:", stage);
        setFormMessage(JOB_FORM_ERRORS.saveFailed);
        setFormStatus("error");
        return;
      }

      router.push(`/company/jobs/${data.id}`);
      router.refresh();
    } catch (err) {
      console.error("[job-form] unexpected create error:", err);
      setFormMessage(JOB_FORM_ERRORS.saveFailed);
      setFormStatus("error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <JobFormFields
        state={state}
        onChange={updateState}
        skills={skills}
        idPrefix="create"
        isContractTypeLocked={false}
      />
      <JobFormActions
        isSaving={isSaving}
        formMessage={formMessage}
        formStatus={formStatus}
        cancelHref={CREATE_JOB_META.cancelHref}
        saveLabel={JOB_FORM_BUTTON_LABELS.save}
      />
    </form>
  );
}
