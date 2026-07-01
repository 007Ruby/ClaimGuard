// app/api/inbox/extract-pdf/route.ts
// Called when a PDF is chosen in the inbox: uploads it to the `evidence` bucket
// (same ${projectId}/ convention as createInboxItem) and returns the extracted
// text + stored path. The form drops the text into `content` so "Analyze with
// AI" works for PDFs, and passes file_path back so the row isn't re-uploaded.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { extractPdfText } from "@/lib/pdf/extract";

export async function POST(req: Request) {
  const { projectId } = await getSessionContext();
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.type !== "application/pdf")
    return NextResponse.json({ error: "PDF only for now." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());

  let text = "";
  try {
    text = await extractPdfText(bytes);
  } catch {
    // Scanned/image-only PDFs yield no text; user can still type a note.
  }

  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${projectId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage
    .from("evidence")
    .upload(path, bytes, { contentType: "application/pdf" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ file_path: path, text, chars: text.length });
}