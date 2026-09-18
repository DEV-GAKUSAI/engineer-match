"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function MineAccountLinkCard({ token }: { token: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  async function completeLink() {
    if (isSubmitting || status === "success") return;
    setIsSubmitting(true);
    setStatus("idle");

    const supabase = createClient();
    const { error } = await supabase.rpc("complete_mine_engineer_account_link", {
      p_token: token,
    });

    setIsSubmitting(false);
    if (error) {
      console.error("[mine-account-link] failed to complete account link:", error);
      setStatus("error");
      return;
    }
    setStatus("success");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12">
      <section className="w-full rounded-3xl border border-indigo-100 bg-white p-7 shadow-sm sm:p-9">
        <span className="grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Link2 className="size-6" aria-hidden="true" />
        </span>
        <p className="mt-5 text-xs font-bold tracking-[0.14em] text-indigo-600">
          MINE × ENGINEER MATCH
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Mineアカウントを連携
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Mineで登録した職種・スキルを、Engineer Matchの案件提案に利用できるようにします。履歴書や連絡先は、この連携だけでは共有されません。
        </p>

        {status === "success" ? (
          <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              アカウントを連携しました
            </div>
            <p className="mt-2 leading-6">
              応募時に、Mineの履歴書・職務経歴書を共有するか選べるようになります。
            </p>
            <Link
              href="/engineer/jobs"
              className="mt-4 inline-flex font-semibold text-emerald-800 underline underline-offset-4"
            >
              案件を探す
            </Link>
          </div>
        ) : (
          <>
            {status === "error" && (
              <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-700">
                連携用リンクの有効期限が切れているか、すでに別のアカウントと連携されています。Mineから新しい連携リンクを作成してください。
              </p>
            )}
            <button
              type="button"
              onClick={completeLink}
              disabled={isSubmitting}
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Mineアカウントを連携する
            </button>
          </>
        )}
      </section>
    </main>
  );
}
