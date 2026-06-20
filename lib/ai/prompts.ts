type EventLite = { id: string; title: string; type: string; occurred_on: string | null };

export function buildExtractionPrompt(sourceType: string, content: string, events: EventLite[]) {
  const eventList = events.length
    ? events.map((e) => `- id:${e.id} | ${e.title} | type:${e.type} | date:${e.occurred_on ?? "n/a"}`).join("\n")
    : "(none yet)";

  const system =
    "You are a construction contract administration assistant. You read a piece of evidence " +
    "(a pasted email or a site/document note) and extract structured data for a claims-tracking app. " +
    "Respond with a single JSON object and nothing else. Decide whether the evidence relates to an " +
    "EXISTING event, warrants CREATING a new one, or whether you are unsure (ask the user). " +
    "Never invent dates; use null if no date is clearly stated. " +
    "Allowed event categories: variation, delay, payment, instruction, site_issue, other.";

  const user = [
    `SOURCE TYPE: ${sourceType}`,
    `EXISTING EVENTS:\n${eventList}`,
    `EVIDENCE CONTENT:\n"""\n${content}\n"""`,
    "",
    "Return JSON exactly shaped like:",
    `{
  "title": "short title for this evidence item",
  "event_date": "YYYY-MM-DD or null",
  "summary": "1-2 sentence explanation of what this is and why it matters",
  "confidence": "low | medium | high",
  "event_decision": {
    "action": "link | create | ask",
    "event_id": "id of an existing event when action=link, else null",
    "reason": "why you chose this action",
    "new_event": { "title": "...", "type": "a category", "occurred_on": "YYYY-MM-DD or null", "description": "..." }
  }
}`,
    "If action is not 'create', set new_event to null. If action is not 'link', set event_id to null.",
  ].join("\n");

  return { system, user };
}