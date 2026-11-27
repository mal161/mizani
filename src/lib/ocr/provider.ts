/** What an OCR engine returns for one document. */
export interface OcrResult {
  text: string;
  confidence: number;
  pageCount: number;
  engine: string;
}

/** An OCR failure; `retryable` says whether trying again later could succeed. */
export class OcrError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(`OCR failed: ${code}`);
    this.name = "OcrError";
  }
}

export interface OcrProvider {
  readonly name: string;
  read(bytes: Uint8Array, fileName: string, mime: string): Promise<OcrResult>;
}
