type EventLite = { id?: string; title: string; type: string; occurred_on: string | null; description: string | null };
type Inputs = { description: string; claim_type?: string | null; relief_sought?: string | null; amount?: number | null };

// STAGE 1 — pick relevant events + outline the argument.
export function buildOutlinePrompt(inputs: Inputs, events: EventLite[]) {
  const list = events.length
    ? events.map((e) => `- id:${e.id} | "${e.title}" | category:${e.type} | date:${e.occurred_on ?? "n/a"} | notes: ${e.description ?? "—"}`).join("\n")
    : "(no events on the project yet)";

  const system = [
    "You are a construction contract-administration assistant helping a SUBCONTRACTOR build a claim",
    "against the main contractor. Return JSON only.",
    "A claim argues an entitlement to additional MONEY and/or TIME arising from events outside the",
    "subcontractor's original price and programme. A good claim has: a basis, a cause-and-effect chain",
    "from event to loss, and substantiation from contemporaneous records.",
    "",
    "Do TWO things:",
    "1. Select which of the listed events are genuinely relevant to THIS claim (by id).",
    "2. Produce a concise outline (5-9 bullet points) of the key argument points the claim should make,",
    "   grounded in the selected events — name the dated facts, the cause and effect, and what each event",
    "   substantiates.",
    "",
    "NEVER invent monetary amounts or durations. Use a figure only if it appears in the inputs or an",
    "event's notes. Where a figure is needed but absent, write the point with a placeholder like",
    "'[INSERT AMOUNT]' or '[INSERT NUMBER OF DAYS]' so the user knows to supply it.",
    // FIDIC hook (parked): contractual basis / sub-clause references would be injected here later.
  ].join("\n");

  const user = [
    `CLAIM TYPE: ${inputs.claim_type ?? "unspecified"}`,
    `RELIEF SOUGHT: ${inputs.relief_sought ?? "unspecified"}`,
    `AMOUNT PROVIDED: ${typeof inputs.amount === "number" ? inputs.amount : "none"}`,
    `CLAIM DESCRIPTION (the user's framing):\n"""\n${inputs.description}\n"""`,
    `PROJECT EVENTS:\n${list}`,
    "",
    "Return JSON exactly shaped like:",
    `{ "relevant_event_ids": ["..."], "key_points": ["point 1", "point 2"] }`,
  ].join("\n");

  return { system, user };
}

// STAGE 2 — write the claim from the approved events + edited outline.
export function buildClaimPrompt(
  inputs: { title: string; claim_type?: string | null; relief_sought?: string | null; amount?: number | null; description: string },
  events: EventLite[],
  keyPoints: string[]
) {
  const list = events.length
    ? events.map((e) => `- "${e.title}" (${e.type}, ${e.occurred_on ?? "no date"}): ${e.description ?? "—"}`).join("\n")
    : "(no events selected)";
  const points = keyPoints.length ? keyPoints.map((p) => `- ${p}`).join("\n") : "(none provided)";

  const system = [
    "You are a construction contract-administration assistant drafting a formal claim for a SUBCONTRACTOR",
    "to issue to the main contractor. Return JSON only: { \"claim\": \"...\" }.",
    "",
    "Structure the claim as flowing prose with these parts:",
    "1. A short opening stating what is being claimed and the relief sought (money / time / both).",
    "2. A chronological narrative of the relevant events, with their dates.",
    "3. The cause-and-effect: how those events caused the subcontractor's loss, delay, or disruption.",
    "4. Substantiation: reference the events as contemporaneous records supporting the position.",
    "5. A closing statement of the relief sought.",
    "",
    "CRITICAL — quantum: NEVER invent or estimate an amount or a duration. Use ONLY figures explicitly",
    "supplied by the user. Wherever a figure is needed but was not supplied, insert a clearly marked",
    "placeholder in square brackets, e.g. '[INSERT AMOUNT — to be substantiated]' or '[INSERT NUMBER OF",
    "DAYS]'. Do not guess, round, or infer numbers from context.",
    "",
    "Tone: professional, measured, contractual. Do not cite specific contract clauses unless the user",
    "provided them. Write in clear paragraphs, not bullet points.",
  ].join("\n");

  const user = [
    `CLAIM TITLE: ${inputs.title}`,
    `CLAIM TYPE: ${inputs.claim_type ?? "unspecified"}`,
    `RELIEF SOUGHT: ${inputs.relief_sought ?? "unspecified"}`,
    `AMOUNT PROVIDED BY USER: ${typeof inputs.amount === "number" ? inputs.amount : "none — use a placeholder if an amount is needed"}`,
    `USER'S DESCRIPTION:\n"""\n${inputs.description}\n"""`,
    `APPROVED KEY POINTS (the spine of the argument):\n${points}`,
    `SUPPORTING EVENTS:\n${list}`,
    "",
    `Return JSON exactly shaped like: { "claim": "the full claim text" }`,
  ].join("\n");

  return { system, user };
}