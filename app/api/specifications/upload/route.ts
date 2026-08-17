import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "specifications";
const objectPath = (projectId: string) => `${projectId}/specification.pdf`;

export async function POST(req: NextRequest) {
  try {
    const { projectId } = await getSessionContext();
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file received." }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "PDF only." }, { status: 400 });
    }

    // Reading the actual bytes is what your contract flow is (probably) missing —
    // passing a raw File/stream server-side is the usual cause of 0-byte objects.
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "That file was empty." }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath(projectId), bytes, { contentType: "application/pdf", upsert: true });

    if (error) {
      console.error("[specifications/upload] storage error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, sizeBytes: bytes.byteLength });
  } catch (e: any) {
    console.error("[specifications/upload] failed:", e);
    return NextResponse.json({ error: e?.message ?? "Upload failed." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const { projectId } = await getSessionContext();
    const supabase = await createClient();
    const { error } = await supabase.storage.from(BUCKET).remove([objectPath(projectId)]);
    if (error) {
      console.error("[specifications/remove] storage error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[specifications/remove] failed:", e);
    return NextResponse.json({ error: e?.message ?? "Remove failed." }, { status: 500 });
  }
}