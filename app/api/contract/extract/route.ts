// app/api/contract/extract/route.ts
// MUST live at exactly this path so the URL is /api/contract/extract.
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { extractPdfText } from "@/lib/pdf/extract";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Probe: open http://localhost:3000/api/contract/extract in the browser.
export async function GET() {
  return NextResponse.json({ ok: true, route: "contract/extract is registered" });
}

const TARGET_KEYS = `{
  "name": string, "parties": { "employer": string, "contractor": string, "engineer": string },
  "acceptedContractAmount": number, "currency": string, "commencementDate": "YYYY-MM-DD",
  "timeForCompletionDays": number, "defectsNotificationPeriodDays": number,
  "governingLaw": string, "rulingLanguage": string, "languageForCommunications": string,
  "timeForAccessToSiteDays": number, "performanceSecurityPct": number,
  "delayDamagesPerDay": string, "maxDelayDamagesPct": number, "advancePaymentPct": number,
  "retentionPct": number, "retentionLimitPct": number, "minimumInterimPaymentCertificate": number,
  "dab": { "appointBy": string, "composition": string, "appointingEntity": string },
  "arbitration": { "rules": string, "seat": string, "language": string }, "dayOverrides": {}
}`;

export async function POST(req: Request) {
  let stage = "start";
  try {
    stage = "session";
    const { projectId } = await getSessionContext();

    stage = "read-form";
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file || file.type !== "application/pdf")
      return NextResponse.json({ error: "PDF only." }, { status: 400 });

    stage = "extract-text";
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text = "";
    try { text = await extractPdfText(bytes); } catch (e: any) { console.error("extract-text:", e); }
    if (!text.trim())
      return NextResponse.json({ error: "No text found (scanned PDF?).", stage }, { status: 422 });

    stage = "storage-upload";
    const supabase = await createClient();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${projectId}/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("contracts").upload(path, bytes, { contentType: "application/pdf" });
    if (upErr) { console.error("storage:", upErr); return NextResponse.json({ error: `Storage: ${upErr.message}`, stage }, { status: 500 }); }

    stage = "ai-extract";
    let data: Record<string, any> = {};
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content:
            "Extract the FIDIC Appendix to Tender / Contract Data. Return ONLY minified JSON matching this shape (null for anything not stated; never invent): " + TARGET_KEYS },
          { role: "user", content: text.slice(0, 24000) },
        ],
      });
      data = JSON.parse(res.choices[0].message.content ?? "{}");
    } catch (e: any) { console.error("ai-extract:", e); }

    data.framework = data.framework || "FIDIC Red Book 1999";
    data.file_path = path;
    return NextResponse.json({ data });
  } catch (e: any) {
    console.error(`contract/extract failed at stage "${stage}":`, e);
    return NextResponse.json({ error: `Failed at stage "${stage}": ${e?.message ?? String(e)}`, stage }, { status: 500 });
  }
}