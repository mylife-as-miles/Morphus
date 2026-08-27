/**
 * useTts — React hook for ElevenLabs text-to-speech
 *
 * Usage:
 *   const { speak, speaking, cancel } = useTts();
 *   speak("Hello, world!");
 */

import { useCallback, useRef, useState } from "react";
import { speak as elevenLabsSpeak, type TtsOptions } from "@/lib/elevenlabs-client";

export interface UseTtsReturn {
  speak: (text: string, opts?: TtsOptions) => Promise<void>;
  speaking: boolean;
  cancel: () => void;
  error: string | null;
}

export function useTts(): UseTtsReturn {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string, opts?: TtsOptions) => {
    if (!text.trim()) return;
    cancelRef.current = false;
    setSpeaking(true);
    setError(null);
    try {
      await elevenLabsSpeak(text, opts);
    } catch (err) {
      if (!cancelRef.current) {
        setError(err instanceof Error ? err.message : "TTS failed");
      }
    } finally {
      setSpeaking(false);
    }
  }, []);

  return { speak, speaking, cancel, error };
}
