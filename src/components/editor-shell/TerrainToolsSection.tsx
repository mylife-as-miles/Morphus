import type { ComponentType, ReactNode } from "react";
import { useSnapshot } from "valtio";
import {
  ArrowDown,
  ArrowUp,
  CircleDotDashed,
  CircleMinus,
  CirclePlus,
  Drill,
  Focus,
  Grid3X3,
  Layers3,
  Mountain,
  Paintbrush,
  Pickaxe,
  Sparkles,
  Waves
} from "lucide-react";
import type { MeshBrushDomain, MeshBrushMode, TerrainPaintChannelId } from "@blud/shared";
import { isTerrainToolId, terrainTools, type TerrainToolId, type ToolId } from "@blud/tool-system";
import { DragInput } from "@/components/ui/drag-input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { setTerrainBrush, uiStore } from "@/state/ui-store";

type TerrainToolsSectionProps = {
  activeToolId: ToolId;
  /** False while the scene has no mesh terrain, so the tools have nothing to act on. */
  hasMeshTerrain: boolean;
  onCreateMeshTerrain: () => void;
  onSetToolId: (toolId: ToolId) => void;
};

const terrainToolIcons: Record<TerrainToolId, ComponentType<{ className?: string }>> = {
  "terrain-sculpt": Layers3,
  "terrain-paint": Paintbrush,
  "terrain-density": Grid3X3,
  "terrain-tunnel": Pickaxe,
  "terrain-dig": Drill
};

/** Short rail labels. The registry label carries the "Terrain " qualifier. */
const terrainToolShortLabels: Record<TerrainToolId, string> = {
  "terrain-sculpt": "Sculpt",
  "terrain-paint": "Paint",
  "terrain-density": "Density",
  "terrain-tunnel": "Tunnel",
  "terrain-dig": "Dig"
};

const brushModeOptions: Array<{
  Icon: ComponentType<{ className?: string }>;
  hint: string;
  label: string;
  mode: MeshBrushMode;
}> = [
  { mode: "raise", label: "Raise", Icon: ArrowUp, hint: "Push the surface outward." },
  { mode: "lower", label: "Lower", Icon: ArrowDown, hint: "Pull the surface inward." },
  { mode: "smooth", label: "Smooth", Icon: Waves, hint: "Relax toward the level the stroke crosses." },
  { mode: "flatten", label: "Flatten", Icon: CircleDotDashed, hint: "Converge on the target elevation." },
  { mode: "clay", label: "Clay", Icon: CirclePlus, hint: "Build broad mass with a flattened crest." },
  { mode: "pinch", label: "Pinch", Icon: Focus, hint: "Sharpen ridges by exaggerating relief." },
  { mode: "scrape", label: "Scrape", Icon: CircleMinus, hint: "Plane away material above the surface." },
  { mode: "terrace", label: "Terrace", Icon: Layers3, hint: "Quantize elevation into stepped benches." },
  { mode: "noise", label: "Noise", Icon: Sparkles, hint: "Blend seeded breakup at a world scale." }
];

const brushDomainOptions: Array<{ domain: MeshBrushDomain; hint: string; label: string }> = [
  {
    domain: "heightfield",
    label: "Heightfield · Y",
    hint: "Displacement stays vertical, as on a heightmap."
  },
  {
    domain: "mesh",
    label: "Mesh · XYZ",
    hint: "Displacement follows the picked normal, so strokes can carve overhangs."
  }
];

const paintChannelOptions: Array<{ channel: TerrainPaintChannelId; label: string }> = [
  { channel: "channel0", label: "CH 1" },
  { channel: "channel1", label: "CH 2" },
  { channel: "channel2", label: "CH 3" },
  { channel: "channel3", label: "CH 4" }
];

export function TerrainToolsSection({
  activeToolId,
  hasMeshTerrain,
  onCreateMeshTerrain,
  onSetToolId
}: TerrainToolsSectionProps) {
  const brush = useSnapshot(uiStore).terrainBrush;
  const terrainToolActive = isTerrainToolId(activeToolId);

  if (!hasMeshTerrain) {
    return (
      <div className="flex flex-col gap-3">
        <div className="editor-dock-note rounded-xl px-3 py-3 text-[11px]">
          This scene has no mesh terrain yet. Mesh terrain sculpts along the picked
          surface normal, so it can carry overhangs, arches and caves that heightmap
          terrain cannot.
        </div>
        <button
          className="editor-toolbar-button flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 text-[11px] font-medium"
          onClick={onCreateMeshTerrain}
          type="button"
        >
          <Mountain className="size-4" />
          Create Mesh Terrain
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-1.5">
        {terrainTools.map((tool) => {
          const Icon = terrainToolIcons[tool.id];

          return (
            <button
              className={cn(
                "editor-toolbar-button flex flex-col items-center gap-1.5 rounded-[10px] border px-1 py-2 text-[10px] font-medium transition-colors duration-150",
                tool.id === activeToolId && "editor-toolbar-button-active text-[#fff0cb]"
              )}
              key={tool.id}
              onClick={() => onSetToolId(tool.id)}
              title={tool.label}
              type="button"
            >
              <Icon className="size-4" />
              {terrainToolShortLabels[tool.id]}
            </button>
          );
        })}
      </div>

      {!terrainToolActive ? (
        <div className="editor-dock-note rounded-xl px-3 py-3 text-[11px]">
          Pick a terrain tool to sculpt, paint or cut a mesh terrain node.
        </div>
      ) : null}

      {activeToolId === "terrain-sculpt" ? (
        <>
          <FieldGroup title="Brush Mode">
            <div className="grid grid-cols-3 gap-1.5">
              {brushModeOptions.map(({ Icon, hint, label, mode }) => (
                <button
                  className={cn(
                    "editor-toolbar-button flex flex-col items-center gap-1.5 rounded-[10px] border px-1 py-2 text-[10px] font-medium transition-colors duration-150",
                    brush.mode === mode && "editor-toolbar-button-active text-[#fff0cb]"
                  )}
                  key={mode}
                  onClick={() => setTerrainBrush("mode", mode)}
                  title={hint}
                  type="button"
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup title="Domain">
            <div className="editor-toolbar-segment grid grid-cols-2 gap-1.5 rounded-[14px] p-1.5">
              {brushDomainOptions.map(({ domain, hint, label }) => (
                <button
                  className={cn(
                    "editor-toolbar-button rounded-[10px] border px-2 py-2 text-[10px] font-semibold tracking-[0.08em] uppercase transition-colors duration-150",
                    brush.domain === domain && "editor-toolbar-button-active text-[#fff0cb]"
                  )}
                  key={domain}
                  onClick={() => setTerrainBrush("domain", domain)}
                  title={hint}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-1.5 text-[10px] text-foreground/42">
              {brushDomainOptions.find((option) => option.domain === brush.domain)?.hint}
            </div>
          </FieldGroup>

          <FieldGroup title="Brush">
            <NumberRow
              label="Radius"
              max={512}
              min={0.5}
              onChange={(value) => setTerrainBrush("radius", value)}
              precision={1}
              step={0.5}
              suffix="m"
              value={brush.radius}
            />
            <NumberRow
              label="Strength"
              max={1}
              min={0}
              onChange={(value) => setTerrainBrush("strength", value)}
              precision={2}
              step={0.01}
              value={brush.strength}
            />
            <NumberRow
              label="Falloff"
              max={1}
              min={0}
              onChange={(value) => setTerrainBrush("falloff", value)}
              precision={2}
              step={0.01}
              value={brush.falloff}
            />
            <ToggleRow
              checked={brush.accumulate}
              hint="Keeps one held stroke building instead of settling on a depth."
              label="Accumulate"
              onCheckedChange={(value) => setTerrainBrush("accumulate", value)}
            />
          </FieldGroup>

          {brush.mode === "flatten" ? (
            <FieldGroup title="Flatten">
              <NumberRow
                label="Target Y"
                max={8192}
                min={-8192}
                onChange={(value) => setTerrainBrush("targetY", value)}
                precision={2}
                step={0.25}
                suffix="m"
                value={brush.targetY}
              />
            </FieldGroup>
          ) : null}

          {brush.mode === "terrace" ? (
            <FieldGroup title="Terrace">
              <NumberRow
                label="Step"
                max={256}
                min={0.1}
                onChange={(value) => setTerrainBrush("terraceStep", value)}
                precision={2}
                step={0.1}
                suffix="m"
                value={brush.terraceStep}
              />
            </FieldGroup>
          ) : null}

          {brush.mode === "noise" ? (
            <FieldGroup title="Noise">
              <NumberRow
                label="Scale"
                max={512}
                min={0.1}
                onChange={(value) => setTerrainBrush("noiseScale", value)}
                precision={2}
                step={0.1}
                suffix="m"
                value={brush.noiseScale}
              />
              <NumberRow
                label="Seed"
                max={65535}
                min={0}
                onChange={(value) => setTerrainBrush("noiseSeed", Math.max(0, Math.round(value)))}
                precision={0}
                step={1}
                value={brush.noiseSeed}
              />
            </FieldGroup>
          ) : null}
        </>
      ) : null}

      {activeToolId === "terrain-paint" ? (
        <>
          <FieldGroup title="Channel">
            <div className="grid grid-cols-4 gap-1.5">
              {paintChannelOptions.map(({ channel, label }) => (
                <button
                  className={cn(
                    "editor-toolbar-button rounded-[10px] border px-1 py-2 text-[10px] font-semibold tracking-[0.08em] uppercase transition-colors duration-150",
                    brush.paintChannel === channel && "editor-toolbar-button-active text-[#fff0cb]"
                  )}
                  key={channel}
                  onClick={() => setTerrainBrush("paintChannel", channel)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-1.5 text-[10px] text-foreground/42">
              Channel names and colours are edited on the terrain node in the inspector.
            </div>
          </FieldGroup>

          <FieldGroup title="Paint">
            <div className="editor-toolbar-segment grid grid-cols-2 gap-1.5 rounded-[14px] p-1.5">
              {(["add", "subtract"] as const).map((mode) => (
                <button
                  className={cn(
                    "editor-toolbar-button rounded-[10px] border px-2 py-2 text-[10px] font-semibold tracking-[0.08em] uppercase transition-colors duration-150",
                    brush.paintMode === mode && "editor-toolbar-button-active text-[#fff0cb]"
                  )}
                  key={mode}
                  onClick={() => setTerrainBrush("paintMode", mode)}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>
            <NumberRow
              label="Radius"
              max={512}
              min={0.5}
              onChange={(value) => setTerrainBrush("paintRadius", value)}
              precision={1}
              step={0.5}
              suffix="m"
              value={brush.paintRadius}
            />
            <NumberRow
              label="Strength"
              max={1}
              min={0}
              onChange={(value) => setTerrainBrush("paintStrength", value)}
              precision={2}
              step={0.01}
              value={brush.paintStrength}
            />
            <NumberRow
              label="Falloff"
              max={1}
              min={0}
              onChange={(value) => setTerrainBrush("paintFalloff", value)}
              precision={2}
              step={0.01}
              value={brush.paintFalloff}
            />
          </FieldGroup>
        </>
      ) : null}

      {activeToolId === "terrain-density" ? (
        <FieldGroup title="Density">
          <NumberRow
            label="Radius"
            max={512}
            min={0.5}
            onChange={(value) => setTerrainBrush("densityRadius", value)}
            precision={1}
            step={0.5}
            suffix="m"
            value={brush.densityRadius}
          />
          <NumberRow
            label="Edge length"
            max={64}
            min={0.1}
            onChange={(value) => setTerrainBrush("densityTargetEdgeLength", value)}
            precision={2}
            step={0.1}
            suffix="m"
            value={brush.densityTargetEdgeLength}
          />
          <div className="text-[10px] text-foreground/42">
            Injects local coordinate bands at the requested edge length.
          </div>
        </FieldGroup>
      ) : null}

      {activeToolId === "terrain-tunnel" ? (
        <FieldGroup title="Tunnel">
          <NumberRow
            label="Radius"
            max={256}
            min={0.5}
            onChange={(value) => setTerrainBrush("tunnelRadius", value)}
            precision={1}
            step={0.5}
            suffix="m"
            value={brush.tunnelRadius}
          />
          <NumberRow
            label="Depth"
            max={512}
            min={0.5}
            onChange={(value) => setTerrainBrush("tunnelDepth", value)}
            precision={1}
            step={0.5}
            suffix="m"
            value={brush.tunnelDepth}
          />
          <NumberRow
            label="Noise"
            max={4}
            min={0}
            onChange={(value) => setTerrainBrush("tunnelNoise", value)}
            precision={2}
            step={0.05}
            value={brush.tunnelNoise}
          />
          <NumberRow
            label="Noise scale"
            max={64}
            min={0.1}
            onChange={(value) => setTerrainBrush("tunnelNoiseScale", value)}
            precision={2}
            step={0.1}
            suffix="m"
            value={brush.tunnelNoiseScale}
          />
          <div className="text-[10px] text-foreground/42">
            Press one portal, drag to the second, release. The swept boolean stays editable in the stack.
          </div>
        </FieldGroup>
      ) : null}

      {activeToolId === "terrain-dig" ? (
        <FieldGroup title="Cave Dig">
          <NumberRow
            label="Radius"
            max={256}
            min={0.5}
            onChange={(value) => setTerrainBrush("digRadius", value)}
            precision={1}
            step={0.5}
            suffix="m"
            value={brush.digRadius}
          />
          <NumberRow
            label="Speed"
            max={200}
            min={0.5}
            onChange={(value) => setTerrainBrush("digSpeed", value)}
            precision={1}
            step={0.5}
            suffix="m/s"
            value={brush.digSpeed}
          />
          <NumberRow
            label="Noise"
            max={4}
            min={0}
            onChange={(value) => setTerrainBrush("digNoise", value)}
            precision={2}
            step={0.05}
            value={brush.digNoise}
          />
          <NumberRow
            label="Noise scale"
            max={64}
            min={0.1}
            onChange={(value) => setTerrainBrush("digNoiseScale", value)}
            precision={2}
            step={0.1}
            suffix="m"
            value={brush.digNoiseScale}
          />
          <div className="text-[10px] text-foreground/42">
            Hold on the terrain to drill along the camera ray. Touching an existing hole extends that modifier.
          </div>
        </FieldGroup>
      ) : null}
    </div>
  );
}

function FieldGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="editor-toolbar-label">{title}</div>
      {children}
    </div>
  );
}

function NumberRow({
  label,
  max,
  min,
  onChange,
  precision,
  step,
  suffix,
  value
}: {
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  precision?: number;
  step?: number;
  suffix?: string;
  value: number;
}) {
  return (
    <div className="grid grid-cols-[1fr_86px] items-center gap-2">
      <span className="text-[11px] text-foreground/65">{label}</span>
      <DragInput
        compact
        max={max}
        min={min}
        onChange={onChange}
        onValueCommit={onChange}
        precision={precision}
        step={step}
        suffix={suffix}
        value={value}
      />
    </div>
  );
}

function ToggleRow({
  checked,
  hint,
  label,
  onCheckedChange
}: {
  checked: boolean;
  hint?: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2" title={hint}>
      <span className="text-[11px] text-foreground/65">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} size="sm" />
    </div>
  );
}
