import { errorResponse, getAuthenticatedClient } from "@/app/lib/chat/server";
import type { ChatContact, ChatListResponse } from "@/app/lib/chat/types";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const supabase = await getAuthenticatedClient();
  if (!supabase) return errorResponse("Unauthorized", 401);

  const url = new URL(request.url);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? PAGE_SIZE);
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 999
  ) {
    return errorResponse("Invalid pagination", 400);
  }

  const { data, error } = await supabase
    .from("line_contacts")
    .select(
      "line_user_id, display_name, avatar_url, last_message_at, last_message_preview",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("line_user_id", { ascending: true })
    .range(offset, offset + limit);

  if (error) return errorResponse("Could not load LINE contacts", 500);
  const contacts: ChatContact[] = (data ?? []).slice(0, limit).map((row) => ({
    lineUserId: row.line_user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
  }));

  return Response.json({
    contacts,
    hasMore: (data?.length ?? 0) > limit,
  } satisfies ChatListResponse);
}
