// app/api/inbox/extract-pdf/route.ts
// Instrumented: each step reports which stage failed, so a 500 tells us the
// actual cause instead of a bare "Internal Server Error".
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { extractPdfText } from "@/lib/pdf/extract";

export async function POST(req: Request) {
  let stage = "start";
  try {
    stage = "session";
    const { projectId } = await getSessionContext();

    stage = "read-form";
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });
    if (file.type !== "application/pdf")
      return NextResponse.json({ error: "PDF only for now." }, { status: 400 });

    stage = "to-bytes";
    const bytes = new Uint8Array(await file.arrayBuffer());

    stage = "extract-text";
    let text = "";
    try { text = await extractPdfText(bytes); }
    catch (e: any) { console.error("extract-text failed:", e); /* leave empty */ }

    stage = "storage-upload";
    const supabase = await createClient();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${projectId}/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("evidence")
      .upload(path, bytes, { contentType: "application/pdf" });
    if (upErr) {
      console.error("storage upload failed:", upErr);
      return NextResponse.json({ error: `Storage: ${upErr.message}`, stage }, { status: 500 });
    }

    return NextResponse.json({ file_path: path, text, chars: text.length });
  } catch (e: any) {
    console.error(`extract-pdf failed at stage "${stage}":`, e);
    return NextResponse.json(
      { error: `Failed at stage "${stage}": ${e?.message ?? String(e)}`, stage },
      { status: 500 },
    );
  }
}