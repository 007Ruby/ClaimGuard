import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Link href="/settings/contract">
        <Card className="transition-colors hover:bg-muted/50">
          <CardContent className="flex items-center gap-3 p-4">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm">Contract</span>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}