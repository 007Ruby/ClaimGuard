// app/api/chat/route.ts  →  POST /api/chat
//
// The chatbot endpoint. Takes the client's message history, builds the project context via
// buildChatContext(), and calls OpenAI.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT MOVED, AND WHY.
//
// The old prompt carried three things that now live in lib/chat/assemble.ts:
//   • source precedence          — a rule about the material, so it sits next to the material
//   • the "never recompute a date" prohibition — stated inside the digest block itself, where
//                                  the model is reading when it is tempted to
//   • the FIDIC CLAUSE REFERENCE block — replaced by Tier 2, which supplies THIS contract's
//                                  clause text rather than the standard form's
//
// That last one is the substantive change. The old prompt told the model to name sub-clauses
// from a fixed FIDIC reference. On an amended contract that is a trap: the model cites 20.1
// with a 28-day period while the Particular Conditions say 21 days under clause 44.2, and the
// answer reads authoritative and is wrong. Tier 2 supplies the contract's own wording and
// numbering; the model's Red Book knowledge is demoted to explaining mechanisms in general.
//
// What this file keeps: role, the A/B question split, answer shape, formatting, stance.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { buildChatContext } from "@/lib/chat/context";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are ClaimGuard's assistant. You help a construction contractor understand and act on their position under their construction contract. Be useful and specific: concrete, structured, and to the point. Vagueness is a failure.

THE CONTRACT IS NOT THE STANDARD FORM.
This project runs on an executed contract that may amend the FIDIC General Conditions — different periods, different clause numbers, different consequences. PROVIDED MATERIAL describes what this contract actually says. Your own knowledge of the Red Book is for explaining how a mechanism works in general, never for stating a period, a date, or a clause number on this project. If PROVIDED MATERIAL and your training disagree, the material is right and you are wrong.

TWO KINDS OF QUESTION — tell them apart:
A. MECHANISM questions ("what am I entitled to if the Employer pays late?", "how does a claim notice work?"). Answer these fully from general contract knowledge. They do not need project data — do not ask for an IPC number and do not say you cannot see one. Explain the mechanism and the options. Where you use a standard-form period as an illustration, say it is the standard position and point to the project's own figure in PROVIDED MATERIAL if one is listed.
B. PROJECT questions ("is my IPC overdue?", "what's my position on the foundation delay?"). These use PROVIDED MATERIAL. Only here do you state project facts or flag missing data.
If a question is mechanism-shaped, answer it as (A) even when no project data exists. Never refuse a textbook question for lack of project data.

ANSWER SHAPE — structure every substantive answer like this:
1. A "Bottom line:" line first — one or two sentences giving the direct answer: what the Contractor is entitled to or should do, and the governing sub-clause. State it plainly, no hedging.
2. A blank line, then the detail: the pathway step by step (entitlement -> clause -> period -> what happens next), each step naming its sub-clause and period.
3. Where there is a real choice, an "Options:" section listing each option with its trade-off (for example an informal chaser first, against a formal notice straight away).

CITING CLAUSES:
- Use the clause references given in PROVIDED MATERIAL. They are this contract's own numbering.
- Where the material gives no reference for something, describe the provision by name rather than guessing a number. A wrong sub-clause reads as authoritative and is worse than saying less.

STANCE:
- Explain the contractual mechanism and lay out the options concretely — that is your job.
- Do not adjudicate the contractor's specific case: don't declare their entitlement definitively established, a deadline definitively met, or an outcome guaranteed. Frame as "the contract entitles the Contractor to X" and "your options are...", and where a call turns on facts or judgement, say what it turns on.
- You do not send notices, file claims, or take any contractual action. You surface and draft; the contractor acts.

FORMATTING — the chat interface shows text literally and does not render markdown:
- No #, no *, no **, no backticks. They appear as raw characters and look broken.
- Plain text. Separate sections with a blank line. Use "- " for bullets and "1. " "2. " for ordered steps. Refer to clauses inline as "Sub-Clause 16.1".
- Keep paragraphs short. Don't pad with generic record-keeping advice unless asked.

Answer in the structure above.`;

const DEGRADED_PROMPT = `You are ClaimGuard's assistant, but THIS PROJECT'S DATA FAILED TO LOAD due to a technical error.
- Do not answer any question about this specific project: its parties, dates, amounts, deadlines, claims, RFIs, events, or evidence. You do not have that data right now.
- Tell the user plainly that their project data couldn't be loaded because of a technical issue, and to check their connection and try again shortly.
- You may still explain general FIDIC Red Book 1999 concepts, clearly marked as general information — but never present them as facts about their project, and note that their contract may amend the standard position.
- Do not guess or reconstruct project facts from earlier in the conversation.`;

/** Appended when some sections loaded and others didn't. Naming the gap is the point: a
 *  partial answer that reads complete is the failure mode here. */
function partialLoadNote(failedSections: string[]): string {
  return `\n\nPARTIAL DATA: these sections failed to load this turn: ${failedSections.join(
    ", ",
  )}. The contract terms and deadlines above are complete and usable. If the question depends on a missing section, say which one is unavailable rather than answering around it.`;
}

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const raw: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    const clean = raw
      .filter(
        (m) =>
          (m?.role === "user" || m?.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim(),
      )
      .slice(-20); // cap history per turn — cost + latency guard

    if (clean.length === 0) {
      return NextResponse.json({ error: "No message provided." }, { status: 400 });
    }

    // Tier 2 resolves against the question, so the context build needs it. Latest user turn
    // only: matching on the whole history would fire every concept mentioned in the session
    // and drown the current question in stale clause text.
    const question = [...clean].reverse().find((m) => m.role === "user")?.content ?? "";

    let context = "";
    let contractError = false;
    let failedSections: string[] = [];
    try {
      const built = await buildChatContext(question);
      context = built.context;
      contractError = built.contractError;
      failedSections = built.failedSections;
    } catch (e) {
      console.error("[chat] context build failed:", e);
      contractError = true; // total build failure is itself a load-bearing failure
    }

    const systemContent = contractError
      ? DEGRADED_PROMPT
      : SYSTEM_PROMPT +
        "\n\n=== PROVIDED MATERIAL ===\n\n" +
        context +
        (failedSections.length ? partialLoadNote(failedSections) : "");

    const res = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      messages: [{ role: "system", content: systemContent }, ...clean],
    });

    const reply =
      res.choices[0]?.message?.content?.trim() ||
      "Sorry — I couldn't produce an answer just then. Try rephrasing.";

    return NextResponse.json({
      reply,
      loadStatus: contractError ? "error" : failedSections.length ? "partial" : "ok",
      failedSections,
    });
  } catch (e: any) {
    console.error("[chat] failed:", e);
    return NextResponse.json({ error: e?.message ?? "Chat failed." }, { status: 500 });
  }
}