/** One CSV cell: always quoted, quotes doubled, and spreadsheet formulas neutralised with a leading apostrophe. */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** A CSV document (CRLF line endings, trailing CRLF). */
export function toCsv(head: string[], rows: unknown[][]): string {
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
