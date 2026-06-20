export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(d); // e.g. "20 Jun 2026" — identical on server and client
}