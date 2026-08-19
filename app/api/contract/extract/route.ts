// app/api/contract/extract/route.ts
// MUST live at exactly this path so the URL is /api/contract/extract.
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { extractPdfText } from "@/lib/pdf/extract";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  "arbitration": { "rules": string, "seat": string, "language": string }, "dayOverrides": {
    "20.1-notice": number,      // SC 20.1 claim-notice period. GC default 28.
    "20.1-particulars": number, // SC 20.1 detailed-claim period. GC default 42.
    "20.1-response": number,    // SC 20.1 Engineer response period. GC default 42.
    "14.6-ipc": number,         // SC 14.6 IPC issuance period. GC default 28.
    "14.7-payment": number,     // SC 14.7 payment period. GC default 56.
    "16.1-notice": number       // SC 16.1 suspension notice period. GC default 21.
  }
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

    stage = "read-bytes";
    // Copy the bytes into an independent Buffer BEFORE pdf.js touches anything.
    // pdf.js can detach the ArrayBuffer it reads; uploading a view of a detached
    // buffer is what produced the 0-byte objects. Buffer.from allocates fresh
    // memory here, and Buffer is also the body type supabase-js handles most
    // reliably in Node. This copy is made first so extraction can't affect it.
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(new Uint8Array(arrayBuffer));

    stage = "extract-text";
    let text = "";
    try {
      text = await extractPdfText(new Uint8Array(arrayBuffer)); // pdf.js may detach this view; pdfBuffer is already separate
    } catch (e: any) {
      console.error("extract-text:", e);
      return NextResponse.json(
        { error: `PDF text extraction threw: ${e?.message ?? String(e)}`, stage },
        { status: 500 },
      );
    }
    if (!text.trim())
      return NextResponse.json({ error: "No text found (scanned PDF?).", stage }, { status: 422 });

    stage = "storage-upload";
    const supabase = await createClient();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const baseId = crypto.randomUUID();
    const pdfPath = `${projectId}/${baseId}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("contracts")
      .upload(pdfPath, pdfBuffer, { contentType: "application/pdf" });
    if (upErr) { console.error("storage:", upErr); return NextResponse.json({ error: `Storage: ${upErr.message}`, stage }, { status: 500 }); }

    stage = "storage-upload-text";
    // Persist the extracted text next to the PDF so the chatbot never re-extracts.
    // Non-fatal: if this sidecar fails, the PDF + values are still saved and the
    // chatbot can fall back to the PDF. Logged loudly per the project rule.
    const textPath = `${projectId}/${baseId}-contract.txt`;
    const { error: txtErr } = await supabase.storage
      .from("contracts")
      .upload(textPath, Buffer.from(text, "utf8"), { contentType: "text/plain; charset=utf-8" });
    if (txtErr) console.error("storage-text:", txtErr);

    stage = "ai-extract";
    let data: Record<string, any> = {};
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content:
            "Extract the FIDIC Appendix to Tender / Contract Data. Return ONLY minified JSON matching this shape (null for anything not stated; never invent): " + TARGET_KEYS + "For dayOverrides, these are contractual time periods with the FIDIC General Conditions defaults shown. Return the Particular Conditions figure ONLY where the Particular Conditions clearly amend the period; otherwise return the GC default. Never guess — when unsure, return the GC default."},
          { role: "user", content: text.slice(0, 24000) },
        ],
      });
      data = JSON.parse(res.choices[0].message.content ?? "{}");
    } catch (e: any) { console.error("ai-extract:", e); }

    data.framework = data.framework || "FIDIC Red Book 1999";
    data.file_path = pdfPath;
    if (!txtErr) data.text_path = textPath;
    return NextResponse.json({ data });
  } catch (e: any) {
    console.error(`contract/extract failed at stage "${stage}":`, e);
    return NextResponse.json({ error: `Failed at stage "${stage}": ${e?.message ?? String(e)}`, stage }, { status: 500 });
  }
}