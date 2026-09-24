// POST /api/chat — the chatbot endpoint. All logic lives in lib/chat/run.ts; this route only
// parses the request and returns the public fields (never the trace).

import { NextResponse } from "next/server";
import { cleanMessages, runChat } from "@/lib/chat/run";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const clean = cleanMessages(body?.messages);
    if (clean.length === 0) {
      return NextResponse.json({ error: "No message provided." }, { status: 400 });
    }

    const r = await runChat(clean);
    return NextResponse.json({
      reply: r.reply,
      loadStatus: r.loadStatus,
      failedSections: r.failedSections,
    });
  } catch (e: any) {
    console.error("[chat] failed:", e);
    return NextResponse.json({ error: e?.message ?? "Chat failed." }, { status: 500 });
  }
}