import type { Locale } from "@/i18n/routing";

const SMS_LIMIT = 160;

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
  decisionIssued: (l: Locale, caseNumber: string, outcome: string) =>
    l === "sw"
      ? `ACC: Uamuzi umetolewa kwa kesi ${caseNumber}: ${outcome}. Soma sababu na pakua barua kwenye Mizani.`
      : `ACC: A decision was issued on case ${caseNumber}: ${outcome}. Read the reasons and download the letter on Mizani.`,
  /**
   * Hearing notice: date/time in Nairobi, venue or "online" (the link is only shown in the portals).
   * A venue too long for one SMS is shortened with "..." (plain dots keep the GSM-7 encoding; "…" would not).
   */
  hearingScheduled: (l: Locale, caseNumber: string, when: string, place: string | null) => {
    const text = (p: string) => (l === "sw" ? `ACC: Usikilizaji wa kesi ${caseNumber} ni ${when}, ${p}.` : `ACC: Hearing for case ${caseNumber} on ${when}, ${p}.`);
    const where = place ?? (l === "sw" ? "mtandaoni (kiungo kiko Mizani)" : "online (link on Mizani)");
    const full = text(where);
    if (full.length <= SMS_LIMIT) return full;
    const room = SMS_LIMIT - (full.length - where.length) - 3;
    return text(`${where.slice(0, Math.max(0, room)).trimEnd()}...`);
  },
  hearingChanged: (l: Locale, caseNumber: string, what: string) =>
    l === "sw" ? `ACC: Usikilizaji wa kesi ${caseNumber}: ${what}. Angalia Mizani.` : `ACC: Hearing for case ${caseNumber}: ${what}. See Mizani.`,
  /** To the advocate (roll phone). No complainant details. */
  advocateNotified: (l: Locale, caseNumber: string, due: string) =>
    l === "sw"
      ? `ACC: Lalamiko dhidi yako, kesi ${caseNumber}. Jibu kabla ya ${due}. Maelezo na nambari ya uanzishaji yako kwenye barua ya ilani.`
      : `ACC: A complaint has been made against you, case ${caseNumber}. Respond by ${due}. See the notice letter for details and your activation code.`,
  infoRequested: (l: Locale, caseNumber: string) =>
    l === "sw"
      ? `ACC: Tunahitaji maelezo zaidi kuhusu kesi ${caseNumber}. Ingia kwenye Mizani kuona ombi na kujibu.`
      : `ACC: We need more information on case ${caseNumber}. Sign in to Mizani to see the request and reply.`,
};
