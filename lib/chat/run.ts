// The chat core. /api/chat and /api/eval/chat both call runChat(), so what the eval measures
// is exactly what users get — they cannot drift apart.

import OpenAI from "openai";
import { buildChatContext, EMPTY_TRACE, type ChatTrace } from "./context";
import { SYSTEM_PROMPT, DEGRADED_PROMPT, partialLoadNote } from "./prompts";

export const CHAT_MODEL = "gpt-5.6-terra";
const HISTORY_CAP = 20; // cost + latency guard

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type Msg = { role: "user" | "assistant"; content: string };

export interface ChatRunResult {
  reply: string;
  loadStatus: "ok" | "partial" | "error";
  failedSections: string[];
  trace: ChatTrace & {
    question: string;
    systemContent: string;
    model: string;
    latencyMs: number;
    usage: unknown;
  };
}

export function cleanMessages(raw: unknown): Msg[] {
  const arr: any[] = Array.isArray(raw) ? raw : [];
  return arr
    .filter(
      (m) =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .map((m) => ({ role: m.role, content: m.content }) as Msg)
    .slice(-HISTORY_CAP);
}

export async function runChat(clean: Msg[]): Promise<ChatRunResult> {
  // Context is built from the latest user turn only.
  const question = [...clean].reverse().find((m) => m.role === "user")?.content ?? "";

  let context = "";
  let contractError = false;
  let failedSections: string[] = [];
  let trace: ChatTrace = EMPTY_TRACE;

  try {
    const built = await buildChatContext(question);
    context = built.context;
    contractError = built.contractError;
    failedSections = built.failedSections;
    trace = built.trace;
  } catch (e) {
    console.error("[chat] context build failed:", e);
    contractError = true;
  }

  // Context failure -> degraded general-purpose prompt; otherwise full material.
  const systemContent = contractError
    ? DEGRADED_PROMPT
    : SYSTEM_PROMPT +
      "\n\n=== PROVIDED MATERIAL ===\n\n" +
      context +
      (failedSections.length ? partialLoadNote(failedSections) : "");

  const t0 = Date.now();
  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [{ role: "system", content: systemContent }, ...clean],
  });

  const reply =
    res.choices[0]?.message?.content?.trim() ||
    "Sorry — I couldn't produce an answer just then. Try rephrasing.";

  return {
    reply,
    loadStatus: contractError ? "error" : failedSections.length ? "partial" : "ok",
    failedSections,
    trace: {
      ...trace,
      question,
      systemContent,
      model: CHAT_MODEL,
      latencyMs: Date.now() - t0,
      usage: res.usage ?? null,
    },
  };
}