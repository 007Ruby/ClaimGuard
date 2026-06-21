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

// Step 3: link decision. Sees ALL events; matches on subject matter, not category.
export function buildLinkPrompt(
  evidence: { title: string; category: string; summary: string },
  candidates: { id: string; title: string; type: string; occurred_on: string | null; description: string | null }[]
) {
  const list = candidates
    .map((e) => `- id:${e.id} | "${e.title}" | category:${e.type} | date:${e.occurred_on ?? "n/a"} | notes: ${e.description ?? "—"}`)
    .join("\n");

  const system = [
    "You are a construction contract-administration assistant. Return JSON only.",
    "You are given ONE piece of evidence and a list of EXISTING events on the project.",
    "Decide whether the evidence concerns the SAME real-world MATTER as one of the events.",
    "",
    "Judge on SUBJECT, not document type. Same matter means things like:",
    "- the same physical work area or location (e.g. east elevation, Level 12, north core),",
    "- the same drawing / instruction / RFI / variation / certificate reference (e.g. AI-114, CW-204, PC No. 07),",
    "- the same dispute, deduction, or chain of correspondence.",
    "",
    "CRITICAL: a related event can be a DIFFERENT category from the evidence. One real matter often",
    "produces several document types — e.g. an instruction (category: instruction) and the resulting",
    "scope change (category: variation) are the SAME matter and SHOULD link. Never refuse to link just",
    "because the categories differ. The evidence's own category is only a hint, not a filter.",
    "",
    "Rules:",
    "- 'link' if the evidence and a listed event are clearly the same matter (shared area, reference, or dispute).",
    "- 'create' if no listed event concerns the same matter.",
    "- 'ask' if two or more events plausibly match and you cannot tell which.",
    "- match_score is your 0.0-1.0 confidence that evidence and chosen event are the SAME matter.",
    "  Score high only for a concrete overlap (shared reference, area, or dispute). Score low when guessing.",
    "- In 'reason', quote the deciding words from BOTH the evidence and the event (or state none matched).",
  ].join("\n");

  const user = [
    `EVIDENCE: "${evidence.title}" (category hint: ${evidence.category})`,
    `EVIDENCE SUMMARY: ${evidence.summary}`,
    `EXISTING EVENTS:\n${list}`,
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