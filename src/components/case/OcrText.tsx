import { getTranslations } from "next-intl/server";

export interface OcrTextRow {
  status: "pending" | "done" | "failed" | "skipped";
  text: string | null;
  confidence: number | null;
}

/** Below this, the text is shown with a warning and kept out of AI summaries. */
export const OCR_RELIABLE_CONFIDENCE = 60;

/**
 * What OCR read from one scanned document, for staff and commissioners only (the RLS on document_texts
 * returns nothing to anyone else). `rereadAction` adds a "Read text again" button after a failure.
 */
export async function OcrText({
  row,
  documentId,
  path,
  rereadAction,
}: {
  row: OcrTextRow | null;
  documentId: string;
  path: string;
  rereadAction?: (formData: FormData) => Promise<void>;
}) {
  if (!row || row.status === "skipped") return null;
  const t = await getTranslations("ocr");

  if (row.status === "pending") return <p className="mt-1 text-xs text-slate-500">{t("pending")}</p>;

  if (row.status === "failed") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        <span>{t("failed")}</span>
        {rereadAction && (
          <form action={rereadAction}>
            <input type="hidden" name="documentId" value={documentId} />
            <input type="hidden" name="path" value={path} />
            <button type="submit" className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover">
              {t("reread")}
            </button>
          </form>
        )}
      </div>
    );
  }

  const confidence = Math.round(Number(row.confidence ?? 0));
  const text = (row.text ?? "").trim();
  return (
    <details className="mt-1 rounded-md border border-slate-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm text-slate-700">
        {t("summary", { confidence })}
        {confidence < OCR_RELIABLE_CONFIDENCE && (
          <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent-ink">{t("low")}</span>
        )}
      </summary>
      {text ? (
        <p className="max-h-64 overflow-y-auto px-3 pb-2 text-sm whitespace-pre-wrap text-slate-800">{text}</p>
      ) : (
        <p className="px-3 pb-2 text-sm text-slate-600">{t("empty")}</p>
      )}
      <p className="px-3 pb-3 text-xs text-slate-500">{t("note")}</p>
    </details>
  );
}
