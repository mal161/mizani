import type { Locale } from "@/i18n/routing";

/** SMS templates. Each must stay within one 160-character SMS. */
export const smsText = {
  filed: (l: Locale, caseNumber: string, pin: string) =>
    l === "sw"
      ? `ACC: Lalamiko lako limepokelewa. Kesi ${caseNumber}. PIN ${pin}. Fuatilia mizani au USSD. Usimpe mtu PIN.`
      : `ACC: Your complaint was received. Case ${caseNumber}. PIN ${pin}. Track online or via USSD. Keep your PIN private.`,
  statusChanged: (l: Locale, caseNumber: string, stageLabel: string) =>
    l === "sw"
      ? `ACC: Kesi ${caseNumber} sasa iko hatua: ${stageLabel}.`
      : `ACC: Case ${caseNumber} is now at stage: ${stageLabel}.`,
  infoRequested: (l: Locale, caseNumber: string) =>
    l === "sw"
      ? `ACC: Tunahitaji maelezo zaidi kuhusu kesi ${caseNumber}. Ingia kwenye Mizani kuona ombi na kujibu.`
      : `ACC: We need more information on case ${caseNumber}. Sign in to Mizani to see the request and reply.`,
};
