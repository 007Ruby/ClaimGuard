import { Badge } from "@/components/ui/badge";
import { EVENT_STATUS_LABELS } from "@/lib/constants";

const VARIANTS: Record<string, string> = {
  identified: "bg-blue-100 text-blue-800",
  in_review: "bg-amber-100 text-amber-800",
  notice_due: "bg-red-100 text-red-800",
  notice_issued: "bg-purple-100 text-purple-800",
  claimed: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800",
  dismissed: "bg-gray-100 text-gray-500",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={VARIANTS[status] ?? ""}>
      {EVENT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}