"use client";

import { Contact, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type {
  ChatContact,
  ChatListResponse,
  ChatMessage,
  ChatMessagesResponse,
} from "@/app/lib/chat/types";
import { createClient } from "@/app/lib/supabase/client";
import { cn } from "@/app/lib/utils";

import { ChatComposer } from "./chat-composer";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Bubble, BubbleContent, BubbleGroup } from "./ui/bubble";
import { Button } from "./ui/button";
import { Field } from "./ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";
import { Message, MessageAvatar, MessageContent } from "./ui/message";
import { Separator } from "./ui/separator";

const POLL_INTERVAL_MS = 5000;
const CONTACT_PAGE_SIZE = 50;
const MESSAGE_PAGE_SIZE = 100;
const MAX_LOADED_ITEMS = 999;

class UnauthorizedError extends Error {}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (response.status === 401) throw new UnauthorizedError("Session expired");
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload as { error?: string } | null;
    throw new Error(error?.error ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

function formatTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

export function ChatWorkspace() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [isContactDetailsOpen, setIsContactDetailsOpen] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [contactsError, setContactsError] = useState("");
  const [messagesError, setMessagesError] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMoreContacts, setHasMoreContacts] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(
    null,
  );
  const loadedContactLimit = useRef(CONTACT_PAGE_SIZE);
  const loadedMessageLimit = useRef(MESSAGE_PAGE_SIZE);
  const selectedUserIdRef = useRef(selectedUserId);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const lastDisplayedContactRef = useRef<string | null>(null);
  const lastDisplayedMessageRef = useRef<string | null>(null);
  selectedUserIdRef.current = selectedUserId;

  const selectedContact =
    contacts.find((contact) => contact.lineUserId === selectedUserId) ?? null;
  const visibleContacts = contacts.filter((contact) =>
    `${contact.displayName} ${contact.lineUserId}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );

  const refreshContacts = useCallback(async () => {
    try {
      const data = await requestJson<ChatListResponse>(
        `/api/chats?limit=${loadedContactLimit.current}`,
      );
      setContacts((previous) => {
        const selected = previous.find(
          (contact) => contact.lineUserId === selectedUserIdRef.current,
        );
        if (
          selected &&
          !data.contacts.some(
            (contact) => contact.lineUserId === selected.lineUserId,
          )
        ) {
          return [...data.contacts, selected];
        }
        return data.contacts;
      });
      setHasMoreContacts(data.hasMore);
      setSelectedUserId(
        (current) => current ?? data.contacts[0]?.lineUserId ?? null,
      );
      setContactsError("");
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace("/login");
      else
        setContactsError(
          error instanceof Error ? error.message : String(error),
        );
    } finally {
      setLoadingContacts(false);
    }
  }, [router]);

  const refreshMessages = useCallback(
    async (lineUserId: string) => {
      try {
        const data = await requestJson<ChatMessagesResponse>(
          `/api/chats/${encodeURIComponent(lineUserId)}/messages?limit=${loadedMessageLimit.current}`,
        );
        if (selectedUserIdRef.current !== lineUserId) return;
        setMessages(data.messages);
        setHasMoreMessages(data.hasMore);
        setMessagesError("");
      } catch (error) {
        if (selectedUserIdRef.current !== lineUserId) return;
        if (error instanceof UnauthorizedError) router.replace("/login");
        else
          setMessagesError(
            error instanceof Error ? error.message : String(error),
          );
      } finally {
        if (selectedUserIdRef.current === lineUserId) setLoadingMessages(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void refreshContacts();
    const timer = window.setInterval(
      () => void refreshContacts(),
      POLL_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [refreshContacts]);

  useEffect(() => {
    setMessages([]);
    lastDisplayedContactRef.current = null;
    lastDisplayedMessageRef.current = null;
    loadedMessageLimit.current = MESSAGE_PAGE_SIZE;
    setHasMoreMessages(false);
    setMessagesError("");
    if (!selectedUserId) return;
    setLoadingMessages(true);
    void refreshMessages(selectedUserId);
    const timer = window.setInterval(
      () => void refreshMessages(selectedUserId),
      POLL_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [selectedUserId, refreshMessages]);

  useLayoutEffect(() => {
    const container = messageScrollRef.current;
    const latestId = messages.at(-1)?.id ?? null;
    if (!container || !selectedUserId || !latestId) return;

    const isNewConversation =
      lastDisplayedContactRef.current !== selectedUserId;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      160;
    if (
      isNewConversation ||
      (latestId !== lastDisplayedMessageRef.current && isNearBottom)
    ) {
      container.scrollTop = container.scrollHeight;
    }
    lastDisplayedContactRef.current = selectedUserId;
    lastDisplayedMessageRef.current = latestId;
  }, [messages, selectedUserId]);

  async function loadMoreContacts() {
    try {
      const data = await requestJson<ChatListResponse>(
        `/api/chats?offset=${loadedContactLimit.current}&limit=${CONTACT_PAGE_SIZE}`,
      );
      loadedContactLimit.current = Math.min(
        MAX_LOADED_ITEMS,
        loadedContactLimit.current + data.contacts.length,
      );
      setContacts((previous) => {
        const byId = new Map(
          previous.map((contact) => [contact.lineUserId, contact]),
        );
        data.contacts.forEach((contact) =>
          byId.set(contact.lineUserId, contact),
        );
        return [...byId.values()].sort((a, b) =>
          (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
        );
      });
      setHasMoreContacts(
        data.hasMore && loadedContactLimit.current < MAX_LOADED_ITEMS,
      );
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace("/login");
      else
        setContactsError(
          error instanceof Error ? error.message : String(error),
        );
    }
  }

  async function loadOlderMessages() {
    if (!selectedUserId) return;
    const lineUserId = selectedUserId;
    try {
      const data = await requestJson<ChatMessagesResponse>(
        `/api/chats/${encodeURIComponent(lineUserId)}/messages?offset=${loadedMessageLimit.current}&limit=${MESSAGE_PAGE_SIZE}`,
      );
      if (selectedUserIdRef.current !== lineUserId) return;
      loadedMessageLimit.current = Math.min(
        MAX_LOADED_ITEMS,
        loadedMessageLimit.current + data.messages.length,
      );
      setMessages((previous) => {
        const byId = new Map(previous.map((message) => [message.id, message]));
        data.messages.forEach((message) => byId.set(message.id, message));
        return [...byId.values()].sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        );
      });
      setHasMoreMessages(
        data.hasMore && loadedMessageLimit.current < MAX_LOADED_ITEMS,
      );
    } catch (error) {
      if (selectedUserIdRef.current !== lineUserId) return;
      if (error instanceof UnauthorizedError) router.replace("/login");
      else
        setMessagesError(
          error instanceof Error ? error.message : String(error),
        );
    }
  }

  async function sendMessage(text: string, clientMessageId: string) {
    if (!selectedUserId) throw new Error("Select a LINE contact first.");
    try {
      await requestJson<{ status: "sent" }>(
        `/api/chats/${encodeURIComponent(selectedUserId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, clientMessageId }),
        },
      );
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace("/login");
      throw error;
    }
    await Promise.all([refreshMessages(selectedUserId), refreshContacts()]);
  }

  async function retryMessage(message: ChatMessage) {
    if (!message.clientMessageId || retryingMessageId) return;
    setRetryingMessageId(message.id);
    setMessagesError("");
    try {
      await sendMessage(message.body, message.clientMessageId);
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace("/login");
      else
        setMessagesError(
          error instanceof Error ? error.message : String(error),
        );
    } finally {
      setRetryingMessageId(null);
    }
  }

  async function handleSignOut() {
    setSignOutError("");
    setIsSigningOut(true);
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div
      className={cn(
        "grid h-dvh",
        isContactDetailsOpen
          ? "grid-cols-[320px_minmax(0,1fr)_320px]"
          : "grid-cols-[320px_minmax(0,1fr)]",
      )}
    >
      <div className="flex min-h-0 flex-col overflow-hidden border-r">
        <div className="shrink-0 px-3 py-4">
          <p className="text-xs font-medium text-slate-400">Workspace</p>
          <h1 className="mb-2 text-2xl font-semibold">Chat</h1>
          <Field>
            <InputGroup className="h-10">
              <InputGroupInput
                id="search-conversations"
                aria-label="Search loaded conversations"
                placeholder="Search conversations"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <InputGroupAddon align="inline-start">
                <SearchIcon className="text-muted-foreground" />
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </div>
        {contactsError && (
          <p role="alert" className="px-3 text-sm text-destructive">
            {contactsError}
          </p>
        )}
        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-t px-3 py-4">
          {loadingContacts && contacts.length === 0 && (
            <li>Loading chats...</li>
          )}
          {!loadingContacts && !contactsError && contacts.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No LINE messages yet. New customer messages will appear here.
            </li>
          )}
          {visibleContacts.map((contact) => (
            <li key={contact.lineUserId} className="shrink-0">
              <button
                type="button"
                aria-current={
                  selectedUserId === contact.lineUserId ? "true" : undefined
                }
                onClick={() => setSelectedUserId(contact.lineUserId)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                  selectedUserId === contact.lineUserId && "bg-muted",
                )}
              >
                <Avatar className="size-10 shrink-0">
                  {contact.avatarUrl && (
                    <AvatarImage src={contact.avatarUrl} alt="" />
                  )}
                  <AvatarFallback>
                    {contact.displayName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate">{contact.displayName}</p>
                    <p className="shrink-0 text-xs">
                      {formatTime(contact.lastMessageAt)}
                    </p>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {contact.lastMessagePreview}
                  </p>
                </div>
              </button>
            </li>
          ))}
          {hasMoreContacts && !search && (
            <li>
              <Button
                variant="outline"
                onClick={loadMoreContacts}
                className="w-full"
              >
                Load more chats
              </Button>
            </li>
          )}
        </ul>
        <div className="flex flex-col items-end gap-2 px-3 py-4">
          {signOutError && (
            <p role="alert" className="text-sm text-destructive">
              {signOutError}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="cursor-pointer"
          >
            {isSigningOut ? "Signing out..." : "Logout"}
          </Button>
        </div>
      </div>

      <div className="col-start-2 row-start-1 flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-3 py-4">
          {selectedContact ? (
            <div className="flex shrink-0 items-center gap-3">
              <Avatar className="size-10 shrink-0">
                {selectedContact.avatarUrl && (
                  <AvatarImage src={selectedContact.avatarUrl} alt="" />
                )}
                <AvatarFallback>
                  {selectedContact.displayName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p>
                  {selectedContact.displayName}{" "}
                  <Badge
                    variant="outline"
                    className="rounded-sm border-[#e5f1e9] px-1 py-0.5 text-[#4e9d67]"
                  >
                    LINE
                  </Badge>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedContact.lineUserId}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a conversation
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="cursor-pointer"
            aria-label={
              isContactDetailsOpen
                ? "Hide contact details"
                : "Show contact details"
            }
            aria-controls="contact-details"
            aria-expanded={isContactDetailsOpen}
            onClick={() => setIsContactDetailsOpen((open) => !open)}
          >
            <Contact className="text-slate-500" />
          </Button>
        </div>
        <div
          ref={messageScrollRef}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-6"
        >
          {messagesError && (
            <p role="alert" className="text-sm text-destructive">
              {messagesError}
            </p>
          )}
          {selectedContact && loadingMessages && <p>Loading messages...</p>}
          {selectedContact &&
            !loadingMessages &&
            messages.length === 0 &&
            !messagesError && (
              <p className="text-sm text-muted-foreground">
                No messages in this conversation.
              </p>
            )}
          {hasMoreMessages && (
            <Button
              variant="outline"
              onClick={loadOlderMessages}
              className="self-center"
            >
              Load earlier messages
            </Button>
          )}
          {messages.map((message) => (
            <Message
              key={message.id}
              align={message.direction === "outgoing" ? "end" : "start"}
            >
              <MessageAvatar>
                <Avatar>
                  {message.direction === "incoming" &&
                    selectedContact?.avatarUrl && (
                      <AvatarImage src={selectedContact.avatarUrl} alt="" />
                    )}
                  <AvatarFallback>
                    {message.direction === "outgoing"
                      ? "ฉ"
                      : (selectedContact?.displayName.charAt(0) ?? "ล")}
                  </AvatarFallback>
                </Avatar>
              </MessageAvatar>
              <MessageContent>
                <BubbleGroup className="w-full">
                  <Bubble
                    variant={
                      message.direction === "incoming" ? "muted" : "default"
                    }
                  >
                    <BubbleContent>{message.body}</BubbleContent>
                  </Bubble>
                </BubbleGroup>
                {message.direction === "outgoing" &&
                  message.status !== "sent" && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {message.status === "pending"
                        ? "Sending or awaiting confirmation"
                        : "Send failed"}{" "}
                      {message.clientMessageId && (
                        <button
                          type="button"
                          className="cursor-pointer underline"
                          disabled={retryingMessageId === message.id}
                          onClick={() => void retryMessage(message)}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
              </MessageContent>
            </Message>
          ))}
        </div>
        {selectedContact && (
          <ChatComposer key={selectedContact.lineUserId} onSend={sendMessage} />
        )}
      </div>

      <aside
        id="contact-details"
        hidden={!isContactDetailsOpen}
        className="col-start-3 row-start-1 space-y-4 overflow-y-auto border-l px-3 py-4"
      >
        <p className="text-sm text-slate-400">ข้อมูลผู้ติดต่อ</p>
        {selectedContact && (
          <>
            <div className="flex flex-col items-center justify-center gap-1">
              <Avatar className="size-16">
                {selectedContact.avatarUrl && (
                  <AvatarImage src={selectedContact.avatarUrl} alt="" />
                )}
                <AvatarFallback>
                  {selectedContact.displayName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <p className="text-lg font-bold">{selectedContact.displayName}</p>
              <p className="text-sm text-slate-400">
                LINE Official Account Contact
              </p>
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => {
                  if (!navigator.clipboard) {
                    setMessagesError("Could not copy LINE ID.");
                    return;
                  }
                  void navigator.clipboard
                    .writeText(selectedContact.lineUserId)
                    .catch(() => {
                      setMessagesError("Could not copy LINE ID.");
                    });
                }}
              >
                Copy LINE ID
              </Button>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-bold">LINE Profile</p>
              <p className="text-xs text-slate-400">ID</p>
              <p className="break-all text-sm text-slate-500">
                {selectedContact.lineUserId}
              </p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
