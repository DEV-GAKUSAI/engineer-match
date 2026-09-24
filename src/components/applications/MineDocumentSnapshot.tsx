export type DocumentValue = string | number | boolean | null | DocumentValue[] | { [key: string]: DocumentValue };
export type MineDocument = { version: number; title: string; content: DocumentValue };

function Value({ value }: { value: DocumentValue }) {
  if (value === null || value === '') return <span className="text-slate-500">未入力</span>;
  if (typeof value === 'boolean') return <span>{value ? 'はい' : 'いいえ'}</span>;
  if (Array.isArray(value)) return value.length ? <ul className="space-y-3">{value.map((item, index) => <li key={index} className="border-l-2 border-slate-200 pl-3"><Value value={item} /></li>)}</ul> : <span className="text-slate-500">記載なし</span>;
  if (typeof value === 'object') return <dl className="space-y-3">{Object.entries(value).map(([label, item]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words"><Value value={item} /></dd></div>)}</dl>;
  return <span>{value}</span>;
}

export function MineDocumentSnapshot({ document }: { document: MineDocument }) {
  return <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-semibold">{document.title}の共有内容を確認</summary><div className="mt-4 text-sm leading-6"><Value value={document.content} /></div></details>;
}
