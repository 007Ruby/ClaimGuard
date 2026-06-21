const CATEGORIES = ["variation", "delay", "payment", "instruction", "site_issue", "other"] as const;

// Step 1: classify + extract. NO events are shown, so the model can't be
// biased toward linking to whatever event happens to exist.
export function buildClassifyPrompt(sourceType: string, content: string) {
  const system = [
    "You are a construction contract-administration assistant. Return JSON only.",
    "You read ONE piece of evidence (a pasted email or a site/document note), extract its details,",
    "and classify it into exactly one category. Judge the evidence on its own content only.",
    "Categories:",
    "- variation: a change to scope of work.",
    "- delay: an impact to time / programme / extension of time.",
    "- payment: payment certificates, deductions, valuations, backcharges, non-payment.",
    "- instruction: a direction, RFI, drawing issue, or verbal/written instruction.",
    "- site_issue: site access, conditions, damage, housekeeping, weather.",
    "- other: none of the above.",
    "Never invent dates; use null if no date is clearly stated.",
  ].join("\n");

  const user = [
    `SOURCE TYPE: ${sourceType}`,
    `EVIDENCE CONTENT:\n"""\n${content}\n"""`,
    "",
    "Return JSON exactly shaped like:",
    `{
  "title": "short title for this evidence item",
  "category": "one of: ${CATEGORIES.join(", ")}",
  "event_date": "YYYY-MM-DD or null",
  "summary": "1-2 sentence explanation of what this is and why it matters",
  "confidence": "low | medium | high"
}`,
  ].join("\n");

  return { system, user };
}

// Step 3: link decision, run ONLY against same-category candidates.
export function buildLinkPrompt(
  evidence: { title: string; category: string; summary: string },
  candidates: { id: string; title: string; occurred_on: string | null; description: string | null }[]
) {
  const list = candidates
    .map((e) => `- id:${e.id} | "${e.title}" | date:${e.occurred_on ?? "n/a"} | notes: ${e.description ?? "—"}`)
    .join("\n");

  const system = [
    "You are a construction contract-administration assistant. Return JSON only.",
    "You are given ONE piece of evidence and a shortlist of EXISTING events that are ALREADY the same",
    "category as the evidence. Decide whether the evidence concerns the SAME underlying matter as one.",
    "Rules:",
    "- 'link' ONLY if it is the same specific matter (same certificate, same instruction, same work area,",
    "  same dispute). Same category is NOT enough on its own.",
    "- 'create' if none of the listed events concern the same matter.",
    "- 'ask' if two or more plausibly match and you cannot tell which.",
    "- match_score is your 0.0-1.0 confidence that the evidence and the chosen event are the SAME matter.",
    "  Score LOW when guessing; only score high for a concrete subject-matter overlap.",
    "- In 'reason', quote the deciding words from BOTH the evidence and the event (or state none matched).",
  ].join("\n");

  const user = [
    `EVIDENCE: "${evidence.title}" (category: ${evidence.category})`,
    `EVIDENCE SUMMARY: ${evidence.summary}`,
    `SAME-CATEGORY EVENTS:\n${list}`,
    "",
    "Return JSON exactly shaped like:",
    `{
  "action": "link | create | ask",
  "event_id": "id of a listed event when action=link, else null",
  "match_score": 0.0,
  "reason": "quote the deciding words, or state none matched"
}`,
  ].join("\n");

  return { system, user };
}