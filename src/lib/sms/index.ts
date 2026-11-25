import type { SmsProvider } from "./provider";
import { FakeSms } from "./fake";
import { AfricasTalkingSms } from "./africastalking";

export type { SmsProvider } from "./provider";

let fakeSingleton: FakeSms | undefined;

/** Selects the SMS provider from SMS_PROVIDER (fake | africastalking). Fake is a process-wide singleton. */
export function getSmsProvider(): SmsProvider {
  if (process.env.SMS_PROVIDER === "africastalking") return new AfricasTalkingSms();
  fakeSingleton ??= new FakeSms();
  return fakeSingleton;
}
