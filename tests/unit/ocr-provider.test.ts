import { describe, it, expect, afterEach, vi } from "vitest";
import { getOcrProvider, resetOcrProviderForTests } from "@/lib/ocr";
import { FakeOcrProvider } from "@/lib/ocr/fake";
import { HttpOcrProvider } from "@/lib/ocr/http";
import { OcrError } from "@/lib/ocr/provider";

const ENV_KEYS = ["OCR_PROVIDER", "OCR_URL", "OCR_API_KEY"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetOcrProviderForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe("getOcrProvider", () => {
  it("is off by default", () => {
    delete process.env.OCR_PROVIDER;
    expect(getOcrProvider()).toBeNull();
  });

  it("returns the fake provider", () => {
    process.env.OCR_PROVIDER = "fake";
    expect(getOcrProvider()?.name).toBe("fake");
  });

  it("is off with one warning when http has no key", () => {
    process.env.OCR_PROVIDER = "http";
    process.env.OCR_URL = "https://ocr.example";
    delete process.env.OCR_API_KEY;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getOcrProvider()).toBeNull();
    resetOcrProviderForTests();
    expect(getOcrProvider()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns the http provider when configured", () => {
    process.env.OCR_PROVIDER = "http";
    process.env.OCR_URL = "https://ocr.example";
    process.env.OCR_API_KEY = "k";
    expect(getOcrProvider()?.name).toBe("http");
  });
});

describe("HttpOcrProvider", () => {
  it("sends the file, the languages and the key, and maps the answer", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ text: "hello", confidence: 87.5, page_count: 2, engine: "tesseract 5.3", pages: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new HttpOcrProvider("https://ocr.example/", "k").read(png, "scan.png", "image/png");
    expect(result).toEqual({ text: "hello", confidence: 87.5, pageCount: 2, engine: "tesseract 5.3" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ocr.example/v1/ocr");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer k");
    const form = init.body as FormData;
    expect(form.get("languages")).toBe("eng+swa");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("does not retry input errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "file_too_large", message: "x" }, { status: 413 })));
    const err = await new HttpOcrProvider("https://ocr.example", "k").read(png, "a.png", "image/png").catch((e) => e);
    expect(err).toBeInstanceOf(OcrError);
    expect(err).toMatchObject({ code: "file_too_large", retryable: false });
  });

  it("retries server errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const err = await new HttpOcrProvider("https://ocr.example", "k").read(png, "a.png", "image/png").catch((e) => e);
    expect(err).toMatchObject({ code: "http_503", retryable: true });
  });

  it("retries when the service cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const err = await new HttpOcrProvider("https://ocr.example", "k").read(png, "a.png", "image/png").catch((e) => e);
    expect(err).toMatchObject({ code: "unreachable", retryable: true });
  });
});

describe("FakeOcrProvider", () => {
  it("returns deterministic text", async () => {
    const fake = new FakeOcrProvider();
    expect(await fake.read(png, "receipt.png", "image/png")).toEqual({
      text: "Scanned text of receipt.png",
      confidence: 90,
      pageCount: 1,
      engine: "fake",
    });
    expect(fake.calls).toEqual([{ fileName: "receipt.png" }]);
  });

  it("reports low confidence and failures by file name", async () => {
    const fake = new FakeOcrProvider();
    expect((await fake.read(png, "low-confidence.png", "image/png")).confidence).toBe(40);
    await expect(fake.read(png, "ocr-fail.png", "image/png")).rejects.toMatchObject({ code: "engine_error", retryable: true });
  });

  it("can be told to fail the next read", async () => {
    const fake = new FakeOcrProvider();
    fake.failNext(new OcrError("file_too_large", false));
    await expect(fake.read(png, "a.png", "image/png")).rejects.toMatchObject({ code: "file_too_large", retryable: false });
    expect((await fake.read(png, "a.png", "image/png")).confidence).toBe(90);
  });
});
