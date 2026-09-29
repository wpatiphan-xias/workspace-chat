import { redirect } from "next/navigation";

import { ChatWorkspace } from "./components/chat-workspace";
import { createClient } from "./lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  return <ChatWorkspace />;
}
