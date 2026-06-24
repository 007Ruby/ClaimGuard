// contracts/marina-heights/contract-data.ts
// ---------------------------------------------------------------------------
// Structured contract data for the fake test project "Marina Heights Tower".
// FIDIC Red Book 1999. AED 100,000,000 over 365 days, Dubai.
//
// This is the machine-readable companion to contract.md. Seed it into
// contracts.data (jsonb) so the engine reads commencement_date + dayOverrides
// and the claim builder reads the particulars for grounding.
//
// Time bars are the FIDIC defaults (in lib/fidic/clauses.ts); dayOverrides is
// empty here because the Particular Conditions for this project do not amend
// any default period. Add an entry to override (e.g. {"14.7-payment": 56}).
// ---------------------------------------------------------------------------

export const marinaHeightsContractData = {
  framework: "FIDIC Red Book 1999",
  project: "Marina Heights Tower",
  location: "Plot D-17, Dubai Marina, Dubai, United Arab Emirates",

  parties: {
    employer: "Marina Bay Developments LLC, Dubai, UAE",
    contractor: "Gulf Continental Contracting LLC, Dubai, UAE",
    engineer: "Meridian Consultants (Middle East), Dubai, UAE",
  },

  // Appendix to Tender values --------------------------------------------
  acceptedContractAmount: 100_000_000, // AED
  currency: "AED",
  commencementDate: "2026-02-01",
  timeForCompletionDays: 365, // -> completion 2027-01-31
  defectsNotificationPeriodDays: 365,

  governingLaw: "the laws of the United Arab Emirates as applied in the Emirate of Dubai",
  rulingLanguage: "English",
  languageForCommunications: "English",

  timeForAccessToSiteDays: 14, // SC 2.1 — days after Commencement Date
  performanceSecurityPct: 10, // SC 4.2 — % of Accepted Contract Amount
  normalWorkingHours: "07:00–18:00, Saturday to Thursday", // SC 6.5

  delayDamagesPerDayPct: 0.05, // SC 8.7 — % of final Contract Price / day
  delayDamagesPerDay: "0.05% of the final Contract Price per day",
  maxDelayDamagesPct: 10, // SC 8.7 — % of final Contract Price

  advancePaymentPct: 10, // SC 14.2 — % of Accepted Contract Amount
  advanceRepaymentStartPct: 10, // begins when certified payments reach 10%
  advanceRepaymentRatePct: 25, // amortised at 25% of each IPC
  retentionPct: 5, // SC 14.3
  retentionLimitPct: 5, // SC 14.3 — limit, % of Accepted Contract Amount
  minimumInterimPaymentCertificate: 2_000_000, // SC 14.6 — AED

  insuranceEvidenceDays: 14, // SC 18.1(a)
  thirdPartyInsuranceMin: 10_000_000, // SC 18.3 — AED per occurrence

  // Dispute resolution (Dubai standard post Decree 34/2021) ----------------
  dab: {
    appointBy: "28 days after the Commencement Date", // SC 20.2
    composition: "one sole member", // SC 20.2
    appointingEntity: "the Dubai International Arbitration Centre (DIAC)", // SC 20.3
  },
  arbitration: {
    rules: "the Arbitration Rules of the Dubai International Arbitration Centre (DIAC)",
    seat: "Dubai, United Arab Emirates",
    language: "English",
  },

  // Engine overrides — none for this project (defaults apply).
  dayOverrides: {} as Record<string, number>,
};

export type MarinaHeightsContractData = typeof marinaHeightsContractData;