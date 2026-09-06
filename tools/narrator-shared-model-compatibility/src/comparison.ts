import {
  liveNarratorForms,
  renderLiveNarratorForm,
  type LiveNarratorFormDescriptor,
} from "../../../src/narrator/live-form-selection";
import { isSafeLiveNarration } from "../../../src/narrator/live-output-policy";
import type { NarratorPromptV1 } from "../../../src/narrator/protocol";

export function identifyLiveNarratorSelection(
  prompt: NarratorPromptV1,
  text: string,
): LiveNarratorFormDescriptor {
  if (!isSafeLiveNarration(text, prompt)) {
    throw new TypeError("Shared-model compatibility output failed the live safety policy");
  }
  const matches = liveNarratorForms(prompt).filter(
    (form) => renderLiveNarratorForm(prompt, form.formId) === text,
  );
  if (matches.length !== 1) {
    throw new TypeError("Shared-model compatibility output does not identify exactly one eligible form");
  }
  return matches[0]!;
}
