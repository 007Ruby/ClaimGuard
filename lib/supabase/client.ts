import { createBrowserClient } from "@supabase/ssr";
//Interaction with Supabase from the client side
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}