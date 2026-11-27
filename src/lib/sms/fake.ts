import { randomUUID } from "node:crypto";
import type { SmsProvider } from "./provider";

/**
 * In-memory SMS provider for tests and local development; also logs to the console. With SMS_TEST_INBOX=on it
 * also keeps a copy for the admin test SMS inbox (test-inbox.ts), loaded only then so unit tests stay offline.
 */
export class FakeSms implements SmsProvider {
  sent: { to: string; message: string }[] = [];

  async send(to: string, message: string) {
    this.sent.push({ to, message });
    if (process.env.NODE_ENV !== "test")
      console.info(`[FakeSms] to ${to}: ${message}`);
    if (process.env.SMS_TEST_INBOX === "on") {
      const { recordTestSms } = await import("./test-inbox");
      await recordTestSms(to, message);
    }
    return { id: randomUUID() };
  }
}
