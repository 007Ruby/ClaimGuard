// app/api/chat/route.ts  →  POST /api/chat
// The chatbot endpoint. Takes the client's message history, builds the project
// context via buildChatContext(), and calls OpenAI with a strict system prompt
// that confines the model to the provided material (no outside facts about this
// project) and forbids inventing or recomputing deadlines. History is capped per
// turn as a cost/latency guard; a context-build failure is logged but still lets
// the model answer from history. Returns { reply } or a logged { error }.

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
    try { context = await buildChatContext(); }
    catch (e) { console.error("[chat] context build failed:", e); }

    const res = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\n\n=== PROVIDED MATERIAL ===\n\n" + context },
        ...clean,
      ],
    });

    const reply = res.choices[0]?.message?.content?.trim()
      || "Sorry — I couldn't produce an answer just then. Try rephrasing.";
    return NextResponse.json({ reply });
  } catch (e: any) {
    console.error("[chat] failed:", e);
    return NextResponse.json({ error: e?.message ?? "Chat failed." }, { status: 500 });
  }
}