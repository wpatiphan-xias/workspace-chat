import { LinePushError, pushLineText } from "@/app/lib/line/server";
import { errorResponse, getAuthenticatedClient } from "@/app/lib/chat/server";
import type { ChatMessage, ChatMessagesResponse } from "@/app/lib/chat/types";
import { createAdminClient } from "@/app/lib/supabase/admin";

const PAGE_SIZE = 100;

type Context = { params: Promise<{ lineUserId: string }> };

function mapMessage(row: {
  id: string;
  line_user_id: string;
  direction: string;
  kind: string;
  body: string;
  status: string;
  client_message_id: string | null;
  created_at: string;
}): ChatMessage {
  return {
    id: row.id,
    lineUserId: row.line_user_id,
    direction: row.direction as ChatMessage["direction"],
    kind: row.kind as ChatMessage["kind"],
    body: row.body,
    status: row.status as ChatMessage["status"],
    clientMessageId: row.client_message_id,
    createdAt: row.created_at,
  };
}

export async function GET(request: Request, context: Context) {
  const supabase = await getAuthenticatedClient();
  if (!supabase) return errorResponse("Unauthorized", 401);
  const { lineUserId } = await context.params;
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
    .from("line_messages")
    .select(
      "id, line_user_id, direction, kind, body, status, client_message_id, created_at",
    )
    .eq("line_user_id", lineUserId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (error) return errorResponse("Could not load LINE messages", 500);

  const messages = (data ?? []).slice(0, limit).map(mapMessage).reverse();
  return Response.json({
    messages,
    hasMore: (data?.length ?? 0) > limit,
  } satisfies ChatMessagesResponse);
}

export async function POST(request: Request, context: Context) {
  const userClient = await getAuthenticatedClient();
  if (!userClient) return errorResponse("Unauthorized", 401);
  const { lineUserId } = await context.params;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }
  if (!input || typeof input !== "object")
    return errorResponse("Invalid message", 400);
  const { text, clientMessageId } = input as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim() || text.length > 5000) {
    return errorResponse("Message must contain 1–5000 characters", 400);
  }
  if (
    typeof clientMessageId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      clientMessageId,
    )
  ) {
    return errorResponse("Invalid clientMessageId", 400);
  }

  const { data: contact, error: contactError } = await userClient
    .from("line_contacts")
    .select("line_user_id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (contactError) return errorResponse("Could not find LINE contact", 500);
  if (!contact) return errorResponse("LINE contact not found", 404);

  try {
    const admin = createAdminClient();
    const { data: inserted, error: insertError } = await admin
      .from("line_messages")
      .insert({
        line_user_id: lineUserId,
        direction: "outgoing",
        kind: "text",
        body: text.trim(),
        status: "pending",
        client_message_id: clientMessageId,
      })
      .select("id, line_user_id, body, status")
      .single();

    if (insertError && insertError.code !== "23505") throw insertError;

    const { data: message, error: lookupError } = inserted
      ? { data: inserted, error: null }
      : await admin
          .from("line_messages")
          .select("id, line_user_id, body, status")
          .eq("client_message_id", clientMessageId)
          .single();
    if (lookupError || !message)
      throw lookupError ?? new Error("Message not found");
    if (message.line_user_id !== lineUserId || message.body !== text.trim()) {
      return errorResponse(
        "This clientMessageId belongs to another message",
        409,
      );
    }
    if (message.status === "sent") return Response.json({ status: "sent" });

    try {
      await pushLineText(lineUserId, text.trim(), clientMessageId);
    } catch (error) {
      // A timeout or server error may have delivered the message. Keep it pending
      // so the same retry key can be reused safely.
      if (
        error instanceof LinePushError &&
        error.status < 500 &&
        error.status !== 429
      ) {
        await admin
          .from("line_messages")
          .update({ status: "failed" })
          .eq("id", message.id);
      }
      return errorResponse(
        error instanceof Error ? error.message : "LINE send failed",
        502,
      );
    }

    const { error: updateError } = await admin
      .from("line_messages")
      .update({ status: "sent" })
      .eq("id", message.id);
    if (updateError) throw updateError;
    return Response.json({ status: "sent" });
  } catch (error) {
    console.error("LINE message send failed", error);
    return errorResponse("Could not send LINE message", 500);
  }
}
