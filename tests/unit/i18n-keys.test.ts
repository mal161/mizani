import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import sw from "../../messages/sw.json";

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj)
    .flatMap(([k, v]) =>
      v && typeof v === "object"
        ? flattenKeys(v as Record<string, unknown>, `${prefix}${k}.`)
        : [`${prefix}${k}`],
    )
    .sort();
}

describe("translations", () => {
  it("sw has exactly the same keys as en", () => {
    expect(flattenKeys(sw)).toEqual(flattenKeys(en));
  });
});
