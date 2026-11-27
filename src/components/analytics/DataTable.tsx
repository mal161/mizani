import type { ReactNode } from "react";

/** The table view behind every chart (and the only view for tabular sections). */
export function DataTable({ caption, head, rows }: { caption?: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="mb-2 text-left text-xs text-slate-500">{caption}</caption>}
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={`border-b px-2 py-1.5 font-medium text-slate-600 ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="odd:bg-slate-50">
              {r.map((c, ci) => (
                <td key={ci} className={`px-2 py-1.5 ${ci === 0 ? "text-left" : "text-right tabular-nums"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
