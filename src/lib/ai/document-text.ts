import { extractText, getDocumentProxy } from "unpdf";

/**
 * Text from a PDF's text layer, read locally on the server (files are never sent to an AI provider).
 * Returns null for non-PDFs, image-only (scanned) PDFs, or unreadable files. No OCR.
 */
export async function extractPdfText(bytes: Uint8Array, maxChars = 20_000): Promise<string | null> {
  // "%PDF" magic number: don't hand arbitrary bytes to the parser.
  if (bytes.length < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return null;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = (Array.isArray(text) ? text.join("\n") : text).replace(/[ \t]+/g, " ").trim();
    return clean ? clean.slice(0, maxChars) : null;
  } catch {
    return null;
  }
}
