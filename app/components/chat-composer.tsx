"use client";

import { ArrowUp } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Field } from "./ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "./ui/input-group";

export function ChatComposer({
  onSend,
}: {
  onSend: (text: string, clientMessageId: string) => Promise<void>;
}) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const retryId = useRef<string | null>(null);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending) return;

    const form = event.currentTarget;
    const message = String(new FormData(form).get("message") ?? "").trim();
    if (!message) return;

    const clientMessageId = retryId.current ?? crypto.randomUUID();
    retryId.current = clientMessageId;
    setIsSending(true);
    setError("");
    try {
      await onSend(message, clientMessageId);
      form.reset();
      retryId.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <div className="border-t px-4 pt-3 pb-4">
      {error && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <form onSubmit={sendMessage}>
        <Field>
          <InputGroup className="items-end">
            <InputGroupTextarea
              id="block-chat-message"
              name="message"
              placeholder="Write a message..."
              onKeyDown={handleKeyDown}
              disabled={isSending}
              maxLength={5000}
              required
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                className="cursor-pointer"
                disabled={isSending}
                aria-label={isSending ? "Sending message" : "Send message"}
              >
                <ArrowUp />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </form>
    </div>
  );
}
