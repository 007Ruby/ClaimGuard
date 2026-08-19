// app/api/chat/route.ts  →  POST /api/chat
// The chatbot endpoint. Takes the client's message history, builds the project
// context via buildChatContext(), and calls OpenAI with a strict system prompt
// that confines the model to the provided material (no outside facts about this
// project) and forbids inventing or recomputing deadlines. 
// History is capped per turn as a cost/latency guard.
// Each data section (e.g rfis, followups, claims, etc) have a separate try/catch in context.ts:
//      - If specific data fails to load, bot will respond but explicitly mention that section is unavailable
//      - If contract fails to load, bot refuses to answer

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { buildChatContext } from "@/lib/chat/context";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are ClaimGuard's assistant. You help a construction contractor understand their position under a FIDIC Red Book 1999 contract, using ONLY the material provided below about THIS project.

STRICT SOURCING RULES — follow exactly:
1. For any fact about THIS project (parties, dates, amounts, deadlines, what happened, what was claimed or asked), use ONLY the CONTRACT and PROJECT DIGEST below. Never use outside knowledge to assert a project fact.
2. If something isn't in the provided material, say so plainly, e.g. "I don't see that in the contract or project data." Do not guess or fill gaps.
3. You may use general FIDIC / construction knowledge ONLY to explain what a clause or term means in general — and you must clearly mark that as general explanation, not a fact about this project.
4. Any date or deadline in a section marked "system-computed — AUTHORITATIVE" was calculated by the ClaimGuard system. Report those as-is. Never invent, recompute, or adjust a date yourself. If asked to work out a new deadline, explain the basis but tell the user the system's tracked date is the one to rely on.
5. When you state a project fact, say where it came from (e.g. "per the contract", "from the event 'Foundation delay'", "from the awaiting-deadlines list").
6. You are a tool that assists. You do not send notices, file claims, or take any contractual action, and you are not a substitute for the contractor's own judgement or legal advice. Be concrete and useful, but don't declare a deadline definitively safe or met — point the user to confirm against their own records.

Answer concisely and practically.`;

const DEGRADED_PROMPT = `You are ClaimGuard's assistant, but THIS PROJECT'S DATA FAILED TO LOAD due to a technical/network error.
- Do NOT answer any question about this specific project: its parties, dates, amounts, deadlines, claims, RFIs, events, or evidence. You do not have that data right now.
- Tell the user plainly that their project data couldn't be loaded because of a technical issue, and to check their connection and try again shortly.
- You MAY still explain GENERAL FIDIC Red Book 1999 concepts, clearly marked as general information — but never present it as a fact about their project.
- Do not guess or reconstruct project facts from earlier in the conversation.`;

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const raw: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    const clean = raw
      .filter((m) => (m?.role === "user" || m?.role === "assistant") &&
                     typeof m.content === "string" && m.content.trim())
      .slice(-20); // cap history per turn — cost + latency guard
    if (clean.length === 0)
      return NextResponse.json({ error: "No message provided." }, { status: 400 });

let context = "";
    let contractError = false;
    let failedSections: string[] = [];
    try {
      const built = await buildChatContext();
      context = built.context;
      contractError = built.contractError;
      failedSections = built.failedSections;
    } catch (e) {
      console.error("[chat] context build failed:", e);
      contractError = true; // total build failure is itself a load-bearing failure
    }

    const systemContent = contractError
      ? DEGRADED_PROMPT
      : SYSTEM_PROMPT + "\n\n=== PROVIDED MATERIAL ===\n\n" + context;

    const res = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: systemContent },
        ...clean,
      ],
    });

    const reply = res.choices[0]?.message?.content?.trim()
      || "Sorry — I couldn't produce an answer just then. Try rephrasing.";
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