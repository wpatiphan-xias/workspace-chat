import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "./config";

export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Set SUPABASE_SECRET_KEY in the server environment.");
  }

  return createClient(getSupabaseConfig().url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
