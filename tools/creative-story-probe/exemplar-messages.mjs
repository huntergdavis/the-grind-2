/** Original demonstration prose; never a production prompt or fallback. */
export const exemplarDemonstrations = "Example facts: Ada faces a locked tower; its door remains shut.\n"
  + "Example story: Ada wanted to know what waited inside, yet the silence made her grateful for the locked door. Curiosity and caution pulled her in opposite directions.\n\n"
  + "Example facts: Neri travels with Pell, who remains injured.\n"
  + "Example story: Neri wanted to promise Pell an easy road, but the promise caught in her throat. His injury frightened her, and leaving him frightened her more.\n\n"
  + "For the next scene, use only its people and facts.";

export function withExemplarDemonstrations(messages) {
  if (messages?.length !== 2 || messages[0]?.role !== 'system' || messages[1]?.role !== 'user'
    || messages.some((message) => typeof message.content !== 'string')) {
    throw new Error('Expected the unchanged production system/user pair');
  }
  const result = Object.freeze([
    Object.freeze({ ...messages[0], content: `${messages[0].content}\n\n${exemplarDemonstrations}` }),
    messages[1],
  ]);
  if (result.some((message) => message.content.length > 4_000)
    || result.reduce((sum, message) => sum + message.content.length, 0) > 8_000) {
    throw new Error('Exemplar prompt exceeds unchanged production character bounds');
  }
  return result;
}
