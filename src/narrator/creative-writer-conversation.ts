import { creativeStoryMemoryPrefix } from "./creative-continuity";

interface WriterInputMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export interface CreativeWriterConversationMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

const legacyScene = "Earlier imagined moment; its recorded scene details are unavailable. This is past prose, not the current scene.";
const safeLabel = (value: unknown, maximum: number): value is string => typeof value === "string"
  && value.length > 0 && value.length <= maximum && value.trim() === value
  && !/[<>\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value);

/** Pair each earlier interpretation with its own scene, never with the current facts. */
function historyPair(encoded: string): CreativeWriterConversationMessage[] {
  const value: unknown = JSON.parse(encoded);
  let text: unknown = value;
  let context = legacyScene;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entry = value as Record<string, unknown>;
    const scene = entry.scene;
    if (Object.keys(entry).length !== 2 || !Object.hasOwn(entry, "text")
      || scene === null || typeof scene !== "object" || Array.isArray(scene)) {
      throw new Error("Invalid imagined narrative scene context");
    }
    const labels = scene as Record<string, unknown>;
    if (Object.keys(labels).length !== 2 || !safeLabel(labels.location, 120) || !safeLabel(labels.headline, 160)) {
      throw new Error("Invalid imagined narrative scene labels");
    }
    text = entry.text;
    context = `Earlier recorded scene (past, not current): ${labels.location}\n${labels.headline}`
      + "\nThe following passage imagined this earlier moment; its feelings are not game facts.";
  }
  if (typeof text !== "string" || text.trim().length === 0) throw new Error("Invalid imagined narrative history text");
  return [{ role: "user", content: context }, { role: "assistant", content: text }];
}

/** Reconstructed past scene/prose turns; no invented history or replacement for current facts. */
export function buildCreativeWriterConversation(messages: readonly WriterInputMessage[]): CreativeWriterConversationMessage[] {
  const middle = messages.slice(1, -1);
  const recognized = middle.some((message) => message.content.startsWith(creativeStoryMemoryPrefix));
  if (!recognized) return messages.map(({ role, content }) => ({ role, content }));
  if (messages.length < 3 || messages.length > 4 || messages[0]?.role !== "system"
    || messages.at(-1)?.role !== "user" || !middle.every((message) => message.role === "user"
      && message.content.startsWith(creativeStoryMemoryPrefix))) {
    throw new Error("Invalid imagined narrative history shape");
  }
  const history = middle.flatMap((message) => historyPair(message.content.slice(creativeStoryMemoryPrefix.length)));
  return [{ ...messages[0]! }, ...history, { ...messages.at(-1)! }];
}
