import type { OcrProvider } from "./provider";
import { FakeOcrProvider } from "./fake";
import { HttpOcrProvider } from "./http";

export type { OcrProvider, OcrResult } from "./provider";
export { OcrError } from "./provider";

let cached: { key: string; provider: OcrProvider | null } | null = null;
const warned = new Set<string>();

/**
 * The configured OCR provider, from OCR_PROVIDER (default "none"):
 * - "http": a soma-OCR instance (OCR_URL, OCR_API_KEY); "fake": deterministic stand-in; "none": OCR off.
 * Missing settings mean OCR is off (null), with one warning.
 */
export function getOcrProvider(): OcrProvider | null {
  const env = process.env;
  const kind = (env.OCR_PROVIDER ?? "none").toLowerCase();
  const key = [kind, env.OCR_URL, env.OCR_API_KEY ? "k" : ""].join("|");
  if (cached?.key === key) return cached.provider;
  let provider: OcrProvider | null = null;
  if (kind === "fake") provider = new FakeOcrProvider();
  else if (kind === "http") {
    if (env.OCR_URL && env.OCR_API_KEY) provider = new HttpOcrProvider(env.OCR_URL, env.OCR_API_KEY);
    else if (!warned.has("http")) {
      warned.add("http");
      console.warn("OCR_PROVIDER=http needs OCR_URL and OCR_API_KEY: OCR is off.");
    }
  }
  cached = { key, provider };
  return provider;
}

export function resetOcrProviderForTests() {
  cached = null;
}
