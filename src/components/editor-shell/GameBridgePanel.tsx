import { useState, type RefObject } from "react";
import { Car, CloudFog, Layers, RotateCcw, Sun, Wind, Zap } from "lucide-react";

type BridgeCmd =
  | "setGravity"
  | "setFriction"
  | "setRestitution"
  | "setFog"
  | "setTimeOfDay"
  | "setWind"
  | "spawnVehicle"
  | "spawnDebris"
  | "setCameraMode"
  | "reset";

function sendCmd(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  cmd: BridgeCmd,
  args?: Record<string, unknown>
) {
  iframeRef.current?.contentWindow?.postMessage(
    { __blud: true, cmd, args: args ?? {} },
    "*"
  );
}

type GameBridgePanelProps = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
};

export function GameBridgePanel({ iframeRef }: GameBridgePanelProps) {
  const [gravity, setGravityState] = useState(-9.81);
  const [friction, setFrictionState] = useState(0.8);
  const [restitution, setRestitutionState] = useState(0.2);
  const [fogDensity, setFogDensityState] = useState(0.012);
  const [timeOfDay, setTimeOfDayState] = useState(0.55);
  const [windX, setWindX] = useState(0);
  const [windZ, setWindZ] = useState(0);
  const [cameraMode, setCameraModeState] = useState<"follow" | "free" | "orbit">("follow");

  return (
    <div
      className="absolute right-3 top-14 z-30 flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/70 p-3 backdrop-blur-xl"
      style={{ width: 220 }}
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
          Live Controls
        </span>
        <div className="flex gap-1">
          {(["follow", "free", "orbit"] as const).map((m) => (
            <button
              key={m}
              className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                cameraMode === m
                  ? "bg-white/20 text-white"
                  : "text-white/40 hover:text-white/60"
              }`}
              onClick={() => {
                setCameraModeState(m);
                sendCmd(iframeRef, "setCameraMode", { mode: m });
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <Section icon={<Zap className="size-3" />} label="Physics">
        <Slider
          label="Gravity"
          value={gravity}
          min={-25}
          max={0}
          step={0.1}
          display={gravity.toFixed(1)}
          onChange={(v) => {
            setGravityState(v);
            sendCmd(iframeRef, "setGravity", { y: v });
          }}
        />
        <Slider
          label="Friction"
          value={friction}
          min={0}
          max={2}
          step={0.01}
          display={friction.toFixed(2)}
          onChange={(v) => {
            setFrictionState(v);
            sendCmd(iframeRef, "setFriction", { v });
          }}
        />
        <Slider
          label="Bounce"
          value={restitution}
          min={0}
          max={1}
          step={0.01}
          display={restitution.toFixed(2)}
          onChange={(v) => {
            setRestitutionState(v);
            sendCmd(iframeRef, "setRestitution", { v });
          }}
        />
      </Section>

      <Section icon={<Sun className="size-3" />} label="Environment">
        <Slider
          label="Time of day"
          value={timeOfDay}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(timeOfDay * 24)}:00`}
          onChange={(v) => {
            setTimeOfDayState(v);
            sendCmd(iframeRef, "setTimeOfDay", { t: v });
          }}
        />
        <Slider
          label="Fog"
          value={fogDensity}
          min={0}
          max={0.1}
          step={0.001}
          display={fogDensity.toFixed(3)}
          onChange={(v) => {
            setFogDensityState(v);
            sendCmd(iframeRef, "setFog", { density: v });
          }}
        />
      </Section>

      <Section icon={<Wind className="size-3" />} label="Wind">
        <Slider
          label="X"
          value={windX}
          min={-20}
          max={20}
          step={0.5}
          display={windX.toFixed(1)}
          onChange={(v) => {
            setWindX(v);
            sendCmd(iframeRef, "setWind", { x: v, z: windZ });
          }}
        />
        <Slider
          label="Z"
          value={windZ}
          min={-20}
          max={20}
          step={0.5}
          display={windZ.toFixed(1)}
          onChange={(v) => {
            setWindZ(v);
            sendCmd(iframeRef, "setWind", { x: windX, z: v });
          }}
        />
      </Section>

      <Section icon={<Layers className="size-3" />} label="Spawn">
        <div className="flex gap-1.5">
          <SpawnButton
            icon={<Car className="size-3.5" />}
            label="Vehicle"
            onClick={() => sendCmd(iframeRef, "spawnVehicle", { x: 0, y: 8, z: 0 })}
          />
          <SpawnButton
            icon={<CloudFog className="size-3.5" />}
            label="Debris"
            onClick={() => sendCmd(iframeRef, "spawnDebris", { x: 0, y: 8, z: 0, count: 30, scale: 1.5 })}
          />
          <SpawnButton
            icon={<RotateCcw className="size-3.5" />}
            label="Reset"
            danger
            onClick={() => sendCmd(iframeRef, "reset")}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2">
      <div className="mb-0.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-widest text-white/30">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[52px] shrink-0 text-[10px] text-white/50">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="flex-1 accent-emerald-400"
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="w-[36px] shrink-0 text-right text-[10px] tabular-nums text-white/60">
        {display}
      </span>
    </div>
  );
}

function SpawnButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[9px] font-medium transition-colors ${
        danger
          ? "border border-red-400/20 bg-red-500/10 text-red-400 hover:bg-red-500/20"
          : "border border-white/8 bg-white/[0.05] text-white/50 hover:bg-white/[0.09] hover:text-white/70"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
