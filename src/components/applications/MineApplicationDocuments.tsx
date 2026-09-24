import { createClient } from '@/lib/supabase/server';
import { MineDocumentSnapshot, type MineDocument } from './MineDocumentSnapshot';
import { MineRirekishoPrint } from './MineRirekishoPrint';
import { createAdminClient } from '@/lib/supabase/admin';

export async function MineApplicationDocuments({ applicationId }: { applicationId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('application_mine_document_shares')
    .select('rirekisho_snapshot, shokumu_keirekisho_snapshot, rirekisho_pdf_path, shokumu_keirekisho_pdf_path, consented_at')
    .eq('application_id', applicationId).maybeSingle();
  if (error) return <p role="alert">Mineの応募書類を読み込めませんでした。再読み込みしてください。</p>;
  if (!data) return null;
  const documents = [data.rirekisho_snapshot, data.shokumu_keirekisho_snapshot].filter(Boolean) as MineDocument[];
  const admin = createAdminClient();
  const paths = [data.rirekisho_pdf_path, data.shokumu_keirekisho_pdf_path].filter(Boolean) as string[];
  const links = admin && paths.length ? (await admin.storage.from('mine-application-pdfs').createSignedUrls(paths, 900)).data ?? [] : [];
  return <section className="space-y-4 rounded-2xl border border-border bg-surface p-6"><h2 className="font-bold">Mineの応募書類</h2><p className="text-sm text-muted-foreground">応募時に共有された内容です。後からのプロフィール変更は反映されません。</p>{links.length ? <div className="flex flex-wrap gap-3">{links.map((item, index) => item.signedUrl && <a key={paths[index]} href={item.signedUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{paths[index].includes('shokumu') ? '職務経歴書PDFを開く' : '履歴書PDFを開く'}</a>)}</div> : null}{documents.length ? documents.map(doc => doc.title === '履歴書' ? <MineRirekishoPrint key={doc.title} document={doc} /> : <MineDocumentSnapshot key={doc.title} document={doc} />) : <p className="text-sm">書類を共有せずに応募しました。</p>}</section>;
}
