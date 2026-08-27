/**
 * elevenlabs-voices-store.ts
 *
 * Persistent (localStorage) store for user-cloned ElevenLabs voices.
 * Uses Valtio proxy so components re-render when the list changes.
 */

import { proxy, subscribe } from "valtio";

export type CustomVoice = {
  id: string;
  name: string;
  voiceId: string;
  createdAt: number;
};

const STORAGE_KEY = "blud-el-custom-voices";

function loadFromStorage(): CustomVoice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomVoice[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(voices: CustomVoice[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(voices));
  } catch {}
}

export const voicesStore = proxy<{ voices: CustomVoice[] }>({
  voices: typeof window !== "undefined" ? loadFromStorage() : [],
});

if (typeof window !== "undefined") {
  subscribe(voicesStore, () => {
    saveToStorage(voicesStore.voices);
  });
}

export function addCustomVoice(name: string, voiceId: string) {
  voicesStore.voices.push({
    id: crypto.randomUUID(),
    name,
    voiceId,
    createdAt: Date.now(),
  });
}

export function removeCustomVoice(id: string) {
  const idx = voicesStore.voices.findIndex((v) => v.id === id);
  if (idx !== -1) voicesStore.voices.splice(idx, 1);
}
