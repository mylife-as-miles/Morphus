import { useCallback, useEffect, useMemo } from "react";
import type { Material } from "@blud/shared";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { X, Layers, Palette, ImageIcon, Sliders, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PALETTE = {
  output: "#1a2f1e",
  color: "#1a1f30",
  texture: "#1f1a30",
  surface: "#1a271f",
  normal: "#1a2830",
};

type MatNodeData = Record<string, unknown>;

function OutputNode({ data }: NodeProps<Node<MatNodeData>>) {
  return (
    <div className="min-w-[160px] overflow-hidden rounded-xl border border-emerald-500/30 shadow-lg">
      <div className="flex items-center gap-1.5 bg-emerald-900/60 px-3 py-2">
        <CircleDot className="size-3 text-emerald-400" />
        <span className="text-[11px] font-semibold tracking-wide text-emerald-200">Material Output</span>
      </div>
      <div className="space-y-1 bg-[#0d1f10]/80 px-3 py-2.5">
        {["Albedo", "Normal", "Roughness", "Metalness", "Opacity", "Emissive"].map((label) => (
          <div key={label} className="relative flex items-center justify-start gap-2 py-0.5">
            <Handle
              type="target"
              position={Position.Left}
              id={label.toLowerCase()}
              style={{ left: -12, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, background: "#4ade80", border: "1.5px solid #166534" }}
            />
            <span className="text-[10px] text-white/50">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorNode({ data }: NodeProps<Node<MatNodeData>>) {
  const color = (data.color as string) ?? "#ffffff";
  return (
    <div className="min-w-[140px] overflow-hidden rounded-xl border border-sky-500/25 shadow-lg">
      <div className="flex items-center gap-1.5 bg-sky-900/50 px-3 py-2">
        <Palette className="size-3 text-sky-400" />
        <span className="text-[11px] font-semibold tracking-wide text-sky-200">{data.label as string}</span>
      </div>
      <div className="bg-[#0d1020]/80 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div
            className="h-6 w-10 flex-shrink-0 rounded-md border border-white/15"
            style={{ background: color }}
          />
          <span className="font-mono text-[10px] text-white/60">{color}</span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ right: -12, width: 8, height: 8, background: "#38bdf8", border: "1.5px solid #0369a1" }}
      />
    </div>
  );
}

function TextureNode({ data }: NodeProps<Node<MatNodeData>>) {
  const hasTexture = Boolean(data.texturePath);
  return (
    <div className="min-w-[150px] overflow-hidden rounded-xl border border-violet-500/25 shadow-lg">
      <div className="flex items-center gap-1.5 bg-violet-900/50 px-3 py-2">
        <ImageIcon className="size-3 text-violet-400" />
        <span className="text-[11px] font-semibold tracking-wide text-violet-200">{data.label as string}</span>
      </div>
      <div className="bg-[#10091f]/80 px-3 py-2.5">
        {hasTexture ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5">
              <ImageIcon className="size-4 text-white/40" />
            </div>
            <span className="break-all font-mono text-[9px] leading-tight text-white/50">
              {(data.texturePath as string).split("/").pop()}
            </span>
          </div>
        ) : (
          <span className="text-[10px] italic text-white/30">No texture</span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ right: -12, width: 8, height: 8, background: "#a78bfa", border: "1.5px solid #6d28d9" }}
      />
    </div>
  );
}

function ValueNode({ data }: NodeProps<Node<MatNodeData>>) {
  const value = data.value as number;
  return (
    <div className="min-w-[130px] overflow-hidden rounded-xl border border-amber-500/25 shadow-lg">
      <div className="flex items-center gap-1.5 bg-amber-900/40 px-3 py-2">
        <Sliders className="size-3 text-amber-400" />
        <span className="text-[11px] font-semibold tracking-wide text-amber-200">{data.label as string}</span>
      </div>
      <div className="bg-[#1a1200]/80 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-amber-400/70"
              style={{ width: `${Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100)}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-white/60">{(value ?? 0).toFixed(2)}</span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ right: -12, width: 8, height: 8, background: "#fbbf24", border: "1.5px solid #92400e" }}
      />
    </div>
  );
}

function BlendLayerNode({ data }: NodeProps<Node<MatNodeData>>) {
  return (
    <div className="min-w-[140px] overflow-hidden rounded-xl border border-rose-500/25 shadow-lg">
      <div className="flex items-center gap-1.5 bg-rose-900/40 px-3 py-2">
        <Layers className="size-3 text-rose-400" />
        <span className="text-[11px] font-semibold tracking-wide text-rose-200">{data.label as string}</span>
      </div>
      <div className="bg-[#1f0a0a]/80 px-3 py-2.5">
        <span className="text-[10px] text-white/40">Blend layer</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ right: -12, width: 8, height: 8, background: "#fb7185", border: "1.5px solid #9f1239" }}
      />
    </div>
  );
}

const NODE_TYPES = {
  output: OutputNode,
  color: ColorNode,
  texture: TextureNode,
  value: ValueNode,
  blendLayer: BlendLayerNode,
};

function buildGraph(material: Material): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const outputX = 620;
  const sourceX = 80;
  let rowY = 60;
  const rowStep = 110;

  nodes.push({
    id: "output",
    type: "output",
    position: { x: outputX, y: 120 },
    data: {},
    draggable: true,
  });

  const addEdge = (sourceId: string, targetHandle: string) => {
    edges.push({
      id: `${sourceId}->${targetHandle}`,
      source: sourceId,
      sourceHandle: "out",
      target: "output",
      targetHandle,
      style: { stroke: "#4ade8066", strokeWidth: 1.5 },
      animated: true,
    });
  };

  nodes.push({
    id: "albedo",
    type: material.colorTexture ? "texture" : "color",
    position: { x: sourceX, y: rowY },
    data: {
      label: "Albedo",
      color: material.color,
      texturePath: material.colorTexture,
    },
    draggable: true,
  });
  addEdge("albedo", "albedo");
  rowY += rowStep;

  nodes.push({
    id: "normal",
    type: "texture",
    position: { x: sourceX, y: rowY },
    data: { label: "Normal Map", texturePath: material.normalTexture },
    draggable: true,
  });
  addEdge("normal", "normal");
  rowY += rowStep;

  nodes.push({
    id: "roughness",
    type: material.roughnessTexture ? "texture" : "value",
    position: { x: sourceX, y: rowY },
    data: {
      label: "Roughness",
      value: material.roughness ?? 0.5,
      texturePath: material.roughnessTexture,
    },
    draggable: true,
  });
  addEdge("roughness", "roughness");
  rowY += rowStep;

  nodes.push({
    id: "metalness",
    type: material.metalnessTexture ? "texture" : "value",
    position: { x: sourceX, y: rowY },
    data: {
      label: "Metalness",
      value: material.metalness ?? 0,
      texturePath: material.metalnessTexture,
    },
    draggable: true,
  });
  addEdge("metalness", "metalness");
  rowY += rowStep;

  if (material.transparent || (material.opacity !== undefined && material.opacity < 1)) {
    nodes.push({
      id: "opacity",
      type: "value",
      position: { x: sourceX, y: rowY },
      data: { label: "Opacity", value: material.opacity ?? 1 },
      draggable: true,
    });
    addEdge("opacity", "opacity");
    rowY += rowStep;
  }

  if (material.emissiveColor && material.emissiveColor !== "#000000") {
    nodes.push({
      id: "emissive",
      type: "color",
      position: { x: sourceX, y: rowY },
      data: { label: "Emissive", color: material.emissiveColor },
      draggable: true,
    });
    addEdge("emissive", "emissive");
    rowY += rowStep;
  }

  (material.blendLayers ?? []).forEach((layer, i) => {
    const id = `blend-${i}`;
    nodes.push({
      id,
      type: "blendLayer",
      position: { x: 360, y: 60 + i * 80 },
      data: { label: `Blend Layer ${i + 1}`, texturePath: layer.colorTexture },
      draggable: true,
    });
    addEdge(id, "albedo");
  });

  return { nodes, edges };
}

function NodeMaterialGraph({ material }: { material: Material }) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraph(material),
    [material]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(material);
    setNodes(n);
    setEdges(e);
  }, [material, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.4}
      maxZoom={2}
      deleteKeyCode={null}
      className="bg-transparent"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#ffffff12"
      />
      <Controls
        className="!border-white/10 !bg-[#0a1a0d]/80 !shadow-lg [&>button]:!border-white/10 [&>button]:!bg-transparent [&>button]:!text-white/60"
        showInteractive={false}
      />
    </ReactFlow>
  );
}

type NodeMaterialEditorSheetProps = {
  material: Material | undefined;
  onClose: () => void;
};

const MIN_HEIGHT = 280;
const DEFAULT_HEIGHT = 420;

export function NodeMaterialEditorSheet({ material, onClose }: NodeMaterialEditorSheetProps) {
  const hostRef = useCallback((node: HTMLDivElement | null) => {
    hostRefEl.current = node;
  }, []);
  const hostRefEl = { current: null as HTMLDivElement | null };

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-8 z-30 flex flex-col overflow-hidden rounded-t-[1.35rem] border-x border-t border-white/8 bg-[#040907]/80 shadow-[0_-22px_72px_rgba(0,0,0,0.44)] backdrop-blur-2xl"
      style={{ height: DEFAULT_HEIGHT }}
    >
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-white/6 px-3.5">
        <div className="flex items-center gap-2">
          <Layers className="size-3.5 text-violet-400" />
          <span className="text-[11px] font-semibold tracking-[0.12em] text-white/80 uppercase">
            Node Material Editor
          </span>
          {material && (
            <span className="rounded-md bg-white/8 px-2 py-0.5 text-[10px] text-white/50">
              {material.name}
            </span>
          )}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-6 text-white/40 hover:text-white/70"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        {material ? (
          <ReactFlowProvider>
            <NodeMaterialGraph material={material} />
          </ReactFlowProvider>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/30">
            <Layers className="size-8 opacity-40" />
            <span className="text-[12px]">Select a material to inspect its node graph</span>
          </div>
        )}
      </div>
    </div>
  );
}
