import type { Edge, Node } from "@xyflow/react";

export type BtNodeType =
  | "root"
  | "selector"
  | "sequence"
  | "parallel"
  | "inverter"
  | "repeater"
  | "condition"
  | "action";

export type BtNodeData = {
  btType: BtNodeType;
  label: string;
  event: string;
  mode: "allOf" | "anyOf";
  actionType: string;
  actionTarget: string;
  actionValue: string;
  count: number;
  [key: string]: unknown;
};

export type BehaviorTree = {
  id: string;
  name: string;
  nodes: Node<BtNodeData>[];
  edges: Edge[];
};

const REGISTRY_KEY = "blud_bt_index";
const NODE_W = 188;
const NODE_GAP_H = 28;
const NODE_GAP_V = 100;

export function makeBehaviorTreeNodeId() {
  return Math.random().toString(36).slice(2, 9);
}

export function slugifyBehaviorTreeId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "tree";
}

export function listBehaviorTrees(): Array<{ id: string; name: string }> {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function loadBehaviorTree(id: string): BehaviorTree | null {
  try {
    const raw = localStorage.getItem(`blud_bt_${id}`);
    return raw ? JSON.parse(raw) as BehaviorTree : null;
  } catch {
    return null;
  }
}

export function saveBehaviorTree(tree: BehaviorTree) {
  const registry = listBehaviorTrees().filter((entry) => entry.id !== tree.id);
  registry.push({ id: tree.id, name: tree.name });
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  localStorage.setItem(`blud_bt_${tree.id}`, JSON.stringify(tree));
}

export function deleteBehaviorTree(id: string) {
  const registry = listBehaviorTrees().filter((entry) => entry.id !== id);
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  localStorage.removeItem(`blud_bt_${id}`);
}

export function createBehaviorTreeNode(
  btType: BtNodeType,
  overrides: Partial<Node<BtNodeData>> = {},
  dataOverrides: Partial<BtNodeData> = {}
): Node<BtNodeData> {
  return {
    id: overrides.id ?? makeBehaviorTreeNodeId(),
    type: "btNode",
    position: overrides.position ?? { x: 0, y: 0 },
    ...overrides,
    data: {
      ...defaultNodeData(btType),
      ...dataOverrides
    }
  };
}

export function makeEmptyBehaviorTree(name = "New Tree", id?: string): BehaviorTree {
  const treeId = id || "new_tree";
  const root = createBehaviorTreeNode("root", {
    position: { x: 0, y: 0 }
  });

  return {
    id: treeId,
    name,
    nodes: [root],
    edges: []
  };
}

export function makeDefaultBehaviorTree(): BehaviorTree {
  const rootId = makeBehaviorTreeNodeId();
  const selId = makeBehaviorTreeNodeId();
  const seqId = makeBehaviorTreeNodeId();
  const condId = makeBehaviorTreeNodeId();
  const actId = makeBehaviorTreeNodeId();
  const act2Id = makeBehaviorTreeNodeId();

  const nodes: Node<BtNodeData>[] = [
    createBehaviorTreeNode("root", { id: rootId, position: { x: 0, y: 0 } }, { label: "Root" }),
    createBehaviorTreeNode("selector", { id: selId, position: { x: 0, y: 0 } }, { label: "Can Attack?" }),
    createBehaviorTreeNode("sequence", { id: seqId, position: { x: 0, y: 0 } }, { label: "Attack Sequence" }),
    createBehaviorTreeNode("condition", { id: condId, position: { x: 0, y: 0 } }, { label: "Target In Range", event: "ai.target_acquired" }),
    createBehaviorTreeNode("action", { id: actId, position: { x: 0, y: 0 } }, { label: "Attack Target", actionTarget: "ai.attack" }),
    createBehaviorTreeNode("action", { id: act2Id, position: { x: 0, y: 0 } }, { label: "Patrol", actionTarget: "ai.patrol" })
  ];

  const edges: Edge[] = [
    { id: `${rootId}-${selId}`, source: rootId, target: selId },
    { id: `${selId}-${seqId}`, source: selId, target: seqId },
    { id: `${selId}-${act2Id}`, source: selId, target: act2Id },
    { id: `${seqId}-${condId}`, source: seqId, target: condId },
    { id: `${seqId}-${actId}`, source: seqId, target: actId }
  ];

  return {
    id: "new_tree",
    name: "New Tree",
    nodes: layoutBehaviorTreeNodes(nodes, edges),
    edges
  };
}

export function layoutBehaviorTree(tree: BehaviorTree): BehaviorTree {
  return {
    ...tree,
    nodes: layoutBehaviorTreeNodes(tree.nodes, tree.edges)
  };
}

export function layoutBehaviorTreeNodes(
  nodes: Node<BtNodeData>[],
  edges: Edge[]
): Node<BtNodeData>[] {
  if (nodes.length === 0) {
    return nodes;
  }

  const childMap = new Map<string, string[]>();
  const parentSet = new Set<string>();

  for (const node of nodes) {
    childMap.set(node.id, []);
  }

  for (const edge of edges) {
    childMap.get(edge.source)?.push(edge.target);
    parentSet.add(edge.target);
  }

  const roots = nodes.filter((node) => !parentSet.has(node.id));
  if (roots.length === 0) {
    return nodes;
  }

  const subtreeWidths = new Map<string, number>();

  function calcWidth(id: string): number {
    const children = childMap.get(id) ?? [];
    if (children.length === 0) {
      const width = NODE_W + NODE_GAP_H;
      subtreeWidths.set(id, width);
      return width;
    }

    const width = children.reduce((sum, childId) => sum + calcWidth(childId), 0);
    subtreeWidths.set(id, width);
    return width;
  }

  let offsetX = 0;
  for (const root of roots) {
    calcWidth(root.id);
  }

  const positions = new Map<string, { x: number; y: number }>();

  function place(id: string, centerX: number, depth: number) {
    positions.set(id, { x: centerX - NODE_W / 2, y: depth * (80 + NODE_GAP_V) });
    const children = childMap.get(id) ?? [];
    const totalWidth = children.reduce((sum, childId) => sum + (subtreeWidths.get(childId) ?? NODE_W + NODE_GAP_H), 0);
    let currentX = centerX - totalWidth / 2;

    for (const childId of children) {
      const width = subtreeWidths.get(childId) ?? NODE_W + NODE_GAP_H;
      place(childId, currentX + width / 2, depth + 1);
      currentX += width;
    }
  }

  for (const root of roots) {
    const width = subtreeWidths.get(root.id) ?? NODE_W + NODE_GAP_H;
    place(root.id, offsetX + width / 2, 0);
    offsetX += width;
  }

  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position
  }));
}

function defaultNodeData(btType: BtNodeType): BtNodeData {
  return {
    btType,
    label: defaultLabel(btType),
    event: "",
    mode: "allOf",
    actionType: "emit",
    actionTarget: "",
    actionValue: "",
    count: 3
  };
}

function defaultLabel(btType: BtNodeType) {
  switch (btType) {
    case "root":
      return "Root";
    case "selector":
      return "Selector";
    case "sequence":
      return "Sequence";
    case "parallel":
      return "Parallel";
    case "inverter":
      return "Inverter";
    case "repeater":
      return "Repeater";
    case "condition":
      return "Condition";
    case "action":
      return "Action";
  }
}
