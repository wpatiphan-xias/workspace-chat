export type ChatContact = {
  lineUserId: string;
  displayName: string;
  avatarUrl: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

export type ChatMessage = {
  id: string;
  lineUserId: string;
  direction: "incoming" | "outgoing";
  kind: "text" | "unsupported";
  body: string;
  status: "received" | "pending" | "sent" | "failed";
  clientMessageId: string | null;
  createdAt: string;
};

export type ChatListResponse = { contacts: ChatContact[]; hasMore: boolean };
export type ChatMessagesResponse = {
  messages: ChatMessage[];
  hasMore: boolean;
};
