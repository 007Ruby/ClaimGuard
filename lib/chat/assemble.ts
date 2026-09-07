// lib/chat/assemble.ts
//
// THE THREE-TIER CONTEXT ASSEMBLER. Pure and synchronous apart from Tier 3 — no session, no
// Supabase, no I/O of its own. Loading and failure handling stay in context.ts; this file only
// turns already-loaded material into prompt blocks, which makes it testable against a fixture
// profile with no database.
//
//   TIER 1 — always resident. Project identity, the resolved parameters, and the live digest of
//            engine-computed deadlines. Never conditional, never inferred. This is what makes
//            date answers trustworthy: the bot RELAYS what the engine computed.
//
//   TIER 2 — concept-addressed. When the question resolves to a modelled concept (DNS lookup in
//            concept-match.ts), the exact clause text and provenance for that concept.
//
//   TIER 3 — always-on, relevance-gated retrieval over the rest of the corpus. Fails soft;
//            currently a null implementation (retrieval.ts).
//
// ─────────────────────────────────────────────────────────────────────────────
// DIVISION OF LABOUR WITH THE SYSTEM PROMPT — worth being explicit about, because getting it
// wrong produces two sets of rules that quietly disagree.
//
//   The system prompt owns:   role, answer shape, formatting, stance, what not to adjudicate.
//   This file owns:           what is true about this project, and which source wins.
//
// Precedence lives HERE, adjacent to the material it ranks, rather than in the prompt. A rule
// about the material is easier to follow when it sits next to the material, and it stops the
// prompt from asserting things about blocks that may not have been assembled this turn.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConceptKey, Owner, StoredContractProfile } from '@/lib/contract/types';
import { resolveParameter } from '@/lib/contract/resolve';
import { CONCEPTS } from '@/lib/contract/concepts';
import type { ProjectContractData } from '@/lib/contract/contract-data';
import { matchConcepts, type ConceptMatch } from './concept-match';
import { retrieveChunks, type RetrievalDeps, type RetrievalResult } from './retrieval';

/**
 * The exact marker the system prompt keys off. Declared as a constant and interpolated rather
 * than typed out in both files, because a prompt instruction that references a string the
 * assembler no longer emits points at nothing and fails silently.
 */
export const AUTHORITATIVE_MARKER = 'system-computed — AUTHORITATIVE';

// ---------------------------------------------------------------------------
// Digest.
//
// Produced by loadChatDigest() in lib/fidic/get-obligations.ts, which already has the engine
// output in hand. Declared here as the contract between the two, so lib/chat carries no import
// from lib/fidic and an engine refactor breaks one mapper rather than the bot.
//
// No 'satisfied' status: the digest carries OPEN obligations only. A closed obligation is not
// context, it is history, and listing it invites the model to answer about a deadline that no
// longer matters.
// ---------------------------------------------------------------------------
export interface LiveDigestItem {
  eventId: string;
  eventTitle: string;
  /** The modelled concept this obligation belongs to, where the engine step maps to one. */
  conceptKey: ConceptKey | null;
  /** The action, e.g. "Serve Notice of Claim". */
  label: string;
  description: string | null;
  /** ISO date, engine-computed. Null for nominal obligations with no hard clock. */
  dueDate: string | null;
  daysRemaining: number | null;
  status: 'upcoming' | 'due_soon' | 'overdue' | 'time_barred';
  owner: Owner;
  /** The contract's own clause reference, for citation. */
  clauseRef: string | null;
  outstandingAmount: number | null;
}

export interface ProjectIdentity {
  projectName: string;
  employer: string | null;
  engineer: string | null;
  contractor: string | null;
  contractValue: string | null;
  commencementDate: string | null;
  /** ISO. Explicit, because it is the anchor of every relative date the bot states. */
  today: string;
}

export interface AssembledContext {
  /** Ordered blocks to concatenate into the provided material. */
  blocks: string[];
  /** Which concepts Tier 2 fired on — for the trace / sources affordance. */
  matchedConcepts: ConceptMatch[];
  retrieval: RetrievalResult;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export function buildIdentity(input: {
  projectName: string;
  data: ProjectContractData | null;
  commencementDate: string | null;
  today?: string;
}): ProjectIdentity {
  const d = input.data;
  const amount = typeof d?.acceptedContractAmount === 'number' ? d.acceptedContractAmount : null;
  const currency = typeof d?.currency === 'string' ? d.currency : null;

  return {
    projectName: input.projectName,
    employer: d?.parties?.employer ?? null,
    engineer: d?.parties?.engineer ?? null,
    contractor: d?.parties?.contractor ?? null,
    contractValue:
      amount === null ? null : `${currency ?? ''} ${amount.toLocaleString('en-US')}`.trim(),
    commencementDate: input.commencementDate,
    today: input.today ?? new Date().toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Confirmation.
//
// An unamended FIDIC period is confirmed by construction — nobody extracted it, it is
// ClaimGuard's own licensed reference data. An extracted value is confirmed only once a human
// has proofread the clause it came from. This is why extraction output is never silently
// load-bearing.
// ---------------------------------------------------------------------------
export function isParameterConfirmed(
  profile: Pick<StoredContractProfile, 'meta' | 'parameters' | 'clauseMap'>,
  key: ConceptKey,
): boolean {
  // The user's own edit needs no proofreading.
  if (profile.parameters.manual[key] !== undefined) return true;
  // Nothing extracted: on a FIDIC profile the General Conditions stand unamended and are
  // confirmed by construction; on a bespoke profile there is nothing behind them at all.
  if (profile.parameters.contract[key] === undefined) {
    return profile.meta.profileType === 'fidic';
  }
  return profile.clauseMap[key]?.confirmed === true;
}

// ---------------------------------------------------------------------------
// TIER 1
// ---------------------------------------------------------------------------

function buildIdentityBlock(identity: ProjectIdentity): string {
  return [
    '## Project',
    `Project: ${identity.projectName}`,
    identity.employer ? `Employer: ${identity.employer}` : null,
    identity.engineer ? `Engineer: ${identity.engineer}` : null,
    identity.contractor ? `Contractor: ${identity.contractor}` : null,
    identity.contractValue ? `Contract value: ${identity.contractValue}` : null,
    identity.commencementDate ? `Commencement: ${identity.commencementDate}` : null,
    `Today's date: ${identity.today}`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

/**
 * Unconfirmed parameters are INCLUDED and marked, not omitted. Omitting them would leave the
 * model to fill the gap from its own FIDIC training — the silent-wrong-answer failure this
 * whole architecture exists to prevent. Marked-and-present lets it say "the extracted value is
 * 21 days but nobody has confirmed it yet".
 */
function buildParametersBlock(profile: StoredContractProfile): string {
  const absent = new Set(profile.absentConcepts);
  const lines: string[] = [
    '## Contract terms for this project (AUTHORITATIVE)',
    `Base form: ${profile.meta.baseLabel}`,
    '',
    'These are the periods this contract actually carries, and the values the deadline engine',
    'computes from. Where one differs from the General Conditions default, this governs. Do',
    'not substitute a standard-form period for anything listed here.',
    '',
  ];

  for (const key of Object.keys(CONCEPTS) as ConceptKey[]) {
    const name = profile.clauseMap[key]?.canonicalName ?? CONCEPTS[key].canonicalName;

    if (absent.has(key)) {
      lines.push(`- ${name}: NOT PRESENT in this contract. Do not cite it.`);
      continue;
    }

    const p = resolveParameter(profile, key);
    const ref = profile.clauseMap[key]?.sourceClauseRef;

    // Unresolved is NOT a value. Nothing in any layer describes this concept, so there is no
    // period, no deadline, and nothing to reason from. Saying so plainly is the only safe
    // output — the alternative is the model supplying a standard-form period from memory.
    if (!p.resolved) {
      lines.push(
        `- ${name}: NOT FOUND in this contract. No period is tracked. Do not state one, ` +
          'and do not fall back on the standard form. Tell the user it has not been set up.',
      );
      continue;
    }

    lines.push(
      [
        `- ${name}${ref ? ` (${ref})` : ''}:`,
        p.durationDays === null ? 'no fixed period (reasonable time)' : `${p.durationDays} days`,
        `| owner: ${p.owner}`,
        p.anchor ? `| runs from: ${p.anchor.replace(/_/g, ' ')}` : '| trigger event, no clock',
        p.consequence ? `| on expiry: ${p.consequence.replace(/_/g, ' ')}` : '',
        isParameterConfirmed(profile, key)
          ? ''
          : '| UNCONFIRMED — read from the document, not yet checked by the user',
      ]
        .filter(Boolean)
        .join(' '),
    );

    if (p.challengeWindow) {
      lines.push(
        `    - challenge window: ${p.challengeWindow.days} days, ${p.challengeWindow.owner}, ` +
          `${p.challengeWindow.consequence.replace(/_/g, ' ')}`,
      );
    }
    if (p.financingRate) {
      const r = p.financingRate;
      lines.push(
        `    - rate: ${
          r.basis === 'fixed_annual'
            ? `${(r.fixedAnnualRate ?? 0) * 100}% per annum, fixed`
            : `central bank discount rate plus ${r.marginPoints ?? 0} percentage points`
        }, compounded ${r.compounding}`,
      );
    }
  }

  if (profile.notes) {
    lines.push('', '### Notes recorded by the user about this contract', profile.notes);
  }

  return lines.join('\n');
}

/**
 * The digest. Carries dates the ENGINE computed. The prohibition on recomputing is stated
 * inline, at the point the model is reading when it is tempted to.
 */
function buildDigestBlock(items: LiveDigestItem[]): string {
  if (items.length === 0) {
    return [
      '## Live deadlines',
      'No open obligations are currently tracked on this project. That means nothing is',
      'outstanding in the system — not that nothing is outstanding on site.',
    ].join('\n');
  }

  const order: LiveDigestItem['status'][] = ['time_barred', 'overdue', 'due_soon', 'upcoming'];
  const sorted = [...items].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  const lines = [
    `## Live deadlines (${AUTHORITATIVE_MARKER})`,
    '',
    'Every date below was calculated by ClaimGuard from confirmed real-world dates. Relay them',
    'exactly. Never recompute a date, and never adjust one for weekends or holidays. If a date',
    'is not listed here, say it is not tracked rather than working one out.',
    '',
  ];

  for (const i of sorted) {
    const rel =
      i.daysRemaining === null
        ? ''
        : i.daysRemaining < 0
          ? ` (${Math.abs(i.daysRemaining)} days overdue)`
          : ` (${i.daysRemaining} days remaining)`;

    lines.push(
      `- [${i.status.replace(/_/g, ' ')}] ${i.eventTitle}: ${i.label} — due ${
        i.dueDate ?? 'no fixed date'
      }${rel} — ${i.owner} to act${i.clauseRef ? ` — ${i.clauseRef}` : ''}${
        i.outstandingAmount !== null ? ` — outstanding ${i.outstandingAmount.toLocaleString('en-US')}` : ''
      }`,
    );
    if (i.description) lines.push(`    ${i.description}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// TIER 2
// ---------------------------------------------------------------------------

function buildClauseBlock(profile: StoredContractProfile, matches: ConceptMatch[]): string | null {
  const entries = matches
    .map((m) => ({ match: m, entry: profile.clauseMap[m.key] }))
    .filter(
      (e): e is { match: ConceptMatch; entry: NonNullable<typeof e.entry> } =>
        e.entry !== undefined && e.entry.text !== null,
    );

  if (entries.length === 0) return null;

  const lines = [
    '## Clause text from this contract (verbatim)',
    '',
    'This is the executed wording, not a standard form. Quote and cite it by the reference',
    "given. Where it differs from what the General Conditions normally say, this is what the",
    'parties agreed.',
    '',
  ];

  for (const { entry } of entries) {
    const heading = [entry.sourceClauseRef, entry.contractLabel ?? entry.canonicalName]
      .filter(Boolean)
      .join(' — ');
    lines.push(`### ${heading}`);
    if (!entry.confirmed) {
      lines.push('(This wording was read from the document and has not been checked by the user.)');
    }
    lines.push(entry.text ?? '', '');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// TIER 3
// ---------------------------------------------------------------------------

function buildRetrievalBlock(result: RetrievalResult, alreadyCited: Set<string>): string | null {
  if (!result.available || result.chunks.length === 0) return null;

  // Drop anything Tier 2 already supplied exactly. Tier 2's copy carries provenance and is
  // authoritative; a fuzzy near-duplicate is token cost that invites self-contradiction.
  const fresh = result.chunks.filter(
    (c) => c.sourceClauseRef === null || !alreadyCited.has(c.sourceClauseRef),
  );
  if (fresh.length === 0) return null;

  const lines = [
    '## Other passages from the contract that may be relevant',
    '',
    'Found by similarity search. Lower confidence than everything above, and possibly off',
    'topic. Never take a date or a period from this section.',
    '',
  ];
  for (const c of fresh) {
    lines.push(
      `### ${c.sourceClauseRef ?? 'Unreferenced passage'}${c.page ? ` (page ${c.page})` : ''}`,
      c.text,
      '',
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Precedence. Assembled LAST — the position the model weights most heavily, and the only place
// the ranking is stated. Without it the model averages its sources.
// ---------------------------------------------------------------------------
const PRECEDENCE_NOTE = `## Which source wins

Highest first:
1. Live deadlines — dates ClaimGuard computed. Relay, never recompute.
2. Contract terms for this project — the periods and consequences this contract carries.
3. Clause text from this contract — for wording, quotation, and citation.
4. Other retrieved passages — supporting context only.
5. Your own knowledge of the FIDIC Red Book — for explaining how a mechanism works in
   general, and for nothing else.

If a lower source appears to contradict a higher one, the higher one governs, and say so
rather than reconciling them quietly. A period marked UNCONFIRMED should still be used, but
flag that it has not been checked and point the user to Settings > Workflows to confirm it.
If a project fact is not here, say it is not there. Do not fill the gap from general FIDIC
knowledge — this contract may have amended exactly that provision, and a confident wrong
period is worse than an admitted gap.`;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface AssembleInput {
  question: string;
  projectId: string;
  identity: ProjectIdentity;
  profile: StoredContractProfile;
  digest: LiveDigestItem[];
  /** Supabase + OpenAI clients for Tier 3. Pass null to run on Tiers 1 and 2 alone — which is
   *  a complete, correct assistant, just one without contract-wide search. */
  retrievalDeps: RetrievalDeps | null;
}

/**
 * assembleContext — build the three-tier context for one turn.
 *
 * Tier 3 is awaited but never allowed to throw: a retrieval failure degrades the answer, it
 * does not break the chat. Tiers 1 and 2 are pure, so a total AI-infrastructure outage still
 * leaves the bot able to state every deadline correctly.
 */
export async function assembleContext(input: AssembleInput): Promise<AssembledContext> {
  const { question, projectId, identity, profile, digest, retrievalDeps } = input;

  const blocks: string[] = [
    buildIdentityBlock(identity),
    buildParametersBlock(profile),
    buildDigestBlock(digest),
  ];

  const matchedConcepts = matchConcepts(question, profile);
  const clauseBlock = buildClauseBlock(profile, matchedConcepts);
  if (clauseBlock) blocks.push(clauseBlock);

  const alreadyCited = new Set(
    matchedConcepts
      .map((m) => profile.clauseMap[m.key]?.sourceClauseRef)
      .filter((r): r is string => !!r),
  );

  let retrieval: RetrievalResult;
  try {
    retrieval = await retrieveChunks(question, projectId, retrievalDeps);
  } catch (err) {
    console.error('[chat/assemble] Tier 3 retrieval failed:', err);
    retrieval = { chunks: [], available: false, reason: 'Retrieval threw.' };
  }

  const retrievalBlock = buildRetrievalBlock(retrieval, alreadyCited);
  if (retrievalBlock) blocks.push(retrievalBlock);

  blocks.push(PRECEDENCE_NOTE);

  return { blocks, matchedConcepts, retrieval };
}