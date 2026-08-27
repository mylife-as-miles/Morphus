import * as React from "react";
import { Gamepad2, LoaderCircle, MonitorPlay, RefreshCw, Upload } from "lucide-react";
import type { DevSyncGameRegistration } from "@blud/dev-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

const SELF_PREVIEW_GAME_ID_PREFIX = "self-preview:";

function isSelfPreview(game: DevSyncGameRegistration) {
  return game.id.startsWith(SELF_PREVIEW_GAME_ID_PREFIX);
}

type GameConnectionControlProps = {
  activeGame?: DevSyncGameRegistration;
  error?: string;
  games: DevSyncGameRegistration[];
  isLoading: boolean;
  isPushing: boolean;
  lastPush?: {
    game: DevSyncGameRegistration;
    projectSlug: string;
    scenePath: string;
  };
  onProjectNameChange: (value: string) => void;
  onProjectSlugChange: (value: string) => void;
  onPushScene: (forceSwitch: boolean) => void;
  onRefresh: () => void;
  onSelectGame: (gameId: string) => void;
  projectName: string;
  projectSlug: string;
  selectedGameId?: string;
};

export function GameConnectionControl({
  activeGame,
  error,
  games,
  isLoading,
  isPushing,
  lastPush,
  onProjectNameChange,
  onProjectSlugChange,
  onPushScene,
  onRefresh,
  onSelectGame,
  projectName,
  projectSlug,
  selectedGameId
}: GameConnectionControlProps) {
  const hasExternal = games.some((g) => !isSelfPreview(g));
  const connectionLabel = games.length === 0
    ? "No Game"
    : games.length === 1
      ? activeGame?.name ?? games[0]?.name ?? "Game"
      : `${games.length} Games`;

  const activeSelf = activeGame ? isSelfPreview(activeGame) : false;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label="Game connection"
            className="editor-toolbar-button flex flex-row gap-1 rounded-[10px] px-2 text-[11px] hover:translate-y-0 active:scale-100"
            size="sm"
            title="Connected game"
            variant="ghost"
          >
            <Gamepad2 className={`size-3.5 ${games.length > 0 ? "text-[#f6d07d]" : "text-foreground/55"}`} />
            <span className="max-w-28 truncate">{connectionLabel}</span>
          </Button>
        }
      />

      <PopoverContent
        align="end"
        className="editor-toolbar-shell w-96 gap-3 rounded-[18px] p-3"
      >
        <PopoverHeader>
          <PopoverTitle className="text-sm text-foreground">Editor Sync</PopoverTitle>
          <PopoverDescription className="text-xs text-foreground/55">
            {activeSelf
              ? "Push the current scene into the built-in preview. Connect an external game project to push into its src/scenes folder."
              : "Push the current runtime scene straight into a connected game's src/scenes folder."}
          </PopoverDescription>
        </PopoverHeader>

        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Project</span>
            <Input
              onChange={(event) => onProjectNameChange(event.currentTarget.value)}
              placeholder="Untitled Scene"
              value={projectName}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Slug</span>
            <Input
              onChange={(event) => onProjectSlugChange(event.currentTarget.value)}
              placeholder="untitled-scene"
              value={projectSlug}
            />
          </label>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Connected Games</span>
            <Button className="editor-toolbar-button rounded-[10px] hover:translate-y-0 active:scale-100" onClick={onRefresh} size="icon-xs" variant="ghost">
              <RefreshCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="grid max-h-40 gap-1 overflow-y-auto">
            {games.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-foreground/50">
                Waiting for a game dev server to connect…
              </div>
            ) : (
              games.map((game) => (
                <button
                  className={`rounded-xl border px-3 py-2 text-left transition ${game.id === selectedGameId ? "border-[#f6d07d]/30 bg-[#f6d07d]/10 text-foreground" : "border-white/8 bg-white/4 text-foreground/70 hover:bg-white/7"}`}
                  key={game.id}
                  onClick={() => onSelectGame(game.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {isSelfPreview(game) ? (
                        <MonitorPlay className="size-3 shrink-0 text-foreground/40" />
                      ) : null}
                      <span className="truncate text-sm font-medium">{game.name}</span>
                    </div>
                    {isSelfPreview(game) ? (
                      <span className="shrink-0 rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] text-foreground/45">built-in</span>
                    ) : (
                      <span className="text-[11px] text-foreground/45">{game.sceneIds.length} scenes</span>
                    )}
                  </div>
                  {!isSelfPreview(game) ? (
                    <div className="truncate pt-0.5 text-[11px] text-foreground/45">{game.url}</div>
                  ) : null}
                </button>
              ))
            )}
          </div>

          {!hasExternal && games.length > 0 ? (
            <p className="text-[11px] text-foreground/35">
              Run a game project with the <span className="font-mono">web-hammer-game-dev</span> Vite plugin to connect an external target.
            </p>
          ) : null}
        </div>

        <ForceSwitchRow
          activeGame={activeGame}
          isPushing={isPushing}
          onPushScene={onPushScene}
          pushDisabled={!activeGame || isPushing || projectSlug.trim().length === 0}
        />

        {lastPush ? (
          <div className="rounded-xl border border-[#f6d07d]/18 bg-[#f6d07d]/8 px-3 py-2 text-xs text-[#fff0cb]/85">
            {isSelfPreview(lastPush.game)
              ? `Scene "${lastPush.projectSlug}" staged in the built-in preview.`
              : `Pushed \`${lastPush.projectSlug}\` to \`${lastPush.scenePath}\` in ${lastPush.game.name}.`}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100/90">
            {error}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ForceSwitchRow(props: {
  activeGame?: DevSyncGameRegistration;
  isPushing: boolean;
  onPushScene: (forceSwitch: boolean) => void;
  pushDisabled: boolean;
}) {
  const [forceSwitch, setForceSwitch] = React.useState(true);
  const selfTarget = props.activeGame ? isSelfPreview(props.activeGame) : false;

  return (
    <div className="editor-toolbar-segment flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm text-foreground">
          {selfTarget ? "Switch to Preview" : "Force Scene Switch"}
        </div>
        <div className="text-xs text-foreground/50">
          {selfTarget
            ? "Signal the orchestrator to open the game view after pushing."
            : "Reload the running game into this scene after the files land."}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={forceSwitch} onCheckedChange={setForceSwitch} size="sm" />
        <Button className="hover:translate-y-0 active:scale-100" disabled={props.pushDisabled} onClick={() => props.onPushScene(forceSwitch)} size="sm">
          {props.isPushing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          Push
        </Button>
      </div>
    </div>
  );
}
