import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Connection,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  X,
  GitBranch,
  GitMerge,
  Zap,
  Filter,
  Repeat,
  CircleDot,
  Plus,
  Save,
  FolderOpen,
  Bot,
  ChevronRight,
  Minus,
  Trash2,
  LayoutList,
  FilePlus,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type BehaviorTree,
  type BtNodeData,
  type BtNodeType
} from "@/lib/behavior-tree-storage";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Node Metadata ─────────────────────────────────────────────────────────

const BT_META: Record<
  BtNodeType,
  {
    label: string;
    symbol: string;
    desc: string;
    headerCls: string;
    borderCls: string;
    dotColor: string;
    isLeaf: boolean;
    isRoot: boolean;
  }
> = {
  root: {
    label: "Root",
    symbol: "●",
    desc: "Entry point of the tree",
    headerCls: "bg-amber-900/70",
    borderCls: "border-amber-500/40",
    dotColor: "#f59e0b",
    isLeaf: false,
    isRoot: true,
  },
  selector: {
    label: "Selector",
    symbol: "?",
    desc: "Tries children left→right until one succeeds",
    headerCls: "bg-blue-900/70",
    borderCls: "border-blue-500/40",
    dotColor: "#3b82f6",
    isLeaf: false,
    isRoot: false,
  },
  sequence: {
    label: "Sequence",
    symbol: "→",
    desc: "Runs children left→right until one fails",
    headerCls: "bg-green-900/70",
    borderCls: "border-green-500/40",
    dotColor: "#22c55e",
    isLeaf: false,
    isRoot: false,
  },
  parallel: {
    label: "Parallel",
    symbol: "⇉",
    desc: "Runs all children simultaneously",
    headerCls: "bg-violet-900/70",
    borderCls: "border-violet-500/40",
    dotColor: "#8b5cf6",
    isLeaf: false,
    isRoot: false,
  },
  inverter: {
    label: "Inverter",
    symbol: "¬",
    desc: "Inverts the result of its single child",
    headerCls: "bg-orange-900/70",
    borderCls: "border-orange-500/40",
    dotColor: "#f97316",
    isLeaf: false,
    isRoot: false,
  },
  repeater: {
    label: "Repeater",
    symbol: "↻",
    desc: "Repeats its child N times",
    headerCls: "bg-teal-900/70",
    borderCls: "border-teal-500/40",
    dotColor: "#14b8a6",
    isLeaf: false,
    isRoot: false,
  },
  condition: {
    label: "Condition",
    symbol: "?",
    desc: "Checks a game event or state",
    headerCls: "bg-cyan-900/70",
    borderCls: "border-cyan-500/40",
    dotColor: "#06b6d4",
    isLeaf: true,
    isRoot: false,
  },
  action: {
    label: "Action",
    symbol: "!",
    desc: "Performs a gameplay action",
    headerCls: "bg-rose-900/70",
    borderCls: "border-rose-500/40",
    dotColor: "#f43f5e",
    isLeaf: true,
    isRoot: false,
  },
};

const BT_ICON: Record<BtNodeType, React.ComponentType<{ className?: string }>> = {
  root: CircleDot,
  selector: GitBranch,
  sequence: ChevronRight,
  parallel: GitMerge,
  inverter: Minus,
  repeater: Repeat,
  condition: Filter,
  action: Zap,
};

// ─── Layout Algorithm ──────────────────────────────────────────────────────

const NODE_W = 188;
const NODE_GAP_H = 28;
const NODE_GAP_V = 100;

function computeLayout(
  nodes: Node<BtNodeData>[],
  edges: Edge[]
): Node<BtNodeData>[] {
  if (nodes.length === 0) return nodes;

  const childMap = new Map<string, string[]>();
  const parentSet = new Set<string>();

  for (const n of nodes) childMap.set(n.id, []);
  for (const e of edges) {
    childMap.get(e.source)?.push(e.target);
    parentSet.add(e.target);
  }

  const roots = nodes.filter((n) => !parentSet.has(n.id));
  if (roots.length === 0) return nodes;

  const subtreeW = new Map<string, number>();
  function calcWidth(id: string): number {
    const children = childMap.get(id) ?? [];
    if (children.length === 0) {
      const w = NODE_W + NODE_GAP_H;
      subtreeW.set(id, w);
      return w;
    }
    const w = children.reduce((s, c) => s + calcWidth(c), 0);
    subtreeW.set(id, w);
    return w;
  }

  let offsetX = 0;
  for (const root of roots) calcWidth(root.id);

  const positions = new Map<string, { x: number; y: number }>();
  function place(id: string, cx: number, depth: number) {
    positions.set(id, { x: cx - NODE_W / 2, y: depth * (80 + NODE_GAP_V) });
    const children = childMap.get(id) ?? [];
    const total = children.reduce((s, c) => s + (subtreeW.get(c) ?? NODE_W + NODE_GAP_H), 0);
    let x = cx - total / 2;
    for (const c of children) {
      const w = subtreeW.get(c) ?? NODE_W + NODE_GAP_H;
      place(c, x + w / 2, depth + 1);
      x += w;
    }
  }

  for (const root of roots) {
    const w = subtreeW.get(root.id) ?? NODE_W + NODE_GAP_H;
    place(root.id, offsetX + w / 2, 0);
    offsetX += w;
  }

  return nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) ?? n.position,
  }));
}

// ─── Storage ───────────────────────────────────────────────────────────────

const REGISTRY_KEY = "blud_bt_index";

function listTrees(): Array<{ id: string; name: string }> {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function loadTree(id: string): BehaviorTree | null {
  try {
    const raw = localStorage.getItem(`blud_bt_${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveTree(tree: BehaviorTree) {
  const registry = listTrees().filter((t) => t.id !== tree.id);
  registry.push({ id: tree.id, name: tree.name });
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  localStorage.setItem(`blud_bt_${tree.id}`, JSON.stringify(tree));
}

function deleteTree(id: string) {
  const registry = listTrees().filter((t) => t.id !== id);
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  localStorage.removeItem(`blud_bt_${id}`);
}

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "tree";
}

// ─── Default Tree ─────────────────────────────────────────────────────────

function makeDefaultTree(): BehaviorTree {
  const rootId = makeId();
  const selId = makeId();
  const seqId = makeId();
  const condId = makeId();
  const actId = makeId();
  const act2Id = makeId();

  const nodes: Node<BtNodeData>[] = [
    { id: rootId, type: "btNode", position: { x: 0, y: 0 }, data: { btType: "root", label: "Root", event: "", mode: "allOf", actionType: "emit", actionTarget: "", actionValue: "", count: 3 } },
    { id: selId, type: "btNode", position: { x: 0, y: 0 }, data: { btType: "selector", label: "Can Attack?", event: "", mode: "allOf", actionType: "emit", actionTarget: "", actionValue: "", count: 3 } },
    { id: seqId, type: "btNode", position: { x: 0, y: 0 }, data: { btType: "sequence", label: "Attack Sequence", event: "", mode: "allOf", actionType: "emit", actionTarget: "", actionValue: "", count: 3 } },
    { id: condId, type: "btNode", position: { x: 0, y: 0 }, data: { btType: "condition", label: "Target In Range", event: "ai.target_acquired", mode: "allOf", actionType: "emit", actionTarget: "", actionValue: "", count: 3 } },
    { id: actId, type: "btNode", position: { x: 0, y: 0 }, data: { btType: "action", label: "Attack Target", event: "", mode: "allOf", actionType: "emit", actionTarget: "ai.attack", actionValue: "", count: 3 } },
    { id: act2Id, type: "btNode", position: { x: 0, y: 0 }, data: { btType: "action", label: "Patrol", event: "", mode: "allOf", actionType: "emit", actionTarget: "ai.patrol", actionValue: "", count: 3 } },
  ];

  const edges: Edge[] = [
    { id: `${rootId}-${selId}`, source: rootId, target: selId },
    { id: `${selId}-${seqId}`, source: selId, target: seqId },
    { id: `${selId}-${act2Id}`, source: selId, target: act2Id },
    { id: `${seqId}-${condId}`, source: seqId, target: condId },
    { id: `${seqId}-${actId}`, source: seqId, target: actId },
  ];

  return { id: "new_tree", name: "New Tree", nodes: computeLayout(nodes, edges), edges };
}

// ─── Custom BT Node ───────────────────────────────────────────────────────

function BtFlowNode({ id, data, selected }: NodeProps<Node<BtNodeData>>) {
  const btType = data.btType as BtNodeType;
  const meta = BT_META[btType];
  const Icon = BT_ICON[btType];

  return (
    <div
      className={cn(
        "min-w-[188px] overflow-hidden rounded-xl border shadow-xl transition-all",
        meta.borderCls,
        selected ? "ring-2 ring-white/30 ring-offset-1 ring-offset-transparent" : ""
      )}
      style={{ background: "#0d1117" }}
    >
      {!meta.isRoot && (
        <Handle
          type="target"
          position={Position.Top}
          id="in"
          style={{ width: 10, height: 10, background: meta.dotColor, border: "2px solid #0d1117", top: -5 }}
        />
      )}

      <div className={cn("flex items-center gap-2 px-3 py-2", meta.headerCls)}>
        <Icon className="size-3 shrink-0 text-white/80" />
        <span className="flex-1 truncate text-[11px] font-semibold tracking-wide text-white/90">
          {meta.label}
        </span>
        <span className="shrink-0 rounded bg-black/30 px-1 py-0.5 font-mono text-[10px] text-white/50">
          {meta.symbol}
        </span>
      </div>

      <div className="border-t border-white/6 px-3 py-2">
        <p className="truncate text-[11px] text-white/70">{String(data.label)}</p>
        {btType === "condition" && data.event && (
          <p className="mt-0.5 truncate text-[9px] text-cyan-400/60">⚡ {String(data.event)}</p>
        )}
        {btType === "action" && data.actionTarget && (
          <p className="mt-0.5 truncate text-[9px] text-rose-400/60">→ {String(data.actionTarget)}</p>
        )}
        {btType === "repeater" && (
          <p className="mt-0.5 text-[9px] text-teal-400/60">×{String(data.count)} times</p>
        )}
      </div>

      {!meta.isLeaf && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="out"
          style={{ width: 10, height: 10, background: meta.dotColor, border: "2px solid #0d1117", bottom: -5 }}
        />
      )}
    </div>
  );
}

const NODE_TYPES = { btNode: BtFlowNode };

const EDGE_DEFAULTS = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#ffffff22" },
  style: { stroke: "#ffffff22", strokeWidth: 1.5 },
  animated: false,
};

// ─── Properties Panel ──────────────────────────────────────────────────────

const ACTION_TYPES = ["emit", "set_flag", "wait", "enable", "disable", "spawn", "destroy"];

function PropertiesPanel({
  node,
  onUpdate,
  onDelete,
}: {
  node: Node<BtNodeData> | null;
  onUpdate: (id: string, patch: Partial<BtNodeData>) => void;
  onDelete: (id: string) => void;
}) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <Bot className="size-7 text-white/20" />
        <p className="text-[11px] text-white/30">Select a node to edit its properties</p>
      </div>
    );
  }

  const d = node.data;
  const btType = d.btType as BtNodeType;
  const meta = BT_META[btType];

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center gap-2">
        <div className="size-2 rounded-full" style={{ background: meta.dotColor }} />
        <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">{meta.label}</span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-white/40 uppercase tracking-wider">Label</span>
        <input
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/80 outline-none focus:border-white/20"
          value={String(d.label)}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
        />
      </label>

      {btType === "condition" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">Event to check</span>
            <input
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/80 outline-none focus:border-white/20"
              placeholder="e.g. trigger.enter"
              value={String(d.event)}
              onChange={(e) => onUpdate(node.id, { event: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">Mode</span>
            <select
              className="rounded-lg border border-white/10 bg-[#0d1117] px-2 py-1.5 text-[11px] text-white/80 outline-none"
              value={String(d.mode)}
              onChange={(e) => onUpdate(node.id, { mode: e.target.value as "allOf" | "anyOf" })}
            >
              <option value="allOf">All Of (AND)</option>
              <option value="anyOf">Any Of (OR)</option>
            </select>
          </label>
        </>
      )}

      {btType === "action" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">Action type</span>
            <select
              className="rounded-lg border border-white/10 bg-[#0d1117] px-2 py-1.5 text-[11px] text-white/80 outline-none"
              value={String(d.actionType)}
              onChange={(e) => onUpdate(node.id, { actionType: e.target.value })}
            >
              {ACTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">
              {d.actionType === "emit" ? "Event name" : "Target"}
            </span>
            <input
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/80 outline-none focus:border-white/20"
              placeholder={d.actionType === "emit" ? "e.g. ai.attack" : "hook id / flag name"}
              value={String(d.actionTarget)}
              onChange={(e) => onUpdate(node.id, { actionTarget: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">Value (optional)</span>
            <input
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/80 outline-none focus:border-white/20"
              placeholder="e.g. 1.5 or true"
              value={String(d.actionValue)}
              onChange={(e) => onUpdate(node.id, { actionValue: e.target.value })}
            />
          </label>
        </>
      )}

      {btType === "repeater" && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-white/40 uppercase tracking-wider">Repeat count</span>
          <input
            type="number"
            min={1}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/80 outline-none focus:border-white/20"
            value={Number(d.count)}
            onChange={(e) => onUpdate(node.id, { count: parseInt(e.target.value, 10) || 1 })}
          />
        </label>
      )}

      <div className="mt-1 border-t border-white/6 pt-3">
        <p className="mb-2 text-[10px] text-white/30">{meta.desc}</p>
        {btType !== "root" && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start gap-2 text-[11px] text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-400"
            onClick={() => onDelete(node.id)}
          >
            <Trash2 className="size-3" />
            Delete node
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Node Palette ──────────────────────────────────────────────────────────

const PALETTE_GROUPS: Array<{ title: string; types: BtNodeType[] }> = [
  { title: "Composite", types: ["selector", "sequence", "parallel"] },
  { title: "Decorator", types: ["inverter", "repeater"] },
  { title: "Leaf", types: ["condition", "action"] },
];

function NodePalette({ onAdd }: { onAdd: (type: BtNodeType) => void }) {
  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      {PALETTE_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 text-[9px] font-semibold tracking-[0.18em] text-white/30 uppercase">
            {group.title}
          </p>
          <div className="flex flex-col gap-1">
            {group.types.map((type) => {
              const meta = BT_META[type];
              const Icon = BT_ICON[type];
              return (
                <button
                  key={type}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] transition-all hover:brightness-110 active:scale-[0.98]",
                    meta.borderCls
                  )}
                  style={{ background: "#0d1117" }}
                  onClick={() => onAdd(type)}
                  title={meta.desc}
                >
                  <span
                    className={cn("flex size-5 shrink-0 items-center justify-center rounded-md", meta.headerCls)}
                  >
                    <Icon className="size-2.5 text-white/80" />
                  </span>
                  <span className="text-white/70">{meta.label}</span>
                  <span className="ml-auto font-mono text-[10px] text-white/25">{meta.symbol}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Load Tree Popover ────────────────────────────────────────────────────

function LoadPopover({
  onLoad,
  onDelete,
}: {
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trees = listTrees();

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 px-2.5 text-[11px] text-white/60 hover:text-white/90"
        onClick={() => setOpen((v) => !v)}
      >
        <FolderOpen className="size-3" />
        Load
        <ChevronDown className="size-2.5" />
      </Button>
      {open && (
        <div className="absolute left-0 top-8 z-50 min-w-[200px] overflow-hidden rounded-xl border border-white/10 bg-[#0d1117]/95 shadow-2xl backdrop-blur-xl">
          {trees.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-white/30">No saved trees</p>
          ) : (
            <div className="flex flex-col p-1">
              {trees.map((t) => (
                <div key={t.id} className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <button
                    className="flex-1 text-left text-[11px] text-white/70"
                    onClick={() => { onLoad(t.id); setOpen(false); }}
                  >
                    {t.name}
                    <span className="ml-1.5 text-[9px] text-white/30">{t.id}</span>
                  </button>
                  <button
                    className="shrink-0 text-white/20 hover:text-rose-400"
                    onClick={() => onDelete(t.id)}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inner Graph ───────────────────────────────────────────────────────────

function BtGraph({
  initialTree,
  selectedNodeId,
  onSelectNode,
  onNodesEdgesChange,
}: {
  initialTree: BehaviorTree;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onNodesEdgesChange: (nodes: Node<BtNodeData>[], edges: Edge[]) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<BtNodeData>>(initialTree.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialTree.edges);
  const { fitView } = useReactFlow();
  const changeRef = useRef(onNodesEdgesChange);
  changeRef.current = onNodesEdgesChange;

  useEffect(() => {
    setNodes(initialTree.nodes);
    setEdges(initialTree.edges);
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
  }, [initialTree.id, setNodes, setEdges, fitView]);

  useEffect(() => {
    changeRef.current(nodes, edges);
  }, [nodes, edges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            ...EDGE_DEFAULTS,
            id: `${connection.source}-${connection.target}-${makeId()}`,
          },
          eds
        )
      );
    },
    [setEdges]
  );

  return (
    <ReactFlow
      nodes={nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId }))}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => onSelectNode(node.id === selectedNodeId ? null : node.id)}
      onPaneClick={() => onSelectNode(null)}
      nodeTypes={NODE_TYPES}
      defaultEdgeOptions={EDGE_DEFAULTS}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.25}
      maxZoom={2}
      deleteKeyCode="Delete"
      className="bg-transparent"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#ffffff0e" />
      <Controls
        className="!border-white/10 !bg-[#0a0f14]/80 !shadow-lg [&>button]:!border-white/10 [&>button]:!bg-transparent [&>button]:!text-white/60"
        showInteractive={false}
      />
      <MiniMap
        className="!border-white/10 !bg-[#0a0f14]/80"
        nodeColor={(n) => BT_META[(n.data as BtNodeData).btType]?.dotColor ?? "#666"}
        maskColor="rgba(0,0,0,0.5)"
        pannable
        zoomable
      />
    </ReactFlow>
  );
}

// ─── Main Sheet ────────────────────────────────────────────────────────────

type BehaviorTreeEditorSheetProps = {
  onClose: () => void;
  initialTreeId?: string;
};

export function BehaviorTreeEditorSheet({ onClose, initialTreeId }: BehaviorTreeEditorSheetProps) {
  const [tree, setTree] = useState<BehaviorTree>(() => {
    if (initialTreeId) {
      return loadTree(initialTreeId) ?? makeDefaultTree();
    }
    return makeDefaultTree();
  });
  const [treeName, setTreeName] = useState(tree.name);
  const [treeId, setTreeId] = useState(tree.id);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const liveNodesRef = useRef<Node<BtNodeData>[]>(tree.nodes);
  const liveEdgesRef = useRef<Edge[]>(tree.edges);

  const selectedNode = liveNodesRef.current.find((n) => n.id === selectedNodeId) ?? null;

  const handleNodesEdgesChange = useCallback((nodes: Node<BtNodeData>[], edges: Edge[]) => {
    liveNodesRef.current = nodes;
    liveEdgesRef.current = edges;
  }, []);

  const handleSave = () => {
    const id = slugify(treeId || treeName);
    const t: BehaviorTree = {
      id,
      name: treeName,
      nodes: liveNodesRef.current,
      edges: liveEdgesRef.current,
    };
    saveTree(t);
    setTree(t);
    setTreeId(id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const handleNew = () => {
    const t = makeDefaultTree();
    setTree(t);
    setTreeName(t.name);
    setTreeId(t.id);
    setSelectedNodeId(null);
    liveNodesRef.current = t.nodes;
    liveEdgesRef.current = t.edges;
  };

  const handleLoad = (id: string) => {
    const t = loadTree(id);
    if (!t) return;
    setTree(t);
    setTreeName(t.name);
    setTreeId(t.id);
    setSelectedNodeId(null);
    liveNodesRef.current = t.nodes;
    liveEdgesRef.current = t.edges;
  };

  const handleDeleteTree = (id: string) => {
    deleteTree(id);
    if (id === treeId) handleNew();
  };

  const handleAutoLayout = () => {
    const laid = computeLayout(liveNodesRef.current, liveEdgesRef.current);
    setTree((prev) => ({ ...prev, nodes: laid }));
    liveNodesRef.current = laid;
  };

  const handleAddNode = (type: BtNodeType) => {
    const meta = BT_META[type];
    const newNode: Node<BtNodeData> = {
      id: makeId(),
      type: "btNode",
      position: {
        x: 100 + Math.random() * 200,
        y: 200 + Math.random() * 100,
      },
      data: {
        btType: type,
        label: meta.label,
        event: "",
        mode: "allOf",
        actionType: "emit",
        actionTarget: "",
        actionValue: "",
        count: 3,
      },
    };
    const next = [...liveNodesRef.current, newNode];
    liveNodesRef.current = next;
    setTree((prev) => ({ ...prev, nodes: next, edges: liveEdgesRef.current }));
    setSelectedNodeId(newNode.id);
  };

  const handleUpdateNode = (id: string, patch: Partial<BtNodeData>) => {
    const next = liveNodesRef.current.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
    );
    liveNodesRef.current = next;
    setTree((prev) => ({ ...prev, nodes: next, edges: liveEdgesRef.current }));
  };

  const handleDeleteNode = (id: string) => {
    const nextNodes = liveNodesRef.current.filter((n) => n.id !== id);
    const nextEdges = liveEdgesRef.current.filter((e) => e.source !== id && e.target !== id);
    liveNodesRef.current = nextNodes;
    liveEdgesRef.current = nextEdges;
    setTree((prev) => ({ ...prev, nodes: nextNodes, edges: nextEdges }));
    setSelectedNodeId(null);
  };

  return (
    <div className="pointer-events-auto absolute inset-2 z-30 flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#060b0f]/90 shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/6 px-3">
        <Bot className="size-3.5 text-amber-400" />
        <span className="text-[11px] font-semibold tracking-[0.14em] text-white/80 uppercase">
          AI Behavior Tree Editor
        </span>

        <div className="mx-2 h-4 w-px bg-white/8" />

        <input
          className="h-6 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-white/80 outline-none focus:border-white/20 w-36"
          value={treeName}
          onChange={(e) => setTreeName(e.target.value)}
          placeholder="Tree name…"
        />
        <input
          className="h-6 w-28 rounded-md border border-white/10 bg-white/5 px-2 font-mono text-[10px] text-white/40 outline-none focus:border-white/20"
          value={treeId}
          onChange={(e) => setTreeId(e.target.value)}
          placeholder="id (slug)"
          title="Behavior Tree ID — matches behaviorTreeId in ai_agent hook"
        />

        <div className="mx-2 h-4 w-px bg-white/8" />

        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2.5 text-[11px] text-white/60 hover:text-white/90"
          onClick={handleNew}
        >
          <FilePlus className="size-3" />
          New
        </Button>

        <LoadPopover onLoad={handleLoad} onDelete={handleDeleteTree} />

        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "h-7 gap-1.5 px-2.5 text-[11px] transition-colors",
            saved ? "text-green-400" : "text-white/60 hover:text-white/90"
          )}
          onClick={handleSave}
        >
          <Save className="size-3" />
          {saved ? "Saved!" : "Save"}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2.5 text-[11px] text-white/60 hover:text-white/90"
          onClick={handleAutoLayout}
          title="Auto-arrange nodes into tree layout"
        >
          <LayoutList className="size-3" />
          Layout
        </Button>

        <div className="flex-1" />

        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[9px] font-mono text-amber-400/70">
          id: {treeId || "unsaved"}
        </span>

        <Button
          size="icon-sm"
          variant="ghost"
          className="size-6 text-white/40 hover:text-white/70"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Palette */}
        <div className="w-44 shrink-0 border-r border-white/6">
          <div className="border-b border-white/6 px-3 py-2">
            <p className="text-[9px] font-semibold tracking-[0.18em] text-white/30 uppercase">Add Node</p>
          </div>
          <NodePalette onAdd={handleAddNode} />
        </div>

        {/* Center: Canvas */}
        <div className="relative min-w-0 flex-1">
          <ReactFlowProvider>
            <BtGraph
              key={tree.id + tree.nodes.length}
              initialTree={tree}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onNodesEdgesChange={handleNodesEdgesChange}
            />
          </ReactFlowProvider>
        </div>

        {/* Right: Properties */}
        <div className="w-52 shrink-0 border-l border-white/6">
          <div className="border-b border-white/6 px-3 py-2">
            <p className="text-[9px] font-semibold tracking-[0.18em] text-white/30 uppercase">Properties</p>
          </div>
          <PropertiesPanel
            node={selectedNode as Node<BtNodeData> | null}
            onUpdate={handleUpdateNode}
            onDelete={handleDeleteNode}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex h-7 shrink-0 items-center border-t border-white/6 px-3 gap-4">
        <span className="text-[10px] text-white/20">Click node to select  •  Drag handle → handle to connect  •  Delete key removes selected node</span>
        <span className="ml-auto text-[10px] text-white/20">
          Set <span className="font-mono text-amber-400/50">behaviorTreeId</span> on an <span className="font-mono text-amber-400/50">ai_agent</span> hook to reference this tree
        </span>
      </div>
    </div>
  );
}
