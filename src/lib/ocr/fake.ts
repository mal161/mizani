import { OcrError, type OcrProvider, type OcrResult } from "./provider";

/** Deterministic stand-in for tests and demos without an OCR service. Never calls a network. */
export class FakeOcrProvider implements OcrProvider {
  readonly name = "fake";
  calls: { fileName: string }[] = [];
  private nextError: OcrError | null = null;

  failNext(error: OcrError) {
    this.nextError = error;
  }

  async read(_bytes: Uint8Array, fileName: string): Promise<OcrResult> {
    this.calls.push({ fileName });
    const err = this.nextError;
    this.nextError = null;
    if (err) throw err;
    if (fileName.includes("ocr-fail")) throw new OcrError("engine_error", true);
    const confidence = fileName.includes("low-confidence") ? 40 : 90;
    return { text: `Scanned text of ${fileName}`, confidence, pageCount: 1, engine: "fake" };
  }
}
