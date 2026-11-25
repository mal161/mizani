import { randomUUID } from "node:crypto";
import type { SmsProvider } from "./provider";

/** In-memory SMS provider for tests and local development; also logs to the console. */
export class FakeSms implements SmsProvider {
  sent: { to: string; message: string }[] = [];

  async send(to: string, message: string) {
    this.sent.push({ to, message });
    if (process.env.NODE_ENV !== "test") console.info(`[FakeSms] to ${to}: ${message}`);
    return { id: randomUUID() };
  }
}
