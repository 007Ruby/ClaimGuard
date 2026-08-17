"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertTriangle, Trash2 } from "lucide-react";

type ExistingSpec = { sizeBytes: number | null } | null;

export function SpecificationUpload({ existing }: { existing: ExistingSpec }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [removing, startRemove] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf") { setMsg("PDF only."); setOk(false); return; }
    setUploading(true); setMsg(null); setOk(false);
    try {
      const fd = new FormData(); fd.set("file", file);
      const res = await fetch("/api/specifications/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Upload failed (HTTP ${res.status}).`);
      setOk(true);
      setMsg("Specification uploaded. It'll be used as a reference for flagging and the chatbot.");
      router.refresh();
    } catch (e: any) {
      console.error("[SpecificationUpload] upload failed:", e);
      setMsg(e?.message ?? "Couldn't upload that PDF."); setOk(false);
    } finally { setUploading(false); }
  }

  function remove() {
    startRemove(async () => {
      try {
        const res = await fetch("/api/specifications/upload", { method: "DELETE" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? "Remove failed.");
        setOk(false); setMsg("Specification removed."); router.refresh();
      } catch (e: any) {
        console.error("[SpecificationUpload] remove failed:", e);
        setMsg(e?.message ?? "Couldn't remove the specification.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{existing ? "Replace specification" : "Upload specification"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {existing && (
          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              specification.pdf
              {existing.sizeBytes != null && (
                <span className="text-muted-foreground">
                  · {(existing.sizeBytes / 1024 / 1024).toFixed(1)} MB
                </span>
              )}
            </span>
            <Button variant="ghost" size="sm" onClick={remove} disabled={removing}>
              <Trash2 className="h-4 w-4" /> {removing ? "Removing…" : "Remove"}
            </Button>
          </div>
        )}
        {existing && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Uploading a new PDF <strong>replaces the current specification</strong>.</span>
          </div>
        )}
        <Input type="file" accept="application/pdf" disabled={uploading}
               onChange={(e) => onFile(e.target.files?.[0])} />
        {uploading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" /> Uploading…
          </p>
        )}
        {msg && <p className={`text-sm ${ok ? "text-emerald-600" : "text-muted-foreground"}`}>{msg}</p>}
      </CardContent>
    </Card>
  );
}