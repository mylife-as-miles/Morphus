/**
 * VoicesPanel.tsx
 *
 * Voice cloning panel — lives in the "Voices" tab of InspectorSidebar.
 * Record or upload a sample, clone via ElevenLabs, browse the account voice
 * library, and pin voices for quick access in the NPC voice picker.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Loader2, Mic, Play, Plus, Search, Square, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cloneVoice, deleteVoice, playBuffer, fetchVoices, speak, type ElevenLabsVoice } from "@/lib/elevenlabs-client";
import { blobToWavFile } from "@/lib/audio-blob-to-wav";
import {
  addCustomVoice,
  removeCustomVoice,
  voicesStore,
  type CustomVoice,
} from "@/lib/elevenlabs-voices-store";
import { useSnapshot } from "valtio";

const PANEL_SURFACE = "rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]";
const MAX_RECORD_SEC = 120;

function pickRecorderMime(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return undefined;
}

export function VoicesPanel() {
  const snap = useSnapshot(voicesStore);

  return (
    <div className="flex min-h-full flex-col gap-4 px-1 pb-1">
      <div className="sticky top-0 z-20 -mx-1 space-y-3 px-1 pb-1">
        <CloneVoiceCard />
        <ElevenLabsVoiceLibrary savedVoiceIds={new Set(snap.voices.map((v) => v.voiceId))} />
      </div>

      {snap.voices.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-2">
          <div className="px-1 text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
            My voices ({snap.voices.length})
          </div>
          <div className="space-y-2">
            {snap.voices.map((voice) => (
              <VoiceRow key={voice.id} voice={voice as CustomVoice} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center">
          <div className="w-full rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[11px] text-foreground/36">
            <Mic className="mx-auto mb-2 size-6 opacity-30" />
            No saved voices yet. Clone from a recording/upload above, or add voices from your ElevenLabs library.
          </div>
        </div>
      )}
    </div>
  );
}

function CloneVoiceCard() {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recording, setRecording] = useState<"idle" | "requesting" | "active">("idle");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  const clearTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setError(null);
    setSuccess(false);
  };

  const startRecording = async () => {
    setError(null);
    setSuccess(false);
    setRecording("requesting");
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;

      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      rec.onerror = () => {
        setError("Recording failed.");
        setRecording("idle");
        stopStream();
        clearTick();
      };

      rec.start(250);
      setRecording("active");
      startedAtRef.current = Date.now();
      setRecordSeconds(0);
      clearTick();
      tickRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setRecordSeconds(elapsed);
        if (elapsed >= MAX_RECORD_SEC) {
          void stopRecording();
        }
      }, 500);
    } catch {
      setError("Microphone access denied or unavailable.");
      setRecording("idle");
      stopStream();
    }
  };

  const stopRecording = async () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      setRecording("idle");
      clearTick();
      stopStream();
      return;
    }

    return new Promise<void>((resolve) => {
      rec.onstop = async () => {
        clearTick();
        stopStream();
        mediaRecorderRef.current = null;
        setRecording("idle");

        const mime = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];

        if (blob.size < 2000) {
          setError("Recording too short. Try again with at least a few seconds of speech.");
          resolve();
          return;
        }

        try {
          const wav = await blobToWavFile(blob, "recording.wav");
          setFile(wav);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        } catch {
          setError("Could not process recording. Try uploading a WAV or MP3 instead.");
        }
        resolve();
      };

      rec.stop();
    });
  };

  const handleClone = async () => {
    if (!name.trim() || !file) {
      return;
    }
    setCloning(true);
    setError(null);
    setSuccess(false);
    try {
      const voiceId = await cloneVoice(name.trim(), file);
      addCustomVoice(name.trim(), voiceId);
      setName("");
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clone failed");
    } finally {
      setCloning(false);
    }
  };

  const canClone = name.trim().length > 0 && file !== null && !cloning && recording === "idle";

  return (
    <div className={`${PANEL_SURFACE} relative space-y-3 overflow-hidden px-3 py-3 backdrop-blur-xl`}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015)_26%,rgba(5,8,12,0.06))]" />
      <div className="relative text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
        Clone a Voice
      </div>

      <Input
        className="relative h-8 rounded-xl border-white/10 bg-white/[0.04] text-xs"
        onChange={(e) => setName(e.target.value)}
        placeholder="Voice name (e.g. Guard NPC)"
        value={name}
      />

      <div className="relative flex gap-2">
        <input
          accept="audio/*"
          className="hidden"
          onChange={handleFileChange}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-white/14 bg-white/[0.025] px-3 py-2.5 text-[11px] text-foreground/56 transition-colors hover:border-purple-400/30 hover:text-purple-300"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <Upload className="size-3.5" />
          <span className="truncate">{file && !file.name.startsWith("recording") ? file.name : "Upload sample (mp3, wav, m4a…)"}</span>
        </button>
      </div>

      <div className="relative flex flex-wrap items-center gap-2">
        {recording === "idle" ? (
          <Button
            className="gap-1.5 border border-rose-500/25 bg-rose-500/10 text-rose-200 hover:bg-rose-500/18"
            disabled={cloning || !pickRecorderMime()}
            onClick={() => void startRecording()}
            size="xs"
            type="button"
            variant="ghost"
          >
            <Circle className="size-3 fill-current" />
            Record
          </Button>
        ) : recording === "requesting" ? (
          <Button className="gap-1.5" disabled size="xs" variant="ghost">
            <Loader2 className="size-3 animate-spin" />
            Starting…
          </Button>
        ) : (
          <Button
            className="gap-1.5 border border-white/14"
            onClick={() => void stopRecording()}
            size="xs"
            type="button"
            variant="ghost"
          >
            <Square className="size-3 fill-current text-rose-400" />
            Stop ({recordSeconds}s)
          </Button>
        )}
        {file?.name.startsWith("recording") && recording === "idle" && (
          <span className="text-[10px] text-emerald-400/80">Recording ready — enter a name and Clone.</span>
        )}
      </div>

      <div className="relative flex items-center justify-between gap-2">
        <div className="text-[10px] text-foreground/36">
          15–120 sec of clean speech works best. Recording converts to WAV for ElevenLabs.
        </div>
        <Button className="gap-1.5" disabled={!canClone} onClick={() => void handleClone()} size="xs">
          {cloning ? <Loader2 className="size-3 animate-spin" /> : <Mic className="size-3" />}
          {cloning ? "Cloning…" : "Clone"}
        </Button>
      </div>

      {error && <div className="relative rounded-lg bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-300">{error}</div>}
      {success && (
        <div className="relative rounded-lg bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-300">
          Voice cloned! It appears under My voices and in the NPC voice picker.
        </div>
      )}
    </div>
  );
}

function ElevenLabsVoiceLibrary({ savedVoiceIds }: { savedVoiceIds: Set<string> }) {
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetchVoices()
      .then(setVoices)
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Could not load ElevenLabs voices."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = voices.filter((v) => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return true;
    }
    return v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q) || v.voice_id.toLowerCase().includes(q);
  });

  const handlePreview = async (v: ElevenLabsVoice) => {
    if (v.preview_url) {
      setPreviewingId(v.voice_id);
      const audio = new Audio(v.preview_url);
      audio.onended = () => setPreviewingId(null);
      audio.play().catch(() => setPreviewingId(null));
      return;
    }
    setPreviewingId(v.voice_id);
    try {
      await speak(`Hi, I'm ${v.name}.`, { voiceId: v.voice_id });
    } catch {
      /* ignore */
    } finally {
      setPreviewingId(null);
    }
  };

  const handleAdd = (v: ElevenLabsVoice) => {
    if (savedVoiceIds.has(v.voice_id)) {
      return;
    }
    addCustomVoice(v.name, v.voice_id);
  };

  return (
    <div className={`${PANEL_SURFACE} relative space-y-2 overflow-hidden px-3 py-3 backdrop-blur-xl`}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015)_26%,rgba(5,8,12,0.06))]" />
      <div className="relative flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
          ElevenLabs library
        </div>
        <Button className="h-6 text-[10px]" disabled={loading} onClick={load} size="xs" variant="ghost">
          Refresh
        </Button>
      </div>
      <div className="relative flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2">
        <Search className="size-3 shrink-0 text-foreground/32" />
        <Input
          className="h-8 border-0 bg-transparent text-xs shadow-none focus-visible:ring-0"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search voices…"
          value={query}
        />
      </div>

      {loadError && <div className="relative text-[10px] text-rose-300">{loadError}</div>}

      {loading ? (
        <div className="relative flex items-center gap-2 py-4 text-[11px] text-foreground/48">
          <Loader2 className="size-3 animate-spin" />
          Loading voices…
        </div>
      ) : (
        <div className="relative max-h-52 space-y-1 overflow-y-auto pr-0.5">
          {filtered.length === 0 ? (
            <div className="py-3 text-center text-[10px] text-foreground/36">No voices match your search.</div>
          ) : (
            filtered.map((v) => {
              const saved = savedVoiceIds.has(v.voice_id);
              return (
                <div
                  key={v.voice_id}
                  className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-foreground/82">{v.name}</div>
                    <div className="truncate text-[9px] text-foreground/38">
                      {v.category}
                      <span className="ml-1 font-mono text-foreground/28">{v.voice_id.slice(0, 8)}…</span>
                    </div>
                  </div>
                  <Button
                    className="size-7 shrink-0"
                    disabled={previewingId === v.voice_id}
                    onClick={() => void handlePreview(v)}
                    size="icon-xs"
                    title="Preview"
                    variant="ghost"
                  >
                    {previewingId === v.voice_id ? (
                      <Loader2 className="size-3 animate-spin text-emerald-400" />
                    ) : (
                      <Play className="size-3 text-emerald-400" />
                    )}
                  </Button>
                  <Button
                    className="h-7 gap-0.5 px-2 text-[10px] shrink-0"
                    disabled={saved}
                    onClick={() => handleAdd(v)}
                    size="xs"
                    title={saved ? "Already in My voices" : "Add to My voices"}
                    variant="ghost"
                  >
                    {saved ? "Saved" : <Plus className="size-3" />}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      )}
      <div className="relative text-[9px] text-foreground/32">
        Premade and custom voices from your ElevenLabs account. Add favorites to pin them under My voices.
      </div>
    </div>
  );
}

function VoiceRow({ voice }: { voice: CustomVoice }) {
  const [deleting, setDeleting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteVoice(voice.voiceId);
      removeCustomVoice(voice.id);
    } catch {
      removeCustomVoice(voice.id);
    } finally {
      setDeleting(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const voices = await fetchVoices();
      const found = voices.find((v) => v.voice_id === voice.voiceId);
      if (found?.preview_url) {
        const audio = new Audio(found.preview_url);
        audio.onended = () => setPreviewing(false);
        audio.play().catch(() => setPreviewing(false));
        return;
      }
      await speak("Preview.", { voiceId: voice.voiceId });
    } catch {
      /* ignore */
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2">
      <Mic className="size-3.5 shrink-0 text-purple-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-foreground/82">{voice.name}</div>
        <div className="truncate font-mono text-[9px] text-foreground/36">{voice.voiceId}</div>
      </div>
      <Button
        className="size-6 shrink-0"
        disabled={previewing}
        onClick={() => void handlePreview()}
        size="icon-xs"
        title="Preview voice"
        variant="ghost"
      >
        <Play className="size-3 text-emerald-400" />
      </Button>
      <Button
        className="size-6 shrink-0"
        disabled={deleting}
        onClick={() => void handleDelete()}
        size="icon-xs"
        title="Remove from My voices (deletes clone on ElevenLabs if applicable)"
        variant="ghost"
      >
        {deleting ? <Loader2 className="size-2.5 animate-spin" /> : <Trash2 className="size-3 text-foreground/40" />}
      </Button>
    </div>
  );
}
