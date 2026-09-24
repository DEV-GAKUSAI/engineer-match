import { createClient } from '@/lib/supabase/server';
import { MineDocumentSnapshot, type MineDocument } from './MineDocumentSnapshot';
import { MineRirekishoPrint } from './MineRirekishoPrint';

export async function MineApplicationDocuments({ applicationId }: { applicationId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('application_mine_document_shares')
    .select('rirekisho_snapshot, shokumu_keirekisho_snapshot, consented_at')
    .eq('application_id', applicationId).maybeSingle();
  if (error) return <p role="alert">Mineの応募書類を読み込めませんでした。再読み込みしてください。</p>;
  if (!data) return null;
  const documents = [data.rirekisho_snapshot, data.shokumu_keirekisho_snapshot].filter(Boolean) as MineDocument[];
  return <section className="space-y-4 rounded-2xl border border-border bg-surface p-6"><h2 className="font-bold">Mineの応募書類</h2><p className="text-sm text-muted-foreground">応募時に共有された内容です。後からのプロフィール変更は反映されません。</p>{documents.length ? documents.map(doc => doc.title === '履歴書' ? <MineRirekishoPrint key={doc.title} document={doc} /> : <MineDocumentSnapshot key={doc.title} document={doc} />) : <p className="text-sm">書類を共有せずに応募しました。</p>}</section>;
}
