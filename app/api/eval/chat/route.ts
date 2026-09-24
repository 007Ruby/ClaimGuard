// POST /api/eval/chat — DEV ONLY. Same runChat() as /api/chat, but returns the full trace:
// assembled system prompt, digest, event matches (with every candidate score), retrieved
// chunks and pre-floor candidates, latency and token usage.
//
// Guarded three ways: 404 unless EVAL_ENABLED=true, 404 in production, 401 without the
// shared secret. Runs under the caller's Supabase session cookie, exactly like the app.
//
// Body: { question: string, history?: {role, content}[] }

import { NextResponse } from "next/server";
import { cleanMessages, runChat } from "@/lib/chat/run";

export async function POST(req: Request) {
  if (process.env.EVAL_ENABLED !== "true" || process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const secret = process.env.EVAL_SECRET;
  if (!secret || req.headers.get("x-eval-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "No question provided." }, { status: 400 });
    }

    const clean = cleanMessages([...(Array.isArray(body?.history) ? body.history : []), { role: "user", content: question }]);
    const r = await runChat(clean);

    return NextResponse.json({
      ...r,
      today: new Date().toISOString().slice(0, 10), // harness checks this against the seed
    });
  } catch (e: any) {
    console.error("[eval/chat] failed:", e);
    return NextResponse.json({ error: e?.message ?? "Eval chat failed." }, { status: 500 });
  }
}
