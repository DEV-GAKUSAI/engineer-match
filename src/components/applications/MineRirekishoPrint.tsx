"use client";

import { Printer } from "lucide-react";
import type { MineDocument } from "./MineDocumentSnapshot";

type RecordValue = Record<string, unknown>;
const asRecord = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => value === null || value === undefined || value === "" ? "未入力" : String(value);
const rows = (value: unknown) => Array.isArray(value) ? value.map(asRecord) : [];

export function MineRirekishoPrint({ document }: { document: MineDocument }) {
  const content = asRecord(document.content);
  const basic = asRecord(content["基本情報"]);
  const education = rows(content["学歴"]);
  const work = rows(content["職歴"]);
  const qualifications = rows(content["資格"]);
  return <section className="rounded-xl border border-slate-200 p-4 print:border-0 print:p-0">
    <button type="button" onClick={() => window.print()} className="mb-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white print:hidden"><Printer className="size-4" />印刷 / PDFとして保存</button>
    <article className="mx-auto max-w-[794px] bg-white p-6 text-[#1e2523] shadow-sm print:w-[210mm] print:shadow-none sm:p-10">
      <header className="mb-4 flex items-end justify-between border-b-2 border-[#909895] pb-2"><h3 className="text-2xl font-bold tracking-[.2em]">履歴書</h3><span className="text-xs">応募時に共有された内容</span></header>
      <table className="w-full border-collapse text-sm"><tbody>
        {[["ふりがな", basic["ふりがな"]],["氏名", basic["氏名"]],["生年月日", basic["生年月日"]],["性別", basic["性別"]],["住所", basic["住所"]],["電話番号", basic["電話番号"]],["メールアドレス", basic["メール"]]].map(([label,value]) => <tr key={String(label)}><th className="w-32 border border-[#cfd6d3] bg-[#f4f5f3] px-3 py-2 text-left text-xs font-medium">{String(label)}</th><td className="border border-[#cfd6d3] px-3 py-2">{text(value)}</td></tr>)}
      </tbody></table>
      <History title="学歴" items={education} name="学校" /><History title="職歴" items={work} name="会社" />
      <History title="資格・免許" items={qualifications} name="資格" />
      <table className="mt-5 w-full border-collapse text-sm"><tbody>{[["志望動機・自己PR", content["志望動機"] || content["自己紹介"]],["特技", content["特技"]],["本人希望記入欄", content["本人希望"]]].map(([label,value]) => <tr key={String(label)}><th className="w-40 border border-[#cfd6d3] bg-[#f4f5f3] px-3 py-3 text-left text-xs font-medium">{String(label)}</th><td className="whitespace-pre-wrap border border-[#cfd6d3] px-3 py-3">{text(value)}</td></tr>)}</tbody></table>
    </article>
  </section>;
}
function History({ title, items, name }: { title: string; items: RecordValue[]; name: string }) { return <table className="mt-5 w-full border-collapse text-sm"><thead><tr><th colSpan={3} className="border border-[#cfd6d3] bg-[#f4f5f3] py-2 text-xs">{title}</th></tr></thead><tbody>{items.length ? items.map((item,index) => <tr key={index}><td className="w-20 border border-[#cfd6d3] px-2 py-2 text-xs">{text(item["開始"] || item["取得日"])}</td><td className="border border-[#cfd6d3] px-3 py-2">{text(item[name])}{item["役職"] ? ` ${text(item["役職"])}` : ""}</td></tr>) : <tr><td colSpan={3} className="border border-[#cfd6d3] px-3 py-3 text-center text-xs text-slate-500">記載なし</td></tr>}</tbody></table>; }
