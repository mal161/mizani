/** A document's OCR result as staff pages and the AI summary read it. */
export interface OcrTextRow {
  status: "pending" | "done" | "failed" | "skipped";
  text: string | null;
  confidence: number | null;
}

/** Below this mean confidence, OCR text is shown with a warning and kept out of AI summaries. */
export const OCR_RELIABLE_CONFIDENCE = 60;
