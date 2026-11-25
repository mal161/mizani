import { describe, it, expect } from "vitest";
import { adminClient, signInAs, makeCase } from "../helpers/db";

const year = new Date().getFullYear();

describe("core schema", () => {
  it("next_case_number is unique and sequential under concurrency", async () => {
    const admin = adminClient();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => admin.rpc("next_case_number")),
    );
    const nums = results.map((r) => {
      expect(r.error).toBeNull();
      return r.data as string;
    });
    const re = new RegExp(`^ACC/${year}/\\d{6}$`);
    nums.forEach((n) => expect(n).toMatch(re));
    expect(new Set(nums).size).toBe(20);
    const seqs = nums.map((n) => Number(n.slice(-6))).sort((a, b) => a - b);
    expect(seqs[19] - seqs[0]).toBe(19);
  });

  it("inserting a case writes an audit_log insert row", async () => {
    const { userId } = await signInAs("complainant", "+254700000101");
    const c = await makeCase(userId);
    const { data } = await adminClient()
      .from("audit_log")
      .select("*")
      .eq("entity", "cases")
      .eq("entity_id", c.id)
      .eq("action", "insert");
    expect(data).toHaveLength(1);
  });

  it("audit_log cannot be updated or deleted, even by service role", async () => {
    const admin = adminClient();
    const { data: row } = await admin
      .from("audit_log")
      .select("id")
      .limit(1)
      .single();
    const upd = await admin
      .from("audit_log")
      .update({ action: "tampered" })
      .eq("id", row!.id);
    expect(upd.error).not.toBeNull();
    const del = await admin.from("audit_log").delete().eq("id", row!.id);
    expect(del.error).not.toBeNull();
  });

  it("settings are seeded", async () => {
    const { data } = await adminClient()
      .from("settings")
      .select("key,value")
      .eq("key", "advocate_response_days")
      .single();
    expect(data!.value).toBe(14);
  });
});
