"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Inbox, AlertCircle, Clock, FileText, Calendar,
  MailPlus,
  MailQuestionMark, 
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "What's Next", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/events", label: "Events", icon: AlertCircle },
  { href: "/claims", label: "Claims", icon: FileText },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/follow-ups", label: "Follow-ups", icon: MailPlus },
  {href: "/rfi", label: "RFI", icon: MailQuestionMark },
  {href: "/chat", label: "Assistant", icon: Bot },
  {href: "/settings", label: "Settings", icon: Clock }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-muted/20">
      <div className="flex h-14 items-center px-5 text-lg font-semibold">
        ClaimGuard
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}