// lib/rfi/grounding.ts
//
// Distilled grounding for RFIs. Unlike SCL_GROUNDING (which is applied
// conditionally), RFI_GROUNDING applies to EVERY RFI — there is no
// notice-only vs detailed distinction here, so no gating helper is needed.

export const RFI_GROUNDING = `
A Request for Further Information (RFI) is a formal query by which the Contractor seeks clarification, missing information, or a decision from the Engineer (or, where appropriate, the Employer). The FIDIC Conditions of Contract for Construction (Red Book, 1999) contain no dedicated RFI sub-clause and impose no fixed period for a response — an RFI is a contract-administration instrument, so any response date is a reasonable expectation set by the Contractor, not a time-barred deadline.

RFIs are, however, frequent precursors to claims. Where the Contractor has requested drawings, instructions or information reasonably required in order to proceed with the Works and these are not issued within a time reasonable in all the circumstances, Sub-Clause 1.9 (Delayed Drawings or Instructions) may entitle the Contractor to an extension of time and/or Cost. Accordingly: frame each query precisely; record the date the query is raised; and where a query concerns information the Contractor needs in order to proceed without delay, make clear that a timely response is required, referencing Sub-Clause 1.9 where the failure to respond would cause delay or disruption.

Other sub-clauses may bear on particular queries and should be cited where relevant: Sub-Clause 3.3 (Instructions of the Engineer), Sub-Clause 1.5 (Priority of Documents) where documents conflict, and Sub-Clause 4.7 (Setting Out) for level or position data.

Write in formal UK contractual English. Cite sub-clauses in the form 'Sub-Clause 1.9'. Never invent facts, amounts, dates or durations — use only what the user has provided, and insert bracketed placeholders such as [INSERT date] or [INSERT drawing reference] otherwise.
`.trim();