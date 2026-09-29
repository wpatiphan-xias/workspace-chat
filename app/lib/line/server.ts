import { createHmac, timingSafeEqual } from "node:crypto";

function channelSecret() {
  const value = process.env.LINE_CHANNEL_SECRET;
  if (!value)
    throw new Error("Set LINE_CHANNEL_SECRET in the server environment.");
  return value;
}

function channelAccessToken() {
  const value = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!value) {
    throw new Error("Set LINE_CHANNEL_ACCESS_TOKEN in the server environment.");
  }
  return value;
}

export function verifyLineSignature(body: string, signature: string | null) {
  if (!signature) return false;
  const expected = createHmac("sha256", channelSecret())
    .update(body, "utf8")
    .digest();
  const actual = Buffer.from(signature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function getLineProfile(lineUserId: string) {
  const response = await fetch(
    `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
    {
      headers: { Authorization: `Bearer ${channelAccessToken()}` },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") return null;
  const profile = data as Record<string, unknown>;
  return {
    displayName:
      typeof profile.displayName === "string"
        ? profile.displayName
        : lineUserId,
    avatarUrl:
      typeof profile.pictureUrl === "string" ? profile.pictureUrl : null,
  };
}

export async function pushLineText(
  lineUserId: string,
  text: string,
  retryKey: string,
) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken()}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": retryKey,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
    cache: "no-store",
  });

  if (response.ok || response.status === 409) return;
  throw new LinePushError(response.status);
}

export class LinePushError extends Error {
  constructor(readonly status: number) {
    super(`LINE rejected the message (HTTP ${status}).`);
  }
}
