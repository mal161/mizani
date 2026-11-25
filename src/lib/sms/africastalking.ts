import type { SmsProvider } from "./provider";

/** Africa's Talking SMS via REST. Uses the sandbox host when AT_USERNAME is "sandbox". */
export class AfricasTalkingSms implements SmsProvider {
  constructor(
    private username = process.env.AT_USERNAME ?? "sandbox",
    private apiKey = process.env.AT_API_KEY ?? "",
    private senderId = process.env.AT_SENDER_ID,
  ) {}

  async send(to: string, message: string) {
    const host =
      this.username === "sandbox"
        ? "https://api.sandbox.africastalking.com"
        : "https://api.africastalking.com";
    const body = new URLSearchParams({ username: this.username, to, message });
    if (this.senderId) body.set("from", this.senderId);
    const res = await fetch(`${host}/version1/messaging`, {
      method: "POST",
      headers: {
        apiKey: this.apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) throw new Error(`Africa's Talking SMS failed: ${res.status}`);
    const json = (await res.json()) as {
      SMSMessageData?: { Recipients?: { messageId: string; status: string }[] };
    };
    const r = json.SMSMessageData?.Recipients?.[0];
    if (!r || r.status !== "Success") {
      throw new Error(`Africa's Talking SMS rejected: ${r?.status ?? "no recipient"}`);
    }
    return { id: r.messageId };
  }
}
