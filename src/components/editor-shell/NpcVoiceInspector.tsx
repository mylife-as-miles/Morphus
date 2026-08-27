/**
 * NpcVoiceInspector.tsx
 *
 * Inspector section for NPC voice assignment and dialogue line authoring.
 * Appears in the INSPECT tab when an npc-spawn or smart-object entity is selected.
 *
 * Data storage in entity.properties:
 *   __el_voice_id — ElevenLabs voice ID string
 *   __el_dialogue — JSON-stringified array of dialogue lines
 *   __npc_character_prompt — Gemini character brief for viewport preview chat
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Play, Plus, Trash2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { NPC_CHARACTER_PROMPT_PROPERTY, NPC_DIALOGUE_PROPERTY, NPC_VOICE_ID_PROPERTY } from "@/lib/npc-voice-keys";
import type { Entity } from "@blud/shared";
import {
  fetchVoices,
  playBuffer,
  speak,
  textToSpeech,
  type ElevenLabsVoice,
} from "@/lib/elevenlabs-client";
import { voicesStore } from "@/lib/elevenlabs-voices-store";
import { useSnapshot } from "valtio";

type DialogueLine = { id: string; text: string; audioBuffer?: AudioBuffer | null };

interface NpcVoiceInspectorProps {
  entity: Entity;
  onUpdateEntityProperties: (entityId: string, props: Entity["properties"]) => void;
}

export function NpcVoiceInspector({ entity, onUpdateEntityProperties }: NpcVoiceInspectorProps) {
  const snap = useSnapshot(voicesStore);

  const [elVoices, setElVoices] = useState<ElevenLabsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  const selectedVoiceId = (entity.properties[NPC_VOICE_ID_PROPERTY] as string | undefined) ?? "";
  const characterPrompt = String(entity.properties[NPC_CHARACTER_PROMPT_PROPERTY] ?? "");

  const parsedDialogue: DialogueLine[] = (() => {
    try {
      const raw = entity.properties[NPC_DIALOGUE_PROPERTY] as string | undefined;
      const arr = raw ? (JSON.parse(raw) as { id: string; text: string }[]) : [];
      return arr.map((l) => ({ ...l, audioBuffer: undefined }));
    } catch {
      return [];
    }
  })();

  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>(parsedDialogue);

  useEffect(() => {
    setLoadingVoices(true);
    fetchVoices()
      .then(setElVoices)
      .catch(() => {})
      .finally(() => setLoadingVoices(false));
  }, []);

  const commitDialogue = useCallback(
    (lines: DialogueLine[]) => {
      const serializable = lines.map(({ id, text }) => ({ id, text }));
      onUpdateEntityProperties(entity.id, {
        ...entity.properties,
        [NPC_DIALOGUE_PROPERTY]: JSON.stringify(serializable),
      });
    },
    [entity, onUpdateEntityProperties],
  );

  const setVoiceId = (voiceId: string) => {
    onUpdateEntityProperties(entity.id, {
      ...entity.properties,
      [NPC_VOICE_ID_PROPERTY]: voiceId,
    });
  };

  const addLine = () => {
    const next = [...dialogueLines, { id: crypto.randomUUID(), text: "", audioBuffer: undefined }];
    setDialogueLines(next);
    commitDialogue(next);
  };

  const removeLine = (id: string) => {
    const next = dialogueLines.filter((l) => l.id !== id);
    setDialogueLines(next);
    commitDialogue(next);
  };

  const updateLineText = (id: string, text: string) => {
    const next = dialogueLines.map((l) => (l.id === id ? { ...l, text } : l));
    setDialogueLines(next);
    commitDialogue(next);
  };

  const customIds = new Set(snap.voices.map((v) => v.voiceId));
  const elVoicesDeduped = elVoices.filter((v) => !customIds.has(v.voice_id));
  const setCharacterPrompt = (text: string) => {
    onUpdateEntityProperties(entity.id, {
      ...entity.properties,
      [NPC_CHARACTER_PROMPT_PROPERTY]: text
    });
  };

  const allVoices: { voice_id: string; name: string }[] = [
    ...snap.voices.map((v) => ({ voice_id: v.voiceId, name: `★ ${v.name}` })),
    ...elVoicesDeduped.map((v) => ({ voice_id: v.voice_id, name: v.name })),
  ];

  return (
    <div className="space-y-3">
      {/* Voice picker */}
      <div className="space-y-1.5">
        <div className="px-1 text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
          <span className="flex items-center gap-1.5">
            <Mic className="size-3 text-purple-400" />
            Voice
          </span>
        </div>

        {loadingVoices ? (
          <div className="flex items-center gap-2 text-[11px] text-foreground/48">
            <Loader2 className="size-3 animate-spin" />
            Loading voices…
          </div>
        ) : (
          <select
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-foreground outline-none focus:border-purple-400/40 focus:ring-0"
            onChange={(e) => setVoiceId(e.target.value)}
            value={selectedVoiceId}
          >
            <option value="">— No voice assigned —</option>
            {allVoices.map((v) => (
              <option key={v.voice_id} value={v.voice_id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="px-1 text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
          Character (viewport preview)
        </div>
        <Textarea
          className="min-h-[72px] resize-y rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[11px] text-foreground placeholder:text-foreground/32"
          onChange={(e) => setCharacterPrompt(e.target.value)}
          placeholder="Who is this NPC? Used with Gemini when you press Interact during physics preview (Copilot Gemini key)."
          value={characterPrompt}
        />
      </div>

      {/* Dialogue lines */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">
            Dialogue
          </div>
          <Button onClick={addLine} size="icon-xs" variant="ghost" title="Add dialogue line">
            <Plus className="size-3" />
          </Button>
        </div>

        {dialogueLines.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-center text-[10px] text-foreground/32">
            No dialogue lines yet. Press + to add one.
          </div>
        )}

        <div className="space-y-1.5">
          {dialogueLines.map((line) => (
            <DialogueLineRow
              key={line.id}
              line={line}
              voiceId={selectedVoiceId}
              onChangeText={(text) => updateLineText(line.id, text)}
              onRemove={() => removeLine(line.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DialogueLineRow({
  line,
  voiceId,
  onChangeText,
  onRemove,
}: {
  line: DialogueLine;
  voiceId: string;
  onChangeText: (text: string) => void;
  onRemove: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!line.text.trim() || !voiceId) return;
    setGenerating(true);
    setError(null);
    try {
      const buf = await textToSpeech(line.text, { voiceId });
      bufferRef.current = buf;
      setPlaying(true);
      await playBuffer(buf);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
      setPlaying(false);
    }
  };

  const replay = async () => {
    if (!bufferRef.current) return;
    setPlaying(true);
    await playBuffer(bufferRef.current);
    setPlaying(false);
  };

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          className="h-7 flex-1 rounded-lg border-white/8 bg-transparent text-[11px]"
          onChange={(e) => onChangeText(e.target.value)}
          placeholder="Enter dialogue text…"
          value={line.text}
        />
        <Button
          className={cn("size-7 shrink-0", !voiceId && "opacity-40")}
          disabled={!line.text.trim() || !voiceId || generating}
          onClick={generate}
          size="icon-xs"
          title={voiceId ? "Generate voice" : "Select a voice first"}
          variant="ghost"
        >
          {generating ? <Loader2 className="size-3 animate-spin text-purple-400" /> : <Volume2 className="size-3 text-purple-400" />}
        </Button>
        {bufferRef.current && !generating && (
          <Button
            className="size-7 shrink-0"
            disabled={playing}
            onClick={replay}
            size="icon-xs"
            title="Play again"
            variant="ghost"
          >
            <Play className="size-3 text-emerald-400" />
          </Button>
        )}
        <Button onClick={onRemove} size="icon-xs" variant="ghost" title="Remove line">
          <Trash2 className="size-3 text-foreground/40" />
        </Button>
      </div>
      {error && <div className="text-[10px] text-rose-400">{error}</div>}
      {playing && !generating && <div className="text-[10px] text-purple-400/70">Playing…</div>}
    </div>
  );
}
