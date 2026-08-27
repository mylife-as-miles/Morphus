import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Eye, EyeOff, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import type { CopilotSettings } from "@/lib/copilot/types";
import { loadCopilotSettings, saveCopilotSettings } from "@/lib/copilot/settings";

type CodexStatus =
  | { state: "checking" }
  | { state: "ready"; version?: string }
  | { state: "unavailable"; message: string };

const CODEX_MODELS = ["gpt-5.4", "gpt-5.3-codex", "gpt-5.1-codex-max", "gpt-4.1", "gpt-4.1-mini", "codex-mini-latest", "o3", "o4-mini"] as const;

export function CopilotSettingsDialog({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<CopilotSettings>(loadCopilotSettings);
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);
  const [codexStatus, setCodexStatus] = useState<CodexStatus>({ state: "checking" });

  const refreshCodexStatus = async () => {
    setCodexStatus({ state: "checking" });

    try {
      const response = await fetch("/api/codex/status");
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The local Codex bridge is not available here.");
      }

      const status = await response.json() as { available?: boolean; version?: string; error?: string };
      setCodexStatus(
        status.available
          ? { state: "ready", version: status.version }
          : { state: "unavailable", message: status.error ?? "Codex is not signed in." },
      );
    } catch (error) {
      setCodexStatus({
        state: "unavailable",
        message: error instanceof Error ? error.message : "The local Codex bridge is not available here.",
      });
    }
  };

  useEffect(() => {
    if (open) void refreshCodexStatus();
  }, [open]);

  const handleSave = () => {
    saveCopilotSettings(settings);
    setOpen(false);
    onSaved?.();
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button className="size-7 rounded-lg text-foreground/48 hover:text-foreground" size="icon-sm" variant="ghost" />
        }
      >
        <Settings className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#0a1510] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copilot Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <section className="space-y-2 border-b border-white/8 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">Codex App</p>
                <p className="mt-1 text-[10px] text-foreground/36">Build and edit through the signed-in Codex app.</p>
              </div>
              <Button
                className="size-8 rounded-lg text-foreground/48"
                onClick={() => void refreshCodexStatus()}
                size="icon-sm"
                title="Refresh Codex connection"
                variant="ghost"
              >
                <RefreshCw className={`size-3.5 ${codexStatus.state === "checking" ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs">
              {codexStatus.state === "ready" ? (
                <CircleCheck className="size-3.5 shrink-0 text-emerald-300" />
              ) : (
                <CircleAlert className="size-3.5 shrink-0 text-amber-300" />
              )}
              <span className="min-w-0 flex-1 text-foreground/72">
                {codexStatus.state === "checking"
                  ? "Checking Codex App connection..."
                  : codexStatus.state === "ready"
                    ? `Connected${codexStatus.version ? ` (${codexStatus.version})` : ""}`
                    : codexStatus.message}
              </span>
            </div>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">Model</span>
              <select
                className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.045] px-3 text-sm text-foreground outline-none focus:border-emerald-300/60"
                onChange={(event) => setSettings({
                  ...settings,
                  provider: "codex",
                  codex: { model: event.target.value as CopilotSettings["codex"]["model"] },
                })}
                value={settings.codex.model}
              >
                {CODEX_MODELS.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </label>
          </section>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
              ElevenLabs Audio Key
            </label>
            <div className="relative">
              <Input
                className="h-10 rounded-xl border-white/10 bg-white/[0.045] pr-10 text-sm font-mono"
                onChange={(e) => setSettings({ ...settings, elevenlabsApiKey: e.target.value })}
                placeholder="Enter your ElevenLabs API key"
                type={showElevenLabsKey ? "text" : "password"}
                value={settings.elevenlabsApiKey}
              />
              <Button
                className="absolute right-1 top-1 size-8 rounded-lg text-foreground/48"
                onClick={() => setShowElevenLabsKey(!showElevenLabsKey)}
                size="icon-sm"
                variant="ghost"
              >
                {showElevenLabsKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
            </div>
            <p className="text-[10px] text-foreground/36">
              Used for voice and audio features. Stored locally in your browser.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button className="rounded-xl" onClick={() => setOpen(false)} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={handleSave} size="sm">
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
