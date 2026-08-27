import { useMemo, useState } from "react";
import {
  createDefaultProceduralWorldConfig,
  normalizeProceduralWorldConfig,
  resolveProceduralWorldPreset,
  validateProceduralWorldConfig,
  type ProceduralWorldConfig,
  type ProceduralWorldNode,
  type ProceduralWorldNodeData,
  type ProceduralWorldSystem,
} from "@blud/shared";
import { Gauge, Play, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requestProceduralWorldRuntimeAction } from "@/lib/procedural-world/runtime-actions";
import { useProceduralWorldRuntimeStatus } from "@/lib/procedural-world/runtime-diagnostics";

type ProceduralWorldInspectorProps = {
  node: ProceduralWorldNode;
  onUpdate: (data: ProceduralWorldNodeData) => void;
};

type RuntimeAction = ProceduralWorldSystem | "world";

export function ProceduralWorldInspector({ node, onUpdate }: ProceduralWorldInspectorProps) {
  const [tab, setTab] = useState("generate");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const runtime = useProceduralWorldRuntimeStatus(node.id);
  const resolution = useMemo(() => resolveProceduralWorldPreset(node.data), [node.data]);
  const effective = runtime?.effectiveRuntimeConfig ?? resolution.config;
  const overrides = runtime ? [...runtime.presetOverrides, ...runtime.hardwareClamps] : resolution.overrides;
  const validation = useMemo(() => validateProceduralWorldConfig(node.data), [node.data]);

  const update = (mutate: (next: ProceduralWorldNodeData) => void) => {
    const next = structuredClone(node.data);
    mutate(next);
    onUpdate(normalizeProceduralWorldConfig(next));
  };
  const setNumber = (path: (next: ProceduralWorldNodeData, value: number) => void, value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) update((next) => path(next, parsed));
  };
  const effectiveAt = (path: string): unknown => getPath(effective, path);
  const fieldOverride = (path: string): string | undefined => overrides.find((item) => item.path === path)?.reason;
  const resetToPreset = () => {
    const defaults = createDefaultProceduralWorldConfig(node.data.seed);
    defaults.preset = node.data.preset;
    const next = resolveProceduralWorldPreset(defaults).config;
    next.bookmarks = structuredClone(node.data.bookmarks);
    next.enabled = node.data.enabled;
    next.exploration = structuredClone(node.data.exploration);
    next.timeOfDay = node.data.timeOfDay;
    onUpdate(next);
  };
  const resetToDefault = () => {
    const next = createDefaultProceduralWorldConfig(node.data.seed);
    next.bookmarks = structuredClone(node.data.bookmarks);
    onUpdate(next);
  };
  const runAction = async (label: string, action: RuntimeAction) => {
    if (busyAction) return;
    setBusyAction(label);
    setActionMessage(null);
    try {
      const result = await requestProceduralWorldRuntimeAction(node.id, action);
      setActionMessage(result.warnings[0] ?? `${label} complete`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="space-y-3 border-t border-white/8 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-foreground">LAAS Procedural World</div>
          <div className="text-[10px] text-foreground/55">{runtime?.stage ?? "Runtime inactive"}</div>
        </div>
        <Switch checked={node.data.enabled} onCheckedChange={(enabled) => update((next) => { next.enabled = enabled; })} />
      </div>
      <Tabs onValueChange={setTab} value={tab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
          {[
            ["generate", "Generate"], ["terrain", "Terrain"], ["vegetation", "Vegetation"], ["lighting", "Lighting"],
            ["atmosphere", "Atmosphere"], ["water", "Water"], ["motion", "Motion"], ["post", "Post"],
            ["exploration", "Explore"], ["diagnostics", "Diagnostics"]
          ].map(([id, label]) => <TabsTrigger className="h-6 px-1.5 text-[10px]" key={id} value={id}>{label}</TabsTrigger>)}
        </TabsList>

        <TabsContent className="space-y-2 pt-2" value="generate">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Seed" meta="World" onChange={(value) => setNumber((next, number) => { next.seed = Math.floor(number) >>> 0; }, value)} value={node.data.seed} />
            <NumberField effective={effectiveAt("worldSizeMeters")} label="World m" meta="World" note={fieldOverride("worldSizeMeters")} onChange={(value) => setNumber((next, number) => { next.worldSizeMeters = number; }, value)} value={node.data.worldSizeMeters} />
            <NumberField effective={effectiveAt("heightfieldResolution")} label="Heightfield" meta="Terrain" note={fieldOverride("heightfieldResolution")} onChange={(value) => setNumber((next, number) => { next.heightfieldResolution = number; }, value)} value={node.data.heightfieldResolution} />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["low", "high", "ultra", "custom"] as const).map((preset) => <Button key={preset} onClick={() => update((next) => { next.preset = preset; })} size="xs" variant={node.data.preset === preset ? "default" : "ghost"}>{preset}</Button>)}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Button onClick={resetToPreset} size="xs" variant="ghost"><RefreshCw className="size-3" />Preset</Button>
            <Button onClick={resetToDefault} size="xs" variant="ghost"><RotateCcw className="size-3" />Default</Button>
          </div>
          <ActionGrid busy={busyAction} onRun={runAction} />
          {actionMessage ? <div className="text-[10px] text-foreground/60">{actionMessage}</div> : null}
        </TabsContent>

        <TabsContent className="space-y-2 pt-2" value="terrain">
          <RangeField effective={effectiveAt("terrain.heightAmplitude")} label="Height" meta="Terrain" onChange={(value) => setNumber((next, number) => { next.terrain.heightAmplitude = number; }, value)} value={node.data.terrain.heightAmplitude} />
          <RangeField effective={effectiveAt("terrain.noiseScale")} label="Noise scale" meta="Terrain" onChange={(value) => setNumber((next, number) => { next.terrain.noiseScale = number; }, value)} value={node.data.terrain.noiseScale} />
          <RangeField effective={effectiveAt("terrain.hydraulicErosion")} label="Hydraulic" meta="Terrain" onChange={(value) => setNumber((next, number) => { next.terrain.hydraulicErosion = number; }, value)} value={node.data.terrain.hydraulicErosion} />
          <RangeField effective={effectiveAt("terrain.thermalErosion")} label="Thermal" meta="Terrain" onChange={(value) => setNumber((next, number) => { next.terrain.thermalErosion = number; }, value)} value={node.data.terrain.thermalErosion} />
          <RangeField effective={effectiveAt("terrain.riverThreshold")} label="River threshold" meta="Hydrology" onChange={(value) => setNumber((next, number) => { next.terrain.riverThreshold = number; }, value)} value={node.data.terrain.riverThreshold} />
          <RangeField effective={effectiveAt("terrain.moisture")} label="Moisture" meta="Hydrology" onChange={(value) => setNumber((next, number) => { next.terrain.moisture = number; }, value)} value={node.data.terrain.moisture} />
          <RangeField effective={effectiveAt("terrain.snow")} label="Snow" meta="Hydrology" onChange={(value) => setNumber((next, number) => { next.terrain.snow = number; }, value)} value={node.data.terrain.snow} />
          <RangeField effective={effectiveAt("terrain.terrainRange")} label="Terrain range" meta="Material" note={fieldOverride("terrain.terrainRange")} onChange={(value) => setNumber((next, number) => { next.terrain.terrainRange = number; }, value)} value={node.data.terrain.terrainRange} />
          <SelectField label="Lakes" meta="Hydrology" onChange={(value) => update((next) => { next.terrain.lakeBehavior = value as ProceduralWorldConfig["terrain"]["lakeBehavior"]; })} options={["natural", "connected", "off"]} value={node.data.terrain.lakeBehavior} />
          <ToggleField checked={node.data.terrain.farShell} label="Far shell" meta="Material" onChange={(value) => update((next) => { next.terrain.farShell = value; })} />
        </TabsContent>

        <TabsContent className="space-y-2 pt-2" value="vegetation">
          <RangeField effective={effectiveAt("vegetation.treeDensity")} label="Trees" meta="Vegetation" onChange={(value) => setNumber((next, number) => { next.vegetation.treeDensity = number; }, value)} value={node.data.vegetation.treeDensity} />
          <RangeField effective={effectiveAt("vegetation.understoryDensity")} label="Understory" meta="Vegetation" onChange={(value) => setNumber((next, number) => { next.vegetation.understoryDensity = number; }, value)} value={node.data.vegetation.understoryDensity} />
          <RangeField effective={effectiveAt("vegetation.grassDensity")} label="Ground cover" meta="Vegetation" onChange={(value) => setNumber((next, number) => { next.vegetation.grassDensity = number; }, value)} value={node.data.vegetation.grassDensity} />
          <RangeField effective={effectiveAt("vegetation.slopeLimit")} label="Slope limit" meta="Vegetation" onChange={(value) => setNumber((next, number) => { next.vegetation.slopeLimit = number; }, value)} value={node.data.vegetation.slopeLimit} />
          <RangeField effective={effectiveAt("vegetation.impostorRange")} label="Impostor range" meta="Vegetation" note={fieldOverride("vegetation.impostorRange")} onChange={(value) => setNumber((next, number) => { next.vegetation.impostorRange = number; }, value)} value={node.data.vegetation.impostorRange} />
          <NumberField label="Scatter offset" meta="Vegetation" onChange={(value) => setNumber((next, number) => { next.vegetation.scatterSeedOffset = Math.floor(number); }, value)} value={node.data.vegetation.scatterSeedOffset} />
          <RangeField effective={effectiveAt("vegetation.windResponse")} label="Wind response" meta="Live" onChange={(value) => setNumber((next, number) => { next.vegetation.windResponse = number; }, value)} value={node.data.vegetation.windResponse} />
          <MultiToggle values={node.data.vegetation.enabledSpecies} options={["beech", "birch", "conifer", "oak", "pine", "willow"]} onChange={(values) => update((next) => { next.vegetation.enabledSpecies = values; })} />
        </TabsContent>

        <TabsContent className="space-y-2 pt-2" value="lighting">
          <NumberField effective={effectiveAt("timeOfDay")} label="Time of day" meta="Live" onChange={(value) => setNumber((next, number) => { next.timeOfDay = number; }, value)} value={node.data.timeOfDay} />
          <RangeField effective={effectiveAt("lighting.sunAzimuth")} label="Sun azimuth" meta="Live" onChange={(value) => setNumber((next, number) => { next.lighting.sunAzimuth = number; }, value)} value={node.data.lighting.sunAzimuth} />
          <RangeField effective={effectiveAt("lighting.sunElevation")} label="Sun elevation" meta="Live" onChange={(value) => setNumber((next, number) => { next.lighting.sunElevation = number; }, value)} value={node.data.lighting.sunElevation} />
          <SelectField label="Shadows" meta="Material" note={fieldOverride("lighting.shadowQuality")} onChange={(value) => update((next) => { next.lighting.shadowQuality = value as ProceduralWorldConfig["lighting"]["shadowQuality"]; })} options={["low", "high", "ultra"]} value={node.data.lighting.shadowQuality} />
          <ToggleField checked={node.data.lighting.giEnabled} label="Probe GI" meta="Material" onChange={(value) => update((next) => { next.lighting.giEnabled = value; })} />
        </TabsContent>

        <TabsContent className="space-y-2 pt-2" value="atmosphere">
          <RangeField effective={effectiveAt("atmosphere.cloudCoverage")} label="Cloud cover" meta="Live" onChange={(value) => setNumber((next, number) => { next.atmosphere.cloudCoverage = number; }, value)} value={node.data.atmosphere.cloudCoverage} />
          <RangeField effective={effectiveAt("atmosphere.cloudSpeed")} label="Cloud speed" meta="Live" onChange={(value) => setNumber((next, number) => { next.atmosphere.cloudSpeed = number; }, value)} value={node.data.atmosphere.cloudSpeed} />
          <RangeField effective={effectiveAt("atmosphere.fogDensity")} label="Fog" meta="Live" onChange={(value) => setNumber((next, number) => { next.atmosphere.fogDensity = number; }, value)} value={node.data.atmosphere.fogDensity} />
          <ToggleField checked={node.data.atmosphere.volumetrics} label="Volumetrics" meta="Atmosphere" onChange={(value) => update((next) => { next.atmosphere.volumetrics = value; })} />
        </TabsContent>

        <TabsContent className="space-y-2 pt-2" value="water">
          <ToggleField checked={node.data.water.enabled} label="Water" meta="Material" onChange={(value) => update((next) => { next.water.enabled = value; })} />
          <ToggleField checked={node.data.water.caustics} label="Caustics" meta="Material" onChange={(value) => update((next) => { next.water.caustics = value; })} />
          <ToggleField checked={node.data.water.foam} label="Foam" meta="Live" onChange={(value) => update((next) => { next.water.foam = value; })} />
          <ToggleField checked={node.data.water.wetMargins} label="Wet margins" meta="Material" onChange={(value) => update((next) => { next.water.wetMargins = value; })} />
          <RangeField effective={effectiveAt("water.clipmapDistance")} label="Clipmap range" meta="Material" note={fieldOverride("water.clipmapDistance")} onChange={(value) => setNumber((next, number) => { next.water.clipmapDistance = number; }, value)} value={node.data.water.clipmapDistance} />
          <SelectField label="Reflections" meta="Material" note={fieldOverride("water.reflectionQuality")} onChange={(value) => update((next) => { next.water.reflectionQuality = value as ProceduralWorldConfig["water"]["reflectionQuality"]; })} options={["low", "high", "ultra"]} value={node.data.water.reflectionQuality} />
        </TabsContent>

        <TabsContent className="space-y-2 pt-2" value="motion">
          <RangeField effective={effectiveAt("motion.windDirection")} label="Wind direction" meta="Live" onChange={(value) => setNumber((next, number) => { next.motion.windDirection = number; }, value)} value={node.data.motion.windDirection} />
          <RangeField effective={effectiveAt("motion.windStrength")} label="Wind strength" meta="Live" onChange={(value) => setNumber((next, number) => { next.motion.windStrength = number; }, value)} value={node.data.motion.windStrength} />
          <RangeField effective={effectiveAt("motion.cloudSpeed")} label="Motion speed" meta="Live" onChange={(value) => setNumber((next, number) => { next.motion.cloudSpeed = number; }, value)} value={node.data.motion.cloudSpeed} />
          <SelectField label="Particles" meta="Material" note={fieldOverride("motion.particlePreset")} onChange={(value) => update((next) => { next.motion.particlePreset = value as ProceduralWorldConfig["motion"]["particlePreset"]; })} options={["low", "high", "ultra"]} value={node.data.motion.particlePreset} />
          <MultiToggle values={node.data.motion.particleTypes} options={["leaves", "pollen", "snow"]} onChange={(values) => update((next) => { next.motion.particleTypes = values as ProceduralWorldConfig["motion"]["particleTypes"]; })} />
          <ToggleField checked={node.data.motion.freezeSimulation} label="Freeze simulation" meta="Live" onChange={(value) => update((next) => { next.motion.freezeSimulation = value; })} />
        </TabsContent>

        <TabsContent className="space-y-2 pt-2" value="post">
          <ToggleField checked={node.data.post.taa} label="Temporal AA" meta="Post" onChange={(value) => update((next) => { next.post.taa = value; })} />
          <ToggleField checked={node.data.post.gtao} label="GTAO" meta="Post" onChange={(value) => update((next) => { next.post.gtao = value; })} />
          <ToggleField checked={node.data.post.screenSpaceBounce} label="Screen bounce" meta="Post" onChange={(value) => update((next) => { next.post.screenSpaceBounce = value; })} />
          <ToggleField checked={node.data.post.bloom} label="Bloom" meta="Post" onChange={(value) => update((next) => { next.post.bloom = value; })} />
          <ToggleField checked={node.data.post.autoExposure} label="Auto exposure" meta="Post" onChange={(value) => update((next) => { next.post.autoExposure = value; })} />
          <SelectField label="Debug view" meta="Post" onChange={(value) => update((next) => { next.post.debugView = value as ProceduralWorldConfig["post"]["debugView"]; })} options={["none", "ao", "clouds", "velocity"]} value={node.data.post.debugView} />
        </TabsContent>

        <TabsContent className="space-y-2 pt-2" value="exploration">
          <div className="flex gap-1">{(["editor", "walk", "fly"] as const).map((mode) => <Button key={mode} onClick={() => update((next) => { next.exploration.mode = mode; })} size="xs" variant={node.data.exploration.mode === mode ? "default" : "ghost"}>{mode}</Button>)}</div>
          <NumberField effective={effectiveAt("exploration.walkSpeed")} label="Walk speed" meta="Live" onChange={(value) => setNumber((next, number) => { next.exploration.walkSpeed = number; }, value)} value={node.data.exploration.walkSpeed} />
          <NumberField effective={effectiveAt("exploration.flySpeed")} label="Fly speed" meta="Live" onChange={(value) => setNumber((next, number) => { next.exploration.flySpeed = number; }, value)} value={node.data.exploration.flySpeed} />
          <NumberField effective={effectiveAt("exploration.sprintMultiplier")} label="Sprint" meta="Live" onChange={(value) => setNumber((next, number) => { next.exploration.sprintMultiplier = number; }, value)} value={node.data.exploration.sprintMultiplier} />
          <div className="space-y-1 text-[10px] text-foreground/55">{node.data.bookmarks.map((bookmark) => <div key={bookmark.id}>{bookmark.name} / {bookmark.timeOfDay.toFixed(1)}h</div>)}</div>
        </TabsContent>

        <TabsContent className="space-y-2 pt-2 text-[10px] text-foreground/65" value="diagnostics">
          <DiagnosticRow label="Preset" value={`${node.data.preset} / ${effective.preset}`} />
          <DiagnosticRow label="Seed" value={String(effective.seed)} />
          <DiagnosticRow label="Generation" value={runtime ? `${runtime.lastGenerationDurationMs.toFixed(0)} ms` : "inactive"} />
          <DiagnosticRow label="Passes" value={runtime?.activePasses.join(", ") ?? "none"} />
          {runtime ? Object.entries(runtime.systems).map(([name, state]) => <DiagnosticRow key={name} label={name} value={state.error ? `${state.status}: ${state.error}` : state.status} />) : null}
          {overrides.map((override) => <div className="border-l border-amber-400/30 pl-2" key={`${override.source}:${override.path}`}>{override.path}: {String(override.authored)} -&gt; {String(override.effective)}</div>)}
          {validation.issues.map((issue) => <div className={issue.severity === "error" ? "text-red-400" : "text-amber-300"} key={`${issue.code}:${issue.path}`}>{issue.path}: {issue.message}</div>)}
          {runtime?.bindingResult.unsupportedFields.map((field) => <div className="text-red-400" key={field}>{field}: unsupported</div>)}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function ActionGrid({ busy, onRun }: { busy: string | null; onRun: (label: string, action: RuntimeAction) => void }) {
  const actions: Array<[string, RuntimeAction]> = [
    ["Generate World", "world"], ["Regenerate Terrain", "terrain"], ["Regenerate Hydrology", "hydrology"],
    ["Regenerate Vegetation", "vegetation"], ["Rebuild Lighting", "lighting"], ["Rebuild Atmosphere", "atmosphere"],
    ["Rebuild Water", "water"], ["Rebuild Post Stack", "post"],
  ];
  return <div className="grid grid-cols-2 gap-1">{actions.map(([label, action]) => <Button disabled={busy !== null} key={label} onClick={() => void onRun(label, action)} size="xs" variant="ghost"><Play className="size-3" />{busy === label ? "Running" : label}</Button>)}<Button disabled size="xs" title="Use the WebGPU verification harness" variant="ghost"><Play className="size-3" />Verification Shot</Button><Button disabled size="xs" title="Use the WebGPU performance harness" variant="ghost"><Gauge className="size-3" />Performance Capture</Button></div>;
}

function NumberField({ effective, label, meta, note, onChange, value }: { effective?: unknown; label: string; meta: string; note?: string; onChange: (value: string) => void; value: number }) {
  return <label className="grid gap-1 text-[10px] text-foreground/60"><span className="flex justify-between gap-2"><span>{label}</span><FieldMeta authored={value} effective={effective} meta={meta} note={note} /></span><input className="h-7 border border-white/10 bg-black/20 px-2 text-xs text-foreground" defaultValue={value} key={value} onBlur={(event) => onChange(event.currentTarget.value)} type="number" /></label>;
}

function RangeField(props: { effective?: unknown; label: string; meta: string; note?: string; onChange: (value: string) => void; value: number }) {
  return <div className="grid grid-cols-[1fr_72px] items-center gap-2"><span className="text-[11px] text-foreground/65"><span className="flex justify-between gap-2"><span>{props.label}</span><FieldMeta authored={props.value} effective={props.effective} meta={props.meta} note={props.note} /></span></span><input className="h-7 border border-white/10 bg-black/20 px-2 text-xs text-foreground" defaultValue={props.value} key={props.value} onBlur={(event) => props.onChange(event.currentTarget.value)} step="0.1" type="number" /></div>;
}

function ToggleField({ checked, label, meta, onChange }: { checked: boolean; label: string; meta: string; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between text-[11px] text-foreground/65"><span>{label}<span className="ml-1 text-[9px] text-foreground/35">{meta}</span></span><Switch checked={checked} onCheckedChange={onChange} /></div>;
}

function SelectField({ label, meta, note, onChange, options, value }: { label: string; meta: string; note?: string; onChange: (value: string) => void; options: string[]; value: string }) {
  return <label className="flex items-center justify-between gap-2 text-[11px] text-foreground/65"><span>{label}<span className="ml-1 text-[9px] text-foreground/35" title={note}>{meta}</span></span><select className="h-7 min-w-24 border border-white/10 bg-background px-1 text-xs" onChange={(event) => onChange(event.currentTarget.value)} value={value}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function MultiToggle({ onChange, options, values }: { onChange: (values: string[]) => void; options: string[]; values: readonly string[] }) {
  return <div className="flex flex-wrap gap-1">{options.map((option) => <Button key={option} onClick={() => onChange(values.includes(option) ? values.filter((item) => item !== option) : [...values, option])} size="xs" variant={values.includes(option) ? "default" : "ghost"}>{option}</Button>)}</div>;
}

function FieldMeta({ authored, effective, meta, note }: { authored: unknown; effective?: unknown; meta: string; note?: string }) {
  const differs = effective !== undefined && JSON.stringify(authored) !== JSON.stringify(effective);
  return <span className={differs ? "text-amber-300" : "text-foreground/35"} title={note}>{differs ? `${String(effective)} / ${meta}` : meta}</span>;
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[72px_1fr] gap-2"><span className="text-foreground/40">{label}</span><span className="break-words">{value}</span></div>;
}

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => typeof current === "object" && current !== null ? (current as Record<string, unknown>)[key] : undefined, value);
}
