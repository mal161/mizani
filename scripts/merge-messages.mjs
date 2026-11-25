// Dev helper: deep-merges a {"en": {...}, "sw": {...}} JSON patch into messages/*.json.
// Usage: node scripts/merge-messages.mjs path/to/patch.json
import fs from "node:fs";

const patch = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const merge = (a, b) => {
  for (const [k, v] of Object.entries(b)) {
    a[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(a[k] ?? {}, v) : v;
  }
  return a;
};
for (const locale of Object.keys(patch)) {
  const file = `messages/${locale}.json`;
  const json = merge(JSON.parse(fs.readFileSync(file, "utf8")), patch[locale]);
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
}
