import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import { POST } from "../app/api/line/webhook/route";
import {
  LinePushError,
  pushLineText,
  verifyLineSignature,
} from "../app/lib/line/server";

const originalFetch = globalThis.fetch;
const originalSecret = process.env.LINE_CHANNEL_SECRET;
const originalToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

function signature(body: string) {
  return createHmac("sha256", "test-channel-secret")
    .update(body, "utf8")
    .digest("base64");
}

beforeEach(() => {
  process.env.LINE_CHANNEL_SECRET = "test-channel-secret";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-access-token";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.LINE_CHANNEL_SECRET;
  else process.env.LINE_CHANNEL_SECRET = originalSecret;
  if (originalToken === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
  else process.env.LINE_CHANNEL_ACCESS_TOKEN = originalToken;
});

describe("LINE webhook verification", () => {
  it("checks the exact raw body", () => {
    const body = '{"events":[],"text":"hello\\nworld"}';
    assert.equal(verifyLineSignature(body, signature(body)), true);
    assert.equal(verifyLineSignature(`${body}\n`, signature(body)), false);
    assert.equal(verifyLineSignature(body, null), false);
  });

  it("accepts LINE's signed empty verification event", async () => {
    const body = '{"events":[]}';
    const response = await POST(
      new Request("http://localhost/api/line/webhook", {
        method: "POST",
        headers: { "x-line-signature": signature(body) },
        body,
      }),
    );
    assert.equal(response.status, 200);
  });

  it("rejects a forged webhook", async () => {
    const response = await POST(
      new Request("http://localhost/api/line/webhook", {
        method: "POST",
        headers: { "x-line-signature": signature('{"events":[]}') },
        body: '{"events":[{}]}',
      }),
    );
    assert.equal(response.status, 401);
  });
});

describe("LINE push", () => {
  it("sends text with a stable retry key", async () => {
    let called: [RequestInfo | URL, RequestInit | undefined] | null = null;
    globalThis.fetch = async (input, init) => {
      called = [input, init];
      return new Response("{}", { status: 200 });
    };
    await pushLineText(
      "U123",
      "สวัสดี",
      "123e4567-e89b-42d3-a456-426614174000",
    );
    assert.ok(called);
    const [url, init] = called as [RequestInfo | URL, RequestInit | undefined];
    assert.equal(url, "https://api.line.me/v2/bot/message/push");
    assert.deepEqual(init?.headers, {
      Authorization: "Bearer test-access-token",
      "Content-Type": "application/json",
      "X-Line-Retry-Key": "123e4567-e89b-42d3-a456-426614174000",
    });
    assert.deepEqual(JSON.parse(String(init?.body)), {
      to: "U123",
      messages: [{ type: "text", text: "สวัสดี" }],
    });
  });

  it("treats a retry-key conflict as previously accepted", async () => {
    globalThis.fetch = async () => new Response("{}", { status: 409 });
    await assert.doesNotReject(pushLineText("U123", "Hi", crypto.randomUUID()));
  });

  it("reports a rejected send", async () => {
    globalThis.fetch = async () => new Response("{}", { status: 400 });
    await assert.rejects(
      pushLineText("U123", "Hi", crypto.randomUUID()),
      LinePushError,
    );
  });
});
