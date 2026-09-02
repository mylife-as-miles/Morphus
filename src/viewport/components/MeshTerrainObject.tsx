/**
 * Renders a mesh terrain node in the viewport.
 *
 * A terrain node in "mesh" mode stores no surface -- only a seed, a profile and
 * an ordered modifier stack -- so this component is the point at which that
 * document becomes something you can look at. Evaluation happens on the main
 * thread, synchronously, and is memoized on a key derived from the document, so
 * it runs when the stack changes and never per frame.
 *
 * ─── Renderer support ────────────────────────────────────────────────────────
 *
 * The editor runs either a WebGLRenderer or a WebGPURenderer, and this
 * component works unchanged on both because it never introduces a
 * `ShaderMaterial` -- the one thing WebGPU cannot compile, which is why
 * `ViewportCanvas` skips its sky dome there. The four paint channels are
 * resolved to per-vertex colour during evaluation and drawn with a plain
 * `meshStandardMaterial`, which the WebGPU renderer converts to a node material
 * on its own. The four raw channel weights are still uploaded as an attribute,
 * so a future node-material splat can read them without re-evaluating anything.
 */

import { useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, type Object3D } from "three";
import type { GeometryNode, MeshTerrainState, TerrainNode } from "@blud/shared";
import { isMeshTerrainNode, resolveTransformPivot, toTuple } from "@blud/shared";
import type { ViewportRenderMode } from "@/viewport/viewports";
import {
  evaluateMeshTerrain,
  meshTerrainEvaluationKey,
  type EvaluatedMeshTerrain,
  type MeshTerrainEvaluateOptions,
} from "./mesh-terrain-runtime";

/** What one evaluation produced, for status panels and diagnostics. */
export type MeshTerrainEvaluationSummary = {
  nodeId: string;
  vertexCount: number;
  triangleCount: number;
  region: EvaluatedMeshTerrain["region"];
  bounds: EvaluatedMeshTerrain["bounds"];
  durationMs: number;
  warnings: string[];
};

export type MeshTerrainObjectProps = {
  /**
   * The node to draw. Anything that is not a mesh terrain node -- including
   * `undefined` and heightmap terrain -- renders nothing, so a caller can pass
   * a selection straight through without narrowing it first.
   */
  node?: GeometryNode;
  /** Grid vertices per axis before CSG. Higher is slower; 129 is the default. */
  resolution?: number;
  /** Set false to skip CSG, e.g. while a cutter is being dragged. */
  applyBooleans?: boolean;
  /** Wireframe matches the rest of the viewport's wireframe mode. */
  renderMode?: ViewportRenderMode;
  visible?: boolean;
  /** Enables click/hover handling. Off by default: terrain is usually backdrop. */
  interactive?: boolean;
  selected?: boolean;
  hovered?: boolean;
  onSelectNode?: (nodeId: string) => void;
  onFocusNode?: (nodeId: string) => void;
  onHoverStart?: (nodeId: string) => void;
  onHoverEnd?: () => void;
  /** Mirrors ScenePreview's `onMeshObjectChange`, for gizmos and framing. */
  onObjectChange?: (nodeId: string, object: Object3D | null) => void;
  onEvaluated?: (summary: MeshTerrainEvaluationSummary) => void;
};

export function MeshTerrainObject({
  node,
  resolution,
  applyBooleans,
  renderMode = "lit",
  visible = true,
  interactive = false,
  selected = false,
  hovered = false,
  onSelectNode,
  onFocusNode,
  onHoverStart,
  onHoverEnd,
  onObjectChange,
  onEvaluated,
}: MeshTerrainObjectProps) {
  if (!node || !isMeshTerrainNode(node)) {
    return null;
  }

  return (
    <MeshTerrainSurface
      applyBooleans={applyBooleans}
      hovered={hovered}
      interactive={interactive}
      node={node}
      onEvaluated={onEvaluated}
      onFocusNode={onFocusNode}
      onHoverEnd={onHoverEnd}
      onHoverStart={onHoverStart}
      onObjectChange={onObjectChange}
      onSelectNode={onSelectNode}
      renderMode={renderMode}
      resolution={resolution}
      selected={selected}
      visible={visible}
    />
  );
}

/** Draws every mesh terrain node in a scene. A convenience for the canvas. */
export function MeshTerrainLayer({
  nodes,
  ...shared
}: Omit<MeshTerrainObjectProps, "node"> & { nodes: readonly GeometryNode[] }) {
  const terrainNodes = useMemo(() => nodes.filter(isMeshTerrainNode), [nodes]);

  return (
    <>
      {terrainNodes.map((terrainNode) => (
        <MeshTerrainObject key={terrainNode.id} node={terrainNode} {...shared} />
      ))}
    </>
  );
}

/**
 * The node is narrowed before this renders, so the hooks below are
 * unconditional. Splitting the guard out is what keeps that true -- React
 * requires a component's hook order to be stable, and the wrapper's early
 * return would otherwise change it.
 */
function MeshTerrainSurface({
  node,
  resolution,
  applyBooleans,
  renderMode,
  visible,
  interactive,
  selected,
  hovered,
  onSelectNode,
  onFocusNode,
  onHoverStart,
  onHoverEnd,
  onObjectChange,
  onEvaluated,
}: Omit<MeshTerrainObjectProps, "node"> & { node: TerrainNode }) {
  const state = node.data.meshTerrain as MeshTerrainState;
  const options = useMemo<MeshTerrainEvaluateOptions>(
    () => ({ resolution, applyBooleans }),
    [applyBooleans, resolution],
  );

  // Evaluation is pure, so identical inputs give identical geometry and this
  // key is a sound substitute for re-running the stack. It is also what stops a
  // parent re-render -- a camera move, a selection change -- from rebuilding
  // several hundred thousand vertices.
  const evaluationKey = useMemo(
    () => meshTerrainEvaluationKey(state, options),
    [options, state],
  );

  const evaluated = useMemo(
    () => {
      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const result = evaluateMeshTerrain(state, options);
      const endedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      return { result, durationMs: endedAt - startedAt };
    },
    // Deliberately keyed on the evaluation key rather than on `state`: two
    // structurally identical documents must not force a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evaluationKey],
  );

  const geometry = useMemo(
    () => createTerrainGeometry(evaluated.result),
    [evaluated],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    onEvaluated?.({
      nodeId: node.id,
      vertexCount: evaluated.result.vertexCount,
      triangleCount: evaluated.result.triangleCount,
      region: evaluated.result.region,
      bounds: evaluated.result.bounds,
      durationMs: evaluated.durationMs,
      warnings: evaluated.result.warnings,
    });
  }, [evaluated, node.id, onEvaluated]);

  const pivot = resolveTransformPivot(node.transform);
  const { region, averageRoughness } = evaluated.result;

  const handle = (action?: (nodeId: string) => void) => (event: ThreeEvent<PointerEvent>) => {
    if (!interactive || !action) return;
    event.stopPropagation();
    action(node.id);
  };

  return (
    <group
      name={`node:${node.id}`}
      position={toTuple(node.transform.position)}
      ref={(object) => {
        onObjectChange?.(node.id, object);
      }}
      rotation={toTuple(node.transform.rotation)}
      scale={toTuple(node.transform.scale)}
      visible={visible}
    >
      <group position={[-pivot.x, -pivot.y, -pivot.z]}>
        {/*
          Evaluated positions are local to the region's minimum corner, so this
          offset is what puts the ground back at the world coordinates its
          strokes were authored against, relative to the node.
        */}
        <group position={[region.originX, 0, region.originZ]}>
          <mesh
            castShadow={renderMode === "lit"}
            onClick={handle(onSelectNode) as unknown as (event: ThreeEvent<MouseEvent>) => void}
            onDoubleClick={handle(onFocusNode) as unknown as (event: ThreeEvent<MouseEvent>) => void}
            onPointerOut={(event) => {
              if (!interactive || !onHoverEnd) return;
              event.stopPropagation();
              onHoverEnd();
            }}
            onPointerOver={handle(onHoverStart)}
            receiveShadow={renderMode === "lit"}
          >
            <primitive attach="geometry" object={geometry} />
            {renderMode === "wireframe" ? (
              <meshBasicMaterial
                color={selected ? "#f97316" : hovered ? "#67e8f9" : "#94a3b8"}
                depthWrite={false}
                toneMapped={false}
                wireframe
              />
            ) : (
              <meshStandardMaterial
                emissive={selected ? "#f97316" : hovered ? "#0ea5e9" : "#000000"}
                emissiveIntensity={selected || hovered ? 0.12 : 0}
                metalness={0}
                roughness={averageRoughness}
                vertexColors
              />
            )}
          </mesh>
        </group>
      </group>
    </group>
  );
}

/**
 * Uploads the evaluated buffers.
 *
 * The typed arrays come straight from evaluation and are not shared with
 * anything else, so they are handed over rather than copied. `terrainWeights`
 * is a custom attribute the standard material ignores; it is here so a splat
 * material can be dropped in without another evaluation pass.
 */
function createTerrainGeometry(evaluated: EvaluatedMeshTerrain): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(evaluated.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(evaluated.normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(evaluated.uvs, 2));
  geometry.setAttribute("color", new BufferAttribute(evaluated.colors, 3));
  geometry.setAttribute("terrainWeights", new BufferAttribute(evaluated.paintWeights, 4));
  geometry.setIndex(new BufferAttribute(evaluated.indices, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
