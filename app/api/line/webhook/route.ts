import { createAdminClient } from "@/app/lib/supabase/admin";
import { getLineProfile, verifyLineSignature } from "@/app/lib/line/server";

type LineEvent = {
  type?: string;
  webhookEventId?: string;
  timestamp?: number;
  source?: { type?: string; userId?: string };
  message?: { id?: string; type?: string; text?: string };
  unsend?: { messageId?: string };
};

export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (!verifyLineSignature(body, request.headers.get("x-line-signature"))) {
      return new Response("Invalid LINE signature", { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("Invalid LINE JSON", { status: 400 });
    }
    if (!payload || typeof payload !== "object") {
      return new Response("Invalid LINE payload", { status: 400 });
    }
    const events = (payload as { events?: unknown }).events;
    if (!Array.isArray(events)) {
      return new Response("Invalid LINE events", { status: 400 });
    }
    if (events.length === 0) return new Response(null, { status: 200 });

    const supabase = createAdminClient();
    for (const rawEvent of events) {
      if (!rawEvent || typeof rawEvent !== "object") continue;
      const event = rawEvent as LineEvent;
      if (event.source?.type !== "user" || !event.source.userId) continue;

      if (event.type === "unsend" && event.unsend?.messageId) {
        const { error: tombstoneError } = await supabase
          .from("line_unsent_messages")
          .upsert(
            {
              line_message_id: event.unsend.messageId,
              line_user_id: event.source.userId,
            },
            { onConflict: "line_message_id", ignoreDuplicates: true },
          );
        if (tombstoneError) throw tombstoneError;
        const { error } = await supabase
          .from("line_messages")
          .delete()
          .eq("line_message_id", event.unsend.messageId)
          .eq("direction", "incoming");
        if (error) throw error;
        continue;
      }

      if (
        event.type !== "message" ||
        !event.message?.id ||
        !event.webhookEventId
      ) {
        continue;
      }

      const lineUserId = event.source.userId;
      const { data: unsent, error: unsentError } = await supabase
        .from("line_unsent_messages")
        .select("line_message_id")
        .eq("line_message_id", event.message.id)
        .maybeSingle();
      if (unsentError) throw unsentError;
      if (unsent) continue;

      const { data: existing, error: lookupError } = await supabase
        .from("line_contacts")
        .select("line_user_id")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      if (lookupError) throw lookupError;

      if (!existing) {
        let profile: Awaited<ReturnType<typeof getLineProfile>> = null;
        try {
          profile = await getLineProfile(lineUserId);
        } catch (error) {
          console.error("LINE profile lookup failed", error);
        }
        const { error } = await supabase.from("line_contacts").upsert(
          {
            line_user_id: lineUserId,
            display_name: profile?.displayName ?? lineUserId,
            avatar_url: profile?.avatarUrl ?? null,
          },
          { onConflict: "line_user_id", ignoreDuplicates: true },
        );
        if (error) throw error;
      }

      const isText =
        event.message.type === "text" && typeof event.message.text === "string";
      const eventDate =
        typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
          ? new Date(event.timestamp)
          : new Date();
      const timestamp = Number.isNaN(eventDate.getTime())
        ? new Date().toISOString()
        : eventDate.toISOString();
      const { error } = await supabase.from("line_messages").insert({
        line_user_id: lineUserId,
        direction: "incoming",
        kind: isText ? "text" : "unsupported",
        body: isText ? event.message.text : "[Unsupported LINE message]",
        status: "received",
        line_message_id: event.message.id,
        webhook_event_id: event.webhookEventId,
        created_at: timestamp,
      });
      if (error && error.code !== "23505") throw error;
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("LINE webhook failed", error);
    return new Response("LINE webhook failed", { status: 500 });
  }
}
