/** What an OCR engine returns for one document. */
export interface OcrResult {
  text: string;
  confidence: number;
  pageCount: number;
  engine: string;
}

/**
 * An OCR failure. `retryable`: trying again later could succeed. `consumesAttempt`: false for configuration
 * problems on our side (wrong key, wrong URL), so documents keep being retried until the setting is fixed.
 */
export class OcrError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly consumesAttempt = true,
  ) {
    super(`OCR failed: ${code}`);
    this.name = "OcrError";
  }
}

export interface OcrProvider {
  readonly name: string;
  read(bytes: Uint8Array, fileName: string, mime: string): Promise<OcrResult>;
}
