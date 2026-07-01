// lib/pdf/extract.ts
// Server-side PDF text extraction. unpdf is serverless-friendly (built on a
// bundled pdf.js) and works inside Next.js route handlers. Install: npm i unpdf
import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (typeof text === "string" ? text : (text as string[]).join("\n")).trim();
}