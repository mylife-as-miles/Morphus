import { proxy } from "valtio";

export type PreviewNpcDialogueTurn = {
  role: "user" | "assistant";
  text: string;
};

export type PreviewNpcDialogueSession = {
  characterPrompt: string;
  displayName: string;
  entityId: string;
  history: PreviewNpcDialogueTurn[];
  voiceId: string;
};

export const previewNpcDialogueStore = proxy({
  busy: false,
  error: null as string | null,
  session: null as PreviewNpcDialogueSession | null
});
