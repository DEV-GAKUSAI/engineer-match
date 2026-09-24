"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, CheckCircle2 } from "lucide-react";
import { APPLY_SIDEBAR_LABELS, CONTRACT_TYPE_BADGE_STYLES, CONTRACT_TYPE_LABEL } from "@/constants/jobs";
import { createMineApplicationShareRequest } from "@/lib/engineer/applications";
import { addFavorite, removeFavorite } from "@/lib/engineer/favorites";
import { createClient } from "@/lib/supabase/client";
import type { CompanyContractType } from "@/lib/engineer/opportunities";

interface ApplySidebarProps {
  opportunityId: string;
  contractType: CompanyContractType;
  salaryLabel: string;
  updatedLabel: string;
  isSignedIn: boolean;
  userId: string | null;
  initialHasApplied: boolean;
  initialIsFavorited: boolean;
}

export function ApplySidebar({
  opportunityId,
  contractType,
  salaryLabel,
  updatedLabel,
  isSignedIn,
  userId,
  initialHasApplied,
  initialIsFavorited,
}: ApplySidebarProps) {
  const [hasApplied, setHasApplied] = useState(initialHasApplied);
  const [isApplying, setIsApplying] = useState(false);
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const [isFavoriting, setIsFavoriting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );

  async function handleApply() {
    if (!isSignedIn || !userId) {
      setMessage({ tone: "error", text: APPLY_SIDEBAR_LABELS.signInRequiredMessage });
      return;
    }
    if (hasApplied || isApplying) return;

    setIsApplying(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const { data: token, error } = await createMineApplicationShareRequest(supabase, opportunityId);

      if (error || !token) {
        setIsApplying(false);
        if (error?.code === "42501") {
          setMessage({ tone: "error", text: APPLY_SIDEBAR_LABELS.mineLinkRequiredMessage });
          return;
        }
        if (error?.code === "23505") {
          setHasApplied(true);
          setMessage({ tone: "error", text: APPLY_SIDEBAR_LABELS.duplicateApplicationMessage });
          return;
        }
        console.error("[apply-sidebar] Mine consent request failed:", error);
        setMessage({ tone: "error", text: APPLY_SIDEBAR_LABELS.mineConsentStartErrorMessage });
        return;
      }

      const mineUrl = (process.env.NEXT_PUBLIC_MINE_APP_URL ?? "https://mine-omega-one.vercel.app").replace(/\/$/, "");
      window.location.assign(`${mineUrl}/apply/engineer-match?token=${encodeURIComponent(token)}`);
    } catch {
      setMessage({ tone: "error", text: APPLY_SIDEBAR_LABELS.mineConsentStartErrorMessage });
    } finally {
      setIsApplying(false);
    }
  }
  async function handleToggleFavorite() {
    if (!isSignedIn || !userId) {
      setMessage({ tone: "error", text: APPLY_SIDEBAR_LABELS.signInRequiredMessage });
      return;
    }
    if (isFavoriting) return;

    const wasFavorited = isFavorited;
    setIsFavoriting(true);
    setIsFavorited(!wasFavorited);

    const supabase = createClient();
    const { error } = wasFavorited
      ? await removeFavorite(supabase, userId, opportunityId)
      : await addFavorite(supabase, userId, opportunityId);

    setIsFavoriting(false);

    if (error) {
      if (error.code === "23505") {
        // Row already exists from a prior successful add (double-click
        // race) — the DB already matches the optimistic "favorited" UI,
        // so don't revert it.
        setIsFavorited(true);
        return;
      }
      console.error("[apply-sidebar] favorite toggle failed:", error);
      setIsFavorited(wasFavorited);
      setMessage({ tone: "error", text: APPLY_SIDEBAR_LABELS.favoriteErrorMessage });
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${CONTRACT_TYPE_BADGE_STYLES[contractType]}`}
      >
        {CONTRACT_TYPE_LABEL[contractType]}
      </span>

      {salaryLabel && <p className="mt-3 text-lg font-bold text-foreground">{salaryLabel}</p>}

      {message && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
            message.tone === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.tone === "success" && (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {!isSignedIn ? (
        <Link
          href="/login"
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {APPLY_SIDEBAR_LABELS.applyLabel}
        </Link>
      ) : hasApplied ? (
        <button
          type="button"
          disabled
          className="mt-5 inline-flex h-11 w-full cursor-not-allowed items-center justify-center rounded-xl bg-muted text-sm font-semibold text-muted-foreground"
        >
          {APPLY_SIDEBAR_LABELS.alreadyAppliedLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleApply}
          disabled={isApplying}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isApplying ? APPLY_SIDEBAR_LABELS.applying : APPLY_SIDEBAR_LABELS.applyLabel}
        </button>
      )}

      <button
        type="button"
        onClick={handleToggleFavorite}
        disabled={isFavoriting}
        aria-pressed={isFavorited}
        className={`mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70 ${
          isFavorited
            ? "border-primary bg-primary/5 text-primary"
            : "border-border bg-surface text-foreground hover:bg-muted"
        }`}
      >
        <Bookmark className={`h-4 w-4 ${isFavorited ? "fill-primary" : ""}`} aria-hidden="true" />
        {isFavorited ? APPLY_SIDEBAR_LABELS.favoritedLabel : APPLY_SIDEBAR_LABELS.favoriteLabel}
      </button>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        {APPLY_SIDEBAR_LABELS.updatedLabel}：{updatedLabel}
      </p>
    </div>
  );
}
