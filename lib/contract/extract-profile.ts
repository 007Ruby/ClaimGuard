
//maps concept keys to specific contract clauses

import OpenAI from 'openai';
import { CONCEPTS } from './concepts';
import { ANCHORS, CONSEQUENCE_TYPES, OWNERS } from './types';
import type {
  Anchor,
  ConceptKey,
  ConceptParameters,
  ConsequenceType,
  Owner,
} from './types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

//Clause-level reasoning on amended contracts 
const MODEL = 'gpt-5.6-terra';

//What one concept looks like coming back off the model, before validation. Validation to be implemented
export interface ExtractedConcept {
  key: ConceptKey;
  //The clause number as printed in this contract — which may not be the FIDIC number. 
  sourceClauseRef: string | null;
  //The clause heading as printed. 
  contractLabel: string | null;
  //Verbatim. This is what the user proofreads against and what the assistant quotes. 
  text: string;
  durationDays: number | null;
  anchor: Anchor | null;
  owner: Owner;
  consequence: ConsequenceType | null;
}

export type ExtractionResult = {
  concepts: ExtractedConcept[];
  //Concepts searched for and not found. Surfaced to the user, never silently filled. 
  missing: ConceptKey[];
};

//What to tell the model each concept is, in contract-administration language. 
const DESCRIPTIONS: Record<ConceptKey, string> = {
  delayed_instruction:
    'The contractor giving notice that a drawing or instruction he needs has not arrived, and the works will be delayed or disrupted without it.',
  claim_notice:
    "The contractor's first notice that he considers himself entitled to extra time or money. Usually the step that is time-barred: miss it and the entitlement is lost outright.",
  claim_particulars:
    'The fully detailed claim with supporting particulars, following the notice.',
  claim_response:
    "The Engineer's response approving or disapproving the claim in principle.",
  determination:
    'The Engineer consulting the parties and then determining the matter. Often has no counted period at all — a fair determination within a reasonable time.',
  payment_statement:
    'The contractor submitting his monthly Statement / application for interim payment to the Engineer.',
  ipc_issue:
    'The Engineer issuing the Interim Payment Certificate after receiving the Statement.',
  payment_due:
    'The Employer paying the certified amount. Read the anchor carefully: this period usually runs from the Engineer RECEIVING the Statement, not from the certificate being issued.',
  financing_charges:
    'Financing charges accruing on amounts not paid by the due date.',
  suspension_notice:
    'The contractor giving notice before suspending or reducing the rate of work for non-payment or non-certification.',
};

//Search terms used to cut the relevant windows out of a long contract. 
const KEYWORDS: Record<ConceptKey, string[]> = {
  delayed_instruction: ['delayed drawing', 'delayed instruction', 'further drawing'],
  claim_notice: ['notice of claim', "contractor's claims", 'became aware', 'shall give notice'],
  claim_particulars: ['fully detailed claim', 'supporting particulars', 'detailed claim'],
  claim_response: ['respond with approval', 'approval or disapproval', 'with detailed comments'],
  determination: ['determination', 'fair determination', 'consult with each party'],
  payment_statement: ['statement', 'application for interim payment', 'interim payment certificate'],
  ipc_issue: ['issue to the employer', 'interim payment certificate', 'shall issue'],
  payment_due: ['payment of the amount certified', 'shall be paid', 'days after'],
  financing_charges: ['financing charge', 'delayed payment', 'monthly rate', 'compounded'],
  suspension_notice: ['suspend work', 'reduce the rate of work', 'not less than', 'suspension'],
};

const GROUPS: { id: string; keys: ConceptKey[] }[] = [
  {
    id: 'claims',
    keys: ['delayed_instruction', 'claim_notice', 'claim_particulars', 'claim_response', 'determination'],
  },
  {
    id: 'payment',
    keys: ['payment_statement', 'ipc_issue', 'payment_due', 'financing_charges', 'suspension_notice'],
  },
];

//Cut windows of text around keyword hits.
function selectWindows(text: string, keys: ConceptKey[], budget: number): string {
  if (text.length <= budget) return text;

  const haystack = text.toLowerCase();
  const terms = keys.flatMap((k) => KEYWORDS[k]);
  const half = 4000;
  const spans: [number, number][] = [];

  for (const term of terms) {
    let from = 0;
    // Cap hits per term: a word like "statement" appears everywhere, and one term must not
    // consume the whole budget.
    for (let hits = 0; hits < 6; hits++) {
      const at = haystack.indexOf(term.toLowerCase(), from);
      if (at === -1) break;
      spans.push([Math.max(0, at - half), Math.min(text.length, at + half)]);
      from = at + term.length;
    }
  }

  if (spans.length === 0) return text.slice(0, budget);

  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }

  let out = '';
  for (const [start, end] of merged) {
    if (out.length >= budget) break;
    out += `\n\n[…]\n\n${text.slice(start, Math.min(end, start + (budget - out.length)))}`;
  }
  return out;
}

function buildPrompt(keys: ConceptKey[]): string {
  const specs = keys
    .map((k) => {
      const anchors = CONCEPTS[k].validAnchors.join(' | ');
      return `- key "${k}" (${CONCEPTS[k].canonicalName}): ${DESCRIPTIONS[k]}\n  allowed anchor values: ${anchors} | null`;
    })
    .join('\n');

  return `You are reading a construction contract to find specific contractual steps.

For each step below, find the clause in THIS contract that governs it and report what that clause actually says.

${specs}

Return ONLY minified JSON: {"concepts":[{...}],"missing":["key",...]}

Each entry in "concepts":
{
  "key": one of the keys above,
  "sourceClauseRef": the clause number AS PRINTED IN THIS DOCUMENT (e.g. "20.1", "Clause 44", "8.2(b)"), or null,
  "contractLabel": the clause heading as printed, or null,
  "text": the operative wording of the clause, copied VERBATIM. Do not summarise, paraphrase, correct or shorten it. Include the sentence stating the period.
  "durationDays": the period in DAYS as a whole number, or null if the clause gives no counted period (e.g. "within a reasonable time", "promptly", "as soon as practicable"),
  "anchor": what the period counts FROM, using only the allowed values listed for that key, or null,
  "owner": "contractor" | "engineer" | "employer" — who must act,
  "consequence": "condition_precedent" (the entitlement is lost if the period is missed) | "soft_support" (the claim is weakened but survives) | "counterparty_default" (the other party is in default) | "accrues_charges" | "enables_right" | null
}

CRITICAL RULES:
1. If you cannot find a clause in this document governing a step, put its key in "missing" and do NOT include it in "concepts". Never invent it.
2. NEVER supply a standard or typical value. If this document does not state a period, "durationDays" is null. Do not write 28 because 28 is usual. A wrong number here produces a wrong legal deadline.
3. Where a Particular Condition amends or replaces a General Condition, report the AMENDED position — that is what governs.
4. "consequence" is "condition_precedent" only where the clause says in terms that the entitlement, or the right to time or money, is lost or barred if the period is missed. Do not infer it from the period being important.
5. Convert weeks and months to days only where the clause states them that way (a "month" is 30 days unless the contract defines otherwise). If the unit is genuinely unclear, use null.
6. Copy "text" exactly as printed, including any sub-paragraph lettering.`;
}

function validate(raw: unknown, allowed: ConceptKey[]): ExtractedConcept[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { concepts?: unknown }).concepts)) {
    return [];
  }

  const out: ExtractedConcept[] = [];

  for (const item of (raw as { concepts: unknown[] }).concepts) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;

    const key = c.key as ConceptKey;
    if (!allowed.includes(key)) continue;
    if (typeof c.text !== 'string' || c.text.trim().length < 20) continue;

    // Anything not recognised is dropped, not coerced. 
    let anchor: Anchor | null = null;
    if (typeof c.anchor === 'string' && ANCHORS.includes(c.anchor as Anchor)) {
      if (CONCEPTS[key].validAnchors.includes(c.anchor as Anchor)) anchor = c.anchor as Anchor;
    }

    const owner: Owner = OWNERS.includes(c.owner as Owner) ? (c.owner as Owner) : 'contractor';

    let consequence: ConsequenceType | null = null;
    if (typeof c.consequence === 'string' && CONSEQUENCE_TYPES.includes(c.consequence as ConsequenceType)) {
      consequence = c.consequence as ConsequenceType;
    }

    let durationDays: number | null = null;
    if (typeof c.durationDays === 'number' && Number.isInteger(c.durationDays)) {
      if (c.durationDays > 0 && c.durationDays <= 3650) durationDays = c.durationDays;
    }

    out.push({
      key,
      sourceClauseRef: typeof c.sourceClauseRef === 'string' ? c.sourceClauseRef : null,
      contractLabel: typeof c.contractLabel === 'string' ? c.contractLabel : null,
      text: c.text.trim(),
      durationDays,
      anchor,
      owner,
      consequence,
    });
  }

  return out;
}

/**
 * Read the ten contractual steps out of a contract.
 *
 * Two calls, one per workflow group. Not one call over everything: the claims clauses and the
 * payment clauses live in different parts of the document, so splitting lets each call carry a
 * window budget spent entirely on clauses it actually needs. It also means a failure on one
 * group does not cost the other — the payment chain still populates if the claims call throws.
 */ 
export async function extractConceptsFromText(text: string): Promise<ExtractionResult> {
  const results = await Promise.all(
    GROUPS.map(async (group) => {
      try {
        const slice = selectWindows(text, group.keys, 90_000);
        const res = await openai.chat.completions.create({
          model: MODEL,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildPrompt(group.keys) },
            { role: 'user', content: slice },
          ],
        });
        const parsed: unknown = JSON.parse(res.choices[0]?.message.content ?? '{}');
        return validate(parsed, group.keys);
      } catch (e) {
        // Loud, always. A silent swallow here shows up as an unexplained half-empty page.
        console.error(`[extract-profile] group "${group.id}" failed:`, e);
        return [];
      }
    }),
  );

  const concepts = results.flat();
  const found = new Set(concepts.map((c) => c.key));
  const missing = GROUPS.flatMap((g) => g.keys).filter((k) => !found.has(k));

  return { concepts, missing };
}

// The parameters half of an extracted concept, in the shape the profile layer stores. 
export function toParameters(c: ExtractedConcept): Partial<ConceptParameters> {
  return {
    owner: c.owner,
    anchor: c.anchor,
    durationDays: c.durationDays,
    consequence: c.consequence,
  };
}