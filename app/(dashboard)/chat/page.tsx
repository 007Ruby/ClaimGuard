// app/(dashboard)/chat/page.tsx  →  /chat
// Route entry for the Assistant page; renders the ChatPanel. All chat logic lives
// in the panel (client) and the /api/chat route (server) — this is just the mount.

import { ChatPanel } from "@/components/chat/chat-panel";

export default function ChatPage() {
  return <ChatPanel />;
}