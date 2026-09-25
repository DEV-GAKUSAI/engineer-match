import { ExternalLink, FileDown } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MineDocumentSnapshot, type MineDocument } from "./MineDocumentSnapshot";
import { MineRirekishoPrint } from "./MineRirekishoPrint";

type DocumentEntry = {
  title: "履歴書" | "職務経歴書";
  snapshot: MineDocument | null;
  path: string | null;
};

export async function MineApplicationDocuments({ applicationId }: { applicationId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application_mine_document_shares")
    .select(
      "rirekisho_snapshot, shokumu_keirekisho_snapshot, rirekisho_pdf_path, shokumu_keirekisho_pdf_path, consented_at",
    )
    .eq("application_id", applicationId)
    .maybeSingle();

  if (error) {
    return <p role="alert">Mineの応募書類を読み込めませんでした。再読み込みしてください。</p>;
  }
  if (!data) return null;

  const allEntries: DocumentEntry[] = [
    {
      title: "履歴書",
      snapshot: data.rirekisho_snapshot as MineDocument | null,
      path: data.rirekisho_pdf_path,
    },
    {
      title: "職務経歴書",
      snapshot: data.shokumu_keirekisho_snapshot as MineDocument | null,
      path: data.shokumu_keirekisho_pdf_path,
    },
  ];
  const entries = allEntries.filter((entry) => entry.snapshot !== null);

  const paths = entries.flatMap((entry) => (entry.path ? [entry.path] : []));
  const admin = createAdminClient();
  const signedResults =
    admin && paths.length
      ? ((await admin.storage.from("mine-application-pdfs").createSignedUrls(paths, 3600)).data ?? [])
      : [];
  const signedUrlByPath = new Map(
    paths.map((path, index) => [path, signedResults[index]?.signedUrl ?? null]),
  );

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
      <div>
        <h2 className="font-bold">Mineの応募書類</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          応募時に共有されたPDFです。後からのプロフィール変更は反映されません。
        </p>
      </div>

      {entries.length ? (
        entries.map((entry) => {
          const signedUrl = entry.path ? signedUrlByPath.get(entry.path) : null;
          if (signedUrl) {
            return <ApplicationPdf key={entry.title} title={entry.title} signedUrl={signedUrl} />;
          }

          return (
            <div key={entry.title} className="space-y-2">
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                この応募には{entry.title}PDFが保存されていないため、共有された内容を表示しています。
              </p>
              {entry.title === "履歴書" ? (
                <MineRirekishoPrint document={entry.snapshot!} />
              ) : (
                <MineDocumentSnapshot document={entry.snapshot!} />
              )}
            </div>
          );
        })
      ) : (
        <p className="text-sm">書類を共有せずに応募しました。</p>
      )}
    </section>
  );
}

function ApplicationPdf({
  title,
  signedUrl,
}: {
  title: DocumentEntry["title"];
  signedUrl: string;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">Mineで応募時に作成されたPDF</p>
        </div>
        <a
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          <FileDown className="size-4" />
          PDFを開く・印刷
          <ExternalLink className="size-3.5" />
        </a>
      </header>
      <iframe
        src={`${signedUrl}#toolbar=1&navpanes=0`}
        title={`${title}PDF`}
        className="h-[70vh] min-h-[520px] w-full bg-slate-100 sm:min-h-[720px]"
      />
    </article>
  );
}
