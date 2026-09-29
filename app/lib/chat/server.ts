import { createClient } from "@/app/lib/supabase/server";

export async function getAuthenticatedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return supabase;
}

export function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
