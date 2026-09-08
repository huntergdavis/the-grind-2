import { creativeStoryMemoryPrefix } from "./creative-continuity";

interface WriterInputMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export interface CreativeWriterConversationMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/** Native chat history for accepted imagined passages, never a replacement for current facts. */
export function buildCreativeWriterConversation(messages: readonly WriterInputMessage[]): CreativeWriterConversationMessage[] {
  const middle = messages.slice(1, -1);
  const recognized = middle.some((message) => message.content.startsWith(creativeStoryMemoryPrefix));
  if (!recognized) return messages.map(({ role, content }) => ({ role, content }));
  if (messages.length < 3 || messages.length > 4 || messages[0]?.role !== "system"
    || messages.at(-1)?.role !== "user" || !middle.every((message) => message.role === "user"
      && message.content.startsWith(creativeStoryMemoryPrefix))) {
    throw new Error("Invalid imagined narrative history shape");
  }
  const history = middle.map((message): CreativeWriterConversationMessage => {
    const prose: unknown = JSON.parse(message.content.slice(creativeStoryMemoryPrefix.length));
    if (typeof prose !== "string" || prose.trim().length === 0) throw new Error("Invalid imagined narrative history text");
    return { role: "assistant", content: prose };
  });
  return [{ ...messages[0]! }, ...history, { ...messages.at(-1)! }];
}
