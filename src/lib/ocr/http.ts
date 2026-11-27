import { OcrError, type OcrProvider, type OcrResult } from "./provider";

/** A soma-OCR instance, through its public v1 API only. */
export class HttpOcrProvider implements OcrProvider {
  readonly name = "http";
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
  ) {}

  async read(bytes: Uint8Array, fileName: string, mime: string): Promise<OcrResult> {
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart], { type: mime }), fileName);
    form.append("languages", "eng+swa");
    let res: Response;
    try {
      res = await fetch(`${this.url.replace(/\/+$/, "")}/v1/ocr`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new OcrError("unreachable", true);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new OcrError(body?.error ?? `http_${res.status}`, res.status === 429 || res.status >= 500);
    }
    const b = (await res.json()) as { text: string; confidence: number; page_count: number; engine: string };
    return { text: b.text, confidence: b.confidence, pageCount: b.page_count, engine: b.engine };
  }
}
