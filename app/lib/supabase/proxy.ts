import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseConfig } from "./config";

export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabaseConfig();
  let response = NextResponse.next({ request });
  const responseCookies = new Map<
    string,
    { value: string; options: CookieOptions }
  >();
  const responseHeaders = new Map<string, string>();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          responseCookies.set(name, { value, options });
        });

        Object.entries(headers).forEach(([name, value]) => {
          responseHeaders.set(name, value);
        });

        response = NextResponse.next({ request });
        responseCookies.forEach(({ value, options }, name) => {
          response.cookies.set(name, value, options);
        });
        responseHeaders.forEach((value, name) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}
