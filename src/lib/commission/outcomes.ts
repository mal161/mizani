export const OUTCOMES = ["dismissed", "withdrawn", "settled", "admonished", "refund_ordered", "referred_to_tribunal"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export function isOutcome(v: string): v is Outcome {
  return (OUTCOMES as readonly string[]).includes(v);
}

/** Labels for letters and SMS (UI uses the message catalogues). */
export const OUTCOME_LABELS: Record<"en" | "sw", Record<Outcome, string>> = {
  en: {
    dismissed: "Complaint dismissed",
    withdrawn: "Complaint withdrawn",
    settled: "Resolved by agreement",
    admonished: "Advocate admonished",
    refund_ordered: "Refund ordered",
    referred_to_tribunal: "Referred to the Disciplinary Tribunal",
  },
  sw: {
    dismissed: "Lalamiko limetupiliwa mbali",
    withdrawn: "Lalamiko limeondolewa",
    settled: "Limetatuliwa kwa makubaliano",
    admonished: "Wakili ameonywa",
    refund_ordered: "Amri ya kurejesha pesa",
    referred_to_tribunal: "Limepelekwa kwa Mahakama ya Nidhamu",
  },
};
