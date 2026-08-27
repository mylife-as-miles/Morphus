import { useFrame, useThree } from "@react-three/fiber";
import { BallCollider, CapsuleCollider, ConeCollider, CuboidCollider, CylinderCollider, Physics, RigidBody, TrimeshCollider, useRapier, type RapierRigidBody } from "@react-three/rapier";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject
} from "react";
import {
  createCustomScriptController,
  createMutableSceneHostState,
  type CustomScriptEventFilter,
  type CustomScriptEventInput,
  type CustomScriptEventRecord,
  type CustomScriptLogLevel
} from "@blud/runtime-scripting";
import {
  AdditiveBlending,
  BackSide,
  Box3,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MultiplyBlending,
  NormalBlending,
  Object3D,
  SkinnedMesh,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  BufferGeometry,
  type Side
} from "three";
import type { Entity, GeometryNode, MaterialRenderSide, SceneHook, Transform, Vec3 } from "@blud/shared";
import {
  disableBvhRaycast,
  enableBvhRaycast,
  type DerivedEntityMarker,
  type DerivedGroupMarker,
  type DerivedInstancedMesh,
  type DerivedLight,
  type DerivedRenderMesh,
  type DerivedRenderScene
} from "@blud/render-pipeline";
import { createBlockoutTextureDataUri, resolveTransformPivot, toTuple } from "@blud/shared";
import { NPC_CHARACTER_PROMPT_PROPERTY, NPC_VOICE_ID_PROPERTY } from "@/lib/npc-voice-keys";
import { previewNpcDialogueStore } from "@/state/preview-npc-dialogue-store";
import { DefaultHumanoidCharacter } from "@/viewport/components/DefaultHumanoidCharacter";
import { GrassField } from "@/viewport/components/GrassField";
import { shouldUsePreviewNodeMaterials } from "@/viewport/preview-material-policy";
import { loadPreviewTexture, WHITE_PREVIEW_TEXTURE_DATA_URI } from "@/viewport/preview-textures";
import {
  entityUsesViewportPathMotion,
  usePathMotionInnerRegister,
  ViewportNpcPathMotionRoot
} from "@/viewport/viewport-npc-path-motion";
import { createIndexedGeometry } from "@/viewport/utils/geometry";
import type { PreviewSessionMode } from "@/viewport/types";
import type { ViewportRenderMode } from "@/viewport/viewports";
import type { SceneSettings } from "@blud/shared";

const modelSceneCache = new Map<string, Object3D>();

type PreviewNodeMaterialFactory = (
  spec: DerivedRenderMesh["material"],
  selected: boolean,
  hovered: boolean
) => Material;

const PreviewNodeMaterialContext = createContext<PreviewNodeMaterialFactory | null>(null);

const modelTextureLoader = new TextureLoader();
const modelTextureCache = new Map<string, Awaited<ReturnType<TextureLoader["loadAsync"]>>>();
const tempInstanceObject = new Object3D();
const tempInstanceMatrix = new Matrix4();
const tempPivotMatrix = new Matrix4();
const tempInstanceColor = new Color();
let cloneModelSceneImpl: (scene: Object3D) => Object3D = (scene) => scene.clone(true);
let skeletonUtilsPromise: Promise<typeof import("three/examples/jsm/utils/SkeletonUtils.js")> | null = null;
let objPreviewToolsPromise: Promise<{
  MTLLoader: typeof import("three/examples/jsm/loaders/MTLLoader.js").MTLLoader;
  OBJLoader: typeof import("three/examples/jsm/loaders/OBJLoader.js").OBJLoader;
}> | null = null;

type Ktx2CompressionRenderer = Parameters<import("three/examples/jsm/loaders/KTX2Loader.js").KTX2Loader["detectSupport"]>[0];

async function loadGltfPreviewTools(renderer: Ktx2CompressionRenderer) {
  if (!skeletonUtilsPromise) {
    skeletonUtilsPromise = import("three/examples/jsm/utils/SkeletonUtils.js");
  }

  const [runtime, skeletonUtilsModule] = await Promise.all([
    import("@blud/three-runtime"),
    skeletonUtilsPromise
  ]);
  cloneModelSceneImpl = skeletonUtilsModule.clone;

  return {
    gltfLoader: runtime.getSharedGLTFLoader({
      publicBaseUrl: import.meta.env.BASE_URL ?? "/",
      renderer
    })
  };
}

function loadObjPreviewTools() {
  if (!objPreviewToolsPromise) {
    objPreviewToolsPromise = Promise.all([
      import("three/examples/jsm/loaders/MTLLoader.js"),
      import("three/examples/jsm/loaders/OBJLoader.js")
    ]).then(([mtlModule, objModule]) => ({
      MTLLoader: mtlModule.MTLLoader,
      OBJLoader: objModule.OBJLoader
    }));
  }

  return objPreviewToolsPromise;
}

export function ScenePreview({
  entities,
  hiddenSceneItemIds = [],
  interactive,
  nodes,
  onFocusNode,
  onMeshObjectChange,
  onPreviewCursorCapturedChange,
  onSelectNode,
  pathDefinitions,
  physicsDebug = false,
  physicsPlayback,
  physicsRevision,
  previewPossessed,
  previewSessionMode,
  previewStepTick,
  renderMode = "lit",
  renderScene,
  sceneSettings,
  selectedHookNodes = [],
  selectedPathId,
  selectedNodeIds
}: {
  entities: Entity[];
  hiddenSceneItemIds?: string[];
  interactive: boolean;
  nodes: GeometryNode[];
  onFocusNode: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onPreviewCursorCapturedChange?: (captured: boolean) => void;
  onSelectNode: (nodeIds: string[]) => void;
  pathDefinitions?: SceneSettings["paths"];
  physicsDebug?: boolean;
  physicsPlayback: "paused" | "running" | "stopped";
  physicsRevision: number;
  previewPossessed: boolean;
  previewSessionMode: PreviewSessionMode | null;
  previewStepTick: number;
  renderMode?: ViewportRenderMode;
  renderScene: DerivedRenderScene;
  sceneSettings: SceneSettings;
  selectedHookNodes?: GeometryNode[];
  selectedPathId?: string;
  selectedNodeIds: string[];
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string>();
  const boundObjectsRef = useRef(new Map<string, Object3D>());
  const hiddenIds = useMemo(() => new Set(hiddenSceneItemIds), [hiddenSceneItemIds]);
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const physicsActive = renderMode === "lit" && physicsPlayback !== "stopped" && sceneSettings.world.physicsEnabled;
  const handleSceneObjectChange = useCallback(
    (nodeId: string, object: Object3D | null) => {
      if (object) {
        boundObjectsRef.current.set(nodeId, object);
      } else {
        boundObjectsRef.current.delete(nodeId);
      }

      onMeshObjectChange(nodeId, object);
    },
    [onMeshObjectChange]
  );
  const { physicsPropMeshes, playerSpawn, staticMeshes, visibleEntityMarkers, visibleGroups, visibleInstancedMeshes, visibleLights } = useMemo(() => {
    const nextPlayerSpawn = physicsActive
      ? renderScene.entityMarkers.find((entity) => entity.entityType === "player-spawn")
      : undefined;
    const nextPhysicsPropMeshes = physicsActive
      ? renderScene.meshes.filter((mesh) => !hiddenIds.has(mesh.nodeId) && mesh.physics?.enabled)
      : [];
    const physicsPropIds = new Set(nextPhysicsPropMeshes.map((mesh) => mesh.nodeId));
    const nextStaticMeshes = renderScene.meshes.filter(
      (mesh) => !hiddenIds.has(mesh.nodeId) && !physicsPropIds.has(mesh.nodeId)
    );
    const nextVisibleEntityMarkers =
      physicsActive && nextPlayerSpawn
        ? renderScene.entityMarkers.filter((entity) => !hiddenIds.has(entity.entityId) && entity.entityId !== nextPlayerSpawn.entityId)
        : renderScene.entityMarkers.filter((entity) => !hiddenIds.has(entity.entityId));
    const nextVisibleGroups = renderScene.groups.filter((group) => !hiddenIds.has(group.nodeId));
    const nextVisibleInstancedMeshes = renderScene.instancedMeshes
      .map((batch) => ({
        ...batch,
        instances: batch.instances.filter((instance) => !hiddenIds.has(instance.nodeId))
      }))
      .filter((batch) => batch.instances.length > 0);
    const nextVisibleLights = renderScene.lights.filter((light) => !hiddenIds.has(light.nodeId));

    return {
      physicsPropMeshes: nextPhysicsPropMeshes,
      playerSpawn: nextPlayerSpawn,
      staticMeshes: nextStaticMeshes,
      visibleEntityMarkers: nextVisibleEntityMarkers,
      visibleGroups: nextVisibleGroups,
      visibleInstancedMeshes: nextVisibleInstancedMeshes,
      visibleLights: nextVisibleLights
    };
  }, [hiddenIds, physicsActive, renderScene]);

  const previewNpcMarkers = useMemo(
    () =>
      renderScene.entityMarkers.filter(
        (marker) => marker.entityType === "npc-spawn" || marker.entityType === "smart-object"
      ),
    [renderScene.entityMarkers]
  );

  const [previewNodeMaterialFactory, setPreviewNodeMaterialFactory] = useState<PreviewNodeMaterialFactory | null>(null);

  useEffect(() => {
    if (!shouldUsePreviewNodeMaterials()) {
      setPreviewNodeMaterialFactory(null);
      return;
    }

    let cancelled = false;

    void import("@/viewport/preview-node-material").then((m) => {
      if (!cancelled) {
        setPreviewNodeMaterialFactory(() => m.createPreviewNodeMaterial as unknown as PreviewNodeMaterialFactory);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PreviewNodeMaterialContext.Provider value={previewNodeMaterialFactory}>
    <ViewportNpcPathMotionRoot
      entities={entities}
      pathDefinitions={pathDefinitions ?? sceneSettings.paths}
      physicsPlayback={physicsPlayback}
      previewStepTick={previewStepTick}
    >
    <>
      {renderMode === "lit" && sceneSettings.world.grass.enabled ? (
        <GrassField center={renderScene.boundsCenter} settings={sceneSettings.world.grass} />
      ) : null}
      <PathGuides pathDefinitions={pathDefinitions ?? sceneSettings.paths ?? []} selectedPathId={selectedPathId} />
      <TriggerHookGuides nodeTransforms={renderScene.nodeTransforms} nodes={selectedHookNodes} />

      {staticMeshes.map((mesh) => (
        <RenderStaticMesh
          hovered={hoveredNodeId === mesh.nodeId}
          interactive={interactive}
          key={mesh.nodeId}
          mesh={mesh}
          onFocusNode={onFocusNode}
          onHoverEnd={() => setHoveredNodeId(undefined)}
          onHoverStart={setHoveredNodeId}
          onMeshObjectChange={handleSceneObjectChange}
          onSelectNodes={onSelectNode}
          renderMode={renderMode}
          selected={selectedIdSet.has(mesh.nodeId)}
        />
      ))}

      {visibleInstancedMeshes.map((batch) => (
        <RenderInstancedMeshBatch
          batch={batch}
          hoveredNodeId={hoveredNodeId}
          interactive={interactive}
          key={batch.batchId}
          onFocusNode={onFocusNode}
          onHoverEnd={() => setHoveredNodeId(undefined)}
          onHoverStart={setHoveredNodeId}
          onMeshObjectChange={handleSceneObjectChange}
          onSelectNodes={onSelectNode}
          renderMode={renderMode}
          selectedNodeIds={selectedIdSet}
        />
      ))}

      {physicsActive ? (
        <Physics
          debug={physicsDebug}
          gravity={toTuple(sceneSettings.world.gravity)}
          key={`physics:${physicsRevision}`}
          paused={physicsPlayback !== "running"}
          timeStep={1 / 60}
        >
          <PhysicsStepController enabled={physicsPlayback === "paused"} stepTick={previewStepTick} />
          {staticMeshes.map((mesh) => (
            <StaticPhysicsCollider key={`collider:${mesh.nodeId}`} mesh={mesh} />
          ))}
          {physicsPropMeshes.map((mesh) => (
            <PhysicsPropMesh
              hovered={hoveredNodeId === mesh.nodeId}
              interactive={interactive}
              key={`prop:${mesh.nodeId}`}
              mesh={mesh}
              onFocusNode={onFocusNode}
              onHoverEnd={() => setHoveredNodeId(undefined)}
              onHoverStart={setHoveredNodeId}
              onMeshObjectChange={handleSceneObjectChange}
              onSelectNodes={onSelectNode}
              renderMode={renderMode}
              selected={selectedIdSet.has(mesh.nodeId)}
            />
          ))}
          <PreviewCustomScriptRuntimeWithPhysics
            entities={entities}
            nodes={nodes}
            objectBindings={boundObjectsRef}
            physicsPlayback={physicsPlayback}
            previewStepTick={previewStepTick}
          />
          {playerSpawn ? (
            <RuntimePlayer
              entities={entities}
              npcMarkers={previewNpcMarkers}
              onCursorCaptureChange={onPreviewCursorCapturedChange}
              physicsPlayback={physicsPlayback}
              possessed={previewPossessed}
              sceneSettings={sceneSettings}
              spawn={playerSpawn}
            />
          ) : null}
        </Physics>
      ) : physicsPlayback !== "stopped" ? (
        <PreviewCustomScriptRuntime
          entities={entities}
          nodes={nodes}
          objectBindings={boundObjectsRef}
          physicsPlayback={physicsPlayback}
          previewStepTick={previewStepTick}
        />
      ) : null}

      {visibleEntityMarkers.map((entity) => {
        const selected = selectedIdSet.has(entity.entityId);

        return (
          <RenderEntityMarker
            entity={entity}
            hovered={hoveredNodeId === entity.entityId}
            interactive={interactive}
            key={entity.entityId}
            onMeshObjectChange={handleSceneObjectChange}
            onFocusNode={onFocusNode}
            onHoverEnd={() => setHoveredNodeId(undefined)}
            onHoverStart={setHoveredNodeId}
            onSelectNodes={onSelectNode}
            sceneEntities={entities}
            selected={selected}
          />
        );
      })}

      {visibleGroups.map((group) => (
        <RenderGroupNode
          hovered={hoveredNodeId === group.nodeId}
          interactive={interactive}
          key={group.nodeId}
          group={group}
          onMeshObjectChange={handleSceneObjectChange}
          onFocusNode={onFocusNode}
          onHoverEnd={() => setHoveredNodeId(undefined)}
          onHoverStart={setHoveredNodeId}
          onSelectNodes={onSelectNode}
          selected={selectedIdSet.has(group.nodeId)}
        />
      ))}

      {visibleLights.map((light) => (
        <RenderLightNode
          hovered={hoveredNodeId === light.nodeId}
          interactive={interactive}
          key={light.nodeId}
          light={light}
          onMeshObjectChange={handleSceneObjectChange}
          onFocusNode={onFocusNode}
          onHoverEnd={() => setHoveredNodeId(undefined)}
          onHoverStart={setHoveredNodeId}
          onSelectNodes={onSelectNode}
          renderMode={renderMode}
          selected={selectedIdSet.has(light.nodeId)}
        />
      ))}
    </>
    </ViewportNpcPathMotionRoot>
    </PreviewNodeMaterialContext.Provider>
  );
}

function TriggerHookGuides({
  nodeTransforms,
  nodes
}: {
  nodeTransforms: DerivedRenderScene["nodeTransforms"];
  nodes: GeometryNode[];
}) {
  const overlays = nodes.flatMap((node) =>
    (node.hooks ?? [])
      .filter((hook) => hook.type === "trigger_volume" && hook.enabled !== false)
      .map((hook) => ({
        hook,
        nodeId: node.id,
        transform: nodeTransforms.get(node.id) ?? node.transform
      }))
  );

  return (
    <>
      {overlays.map(({ hook, nodeId, transform }) => (
        <TriggerVolumeGuide hook={hook} key={`${nodeId}:${hook.id}`} transform={transform} />
      ))}
    </>
  );
}

function TriggerVolumeGuide({
  hook,
  transform
}: {
  hook: SceneHook;
  transform: Transform;
}) {
  const shape = readHookString(hook.config, "shape", "box");
  const size = readHookVec3Tuple(hook.config, "size", [1, 1, 1]);
  const radius = Math.max(0.05, readHookNumber(hook.config, "radius", 0.5));
  const height = Math.max(radius * 2, readHookNumber(hook.config, "height", radius * 2));
  const capsuleLength = Math.max(0.001, height - radius * 2);

  return (
    <group
      position={[transform.position.x, transform.position.y, transform.position.z]}
      rotation={toTuple(transform.rotation)}
      scale={[transform.scale.x, transform.scale.y, transform.scale.z]}
    >
      {shape === "sphere" ? (
        <mesh raycast={() => null}>
          <sphereGeometry args={[radius, 18, 18]} />
          <meshBasicMaterial color="#34d399" opacity={0.12} transparent wireframe />
        </mesh>
      ) : null}
      {shape === "capsule" ? (
        <mesh raycast={() => null}>
          <capsuleGeometry args={[radius, capsuleLength, 6, 12]} />
          <meshBasicMaterial color="#34d399" opacity={0.12} transparent wireframe />
        </mesh>
      ) : null}
      {shape === "box" ? (
        <mesh raycast={() => null}>
          <boxGeometry args={size} />
          <meshBasicMaterial color="#34d399" opacity={0.12} transparent wireframe />
        </mesh>
      ) : null}
    </group>
  );
}

function PathGuides({
  pathDefinitions,
  selectedPathId
}: {
  pathDefinitions: NonNullable<SceneSettings["paths"]>;
  selectedPathId?: string;
}) {
  return (
    <>
      {pathDefinitions.map((pathDefinition) => (
        <SinglePathGuide
          key={pathDefinition.id}
          loop={pathDefinition.loop === true}
          pathId={pathDefinition.id}
          points={pathDefinition.points}
          selected={pathDefinition.id === selectedPathId}
        />
      ))}
    </>
  );
}

function SinglePathGuide({
  loop,
  pathId,
  points,
  selected
}: {
  loop: boolean;
  pathId: string;
  points: Vec3[];
  selected: boolean;
}) {
  const positions = useMemo(() => {
    if (points.length === 0) {
      return new Float32Array();
    }

    const resolvedPoints = loop && points.length > 2 ? [...points, points[0]] : points;
    return new Float32Array(resolvedPoints.flatMap((point) => [point.x, point.y, point.z]));
  }, [loop, points]);

  if (points.length === 0) {
    return null;
  }

  return (
    <group name={`path:${pathId}`}>
      <line>
        <bufferGeometry>
          <bufferAttribute args={[positions, 3]} attach="attributes-position" count={positions.length / 3} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color={selected ? "#f59e0b" : "#34d399"} transparent opacity={selected ? 0.95 : 0.72} />
      </line>
      {points.map((point, index) => (
        <mesh key={`${pathId}:${index}`} position={[point.x, point.y, point.z]} raycast={() => null}>
          <sphereGeometry args={[0.1, 10, 10]} />
          <meshBasicMaterial color={selected ? "#fdba74" : index === 0 ? "#f59e0b" : "#99f6e4"} transparent opacity={selected ? 1 : 0.88} />
        </mesh>
      ))}
    </group>
  );
}

function PreviewCustomScriptRuntimeWithPhysics({
  entities,
  nodes,
  objectBindings,
  physicsPlayback,
  previewStepTick
}: {
  entities: Entity[];
  nodes: GeometryNode[];
  objectBindings: MutableRefObject<Map<string, Object3D>>;
  physicsPlayback: "paused" | "running" | "stopped";
  previewStepTick: number;
}) {
  const { rapier, world } = useRapier();

  return (
    <PreviewCustomScriptRuntime
      entities={entities}
      nodes={nodes}
      objectBindings={objectBindings}
      physics={{ rapier, world }}
      physicsPlayback={physicsPlayback}
      previewStepTick={previewStepTick}
    />
  );
}

function PreviewCustomScriptRuntime({
  entities,
  nodes,
  objectBindings,
  physics,
  physicsPlayback,
  previewStepTick
}: {
  entities: Entity[];
  nodes: GeometryNode[];
  objectBindings: MutableRefObject<Map<string, Object3D>>;
  physics?: { rapier: unknown; world: unknown };
  physicsPlayback: "paused" | "running" | "stopped";
  previewStepTick: number;
}) {
  const controllerRef = useRef<ReturnType<typeof createCustomScriptController> | null>(null);
  const previousStepTickRef = useRef(previewStepTick);
  const keyStateRef = useRef(new Set<string>());

  useEffect(() => {
    if (physicsPlayback === "stopped") {
      return;
    }

    const sceneState = createMutableSceneHostState(nodes, entities);
    const syncBoundObjects = () => {
      objectBindings.current.forEach((object, targetId) => {
        const worldTransform = sceneState.getWorldTransform(targetId);

        if (!worldTransform) {
          return;
        }

        applyObjectTransform(object, worldTransform);
      });
    };
    const eventListeners = new Set<(event: CustomScriptEventRecord) => void>();
    const controller = createCustomScriptController({
      emitEvent: (event: CustomScriptEventInput & { sourceId: string }) => {
        eventListeners.forEach((listener) => listener(event));
      },
      entities,
      getLocalTransform: (targetId: string) => sceneState.getLocalTransform(targetId),
      getWorldTransform: (targetId: string) => sceneState.getWorldTransform(targetId),
      input: {
        isKeyDown: (key: string) => keyStateRef.current.has(key)
      },
      log: (level: CustomScriptLogLevel, message: string, data?: unknown) => {
        const logger =
          level === "error"
            ? console.error
            : level === "warn"
              ? console.warn
              : level === "debug"
                ? console.debug
                : console.info;
        logger("[preview custom_script]", message, data);
      },
      nodes,
      onEvent: (filter: CustomScriptEventFilter, listener: (event: CustomScriptEventRecord) => void) => {
        const wrapped = (event: CustomScriptEventRecord) => {
          if (!matchesPreviewEventFilter(filter, event)) {
            return;
          }

          listener(event);
        };

        eventListeners.add(wrapped);
        return () => {
          eventListeners.delete(wrapped);
        };
      },
      physics: physics
        ? {
            rapier: physics.rapier,
            world: physics.world
          }
        : undefined,
      setLocalTransform: (targetId: string, transform: Transform) => {
        sceneState.setLocalTransform(targetId, transform);
        syncBoundObjects();
      },
      setWorldTransform: (targetId: string, transform: Transform) => {
        sceneState.setWorldTransform(targetId, transform);
        syncBoundObjects();
      }
    });

    controller.start();
    syncBoundObjects();
    controllerRef.current = controller;
    previousStepTickRef.current = previewStepTick;

    return () => {
      controller.stop();
      controllerRef.current = null;
    };
  }, [entities, nodes, objectBindings, physics, physicsPlayback]);

  useEffect(() => {
    if (physicsPlayback === "stopped") {
      keyStateRef.current.clear();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputTarget(event.target)) {
        return;
      }

      keyStateRef.current.add(event.code);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keyStateRef.current.delete(event.code);
    };
    const handleBlur = () => {
      keyStateRef.current.clear();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [physicsPlayback]);

  useFrame((_state, delta) => {
    const controller = controllerRef.current;

    if (!controller || physicsPlayback === "stopped") {
      return;
    }

    if (physicsPlayback === "running") {
      controller.update(delta);
      return;
    }

    if (previousStepTickRef.current !== previewStepTick) {
      previousStepTickRef.current = previewStepTick;
      controller.update(1 / 60);
    }
  });

  return null;
}

function matchesPreviewEventFilter(
  filter: CustomScriptEventFilter,
  event: CustomScriptEventRecord
) {
  const eventMatches =
    !filter.event ||
    (Array.isArray(filter.event) ? filter.event.includes(event.event) : filter.event === event.event);

  if (!eventMatches) {
    return false;
  }

  if (filter.sourceId && filter.sourceId !== event.sourceId) {
    return false;
  }

  if (filter.targetId && filter.targetId !== event.targetId) {
    return false;
  }

  return true;
}

function readHookNumber(config: SceneHook["config"], key: string, fallback: number) {
  const value = config[key];
  return typeof value === "number" ? value : fallback;
}

function readHookString(config: SceneHook["config"], key: string, fallback: string) {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

function readHookVec3Tuple(config: SceneHook["config"], key: string, fallback: [number, number, number]): [number, number, number] {
  const value = config[key];

  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }

  return [
    typeof value[0] === "number" ? value[0] : fallback[0],
    typeof value[1] === "number" ? value[1] : fallback[1],
    typeof value[2] === "number" ? value[2] : fallback[2]
  ];
}

function RenderEntityMarker({
  entity,
  hovered,
  interactive,
  onMeshObjectChange,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  sceneEntities,
  selected
}: {
  entity: DerivedEntityMarker;
  hovered: boolean;
  interactive: boolean;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  sceneEntities: Entity[];
  selected: boolean;
}) {
  const registerPathInner = usePathMotionInnerRegister();
  const entityRecord = useMemo(() => sceneEntities.find((entry) => entry.id === entity.entityId), [entity.entityId, sceneEntities]);
  const usePathInner = Boolean(entityRecord && entityUsesViewportPathMotion(entityRecord));
  const isHumanoidSpawn = entity.entityType === "player-spawn" || entity.entityType === "npc-spawn";
  const emphasis = selected ? "selected" : hovered ? "hover" : "default";
  const markerColor = selected ? "#ffb35a" : hovered ? "#d8f4f0" : entity.color;
  const humanoidVariant = entity.entityType === "npc-spawn" ? "npc" : entity.entityType === "player-spawn" ? "player" : "neutral";
  const humanoidHeight = entity.entityType === "npc-spawn" ? 1.74 : 1.82;

  const markerVisuals = (
    <>
      {isHumanoidSpawn ? (
        <>
          <DefaultHumanoidCharacter
            accentColor={markerColor}
            emphasis={emphasis}
            height={humanoidHeight}
            pose={entity.entityType === "player-spawn" ? "runtime" : "idle"}
            showSpawnBase
            variant={humanoidVariant}
          />
          <mesh position={[0, 0.015, 0]} raycast={() => null} rotation={[-Math.PI * 0.5, 0, 0]}>
            <circleGeometry args={[0.42, 28]} />
            <meshBasicMaterial color={markerColor} opacity={selected ? 0.18 : hovered ? 0.12 : 0.08} toneMapped={false} transparent />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 0.8, 0]}>
            <octahedronGeometry args={[0.35, 0]} />
            <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.7, 8]} />
            <meshStandardMaterial color="#d8e0ea" metalness={0.1} roughness={0.55} />
          </mesh>
        </>
      )}
      <mesh>
        <boxGeometry args={isHumanoidSpawn ? [0.9, humanoidHeight, 0.9] : [0.7, 1.4, 0.7]} />
        <meshBasicMaterial opacity={0} transparent />
      </mesh>
    </>
  );

  return (
    <group
      name={`entity:${entity.entityId}`}
      ref={(object) => {
        onMeshObjectChange(entity.entityId, object);
      }}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([entity.entityId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onFocusNode(entity.entityId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverStart(entity.entityId);
      }}
      position={toTuple(entity.position)}
      rotation={toTuple(entity.rotation)}
      scale={toTuple(entity.scale)}
    >
      {usePathInner ? <group ref={(inner) => registerPathInner(entity.entityId, inner)}>{markerVisuals}</group> : markerVisuals}
    </group>
  );
}

function RenderGroupNode({
  group,
  hovered,
  interactive,
  onMeshObjectChange,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  selected
}: {
  group: DerivedGroupMarker;
  hovered: boolean;
  interactive: boolean;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  selected: boolean;
}) {
  const markerColor = selected ? "#ffb35a" : hovered ? "#d8f4f0" : "#7dd3fc";

  return (
    <group
      name={`node:${group.nodeId}`}
      ref={(object) => {
        onMeshObjectChange(group.nodeId, object);
      }}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([group.nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onFocusNode(group.nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverStart(group.nodeId);
      }}
      position={toTuple(group.position)}
      rotation={toTuple(group.rotation)}
      scale={toTuple(group.scale)}
    >
      <mesh>
        <octahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={0.18} transparent opacity={0.85} />
      </mesh>
      <mesh visible={false}>
        <sphereGeometry args={[0.4, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

function PhysicsStepController({
  enabled,
  stepTick
}: {
  enabled: boolean;
  stepTick: number;
}) {
  const { step } = useRapier();
  const lastStepTickRef = useRef(stepTick);

  useEffect(() => {
    if (!enabled) {
      lastStepTickRef.current = stepTick;
      return;
    }

    if (stepTick === lastStepTickRef.current) {
      return;
    }

    lastStepTickRef.current = stepTick;
    step(1 / 60);
  }, [enabled, step, stepTick]);

  return null;
}

const PREVIEW_NPC_INTERACT_RANGE_SQ = 3.15 * 3.15;
const PREVIEW_NPC_INTERACT_DOT_MIN = Math.cos((58 * Math.PI) / 180);

function previewInputIsFocusableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable)
  );
}

function findNpcInInteractCone(
  eye: Vector3,
  forward: Vector3,
  markers: DerivedEntityMarker[],
  entityList: Entity[]
): { entity: Entity; marker: DerivedEntityMarker } | null {
  const fx = forward.x;
  const fz = forward.z;
  const flatLen = Math.hypot(fx, fz);

  if (flatLen < 1e-5) {
    return null;
  }

  const fnx = fx / flatLen;
  const fnz = fz / flatLen;
  let best: { distSq: number; entity: Entity; marker: DerivedEntityMarker } | null = null;

  for (const marker of markers) {
    const entity = entityList.find((e) => e.id === marker.entityId);

    if (!entity) {
      continue;
    }

    const dx = marker.position.x - eye.x;
    const dz = marker.position.z - eye.z;
    const distSq = dx * dx + dz * dz;

    if (distSq > PREVIEW_NPC_INTERACT_RANGE_SQ) {
      continue;
    }

    const dLen = Math.hypot(dx, dz);

    if (dLen < 1e-5) {
      if (!best || distSq < best.distSq) {
        best = { distSq, entity, marker };
      }

      continue;
    }

    const dot = (dx / dLen) * fnx + (dz / dLen) * fnz;

    if (dot < PREVIEW_NPC_INTERACT_DOT_MIN) {
      continue;
    }

    if (!best || distSq < best.distSq) {
      best = { distSq, entity, marker };
    }
  }

  return best ? { entity: best.entity, marker: best.marker } : null;
}

function openPreviewNpcSession(entity: Entity, marker: DerivedEntityMarker) {
  const voiceId = String(entity.properties[NPC_VOICE_ID_PROPERTY] ?? "").trim();
  const characterPrompt = String(entity.properties[NPC_CHARACTER_PROMPT_PROPERTY] ?? "").trim();
  const displayName = entity.name?.trim() || marker.label || "NPC";
  const prev = previewNpcDialogueStore.session;

  if (prev?.entityId === entity.id) {
    return;
  }

  previewNpcDialogueStore.session = {
    characterPrompt,
    displayName,
    entityId: entity.id,
    history: [],
    voiceId
  };
  previewNpcDialogueStore.error = null;
}

function RuntimePlayer({
  entities: entityList,
  npcMarkers,
  onCursorCaptureChange,
  physicsPlayback,
  possessed,
  sceneSettings,
  spawn
}: {
  entities: Entity[];
  npcMarkers: DerivedEntityMarker[];
  onCursorCaptureChange?: (captured: boolean) => void;
  physicsPlayback: "paused" | "running" | "stopped";
  possessed: boolean;
  sceneSettings: SceneSettings;
  spawn: DerivedEntityMarker;
}) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const keyStateRef = useRef(new Set<string>());
  const jumpQueuedRef = useRef(false);
  const groundedColliderHandlesRef = useRef(new Set<number>());
  const yawRef = useRef(spawn.rotation.y);
  const pitchRef = useRef(sceneSettings.player.cameraMode === "fps" ? 0 : -0.2);
  const eyeAnchorRef = useRef<Object3D | null>(null);
  const mannequinCoreRef = useRef<Object3D | null>(null);
  const leftArmRef = useRef<Object3D | null>(null);
  const rightArmRef = useRef<Object3D | null>(null);
  const leftLegRef = useRef<Object3D | null>(null);
  const rightLegRef = useRef<Object3D | null>(null);
  const visualRef = useRef<Object3D | null>(null);
  const stridePhaseRef = useRef(0);
  const cameraPositionRef = useRef(new Vector3());
  const cameraTargetRef = useRef(new Vector3());
  const eyeWorldPositionRef = useRef(new Vector3());
  const lookTargetRef = useRef(new Vector3());
  const directionRef = useRef(new Vector3());
  const orbitDirectionRef = useRef(new Vector3());
  const forwardRef = useRef(new Vector3());
  const rightRef = useRef(new Vector3());
  const moveRef = useRef(new Vector3());
  const { camera, gl } = useThree();

  const standingHeight = Math.max(1.2, sceneSettings.player.height);
  const crouchHeight = sceneSettings.player.canCrouch
    ? clampNumber(sceneSettings.player.crouchHeight, 0.9, standingHeight - 0.15)
    : standingHeight;
  const colliderRadius = useMemo(() => clampNumber(standingHeight * 0.18, 0.24, 0.42), [standingHeight]);
  const capsuleHalfHeight = useMemo(() => Math.max(0.12, standingHeight * 0.5 - colliderRadius), [colliderRadius, standingHeight]);
  const footOffset = capsuleHalfHeight + colliderRadius;
  const spawnPosition = useMemo<[number, number, number]>(
    () => [spawn.position.x, spawn.position.y + standingHeight * 0.5 + 0.04, spawn.position.z],
    [spawn.position.x, spawn.position.y, spawn.position.z, standingHeight]
  );

  useEffect(() => {
    yawRef.current = spawn.rotation.y;
    pitchRef.current = sceneSettings.player.cameraMode === "fps" ? 0 : sceneSettings.player.cameraMode === "third-person" ? -0.22 : -0.78;
  }, [sceneSettings.player.cameraMode, spawn.rotation.y]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!possessed || physicsPlayback !== "running") {
        return;
      }

      if (isTextInputTarget(event.target)) {
        return;
      }

      keyStateRef.current.add(event.code);

      if (event.code === "Space") {
        jumpQueuedRef.current = true;
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!possessed) {
        return;
      }

      keyStateRef.current.delete(event.code);
    };

    const handleWindowBlur = () => {
      keyStateRef.current.clear();
      jumpQueuedRef.current = false;
      groundedColliderHandlesRef.current.clear();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [physicsPlayback, possessed]);

  useEffect(() => {
    if (possessed && physicsPlayback === "running") {
      return;
    }

    keyStateRef.current.clear();
    jumpQueuedRef.current = false;
  }, [physicsPlayback, possessed]);

  useEffect(() => {
    const interactCode = sceneSettings.player.interactKey ?? "KeyE";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!possessed || physicsPlayback !== "running") {
        return;
      }

      if (previewInputIsFocusableTarget(event.target)) {
        return;
      }

      if (event.code !== interactCode) {
        return;
      }

      event.preventDefault();
      const body = bodyRef.current;

      if (!body) {
        return;
      }

      const translation = body.translation();
      const viewDirection = resolveViewDirection(yawRef.current, pitchRef.current, directionRef.current);
      const eyeHeight = Math.max(colliderRadius * 1.5, standingHeight * 0.92);
      const eye = new Vector3(translation.x, translation.y - standingHeight * 0.5 + eyeHeight, translation.z);
      const hit = findNpcInInteractCone(eye, viewDirection, npcMarkers, entityList);

      if (hit) {
        openPreviewNpcSession(hit.entity, hit.marker);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    colliderRadius,
    entityList,
    npcMarkers,
    possessed,
    physicsPlayback,
    sceneSettings.player.interactKey,
    standingHeight
  ]);

  useEffect(() => {
    const domElement = gl.domElement;
    const syncCursorCapture = () => {
      onCursorCaptureChange?.(
        possessed && physicsPlayback === "running" && document.pointerLockElement === domElement
      );
    };

    const handleCanvasClick = () => {
      if (!possessed || physicsPlayback !== "running" || document.pointerLockElement === domElement) {
        return;
      }

      void domElement.requestPointerLock();
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!possessed || physicsPlayback !== "running" || document.pointerLockElement !== domElement) {
        return;
      }

      yawRef.current -= event.movementX * 0.0024;
      pitchRef.current = clampNumber(
        pitchRef.current - event.movementY * 0.0018,
        sceneSettings.player.cameraMode === "fps" ? -1.35 : -1.25,
        sceneSettings.player.cameraMode === "fps" ? 1.35 : sceneSettings.player.cameraMode === "top-down" ? -0.12 : 0.4
        );
    };

    const handlePointerLockChange = () => {
      syncCursorCapture();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && event.code === "F1" && document.pointerLockElement === domElement) {
        event.preventDefault();
        document.exitPointerLock();
      }
    };

    syncCursorCapture();
    domElement.addEventListener("click", handleCanvasClick);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerlockchange", handlePointerLockChange);

    return () => {
      domElement.removeEventListener("click", handleCanvasClick);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      onCursorCaptureChange?.(false);
    };
  }, [gl, onCursorCaptureChange, physicsPlayback, possessed, sceneSettings.player.cameraMode]);

  useEffect(() => {
    const domElement = gl.domElement;

    if ((possessed && physicsPlayback === "running") || document.pointerLockElement !== domElement) {
      return;
    }

    document.exitPointerLock();
  }, [gl, physicsPlayback, possessed]);

  useFrame((_, delta) => {
    const body = bodyRef.current;

    if (!body) {
      return;
    }

    const running = physicsPlayback === "running";
    const controllingPlayer = running && possessed;
    const translation = body.translation();
    const linearVelocity = body.linvel();
    const keyState = keyStateRef.current;
    const crouching = controllingPlayer && sceneSettings.player.canCrouch && (keyState.has("ControlLeft") || keyState.has("ControlRight") || keyState.has("KeyC"));
    const currentHeight = crouching ? crouchHeight : standingHeight;
    const speed = sceneSettings.player.canRun && controllingPlayer && (keyState.has("ShiftLeft") || keyState.has("ShiftRight"))
      ? sceneSettings.player.runningSpeed
      : sceneSettings.player.movementSpeed;
    const moveInputX = (keyState.has("KeyD") || keyState.has("ArrowRight") ? 1 : 0) - (keyState.has("KeyA") || keyState.has("ArrowLeft") ? 1 : 0);
    const moveInputZ = (keyState.has("KeyW") || keyState.has("ArrowUp") ? 1 : 0) - (keyState.has("KeyS") || keyState.has("ArrowDown") ? 1 : 0);
    const viewDirection = resolveViewDirection(yawRef.current, pitchRef.current, directionRef.current);
    const forwardDirection = forwardRef.current.set(viewDirection.x, 0, viewDirection.z);
    const rightDirection = rightRef.current;
    const moveDirection = moveRef.current.set(0, 0, 0);

    if (forwardDirection.lengthSq() > 0) {
      forwardDirection.normalize();
    } else {
      forwardDirection.set(0, 0, -1);
    }

    rightDirection.set(-forwardDirection.z, 0, forwardDirection.x);
    rightDirection.normalize();
    moveDirection
      .addScaledVector(rightDirection, moveInputX)
      .addScaledVector(forwardDirection, moveInputZ);

    if (controllingPlayer) {
      if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize().multiplyScalar(crouching ? speed * 0.58 : speed);
      }

      body.setLinvel(
        {
          x: moveDirection.x,
          y: linearVelocity.y,
          z: moveDirection.z
        },
        true
      );

      if (jumpQueuedRef.current) {
        if (sceneSettings.player.canJump && groundedColliderHandlesRef.current.size > 0) {
          const gravityMagnitude = Math.max(
            0.001,
            Math.hypot(sceneSettings.world.gravity.x, sceneSettings.world.gravity.y, sceneSettings.world.gravity.z)
          );

          body.setLinvel(
            {
              x: moveDirection.x,
              y: Math.sqrt(2 * gravityMagnitude * sceneSettings.player.jumpHeight),
              z: moveDirection.z
            },
            true
          );
          groundedColliderHandlesRef.current.clear();
        }

        jumpQueuedRef.current = false;
      }
    } else if (running) {
      body.setLinvel(
        {
          x: 0,
          y: linearVelocity.y,
          z: 0
        },
        true
      );
      jumpQueuedRef.current = false;
    }

    const planarSpeed = Math.hypot(linearVelocity.x, linearVelocity.z);
    const strideIntensity = clampNumber(planarSpeed / Math.max(sceneSettings.player.movementSpeed, 0.001), 0, 1.1);
    stridePhaseRef.current += delta * Math.max(1.8, planarSpeed * 3.6);
    const strideWave = Math.sin(stridePhaseRef.current) * strideIntensity;

    if (visualRef.current) {
      visualRef.current.rotation.set(0, yawRef.current, 0);
      visualRef.current.scale.y = clampNumber(currentHeight / standingHeight, 0.55, 1);
      visualRef.current.position.y = (standingHeight - currentHeight) * -0.22;
    }

    if (mannequinCoreRef.current) {
      mannequinCoreRef.current.position.y = Math.sin(stridePhaseRef.current * 2) * 0.018 * strideIntensity;
      mannequinCoreRef.current.rotation.z = Math.sin(stridePhaseRef.current) * 0.028 * strideIntensity;
    }

    if (leftArmRef.current) {
      leftArmRef.current.rotation.set(-0.24 + strideWave * 0.72, 0, 0.14);
    }

    if (rightArmRef.current) {
      rightArmRef.current.rotation.set(-0.24 - strideWave * 0.72, 0, -0.14);
    }

    if (leftLegRef.current) {
      leftLegRef.current.rotation.set(-strideWave * 0.82, 0, 0.03);
    }

    if (rightLegRef.current) {
      rightLegRef.current.rotation.set(strideWave * 0.82, 0, -0.03);
    }

    const eyeHeight = Math.max(colliderRadius * 1.5, currentHeight * 0.92);
    const eyePosition = eyeWorldPositionRef.current;

    if (eyeAnchorRef.current) {
      eyeAnchorRef.current.position.set(0, -standingHeight * 0.5 + eyeHeight, 0);
      eyeAnchorRef.current.updateWorldMatrix(true, false);
      eyeAnchorRef.current.getWorldPosition(eyePosition);
    } else {
      eyePosition.set(translation.x, translation.y - standingHeight * 0.5 + eyeHeight, translation.z);
    }

    if (possessed) {
      cameraTargetRef.current.copy(eyePosition);
      const nextCameraPosition = cameraPositionRef.current;
      const nextLookTarget = lookTargetRef.current;

      if (sceneSettings.player.cameraMode === "fps") {
        nextCameraPosition.copy(eyePosition);
        nextLookTarget.copy(eyePosition).add(viewDirection);
        camera.position.copy(nextCameraPosition);
        camera.lookAt(nextLookTarget);
      } else if (sceneSettings.player.cameraMode === "third-person") {
        const followDistance = Math.max(3.2, standingHeight * 2.7);

        nextCameraPosition.copy(eyePosition).addScaledVector(viewDirection, -followDistance);
        nextCameraPosition.y += standingHeight * 0.24;
        camera.position.lerp(nextCameraPosition, 1 - Math.exp(-delta * 10));
        camera.lookAt(eyePosition);
      } else {
        const topDownDirection = resolveViewDirection(yawRef.current, pitchRef.current, orbitDirectionRef.current);
        const followDistance = Math.max(8, standingHeight * 5.2);

        nextCameraPosition.copy(eyePosition).addScaledVector(topDownDirection, -followDistance);
        nextCameraPosition.y += standingHeight * 1.8;
        camera.position.lerp(nextCameraPosition, 1 - Math.exp(-delta * 8));
        camera.lookAt(eyePosition);
      }
    }
  });

  return (
    <RigidBody
      canSleep={false}
      ccd
      colliders={false}
      linearDamping={0.8}
      lockRotations
      position={spawnPosition}
      ref={bodyRef}
      type="dynamic"
    >
      <CapsuleCollider args={[capsuleHalfHeight, colliderRadius]} friction={0} restitution={0} />
      <CuboidCollider
        args={[colliderRadius * 0.72, 0.05, colliderRadius * 0.72]}
        onIntersectionEnter={(payload) => {
          groundedColliderHandlesRef.current.add(payload.other.collider.handle);
        }}
        onIntersectionExit={(payload) => {
          groundedColliderHandlesRef.current.delete(payload.other.collider.handle);
        }}
        position={[0, -(footOffset + 0.04), 0]}
        sensor
      />
      <group>
        <object3D ref={eyeAnchorRef} />
        <group ref={visualRef} visible={!possessed || sceneSettings.player.cameraMode !== "fps"}>
          <DefaultHumanoidCharacter
            accentColor="#72dbf6"
            emphasis="default"
            height={standingHeight}
            pose="runtime"
            rigRefs={{
              coreRef: mannequinCoreRef,
              leftArmRef,
              leftLegRef,
              rightArmRef,
              rightLegRef
            }}
            variant="player"
          />
        </group>
      </group>
    </RigidBody>
  );
}

function RenderStaticMesh({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  if (!mesh.surface && !mesh.primitive && !mesh.modelPath) {
    return null;
  }

  return (
    <RenderNodeRoot
      hovered={hovered}
      interactive={interactive}
      mesh={mesh}
      onFocusNode={onFocusNode}
      onHoverEnd={onHoverEnd}
      onHoverStart={onHoverStart}
      onMeshObjectChange={onMeshObjectChange}
      onSelectNodes={onSelectNodes}
      renderMode={renderMode}
      selected={selected}
    />
  );
}

function PhysicsPropMesh({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  const physics = mesh.physics;
  const colliderProps = useMemo(() => resolvePhysicsColliderProps(mesh.physics), [mesh.physics]);

  if (!physics) {
    return null;
  }

  const useTrimeshCollider = physics.colliderShape === "trimesh" || !mesh.primitive;

  return (
    <RigidBody
      angularDamping={physics.angularDamping}
      canSleep={physics.canSleep}
      ccd={physics.ccd}
      colliders={false}
      gravityScale={physics.gravityScale}
      linearDamping={physics.linearDamping}
      lockRotations={physics.lockRotations}
      lockTranslations={physics.lockTranslations}
      position={toTuple(mesh.position)}
      rotation={toTuple(mesh.rotation)}
      type={physics.bodyType}
    >
      {!useTrimeshCollider ? (
        <ManualCollider mesh={mesh} />
      ) : (
        <TrimeshPhysicsCollider colliderProps={colliderProps} mesh={mesh} />
      )}
      <group scale={toTuple(mesh.scale)}>
        <RenderNodeBody
          hovered={hovered}
          interactive={interactive}
          mesh={mesh}
          onFocusNode={onFocusNode}
          onHoverEnd={onHoverEnd}
          onHoverStart={onHoverStart}
          onSelectNodes={onSelectNodes}
          renderMode={renderMode}
          selected={selected}
        />
      </group>
      <object3D
        name={`node:${mesh.nodeId}`}
        ref={(object) => {
          onMeshObjectChange(mesh.nodeId, object);
        }}
      />
    </RigidBody>
  );
}

function RenderInstancedMeshBatch({
  batch,
  hoveredNodeId,
  interactive,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selectedNodeIds
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selectedNodeIds: Set<string>;
}) {
  if (batch.mesh.modelPath) {
    return (
      <RenderInstancedModelBatch
        batch={batch}
        hoveredNodeId={hoveredNodeId}
        interactive={interactive}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onMeshObjectChange={onMeshObjectChange}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        selectedNodeIds={selectedNodeIds}
      />
    );
  }

  const meshRef = useRef<InstancedMesh | null>(null);
  const geometry = useRenderableGeometry(batch.mesh, renderMode);
  const previewMaterials = useInstancedPreviewMaterials(batch.mesh, renderMode);
  const pivot = resolveMeshPivot(batch.mesh);
  const batchNodeIds = useMemo(() => batch.instances.map((instance) => instance.nodeId), [batch.instances]);

  useEffect(() => {
    const meshObject = meshRef.current;

    if (!meshObject || !geometry || previewMaterials.length === 0) {
      return;
    }

    tempPivotMatrix.makeTranslation(-pivot.x, -pivot.y, -pivot.z);

    batch.instances.forEach((instance, index) => {
      tempInstanceObject.position.set(instance.position.x, instance.position.y, instance.position.z);
      tempInstanceObject.rotation.set(instance.rotation.x, instance.rotation.y, instance.rotation.z);
      tempInstanceObject.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      tempInstanceObject.updateMatrix();
      tempInstanceMatrix.copy(tempInstanceObject.matrix).multiply(tempPivotMatrix);
      meshObject.setMatrixAt(index, tempInstanceMatrix);
      meshObject.setColorAt(
        index,
        tempInstanceColor.set(
          selectedNodeIds.has(instance.nodeId)
            ? "#ffb35a"
            : hoveredNodeId === instance.nodeId
              ? "#67e8f9"
              : "#ffffff"
        )
      );
    });

    meshObject.count = batch.instances.length;
    meshObject.instanceMatrix.needsUpdate = true;

    if (meshObject.instanceColor) {
      meshObject.instanceColor.needsUpdate = true;
    }
  }, [batch.instances, geometry, hoveredNodeId, pivot.x, pivot.y, pivot.z, previewMaterials, selectedNodeIds]);

  useEffect(() => {
    return () => {
      previewMaterials.forEach((material) => {
        if (isPreviewDisposableMaterial(material)) {
          material.dispose();
        }
      });
    };
  }, [previewMaterials]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry || previewMaterials.length === 0) {
    return null;
  }

  return (
    <instancedMesh
      args={[geometry, previewMaterials.length === 1 ? previewMaterials[0] : previewMaterials, batch.instances.length]}
      castShadow={renderMode === "lit"}
      name={`node:${batch.batchId}`}
      onPointerDown={(event) => {
        if (!interactive || event.button !== 0) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onFocusNode(nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onHoverStart(nodeId);
      }}
      receiveShadow={renderMode === "lit"}
      ref={(object) => {
        if (object) {
          object.userData.webHammer = {
            instanceNodeIds: batchNodeIds,
            sourceNodeId: batch.sourceNodeId
          };
        }

        onMeshObjectChange(batch.batchId, object);
        meshRef.current = object;
      }}
    />
  );
}

function RenderInstancedModelBatch({
  batch,
  hoveredNodeId,
  interactive,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selectedNodeIds
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selectedNodeIds: Set<string>;
}) {
  const loadedScene = useLoadedModelScene(
    batch.mesh.modelPath,
    batch.mesh.modelFormat === "obj" ? "obj" : "glb",
    batch.mesh.modelTexturePath,
    batch.mesh.modelMtlText
  );
  const loadedBounds = useMemo(
    () => (loadedScene ? computeModelBounds(loadedScene) : undefined),
    [loadedScene]
  );
  const center = loadedBounds?.center ?? batch.mesh.modelCenter ?? { x: 0, y: 0, z: 0 };
  const modelParts = useMemo(() => buildModelParts(loadedScene, center), [center.x, center.y, center.z, loadedScene]);

  useEffect(() => {
    return () => {
      modelParts.forEach((part) => {
        if (part.disposeGeometry) {
          part.geometry.dispose();
        }
      });
    };
  }, [modelParts]);

  if (renderMode === "wireframe" || modelParts.length === 0) {
    return (
      <RenderInstancedModelBoundsBatch
        batch={batch}
        hoveredNodeId={hoveredNodeId}
        interactive={interactive}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onMeshObjectChange={onMeshObjectChange}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        selectedNodeIds={selectedNodeIds}
        size={loadedBounds?.size ?? batch.mesh.modelSize ?? { x: 1.4, y: 1.4, z: 1.4 }}
      />
    );
  }

  return (
    <group
      name={`node:${batch.batchId}`}
      ref={(object) => {
        onMeshObjectChange(batch.batchId, object);
      }}
    >
      {modelParts.map((part) => (
        <RenderInstancedModelPart
          batch={batch}
          hoveredNodeId={hoveredNodeId}
          interactive={interactive}
          key={part.key}
          localMatrix={part.localMatrix}
          material={part.material}
          onFocusNode={onFocusNode}
          onHoverEnd={onHoverEnd}
          onHoverStart={onHoverStart}
          onSelectNodes={onSelectNodes}
          partKey={part.key}
          renderMode={renderMode}
          selectedNodeIds={selectedNodeIds}
          sourceGeometry={part.geometry}
        />
      ))}
    </group>
  );
}

function RenderInstancedModelPart({
  batch,
  hoveredNodeId,
  interactive,
  localMatrix,
  material,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  partKey,
  renderMode,
  selectedNodeIds,
  sourceGeometry
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  localMatrix: Matrix4;
  material: Mesh["material"];
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  partKey: string;
  renderMode: ViewportRenderMode;
  selectedNodeIds: Set<string>;
  sourceGeometry: BufferGeometry;
}) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const batchNodeIds = useMemo(() => batch.instances.map((instance) => instance.nodeId), [batch.instances]);

  useEffect(() => {
    const meshObject = meshRef.current;

    if (!meshObject) {
      return;
    }

    batch.instances.forEach((instance, index) => {
      tempInstanceObject.position.set(instance.position.x, instance.position.y, instance.position.z);
      tempInstanceObject.rotation.set(instance.rotation.x, instance.rotation.y, instance.rotation.z);
      tempInstanceObject.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      tempInstanceObject.updateMatrix();
      tempInstanceMatrix.copy(tempInstanceObject.matrix).multiply(localMatrix);
      meshObject.setMatrixAt(index, tempInstanceMatrix);
      meshObject.setColorAt(
        index,
        tempInstanceColor.set(
          selectedNodeIds.has(instance.nodeId)
            ? "#ffb35a"
            : hoveredNodeId === instance.nodeId
              ? "#67e8f9"
              : "#ffffff"
        )
      );
    });

    meshObject.count = batch.instances.length;
    meshObject.instanceMatrix.needsUpdate = true;

    if (meshObject.instanceColor) {
      meshObject.instanceColor.needsUpdate = true;
    }
  }, [batch.instances, hoveredNodeId, localMatrix, selectedNodeIds]);

  return (
    <instancedMesh
      args={[sourceGeometry, material, batch.instances.length]}
      castShadow={renderMode === "lit"}
      name={`node:${batch.batchId}:${partKey}`}
      onPointerDown={(event) => {
        if (!interactive || event.button !== 0) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onFocusNode(nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onHoverStart(nodeId);
      }}
      receiveShadow={renderMode === "lit"}
      ref={(object) => {
        if (object) {
          object.userData.webHammer = {
            instanceNodeIds: batchNodeIds,
            sourceNodeId: batch.sourceNodeId
          };
        }

        meshRef.current = object;
      }}
    />
  );
}

function RenderInstancedModelBoundsBatch({
  batch,
  hoveredNodeId,
  interactive,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selectedNodeIds,
  size
}: {
  batch: DerivedInstancedMesh;
  hoveredNodeId?: string;
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selectedNodeIds: Set<string>;
  size: Vec3;
}) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const geometry = useMemo(() => new BoxGeometry(size.x, size.y, size.z), [size.x, size.y, size.z]);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: "#94a3b8",
        depthWrite: false,
        opacity: renderMode === "wireframe" ? 1 : 0.85,
        toneMapped: false,
        transparent: renderMode !== "wireframe",
        wireframe: true
      }),
    [renderMode]
  );
  const batchNodeIds = useMemo(() => batch.instances.map((instance) => instance.nodeId), [batch.instances]);

  useEffect(() => {
    const meshObject = meshRef.current;

    if (!meshObject) {
      return;
    }

    batch.instances.forEach((instance, index) => {
      tempInstanceObject.position.set(instance.position.x, instance.position.y, instance.position.z);
      tempInstanceObject.rotation.set(instance.rotation.x, instance.rotation.y, instance.rotation.z);
      tempInstanceObject.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      tempInstanceObject.updateMatrix();
      meshObject.setMatrixAt(index, tempInstanceObject.matrix);
      meshObject.setColorAt(
        index,
        tempInstanceColor.set(
          selectedNodeIds.has(instance.nodeId)
            ? "#f97316"
            : hoveredNodeId === instance.nodeId
              ? "#67e8f9"
              : "#94a3b8"
        )
      );
    });

    meshObject.count = batch.instances.length;
    meshObject.instanceMatrix.needsUpdate = true;

    if (meshObject.instanceColor) {
      meshObject.instanceColor.needsUpdate = true;
    }
  }, [batch.instances, hoveredNodeId, selectedNodeIds]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <instancedMesh
      args={[geometry, material, batch.instances.length]}
      castShadow={renderMode === "lit"}
      name={`node:${batch.batchId}`}
      onPointerDown={(event) => {
        if (!interactive || event.button !== 0) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onFocusNode(nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        const nodeId = typeof event.instanceId === "number" ? batch.instances[event.instanceId]?.nodeId : undefined;

        if (!nodeId) {
          return;
        }

        event.stopPropagation();
        onHoverStart(nodeId);
      }}
      receiveShadow={renderMode === "lit"}
      ref={(object) => {
        if (object) {
          object.userData.webHammer = {
            instanceNodeIds: batchNodeIds,
            sourceNodeId: batch.sourceNodeId
          };
        }

        onMeshObjectChange(batch.batchId, object);
        meshRef.current = object;
      }}
    />
  );
}

function RenderNodeRoot({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onMeshObjectChange,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  return (
    <group
      name={`node:${mesh.nodeId}`}
      position={toTuple(mesh.position)}
      rotation={toTuple(mesh.rotation)}
      scale={toTuple(mesh.scale)}
      ref={(object) => {
        onMeshObjectChange(mesh.nodeId, object);
      }}
    >
      <RenderNodeBody
        hovered={hovered}
        interactive={interactive}
        mesh={mesh}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        selected={selected}
      />
    </group>
  );
}

function RenderNodeBody({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  if (mesh.modelPath) {
    return (
      <RenderModelBody
        hovered={hovered}
        interactive={interactive}
        mesh={mesh}
        onFocusNode={onFocusNode}
        onHoverEnd={onHoverEnd}
        onHoverStart={onHoverStart}
        onSelectNodes={onSelectNodes}
        renderMode={renderMode}
        selected={selected}
      />
    );
  }

  return (
    <RenderMeshBody
      hovered={hovered}
      interactive={interactive}
      mesh={mesh}
      onFocusNode={onFocusNode}
      onHoverEnd={onHoverEnd}
      onHoverStart={onHoverStart}
      onSelectNodes={onSelectNodes}
      renderMode={renderMode}
      selected={selected}
    />
  );
}

function StaticPhysicsCollider({ mesh }: { mesh: DerivedRenderMesh }) {
  return (
    <RigidBody colliders={false} position={toTuple(mesh.position)} rotation={toTuple(mesh.rotation)} type="fixed">
      <TrimeshPhysicsCollider mesh={mesh} />
    </RigidBody>
  );
}

function TrimeshPhysicsCollider({
  colliderProps,
  mesh
}: {
  colliderProps?: ReturnType<typeof resolvePhysicsColliderProps>;
  mesh: DerivedRenderMesh;
}) {
  const colliderArgs = useTrimeshColliderArgs(mesh);
  const pivot = resolveMeshPivot(mesh);

  if (!colliderArgs) {
    return null;
  }

  return (
    <group scale={toTuple(mesh.scale)}>
      <TrimeshCollider
        args={colliderArgs}
        position={[-pivot.x, -pivot.y, -pivot.z]}
        {...colliderProps}
      />
    </group>
  );
}

function useTrimeshColliderArgs(mesh: DerivedRenderMesh): [ArrayLike<number>, ArrayLike<number>] | undefined {
  const geometry = useRenderableGeometry(mesh, "lit");
  const fallbackIndices = useMemo(() => {
    if (!geometry) {
      return new Uint32Array();
    }

    const positionCount = geometry.getAttribute("position")?.count ?? 0;
    return Uint32Array.from({ length: positionCount }, (_, index) => index);
  }, [geometry]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) {
    return undefined;
  }

  return [
    geometry.getAttribute("position").array,
    geometry.getIndex()?.array ?? fallbackIndices
  ];
}

function RenderMeshBody({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  const [meshObject, setMeshObject] = useState<Mesh | null>(null);
  const geometry = useRenderableGeometry(mesh, renderMode);
  const previewMaterials = usePreviewMaterials(mesh, renderMode, selected, hovered);
  const pivot = resolveMeshPivot(mesh);

  useEffect(() => {
    if (geometry && meshObject && mesh.bvhEnabled) {
      enableBvhRaycast(meshObject, geometry);
    }

    return () => {
      if (geometry) {
        disableBvhRaycast(geometry);
      }
    };
  }, [geometry, mesh.bvhEnabled, meshObject]);

  useEffect(() => {
    if (meshObject && previewMaterials.length > 0) {
      meshObject.material = previewMaterials.length === 1 ? previewMaterials[0] : previewMaterials;
    }
  }, [meshObject, previewMaterials]);

  useEffect(() => {
    return () => {
      previewMaterials.forEach((material) => disposePreviewMaterial(material));
    };
  }, [previewMaterials]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) {
    return null;
  }

  return (
    <group position={[-pivot.x, -pivot.y, -pivot.z]}>
      <mesh
        castShadow={renderMode === "lit"}
        onClick={(event) => {
          if (!interactive) {
            return;
          }

          event.stopPropagation();

          if (renderMode === "wireframe") {
            const nodeIds = resolveIntersectedIds(event.intersections);

            if (nodeIds.length > 0) {
              onSelectNodes(nodeIds);
              return;
            }
          }

          onSelectNodes([mesh.nodeId]);
        }}
        onDoubleClick={(event) => {
          if (!interactive) {
            return;
          }

          event.stopPropagation();
          onFocusNode(mesh.nodeId);
        }}
        onPointerOut={(event) => {
          if (!interactive) {
            return;
          }

          event.stopPropagation();
          onHoverEnd();
        }}
        onPointerOver={(event) => {
          if (!interactive) {
            return;
          }

          event.stopPropagation();
          onHoverStart(mesh.nodeId);
        }}
        ref={setMeshObject}
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
        ) : null}
      </mesh>
      {renderMode === "lit" ? <SurfaceDecalOverlays decals={mesh.surface?.decals ?? []} /> : null}
    </group>
  );
}

function SurfaceDecalOverlays({ decals }: { decals: NonNullable<DerivedRenderMesh["surface"]>["decals"] }) {
  if (!decals?.length) {
    return null;
  }

  return (
    <>
      {decals.map((decal) => (
        <SurfaceDecalOverlay decal={decal} key={decal.id} />
      ))}
    </>
  );
}

function SurfaceDecalOverlay({ decal }: { decal: NonNullable<NonNullable<DerivedRenderMesh["surface"]>["decals"]>[number] }) {
  const meshRef = useRef<Mesh | null>(null);
  const material = useMemo(() => {
    const texture = decal.texture ? loadPreviewTexture(decal.texture, true) : undefined;
    const decalMaterial = new MeshBasicMaterial({
      blending: decal.blendMode === "add" ? AdditiveBlending : decal.blendMode === "multiply" ? MultiplyBlending : NormalBlending,
      color: decal.color ?? "#ffffff",
      depthWrite: false,
      map: texture,
      opacity: decal.opacity ?? 1,
      side: DoubleSide,
      toneMapped: false,
      transparent: true
    });

    return decalMaterial;
  }, [decal.blendMode, decal.color, decal.opacity, decal.texture]);

  useEffect(() => {
    const object = meshRef.current;

    if (!object) {
      return;
    }

    const position = new Vector3(decal.position.x, decal.position.y, decal.position.z);
    const normal = new Vector3(decal.normal.x, decal.normal.y, decal.normal.z).normalize();
    object.position.copy(position);
    object.up.set(decal.up?.x ?? 0, decal.up?.y ?? 1, decal.up?.z ?? 0).normalize();
    object.lookAt(position.clone().add(normal));
  }, [
    decal.normal.x,
    decal.normal.y,
    decal.normal.z,
    decal.position.x,
    decal.position.y,
    decal.position.z,
    decal.up?.x,
    decal.up?.y,
    decal.up?.z
  ]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return (
    <mesh ref={meshRef} renderOrder={8} scale={[decal.size.x, decal.size.y, 1]}>
      <planeGeometry args={[1, 1]} />
      <primitive attach="material" object={material} />
    </mesh>
  );
}

function RenderModelBody({
  hovered,
  interactive,
  mesh,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  mesh: DerivedRenderMesh;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  const loadedScene = useLoadedModelScene(
    mesh.modelPath,
    mesh.modelFormat === "obj" ? "obj" : "glb",
    mesh.modelTexturePath,
    mesh.modelMtlText
  );
  const loadedBounds = useMemo(
    () => (loadedScene ? computeModelBounds(loadedScene) : undefined),
    [loadedScene]
  );
  const modelScene = useMemo(() => {
    if (!loadedScene) {
      return undefined;
    }

    return createPreviewModelScene(loadedScene, renderMode);
  }, [loadedScene, renderMode]);
  const modelBounds = loadedBounds ?? (mesh.modelSize && mesh.modelCenter
    ? {
        center: mesh.modelCenter,
        size: mesh.modelSize
      }
    : undefined);
  const center = modelBounds?.center ?? mesh.modelCenter ?? { x: 0, y: 0, z: 0 };
  const showOverlay = renderMode === "wireframe" || selected || hovered;
  const overlayColor = selected ? "#f97316" : hovered ? "#67e8f9" : "#94a3b8";
  const overlayScene = useMemo(() => {
    if (!loadedScene || !showOverlay) {
      return undefined;
    }

    const clone = cloneModelSceneGraph(loadedScene);

    clone.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return;
      }

      child.castShadow = false;
      child.receiveShadow = false;
      child.renderOrder = renderMode === "wireframe" ? 0 : 6;
      child.material = createModelOverlayMaterial(child.material, overlayColor, renderMode);
    });

    return clone;
  }, [loadedScene, overlayColor, renderMode, showOverlay]);

  useEffect(() => {
    return () => {
      disposeSceneMeshMaterials(modelScene);
    };
  }, [modelScene]);

  useEffect(() => {
    return () => {
      disposeOverlaySceneMaterials(overlayScene);
    };
  }, [overlayScene]);

  const handleClick = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onSelectNodes([mesh.nodeId]);
  }, [interactive, mesh.nodeId, onSelectNodes]);

  const handleDoubleClick = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onFocusNode(mesh.nodeId);
  }, [interactive, mesh.nodeId, onFocusNode]);

  const handlePointerOver = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onHoverStart(mesh.nodeId);
  }, [interactive, mesh.nodeId, onHoverStart]);

  const handlePointerOut = useCallback((event: any) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onHoverEnd();
  }, [interactive, onHoverEnd]);

  return (
    <group>
      {modelScene && renderMode === "lit" ? (
        <primitive
          object={modelScene}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          position={[-center.x, -center.y, -center.z]}
        />
      ) : null}
      {overlayScene ? (
        <primitive
          object={overlayScene}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          position={[-center.x, -center.y, -center.z]}
        />
      ) : null}
      {!modelScene ? (
        <mesh
          castShadow={renderMode === "lit"}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          receiveShadow={renderMode === "lit"}
        >
          <boxGeometry args={toTuple(mesh.modelSize ?? { x: 1.4, y: 1.4, z: 1.4 })} />
          <meshStandardMaterial color={mesh.material.color} metalness={0.08} roughness={0.72} />
        </mesh>
      ) : null}
      {!modelScene && showOverlay ? (
        <mesh
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          position={[-center.x, -center.y, -center.z]}
        >
          <boxGeometry args={toTuple(modelBounds?.size ?? mesh.modelSize ?? { x: 1.4, y: 1.4, z: 1.4 })} />
          <meshBasicMaterial
            color={overlayColor}
            depthWrite={false}
            opacity={renderMode === "wireframe" ? 1 : 0.85}
            toneMapped={false}
            transparent={renderMode !== "wireframe"}
            wireframe
          />
        </mesh>
      ) : null}
    </group>
  );
}

function useLoadedModelScene(
  path?: string,
  format: "glb" | "obj" = "glb",
  texturePath?: string,
  mtlText?: string
) {
  const { gl } = useThree();
  const [scene, setScene] = useState<Object3D>();

  useEffect(() => {
    if (!path) {
      setScene(undefined);
      return;
    }

    const cacheKey = `${format}:${path}:${texturePath ?? ""}:${mtlText ?? ""}`;
    const cachedScene = modelSceneCache.get(cacheKey);

    if (cachedScene) {
      setScene(cachedScene);
      return;
    }

    let cancelled = false;

    void loadModelScene(path, format, gl as Ktx2CompressionRenderer, texturePath, mtlText)
      .then((loadedScene) => {
        if (cancelled) {
          return;
        }

        modelSceneCache.set(cacheKey, loadedScene);
        setScene(loadedScene);
      })
      .catch(() => {
        if (!cancelled) {
          setScene(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [format, gl, mtlText, path, texturePath]);

  return scene;
}

async function loadModelScene(
  path: string,
  format: "glb" | "obj",
  renderer: Ktx2CompressionRenderer,
  texturePath?: string,
  mtlText?: string
) {
  if (format === "obj") {
    const { MTLLoader, OBJLoader } = await loadObjPreviewTools();
    const objLoader = new OBJLoader();

    if (mtlText) {
      const materialCreator = new MTLLoader().parse(
        patchMtlTextureReferences(mtlText, texturePath),
        ""
      );
      materialCreator.preload();
      objLoader.setMaterials(materialCreator);
    }

    const object = await objLoader.loadAsync(path);

    if (!mtlText && texturePath) {
      const texture = await loadModelTexture(texturePath);

      object.traverse((child) => {
        if (child instanceof Mesh) {
          child.material = new MeshStandardMaterial({
            map: texture,
            metalness: 0.12,
            roughness: 0.76
          });
        }
      });
    }

    return object;
  }

  const { gltfLoader } = await loadGltfPreviewTools(renderer);
  const gltf = await gltfLoader.loadAsync(path);
  return gltf.scene;
}

async function loadModelTexture(path: string) {
  const cached = modelTextureCache.get(path);

  if (cached) {
    return cached;
  }

  const texture = await modelTextureLoader.loadAsync(path);
  texture.colorSpace = SRGBColorSpace;
  modelTextureCache.set(path, texture);
  return texture;
}

function patchMtlTextureReferences(mtlText: string, texturePath?: string) {
  if (!texturePath) {
    return mtlText;
  }

  const mapPattern =
    /^(map_Ka|map_Kd|map_d|map_Bump|bump)\s+.+$/gm;
  const hasDiffuseMap = /^map_Kd\s+.+$/m.test(mtlText);
  const normalized = mtlText.replace(mapPattern, (line) => {
    if (line.startsWith("map_Kd ")) {
      return `map_Kd ${texturePath}`;
    }

    return line;
  });

  return hasDiffuseMap
    ? normalized
    : `${normalized.trim()}\nmap_Kd ${texturePath}\n`;
}

function computeModelBounds(scene: Object3D) {
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  return {
    center: { x: center.x, y: center.y, z: center.z },
    size: {
      x: Math.max(size.x, 0.001),
      y: Math.max(size.y, 0.001),
      z: Math.max(size.z, 0.001)
    }
  };
}

function buildModelParts(scene: Object3D | undefined, center: { x: number; y: number; z: number }) {
  if (!scene) {
    return [] as Array<{
      disposeGeometry?: boolean;
      geometry: BufferGeometry;
      key: string;
      localMatrix: Matrix4;
      material: Mesh["material"];
    }>;
  }

  const root = cloneModelSceneGraph(scene);
  root.position.set(-center.x, -center.y, -center.z);
  root.updateMatrixWorld(true);

  const parts: Array<{
    disposeGeometry?: boolean;
    geometry: BufferGeometry;
    key: string;
    localMatrix: Matrix4;
    material: Mesh["material"];
  }> = [];
  let partIndex = 0;

  root.traverse((child) => {
    if (!(child instanceof Mesh) || !(child.geometry instanceof BufferGeometry)) {
      return;
    }

    const geometry = child instanceof SkinnedMesh ? bakeSkinnedMeshGeometry(child) : child.geometry;

    parts.push({
      disposeGeometry: child instanceof SkinnedMesh,
      geometry,
      key: `${partIndex}:${child.name || "mesh"}`,
      localMatrix: child.matrixWorld.clone(),
      material: child.material
    });
    partIndex += 1;
  });

  return parts;
}

function cloneModelSceneGraph(scene: Object3D) {
  const clone = cloneModelSceneImpl(scene);
  clone.updateMatrixWorld(true);
  return clone;
}

function createPreviewModelScene(scene: Object3D, renderMode: ViewportRenderMode) {
  const clone = cloneModelSceneGraph(scene);

  clone.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    child.castShadow = renderMode === "lit";
    child.receiveShadow = renderMode === "lit";
    child.material = clonePreviewModelMaterial(child.material);
    tunePreviewModelMaterial(child.material);
  });

  return clone;
}

function clonePreviewModelMaterial(material: Mesh["material"]) {
  if (Array.isArray(material)) {
    return material.map((entry) => entry.clone());
  }

  return material.clone();
}

function tunePreviewModelMaterial(material: Mesh["material"]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => tunePreviewSingleMaterial(entry));
    return;
  }

  tunePreviewSingleMaterial(material);
}

function tunePreviewSingleMaterial(material: Material) {
  if (!(material instanceof MeshStandardMaterial) && !isMeshStandardNodeMaterial(material)) {
    return;
  }

  const tuned = material as Material & { envMapIntensity?: number; roughness: number; needsUpdate: boolean };
  tuned.envMapIntensity = Math.max(tuned.envMapIntensity ?? 1, 1.15);

  if (tuned.roughness > 0.94) {
    tuned.roughness = 0.94;
  }

  tuned.needsUpdate = true;
}

function bakeSkinnedMeshGeometry(mesh: SkinnedMesh) {
  const sourceGeometry = mesh.geometry;
  const positionAttribute = sourceGeometry.getAttribute("position");
  const bakedGeometry = sourceGeometry.clone();
  const bakedPositions = new Float32Array(positionAttribute.count * 3);
  const bakedVertex = new Vector3();

  for (let index = 0; index < positionAttribute.count; index += 1) {
    mesh.getVertexPosition(index, bakedVertex);
    bakedPositions[index * 3] = bakedVertex.x;
    bakedPositions[index * 3 + 1] = bakedVertex.y;
    bakedPositions[index * 3 + 2] = bakedVertex.z;
  }

  bakedGeometry.setAttribute("position", new Float32BufferAttribute(bakedPositions, 3));
  bakedGeometry.deleteAttribute("skinIndex");
  bakedGeometry.deleteAttribute("skinWeight");
  bakedGeometry.deleteAttribute("normal");
  bakedGeometry.computeVertexNormals();
  bakedGeometry.computeBoundingBox();
  bakedGeometry.computeBoundingSphere();

  return bakedGeometry;
}

function createModelOverlayMaterial(material: Mesh["material"], color: string, renderMode: ViewportRenderMode) {
  if (Array.isArray(material)) {
    return material.map((entry) => createSingleModelOverlayMaterial(entry, color, renderMode));
  }

  return createSingleModelOverlayMaterial(material, color, renderMode);
}

function createSingleModelOverlayMaterial(material: Material, color: string, renderMode: ViewportRenderMode) {
  return new MeshBasicMaterial({
    color,
    depthWrite: false,
    opacity: renderMode === "wireframe" ? 1 : 0.85,
    side:
      material instanceof MeshBasicMaterial || material instanceof MeshStandardMaterial || isMeshStandardNodeMaterial(material)
        ? material.side
        : DoubleSide,
    toneMapped: false,
    transparent: renderMode !== "wireframe",
    wireframe: true
  });
}

function disposeOverlaySceneMaterials(scene: Object3D | undefined) {
  if (!scene) {
    return;
  }

  scene.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    if (Array.isArray(child.material)) {
      child.material.forEach((entry) => entry.dispose());
      return;
    }

    child.material.dispose();
  });
}

function disposeSceneMeshMaterials(scene: Object3D | undefined) {
  if (!scene) {
    return;
  }

  scene.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    if (Array.isArray(child.material)) {
      child.material.forEach((entry) => entry.dispose());
      return;
    }

    child.material.dispose();
  });
}

function RenderLightNode({
  hovered,
  interactive,
  light,
  onMeshObjectChange,
  onFocusNode,
  onHoverEnd,
  onHoverStart,
  onSelectNodes,
  renderMode,
  selected
}: {
  hovered: boolean;
  interactive: boolean;
  light: DerivedLight;
  onMeshObjectChange: (nodeId: string, object: Object3D | null) => void;
  onFocusNode: (nodeId: string) => void;
  onHoverEnd: () => void;
  onHoverStart: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  renderMode: ViewportRenderMode;
  selected: boolean;
}) {
  const targetRef = useRef<Object3D | null>(null);
  const lightRef = useRef<any>(null);

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
      targetRef.current.updateMatrixWorld();
    }
  }, [light.nodeId, light.rotation.x, light.rotation.y, light.rotation.z]);

  const markerColor = selected ? "#ffb35a" : hovered ? "#d8f4f0" : light.color;

  return (
    <group
      name={`node:${light.nodeId}`}
      ref={(object) => {
        onMeshObjectChange(light.nodeId, object);
      }}
      onClick={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onSelectNodes([light.nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onFocusNode(light.nodeId);
      }}
      onPointerOut={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverEnd();
      }}
      onPointerOver={(event) => {
        if (!interactive) {
          return;
        }

        event.stopPropagation();
        onHoverStart(light.nodeId);
      }}
      position={toTuple(light.position)}
      rotation={toTuple(light.rotation)}
    >
      <mesh>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.45, 8]} />
        <meshStandardMaterial color="#d8e0ea" metalness={0.1} roughness={0.55} />
      </mesh>

      {renderMode === "lit" && light.data.enabled ? (
        <>
          {light.data.type === "ambient" ? (
            <ambientLight color={light.data.color} intensity={light.data.intensity} />
          ) : null}
          {light.data.type === "hemisphere" ? (
            <hemisphereLight
              args={[light.data.color, light.data.groundColor ?? "#0f1721", light.data.intensity]}
            />
          ) : null}
          {light.data.type === "point" ? (
            <pointLight
              castShadow={light.data.castShadow}
              color={light.data.color}
              decay={light.data.decay}
              distance={light.data.distance}
              intensity={light.data.intensity}
            />
          ) : null}
          {light.data.type === "directional" ? (
            <>
              <directionalLight
                castShadow={light.data.castShadow}
                color={light.data.color}
                intensity={light.data.intensity}
                ref={lightRef}
              />
              <object3D ref={targetRef} position={[0, 0, -6]} />
            </>
          ) : null}
          {light.data.type === "spot" ? (
            <>
              <spotLight
                angle={light.data.angle}
                castShadow={light.data.castShadow}
                color={light.data.color}
                decay={light.data.decay}
                distance={light.data.distance}
                intensity={light.data.intensity}
                penumbra={light.data.penumbra}
                ref={lightRef}
              />
              <object3D ref={targetRef} position={[0, 0, -6]} />
            </>
          ) : null}
        </>
      ) : null}
    </group>
  );
}

function ManualCollider({ mesh }: { mesh: DerivedRenderMesh }) {
  const pivot = resolveMeshPivot(mesh);
  const commonProps = {
    position: [-pivot.x, -pivot.y, -pivot.z] as [number, number, number],
    scale: toTuple(mesh.scale),
    ...resolvePhysicsColliderProps(mesh.physics)
  };

  if (!mesh.primitive || !mesh.physics) {
    return null;
  }

  if (mesh.physics.colliderShape === "ball" && mesh.primitive.kind === "sphere") {
    return <BallCollider args={[mesh.primitive.radius]} {...commonProps} />;
  }

  if (mesh.physics.colliderShape === "cuboid" && mesh.primitive.kind === "box") {
    return (
      <CuboidCollider
        args={[mesh.primitive.size.x * 0.5, mesh.primitive.size.y * 0.5, mesh.primitive.size.z * 0.5]}
        {...commonProps}
      />
    );
  }

  if (mesh.physics.colliderShape === "cylinder" && mesh.primitive.kind === "cylinder") {
    return <CylinderCollider args={[mesh.primitive.height * 0.5, Math.max(mesh.primitive.radiusTop, mesh.primitive.radiusBottom)]} {...commonProps} />;
  }

  if (mesh.physics.colliderShape === "cone" && mesh.primitive.kind === "cone") {
    return <ConeCollider args={[mesh.primitive.height * 0.5, mesh.primitive.radius]} {...commonProps} />;
  }

  return null;
}

function resolvePhysicsColliderProps(physics: DerivedRenderMesh["physics"]) {
  if (!physics) {
    return {};
  }

  return {
    ...(physics.contactSkin !== undefined ? { contactSkin: physics.contactSkin } : {}),
    ...(physics.density !== undefined ? { density: physics.density } : physics.mass !== undefined ? { mass: physics.mass } : {}),
    ...(physics.friction !== undefined ? { friction: physics.friction } : {}),
    ...(physics.restitution !== undefined ? { restitution: physics.restitution } : {}),
    ...(physics.sensor !== undefined ? { sensor: physics.sensor } : {})
  };
}

function useRenderableGeometry(mesh: DerivedRenderMesh, renderMode: ViewportRenderMode) {
  return useMemo(() => {
    let bufferGeometry: BufferGeometry | undefined;

    if (mesh.surface) {
      bufferGeometry = createIndexedGeometry(
        mesh.surface.positions,
        mesh.surface.indices,
        mesh.surface.uvs,
        mesh.surface.groups,
        mesh.surface.colors,
        mesh.surface.blendWeights
      );
    } else if (mesh.primitive?.kind === "box") {
      bufferGeometry = new BoxGeometry(...toTuple(mesh.primitive.size));
    } else if (mesh.primitive?.kind === "sphere") {
      bufferGeometry = new SphereGeometry(mesh.primitive.radius, mesh.primitive.widthSegments, mesh.primitive.heightSegments);
    } else if (mesh.primitive?.kind === "cylinder") {
      bufferGeometry = new CylinderGeometry(
        mesh.primitive.radiusTop,
        mesh.primitive.radiusBottom,
        mesh.primitive.height,
        mesh.primitive.radialSegments
      );
    } else if (mesh.primitive?.kind === "cone") {
      bufferGeometry = new ConeGeometry(mesh.primitive.radius, mesh.primitive.height, mesh.primitive.radialSegments);
    }

    if (!bufferGeometry) {
      return undefined;
    }

    if (renderMode === "lit") {
      bufferGeometry.computeVertexNormals();
    }
    bufferGeometry.computeBoundingBox();
    bufferGeometry.computeBoundingSphere();

    return bufferGeometry;
  }, [mesh.primitive, mesh.surface, renderMode]);
}

function usePreviewMaterials(
  mesh: DerivedRenderMesh,
  renderMode: ViewportRenderMode,
  selected: boolean,
  hovered: boolean
) {
  const previewNodeFactory = useContext(PreviewNodeMaterialContext);

  return useMemo(() => {
    if (renderMode !== "lit") {
      return [];
    }

    const specs = mesh.materials ?? [mesh.material];
    return specs.map((spec) => {
      const blendLayers = spec.blendLayers?.length ?? 0;
      if (previewNodeFactory && blendLayers === 0) {
        return previewNodeFactory(spec, selected, hovered);
      }
      return createClassicPreviewMaterial(spec, selected, hovered);
    });
  }, [hovered, mesh.material, mesh.materials, previewNodeFactory, renderMode, selected]);
}

function useInstancedPreviewMaterials(mesh: DerivedRenderMesh, renderMode: ViewportRenderMode) {
  const previewNodeFactory = useContext(PreviewNodeMaterialContext);

  return useMemo(() => {
    const specs = mesh.materials ?? [mesh.material];

    if (renderMode === "lit") {
      return specs.map((spec) => {
        const blendLayers = spec.blendLayers?.length ?? 0;
        if (previewNodeFactory && blendLayers === 0) {
          return previewNodeFactory(spec, false, false);
        }
        return createClassicPreviewMaterial(spec, false, false);
      });
    }

    return specs.map((spec) => new MeshBasicMaterial({
      color: "#ffffff",
      depthWrite: false,
      side: resolvePreviewMaterialSide(spec.side),
      toneMapped: false,
      wireframe: true
    }));
  }, [mesh.material, mesh.materials, previewNodeFactory, renderMode]);
}

function resolveMeshPivot(mesh: DerivedRenderMesh) {
  return resolveTransformPivot({
    pivot: mesh.pivot,
    position: mesh.position,
    rotation: mesh.rotation,
    scale: mesh.scale
  });
}

function resolveIntersectedIds(intersections: Array<{ instanceId?: number; object: Object3D }>) {
  const ids: string[] = [];
  const seen = new Set<string>();

  intersections.forEach((intersection) => {
    const id =
      typeof intersection.instanceId === "number"
        ? resolveInstancedNodeIdFromObject(intersection.object, intersection.instanceId)
        : resolveSceneObjectIdFromObject(intersection.object);

    if (!id || seen.has(id)) {
      return;
    }

    seen.add(id);
    ids.push(id);
  });

  return ids;
}

function resolveSceneObjectIdFromObject(object: Object3D | null) {
  let current: Object3D | null = object;

  while (current) {
    if (current.name.startsWith("node:")) {
      return current.name.slice(5);
    }

    if (current.name.startsWith("entity:")) {
      return current.name.slice(7);
    }

    current = current.parent;
  }

  return undefined;
}

function resolveInstancedNodeIdFromObject(object: Object3D | null, instanceId: number) {
  let current: Object3D | null = object;

  while (current) {
    const instanceNodeIds = (current.userData.webHammer as { instanceNodeIds?: string[] } | undefined)?.instanceNodeIds;

    if (Array.isArray(instanceNodeIds)) {
      return instanceNodeIds[instanceId];
    }

    current = current.parent;
  }

  return undefined;
}

function isMeshStandardNodeMaterial(material: Material): boolean {
  return Boolean((material as unknown as { isMeshStandardNodeMaterial?: boolean }).isMeshStandardNodeMaterial);
}

function isPreviewDisposableMaterial(material: Material): boolean {
  return (
    material instanceof MeshBasicMaterial || material instanceof MeshStandardMaterial || isMeshStandardNodeMaterial(material)
  );
}

function createClassicPreviewMaterial(spec: DerivedRenderMesh["material"], selected: boolean, hovered: boolean) {
  const blendLayerTextures = (spec.blendLayers ?? [])
    .slice(0, 4)
    .map((layer) => (layer.colorTexture ? loadPreviewTexture(layer.colorTexture, true) : undefined));
  const colorTexture = spec.colorTexture
    ? loadPreviewTexture(spec.colorTexture, true)
    : spec.category === "blockout"
      ? loadPreviewTexture(createBlockoutTextureDataUri(spec.color, spec.edgeColor ?? "#f5f2ea", spec.edgeThickness ?? 0.018), true)
      : blendLayerTextures.some(Boolean)
        ? loadPreviewTexture(WHITE_PREVIEW_TEXTURE_DATA_URI, true)
        : undefined;
  const normalTexture = spec.normalTexture ? loadPreviewTexture(spec.normalTexture, false) : undefined;
  const metalnessTexture = spec.metalnessTexture ? loadPreviewTexture(spec.metalnessTexture, false) : undefined;
  const roughnessTexture = spec.roughnessTexture ? loadPreviewTexture(spec.roughnessTexture, false) : undefined;
  const transparent = spec.transparent ?? false;
  const opacity = transparent ? spec.opacity ?? 1 : 1;

  const material = new MeshStandardMaterial({
    color: colorTexture ? "#ffffff" : selected ? "#ffb35a" : hovered ? "#d8f4f0" : spec.color,
    emissive: selected ? "#f69036" : hovered ? "#2a7f74" : spec.emissiveColor ?? "#000000",
    emissiveIntensity: selected ? 0.38 : hovered ? 0.14 : spec.emissiveIntensity ?? 0,
    envMapIntensity: spec.wireframe ? 0 : 1.15,
    flatShading: spec.flatShaded,
    metalness: spec.wireframe ? 0.05 : spec.metalness,
    opacity,
    roughness: spec.wireframe ? 0.45 : spec.roughness,
    side: resolvePreviewMaterialSide(spec.side),
    transparent,
    vertexColors: true,
    wireframe: spec.wireframe,
    ...(colorTexture ? { map: colorTexture } : {}),
    ...(metalnessTexture ? { metalnessMap: metalnessTexture } : {}),
    ...(normalTexture ? { normalMap: normalTexture } : {}),
    ...(roughnessTexture ? { roughnessMap: roughnessTexture } : {})
  });

  installSurfaceBlendShader(material, spec, blendLayerTextures);
  return material;
}

function installSurfaceBlendShader(
  material: MeshStandardMaterial,
  spec: DerivedRenderMesh["material"],
  blendLayerTextures: Array<ReturnType<typeof loadPreviewTexture> | undefined>
) {
  const layers = (spec.blendLayers ?? []).slice(0, 4);

  if (layers.length === 0) {
    return;
  }

  material.onBeforeCompile = (shader) => {
    layers.forEach((layer, index) => {
      shader.uniforms[`surfaceBlendColor${index}`] = { value: new Color(layer.color ?? spec.color) };
      shader.uniforms[`surfaceBlendMap${index}`] = { value: blendLayerTextures[index] ?? null };
      shader.uniforms[`surfaceBlendMetalness${index}`] = { value: layer.metalness ?? spec.metalness };
      shader.uniforms[`surfaceBlendRoughness${index}`] = { value: layer.roughness ?? spec.roughness };
      shader.uniforms[`surfaceBlendUseMap${index}`] = { value: Boolean(blendLayerTextures[index]) };
    });

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec4 surfaceBlend;
varying vec4 vSurfaceBlend;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vSurfaceBlend = surfaceBlend;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec4 vSurfaceBlend;
uniform vec3 surfaceBlendColor0;
uniform vec3 surfaceBlendColor1;
uniform vec3 surfaceBlendColor2;
uniform vec3 surfaceBlendColor3;
uniform float surfaceBlendMetalness0;
uniform float surfaceBlendMetalness1;
uniform float surfaceBlendMetalness2;
uniform float surfaceBlendMetalness3;
uniform float surfaceBlendRoughness0;
uniform float surfaceBlendRoughness1;
uniform float surfaceBlendRoughness2;
uniform float surfaceBlendRoughness3;
uniform sampler2D surfaceBlendMap0;
uniform sampler2D surfaceBlendMap1;
uniform sampler2D surfaceBlendMap2;
uniform sampler2D surfaceBlendMap3;
uniform bool surfaceBlendUseMap0;
uniform bool surfaceBlendUseMap1;
uniform bool surfaceBlendUseMap2;
uniform bool surfaceBlendUseMap3;

vec4 readSurfaceBlendLayer(vec3 layerColor, sampler2D layerMap, bool useMap) {
  vec4 layer = vec4(layerColor, 1.0);
#ifdef USE_MAP
  if (useMap) {
    layer *= texture2D(layerMap, vMapUv);
  }
#endif
  return layer;
}`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
vec4 surfaceMixedColor = diffuseColor;
surfaceMixedColor = mix(surfaceMixedColor, readSurfaceBlendLayer(surfaceBlendColor0, surfaceBlendMap0, surfaceBlendUseMap0), clamp(vSurfaceBlend.x, 0.0, 1.0));
surfaceMixedColor = mix(surfaceMixedColor, readSurfaceBlendLayer(surfaceBlendColor1, surfaceBlendMap1, surfaceBlendUseMap1), clamp(vSurfaceBlend.y, 0.0, 1.0));
surfaceMixedColor = mix(surfaceMixedColor, readSurfaceBlendLayer(surfaceBlendColor2, surfaceBlendMap2, surfaceBlendUseMap2), clamp(vSurfaceBlend.z, 0.0, 1.0));
surfaceMixedColor = mix(surfaceMixedColor, readSurfaceBlendLayer(surfaceBlendColor3, surfaceBlendMap3, surfaceBlendUseMap3), clamp(vSurfaceBlend.w, 0.0, 1.0));
diffuseColor = surfaceMixedColor;`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, surfaceBlendRoughness0, clamp(vSurfaceBlend.x, 0.0, 1.0));
roughnessFactor = mix(roughnessFactor, surfaceBlendRoughness1, clamp(vSurfaceBlend.y, 0.0, 1.0));
roughnessFactor = mix(roughnessFactor, surfaceBlendRoughness2, clamp(vSurfaceBlend.z, 0.0, 1.0));
roughnessFactor = mix(roughnessFactor, surfaceBlendRoughness3, clamp(vSurfaceBlend.w, 0.0, 1.0));`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, surfaceBlendMetalness0, clamp(vSurfaceBlend.x, 0.0, 1.0));
metalnessFactor = mix(metalnessFactor, surfaceBlendMetalness1, clamp(vSurfaceBlend.y, 0.0, 1.0));
metalnessFactor = mix(metalnessFactor, surfaceBlendMetalness2, clamp(vSurfaceBlend.z, 0.0, 1.0));
metalnessFactor = mix(metalnessFactor, surfaceBlendMetalness3, clamp(vSurfaceBlend.w, 0.0, 1.0));`
      );
  };
  material.customProgramCacheKey = () => `surface-blend:${layers.map((layer) => `${layer.id}:${layer.colorTexture ?? layer.color ?? ""}`).join("|")}`;
}

function resolvePreviewMaterialSide(side?: MaterialRenderSide): Side {
  switch (side) {
    case "back":
      return BackSide;
    case "double":
      return DoubleSide;
    default:
      return FrontSide;
  }
}

function disposePreviewMaterial(material: Material) {
  material.dispose();
}

function applyObjectTransform(object: Object3D, transform: Transform) {
  object.position.set(transform.position.x, transform.position.y, transform.position.z);
  object.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
  object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
  object.updateMatrixWorld();
}

function resolveViewDirection(yaw: number, pitch: number, target: Vector3) {
  return target.set(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  ).normalize();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isTextInputTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}
