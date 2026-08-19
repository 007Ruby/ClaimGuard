// app/(dashboard)/settings/page.tsx
import Link from "next/link";
import { FileText, ChevronRight } from "lucide-react";

const SECTIONS: { href: string; label: string; description: string; icon: React.ReactNode }[] = [
  {
    href: "/settings/contract",
    label: "Contract",
    description: "The FIDIC document behind every deadline and claim.",
    icon: <FileText className="h-5 w-5" />,
  },
  {
    href: "/settings/specification",
    label: "Specification",
    description: "The specification that defines the works to be executed.",
    icon: <FileText className="h-5 w-5" />,
  }
  // Extend here as you add settings sections.
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your project configuration.
        </p>
      </div>

      <nav className="space-y-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
              {s.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.label}</div>
              <div className="text-sm text-muted-foreground">{s.description}</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </nav>
    </div>
  );
}