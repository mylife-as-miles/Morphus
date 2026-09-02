import { createSceneDocumentSnapshot, createSeedSceneDocument, type SceneDocumentSnapshot } from "@blud/editor-core";
import {
  createDefaultSceneSettings,
  makeTransform,
  vec3,
  type Asset,
  type Entity,
  type GroupNode,
  type LightNode,
  type LightNodeData,
  type Material,
  type PrimitiveNode,
  type SceneHook,
  type Vec3
} from "@blud/shared";
import { parse as parseHtml } from "parse5";
import JSZip from "jszip";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import type { HtmlJsImportInput, HtmlJsImportResult, ImportDiagnostic, ImportReport } from "./types";

type BabelTraverse = typeof import("@babel/traverse").default;

const traverse = resolveTraverse(traverseModule);

type ProjectFile = {
  bytes: Uint8Array;
  mimeType?: string;
  normalizedPath: string;
  path: string;
  text?: string;
};

type JSImportMap = {
  named: Map<string, { imported: string; source: string }>;
  namespaces: Map<string, string>;
};

type MaterialRecord = {
  definition: Material;
  variableName?: string;
};

type GeometryRecord =
  | {
      kind: "primitive";
      radialSegments?: number;
      shape: PrimitiveNode["data"]["shape"];
      size: Vec3;
    }
  | {
      kind: "unsupported";
    };

type PendingNodeRecord =
  | {
      kind: "group";
      name: string;
      parentVariableName?: string;
      transform: ReturnType<typeof makeTransform>;
      variableName: string;
    }
  | {
      data: LightNodeData;
      kind: "light";
      name: string;
      parentVariableName?: string;
      transform: ReturnType<typeof makeTransform>;
      variableName: string;
    }
  | {
      kind: "model";
      name: string;
      parentVariableName?: string;
      path: string;
      transform: ReturnType<typeof makeTransform>;
      variableName: string;
    }
  | {
      kind: "primitive";
      materialVariableName?: string;
      name: string;
      parentVariableName?: string;
      radialSegments?: number;
      shape: PrimitiveNode["data"]["shape"];
      size: Vec3;
      transform: ReturnType<typeof makeTransform>;
      variableName: string;
    };

type CameraRecord = {
  name: string;
  transform: ReturnType<typeof makeTransform>;
  variableName: string;
};

type ModelLoadRecord = {
  asset: Asset;
  name: string;
  parentVariableName?: string;
  variableName: string;
};

type Analysis = {
  animationLoopDetected: boolean;
  cameras: CameraRecord[];
  detectedLibraries: Set<string>;
  diagnostics: ImportDiagnostic[];
  gravity?: Vec3;
  materials: MaterialRecord[];
  modelLoads: ModelLoadRecord[];
  needsCustomScript: boolean;
  nodes: Map<string, PendingNodeRecord>;
  physicsDetected: boolean;
};

const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const SCRIPT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const MODEL_EXTENSIONS = new Set([".glb", ".gltf", ".obj"]);

export async function analyzeHtmlJsProject(input: HtmlJsImportInput): Promise<HtmlJsImportResult> {
  const project = await loadProject(input);
  const entrypoint = resolveEntrypoint(project, input.entrypoint);

  if (!entrypoint) {
    return {
      report: {
        detectedLibraries: [],
        diagnostics: [createDiagnostic("entrypoint-ambiguous", "warning", "Multiple HTML/JS entrypoints were found. Choose one before importing.")],
        entrypointOptions: collectEntrypointCandidates(project),
        projectName: project.projectName,
        status: "entrypoint-required",
        summary: emptySummary()
      }
    };
  }

  const analysis = analyzeProject(project, entrypoint);

  return {
    report: buildReport(project.projectName, entrypoint, analysis, undefined)
  };
}

export async function importHtmlJsProject(input: HtmlJsImportInput): Promise<HtmlJsImportResult> {
  const project = await loadProject(input);
  const entrypoint = resolveEntrypoint(project, input.entrypoint);

  if (!entrypoint) {
    return {
      report: {
        detectedLibraries: [],
        diagnostics: [createDiagnostic("entrypoint-ambiguous", "warning", "Multiple HTML/JS entrypoints were found. Choose one before importing.")],
        entrypointOptions: collectEntrypointCandidates(project),
        projectName: project.projectName,
        status: "entrypoint-required",
        summary: emptySummary()
      }
    };
  }

  const analysis = analyzeProject(project, entrypoint);
  const snapshot = buildSnapshot(project.projectName, entrypoint, analysis);

  return {
    report: buildReport(project.projectName, entrypoint, analysis, snapshot),
    snapshot
  };
}

async function loadProject(input: HtmlJsImportInput) {
  const normalizedFiles = input.files.map((file) => ({
    ...file,
    normalizedPath: normalizePath(file.path)
  }));
  const zipInput = normalizedFiles.find((file) => file.normalizedPath.endsWith(".zip"));
  const files = new Map<string, ProjectFile>();

  if (zipInput && normalizedFiles.length === 1) {
    const archive = await JSZip.loadAsync(zipInput.bytes);
    const entries = Object.values(archive.files).filter((entry) => !entry.dir);

    await Promise.all(
      entries.map(async (entry) => {
        const bytes = await entry.async("uint8array");
        const normalizedPath = normalizePath(entry.name);
        files.set(normalizedPath, {
          bytes,
          mimeType: guessMimeType(normalizedPath),
          normalizedPath,
          path: normalizedPath,
          text: isTextFile(normalizedPath) ? decodeText(bytes) : undefined
        });
      })
    );
  } else {
    normalizedFiles.forEach((file) => {
      files.set(file.normalizedPath, {
        ...file,
        text: isTextFile(file.normalizedPath) ? decodeText(file.bytes) : undefined
      });
    });
  }

  return {
    files,
    projectName: input.projectName?.trim() || deriveLabelFromPath(Array.from(files.keys())[0] ?? "Imported Project", "Imported Project")
  };
}

function collectEntrypointCandidates(project: Awaited<ReturnType<typeof loadProject>>) {
  return Array.from(project.files.keys()).filter((path) => hasExtension(path, HTML_EXTENSIONS) || hasExtension(path, SCRIPT_EXTENSIONS)).sort();
}

function resolveEntrypoint(project: Awaited<ReturnType<typeof loadProject>>, requested?: string) {
  const requestedPath = requested ? normalizePath(requested) : undefined;

  if (requestedPath && project.files.has(requestedPath)) {
    return requestedPath;
  }

  const candidates = collectEntrypointCandidates(project);
  const indexHtml = candidates.find((candidate) => basename(candidate).toLowerCase() === "index.html");

  if (indexHtml) {
    return indexHtml;
  }

  const htmlCandidates = candidates.filter((candidate) => hasExtension(candidate, HTML_EXTENSIONS));
  const scriptCandidates = candidates.filter((candidate) => hasExtension(candidate, SCRIPT_EXTENSIONS));

  if (htmlCandidates.length === 1) {
    return htmlCandidates[0];
  }

  if (htmlCandidates.length === 0 && scriptCandidates.length === 1) {
    return scriptCandidates[0];
  }

  return undefined;
}

function analyzeProject(project: Awaited<ReturnType<typeof loadProject>>, entrypoint: string): Analysis {
  const analysis: Analysis = {
    animationLoopDetected: false,
    cameras: [],
    detectedLibraries: new Set(),
    diagnostics: [],
    materials: [],
    modelLoads: [],
    needsCustomScript: false,
    nodes: new Map(),
    physicsDetected: false
  };
  const scripts = collectScripts(project, entrypoint);

  if (scripts.length === 0) {
    analysis.diagnostics.push(createDiagnostic("entrypoint-empty", "warning", `No local scripts were found for "${entrypoint}".`, entrypoint));
  }

  scripts.forEach((script) => analyzeScript(project, entrypoint, script.path, script.content, analysis));
  return analysis;
}

function collectScripts(project: Awaited<ReturnType<typeof loadProject>>, entrypoint: string) {
  const file = project.files.get(entrypoint);

  if (!file) {
    return [];
  }

  if (hasExtension(entrypoint, SCRIPT_EXTENSIONS)) {
    return [{ content: file.text ?? "", path: entrypoint }];
  }

  const scripts: Array<{ content: string; path: string }> = [];
  const root = parseHtml(file.text ?? "");

  walkHtml(root, (node) => {
    if (node?.tagName !== "script") {
      return;
    }

    const attrs = Object.fromEntries((node.attrs ?? []).map((attr: { name: string; value: string }) => [attr.name, attr.value]));
    const scriptType = typeof attrs.type === "string" ? attrs.type : "";

    if (!isJavaScriptScriptType(scriptType)) {
      return;
    }

    if (attrs.src) {
      if (/^https?:\/\//i.test(attrs.src)) {
        scripts.push({ content: "", path: `remote:${attrs.src}` });
        return;
      }

      const resolvedPath = resolveRelativePath(entrypoint, attrs.src);
      const scriptFile = project.files.get(resolvedPath);
      scripts.push({ content: scriptFile?.text ?? "", path: resolvedPath });
      return;
    }

    const content = (node.childNodes ?? [])
      .filter((child: { nodeName: string }) => child.nodeName === "#text")
      .map((child: { value?: string }) => child.value ?? "")
      .join("\n")
      .trim();

    if (content) {
      scripts.push({ content, path: `${entrypoint}#inline-script-${scripts.length + 1}` });
    }
  });

  return scripts;
}

function analyzeScript(
  project: Awaited<ReturnType<typeof loadProject>>,
  entrypoint: string,
  path: string,
  content: string,
  analysis: Analysis
) {
  if (path.startsWith("remote:")) {
    analysis.diagnostics.push(createDiagnostic("remote-script-skipped", "warning", `Remote script "${path.slice(7)}" was skipped during import.`, entrypoint));
    analysis.needsCustomScript = true;
    return;
  }

  if (!content.trim()) {
    analysis.diagnostics.push(createDiagnostic("script-missing", "warning", `Script "${path}" could not be resolved.`, path));
    return;
  }

  const importMap: JSImportMap = { named: new Map(), namespaces: new Map() };
  const geometryByVariable = new Map<string, GeometryRecord>();
  const materialByVariable = new Map<string, MaterialRecord>();
  const gltfLoaders = new Set<string>();
  const rapierWorlds = new Set<string>();
  let ast: t.File;

  try {
    ast = parse(content, {
      plugins: ["classProperties", "jsx", "topLevelAwait", "typescript"],
      sourceType: "unambiguous"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    analysis.diagnostics.push(
      createDiagnostic("script-parse-failed", "warning", `Script "${path}" could not be parsed during import: ${message}`, path)
    );
    analysis.needsCustomScript = true;
    return;
  }

  traverse(ast, {
    AssignmentExpression(path) {
      if (t.isMemberExpression(path.node.left) && t.isIdentifier(path.node.left.object) && t.isIdentifier(path.node.left.property, { name: "name" }) && t.isStringLiteral(path.node.right)) {
        const target = analysis.nodes.get(path.node.left.object.name);

        if (target) {
          target.name = path.node.right.value;
        }
      }
    },
    CallExpression(path) {
      analyzeRuntimeCall(project, entrypoint, analysis, gltfLoaders, rapierWorlds, path.hub, path.node);
    },
    OptionalCallExpression(path) {
      analyzeRuntimeCall(project, entrypoint, analysis, gltfLoaders, rapierWorlds, path.hub, path.node);
    },
    ImportDeclaration(path) {
      const source = path.node.source.value;

      if (source.includes("three")) {
        analysis.detectedLibraries.add("three");
      }

      if (source.toLowerCase().includes("rapier")) {
        analysis.detectedLibraries.add("rapier");
      }

      path.node.specifiers.forEach((specifier) => {
        if (t.isImportNamespaceSpecifier(specifier)) {
          importMap.namespaces.set(specifier.local.name, source);
        } else if (t.isImportDefaultSpecifier(specifier)) {
          importMap.named.set(specifier.local.name, { imported: "default", source });
        } else if (t.isImportSpecifier(specifier)) {
          importMap.named.set(specifier.local.name, {
            imported: t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value,
            source
          });
        }
      });
    },
    NewExpression(path) {
      const constructorInfo = resolveConstructor(path.node.callee, importMap);
      const variableName = t.isVariableDeclarator(path.parentPath.node) && t.isIdentifier(path.parentPath.node.id) ? path.parentPath.node.id.name : undefined;

      if (!constructorInfo) {
        return;
      }

      if (constructorInfo.source === "three") {
        analysis.detectedLibraries.add("three");
      }

      if (constructorInfo.source === "rapier") {
        analysis.detectedLibraries.add("rapier");
      }

      switch (constructorInfo.imported) {
        case "AmbientLight":
        case "DirectionalLight":
        case "HemisphereLight":
        case "PointLight":
        case "SpotLight":
          if (variableName) {
            analysis.nodes.set(variableName, {
              data: createLightData(constructorInfo.imported, path.node.arguments),
              kind: "light",
              name: deriveLabelFromVariable(variableName),
              transform: makeTransform(vec3(0, 0, 0)),
              variableName
            });
          }
          return;
        case "BoxGeometry":
        case "ConeGeometry":
        case "CylinderGeometry":
        case "SphereGeometry":
          if (variableName) {
            geometryByVariable.set(variableName, createGeometryRecord(constructorInfo.imported, path.node.arguments));
          }
          return;
        case "GLTFLoader":
          if (variableName) {
            gltfLoaders.add(variableName);
          }
          return;
        case "Group":
          if (variableName) {
            analysis.nodes.set(variableName, { kind: "group", name: deriveLabelFromVariable(variableName), transform: makeTransform(vec3(0, 0, 0)), variableName });
          }
          return;
        case "Mesh":
          if (variableName) {
            analysis.nodes.set(variableName, createMeshRecord(variableName, path.node.arguments, geometryByVariable));
          }
          return;
        case "MeshBasicMaterial":
        case "MeshLambertMaterial":
        case "MeshPhongMaterial":
        case "MeshStandardMaterial":
          if (variableName) {
            const record = { definition: createMaterialDefinition(variableName, path.node.arguments[0]), variableName };
            materialByVariable.set(variableName, record);
            analysis.materials.push(record);
          }
          return;
        case "PerspectiveCamera":
          if (variableName) {
            analysis.cameras.push({ name: deriveLabelFromVariable(variableName), transform: makeTransform(vec3(0, 0, 0)), variableName });
          }
          return;
        case "Scene":
          analysis.nodes.set(variableName ?? "__scene__", { kind: "group", name: deriveLabelFromPath(entrypoint, "Imported Root"), transform: makeTransform(vec3(0, 0, 0)), variableName: variableName ?? "__scene__" });
          return;
        case "WebGLRenderer":
        case "WebGPURenderer":
          analysis.needsCustomScript = true;
          analysis.diagnostics.push(
            createDiagnostic(
              "renderer-ownership",
              "warning",
              `${constructorInfo.imported} ownership was stripped. Dream Studio keeps viewport renderer ownership.`,
              resolveTraversalFilename(path.hub, entrypoint)
            )
          );
          return;
      }

      if (constructorInfo.source === "rapier" && constructorInfo.imported === "World") {
        analysis.physicsDetected = true;
        analysis.needsCustomScript = true;

        if (variableName) {
          rapierWorlds.add(variableName);
        }

        const gravity = readVec3Object(path.node.arguments[0]);

        if (gravity) {
          analysis.gravity = gravity;
        }
      }
    }
  });

  analysis.nodes.forEach((node) => {
    if (node.kind === "primitive" && node.materialVariableName) {
      const material = materialByVariable.get(node.materialVariableName);

      if (!material) {
        return;
      }

      node.materialVariableName = material.variableName;
    }
  });
}

function analyzeRuntimeCall(
  project: Awaited<ReturnType<typeof loadProject>>,
  entrypoint: string,
  analysis: Analysis,
  gltfLoaders: Set<string>,
  rapierWorlds: Set<string>,
  hub: unknown,
  node: t.CallExpression | t.OptionalCallExpression
) {
  const calleeName = resolveMemberName(node.callee);
  const calleeObjectName = resolveMemberObjectName(node.callee);
  const calleePropertyName = resolveMemberPropertyName(node.callee);
  const filename = resolveTraversalFilename(hub, entrypoint);

  if (calleeName === "requestAnimationFrame" || calleeName.endsWith(".setAnimationLoop")) {
    analysis.animationLoopDetected = true;
    analysis.needsCustomScript = true;
  }

  if (calleeName.startsWith("document.") || calleeName.includes("document.body") || calleeName.endsWith(".appendChild")) {
    analysis.diagnostics.push(
      createDiagnostic("dom-ownership", "warning", "DOM ownership code was omitted. Dream Studio keeps renderer and shell ownership.", filename)
    );
    analysis.needsCustomScript = true;
  }

  if (calleeName.endsWith(".position.set") || calleeName.endsWith(".rotation.set") || calleeName.endsWith(".scale.set")) {
    applyTransformSetter(analysis.nodes, analysis.cameras, calleeName, node.arguments);
  }

  if (calleeName.endsWith(".add") && calleeObjectName) {
    node.arguments.forEach((argument) => {
      if (t.isIdentifier(argument)) {
        const target = analysis.nodes.get(argument.name);

        if (target) {
          target.parentVariableName = calleeObjectName;
        }
      }
    });
  }

  if (calleeName.endsWith(".load") && calleeObjectName && gltfLoaders.has(calleeObjectName)) {
    const pathArgument = node.arguments[0];

    if (!t.isStringLiteral(pathArgument)) {
      analysis.needsCustomScript = true;
      analysis.diagnostics.push(
        createDiagnostic("dynamic-model-load", "warning", "Dynamic GLTFLoader paths require a manual follow-up after import.", filename)
      );
      return;
    }

    const asset = createModelAsset(project, resolveRelativePath(filename, pathArgument.value), analysis.modelLoads.length + 1);

    if (!asset) {
      analysis.diagnostics.push(
        createDiagnostic(
          "model-asset-missing",
          "warning",
          `Model asset "${pathArgument.value}" was referenced but not found in the imported payload.`,
          filename
        )
      );
      return;
    }

    analysis.modelLoads.push({
      asset,
      name: deriveLabelFromPath(pathArgument.value, "Imported Model"),
      parentVariableName: resolveAddParentFromCallback(node.arguments[1]),
      variableName: `model-load-${analysis.modelLoads.length + 1}`
    });
  }

  if (calleeObjectName && rapierWorlds.has(calleeObjectName)) {
    analysis.physicsDetected = true;

    if (calleePropertyName === "createVehicleController") {
      analysis.diagnostics.push(
        createDiagnostic(
          "advanced-physics",
          "warning",
          "Rapier vehicle logic was compiled into a generated custom_script hook.",
          filename
        )
      );
      analysis.needsCustomScript = true;
    }
  }
}

function buildSnapshot(projectName: string, entrypoint: string, analysis: Analysis): SceneDocumentSnapshot | undefined {
  const hasImportableContent = analysis.nodes.size > 0 || analysis.modelLoads.length > 0 || analysis.cameras.length > 0;

  if (!hasImportableContent) {
    return undefined;
  }

  const seed = createSeedSceneDocument();
  const rootId = "node:import:root";
  const root: GroupNode = {
    data: {},
    hooks: [],
    id: rootId,
    kind: "group",
    name: projectName,
    transform: makeTransform(vec3(0, 0, 0))
  };

  if (analysis.gravity) {
    seed.settings = {
      ...createDefaultSceneSettings(),
      world: {
        ...seed.settings.world,
        gravity: structuredClone(analysis.gravity),
        physicsEnabled: true
      }
    };
  }

  seed.addNode(root);

  const materialIdByVariable = new Map<string, string>();
  analysis.materials.forEach((record, index) => {
    const id = `material:import:${slugify(record.definition.name || `material-${index + 1}`)}`;
    seed.setMaterial({
      ...record.definition,
      id,
      name: record.definition.name || `Imported Material ${index + 1}`
    });

    if (record.variableName) {
      materialIdByVariable.set(record.variableName, id);
    }
  });

  const nodeIdByVariable = new Map<string, string>([["__scene__", rootId]]);
  const assetIdByVariable = new Map<string, string>();

  analysis.modelLoads.forEach((record) => {
    const assetId = `asset:model:import:${slugify(record.name)}`;
    seed.setAsset({ ...record.asset, id: assetId });
    assetIdByVariable.set(record.variableName, assetId);
  });

  analysis.nodes.forEach((record, variableName) => {
    const parentId = nodeIdByVariable.get(record.parentVariableName ?? "__scene__") ?? rootId;
    const nodeId = `node:import:${slugify(record.name || variableName)}`;

    if (record.kind === "group") {
      seed.addNode({ data: {}, id: nodeId, kind: "group", name: record.name, parentId, transform: structuredClone(record.transform) });
    } else if (record.kind === "light") {
      const node: LightNode = { data: structuredClone(record.data), id: nodeId, kind: "light", name: record.name, parentId, transform: structuredClone(record.transform) };
      seed.addNode(node);
    } else if (record.kind === "model") {
      const assetId = assetIdByVariable.get(variableName);

      if (assetId) {
        seed.addNode({ data: { assetId, path: "" }, id: nodeId, kind: "model", name: record.name, parentId, transform: structuredClone(record.transform) });
      }
    } else {
      seed.addNode({
        data: {
          materialId: record.materialVariableName ? materialIdByVariable.get(record.materialVariableName) : undefined,
          radialSegments: record.radialSegments,
          role: "prop",
          shape: record.shape,
          size: structuredClone(record.size),
          uvScale: { x: 1, y: 1 }
        },
        id: nodeId,
        kind: "primitive",
        name: record.name,
        parentId,
        transform: structuredClone(record.transform)
      });
    }

    nodeIdByVariable.set(variableName, nodeId);
  });

  analysis.modelLoads.forEach((record) => {
    const assetId = assetIdByVariable.get(record.variableName);

    if (!assetId) {
      return;
    }

    seed.addNode({
      data: { assetId, path: record.asset.path },
      id: `node:import:model:${slugify(record.name)}`,
      kind: "model",
      name: record.name,
      parentId: nodeIdByVariable.get(record.parentVariableName ?? "__scene__") ?? rootId,
      transform: makeTransform(vec3(0, 0, 0))
    });
  });

  analysis.cameras.forEach((camera, index) => {
    if (index > 0) {
      analysis.diagnostics.push(createDiagnostic("additional-camera", "info", `Additional imported camera "${camera.name}" was reported but not converted into a runtime spawn.`, entrypoint));
      return;
    }

    const entity: Entity = {
      hooks: [],
      id: "entity:import:player-spawn",
      name: camera.name || "Player Spawn",
      properties: { enabled: true, team: "player" },
      transform: structuredClone(camera.transform),
      type: "player-spawn"
    };
    seed.addEntity(entity);
  });

  if (analysis.needsCustomScript) {
    root.hooks = [...(root.hooks ?? []), createCustomScriptHook(projectName, entrypoint, analysis)];
    seed.touch();
  }

  const snapshot = createSceneDocumentSnapshot(seed);
  snapshot.metadata = { projectName, projectSlug: slugify(projectName) };
  return snapshot;
}

function buildReport(projectName: string, entrypoint: string, analysis: Analysis, snapshot?: SceneDocumentSnapshot): ImportReport {
  return {
    detectedLibraries: Array.from(analysis.detectedLibraries.values()).sort(),
    diagnostics: analysis.diagnostics,
    entrypoint,
    projectName,
    status:
      !snapshot
        ? "unsupported"
        : analysis.needsCustomScript || analysis.diagnostics.some((diagnostic) => diagnostic.severity !== "info")
          ? "partially-imported"
          : "imported",
    summary: {
      assets: snapshot?.assets.filter((asset) => asset.id.startsWith("asset:model:import:")).length ?? 0,
      cameras: analysis.cameras.length,
      customScripts: snapshot?.nodes.flatMap((node) => node.hooks ?? []).filter((hook) => hook.type === "custom_script").length ?? 0,
      entities: snapshot?.entities.length ?? 0,
      lights: snapshot?.nodes.filter((node) => node.kind === "light").length ?? 0,
      materials: snapshot?.materials.filter((material) => material.id.startsWith("material:import:")).length ?? 0,
      nodes: snapshot?.nodes.length ?? 0,
      unsupportedFeatures: analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "info").length
    }
  };
}

function createMeshRecord(
  variableName: string,
  args: Array<t.Expression | t.SpreadElement | t.ArgumentPlaceholder>,
  geometryByVariable: Map<string, GeometryRecord>
): PendingNodeRecord {
  const geometry = readGeometryArgument(args[0], geometryByVariable);

  if (!geometry || geometry.kind === "unsupported") {
    return {
      kind: "group",
      name: deriveLabelFromVariable(variableName),
      transform: makeTransform(vec3(0, 0, 0)),
      variableName
    };
  }

  return {
    kind: "primitive",
    materialVariableName: t.isIdentifier(args[1]) ? args[1].name : undefined,
    name: deriveLabelFromVariable(variableName),
    radialSegments: geometry.radialSegments,
    shape: geometry.shape,
    size: structuredClone(geometry.size),
    transform: makeTransform(vec3(0, 0, 0)),
    variableName
  };
}

function createLightData(type: string, args: Array<t.Expression | t.SpreadElement | t.ArgumentPlaceholder>): LightNodeData {
  const color = normalizeColor(args[0]) ?? (type === "HemisphereLight" ? "#9ec5f8" : "#ffd089");
  const intensity = readNumber(args[1]) ?? (type === "AmbientLight" ? 0.6 : 1);

  switch (type) {
    case "AmbientLight":
      return { castShadow: false, color, enabled: true, intensity, type: "ambient" };
    case "DirectionalLight":
      return { castShadow: true, color, enabled: true, intensity, type: "directional" };
    case "HemisphereLight":
      return {
        castShadow: false,
        color,
        enabled: true,
        groundColor: normalizeColor(args[1]) ?? "#0f1721",
        intensity: readNumber(args[2]) ?? 0.8,
        type: "hemisphere"
      };
    case "SpotLight":
      return {
        angle: readNumber(args[4]) ?? Math.PI / 6,
        castShadow: true,
        color,
        decay: readNumber(args[5]) ?? 1.2,
        distance: readNumber(args[2]) ?? 18,
        enabled: true,
        intensity,
        penumbra: readNumber(args[6]) ?? 0.2,
        type: "spot"
      };
    default:
      return {
        castShadow: true,
        color,
        decay: readNumber(args[3]) ?? 1.2,
        distance: readNumber(args[2]) ?? 18,
        enabled: true,
        intensity,
        type: "point"
      };
  }
}

function createMaterialDefinition(variableName: string, input?: t.Expression | t.SpreadElement | t.ArgumentPlaceholder): Material {
  if (t.isObjectExpression(input)) {
    return {
      color: normalizeColor(readProperty(input, "color")) ?? "#c7d2e0",
      emissiveColor: normalizeColor(readProperty(input, "emissive")),
      emissiveIntensity: readNumber(readProperty(input, "emissiveIntensity")) ?? 0,
      id: `material:import:${slugify(variableName)}`,
      metalness: readNumber(readProperty(input, "metalness")) ?? 0,
      name: deriveLabelFromVariable(variableName),
      opacity: readNumber(readProperty(input, "opacity")) ?? 1,
      roughness: readNumber(readProperty(input, "roughness")) ?? 0.85,
      transparent: readBoolean(readProperty(input, "transparent")) ?? false
    };
  }

  return {
    color: "#c7d2e0",
    id: `material:import:${slugify(variableName)}`,
    metalness: 0,
    name: deriveLabelFromVariable(variableName),
    roughness: 0.85
  };
}

function createModelAsset(project: Awaited<ReturnType<typeof loadProject>>, relativePath: string, index: number): Asset | undefined {
  const normalizedPath = normalizePath(relativePath);
  const file = project.files.get(normalizedPath);

  if (!file) {
    return undefined;
  }

  return {
    id: `asset:model:import:${slugify(deriveLabelFromPath(relativePath, `model-${index}`))}`,
    metadata: {
      importedFromHtmlJs: true,
      modelFormat: relativePath.toLowerCase().endsWith(".obj") ? "obj" : "glb",
      previewColor: "#7f8ea3"
    },
    path: createDataUrl(file.bytes, file.mimeType ?? guessMimeType(relativePath)),
    type: "model"
  };
}

function createCustomScriptHook(projectName: string, entrypoint: string, analysis: Analysis): SceneHook {
  const capabilities = new Set<string>(["logging", "scene"]);

  if (analysis.physicsDetected) {
    capabilities.add("physics");
  }

  if (analysis.modelLoads.length > 0) {
    capabilities.add("assets");
  }

  const source = [
    "export default class ImportedHtmlJsBridge {",
    "  onInit(node, engine) {",
    "    this.node = node;",
    "    this.engine = engine;",
    `    engine.log?.("info", "Initialized imported HTML/JS bridge.", ${JSON.stringify({
      entrypoint,
      libraries: Array.from(analysis.detectedLibraries.values()).sort(),
      projectName
    })});`,
    "  }",
    "  onTick(_dt) {}",
    "  onDispose() {}",
    "}"
  ].join("\n");

  return {
    config: {
      capabilities: Array.from(capabilities.values()),
      diagnostics: analysis.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        file: diagnostic.file ?? "",
        message: diagnostic.message,
        severity: diagnostic.severity
      })),
      origin: {
        entrypoint,
        generatedBy: "htmljs-importer",
        projectName
      },
      runtime: "blob.custom_script.v1",
      source
    },
    enabled: true,
    id: "hook:custom_script:imported",
    type: "custom_script"
  };
}

function resolveConstructor(callee: t.Expression | t.V8IntrinsicIdentifier, importMap: JSImportMap) {
  if (t.isIdentifier(callee)) {
    const imported = importMap.named.get(callee.name);

    if (imported?.source.includes("three")) {
      return { imported: imported.imported === "default" ? callee.name : imported.imported, source: "three" as const };
    }

    if (imported?.source.toLowerCase().includes("rapier")) {
      return { imported: imported.imported === "default" ? "default" : imported.imported, source: "rapier" as const };
    }

    return undefined;
  }

  if (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && t.isIdentifier(callee.property)) {
    const namespaceSource = importMap.namespaces.get(callee.object.name);

    if (namespaceSource?.includes("three") || callee.object.name === "THREE") {
      return { imported: callee.property.name, source: "three" as const };
    }

    if (namespaceSource?.toLowerCase().includes("rapier") || callee.object.name === "RAPIER") {
      return { imported: callee.property.name, source: "rapier" as const };
    }
  }

  return undefined;
}

function createGeometryRecord(type: string, args: Array<t.Expression | t.SpreadElement | t.ArgumentPlaceholder>): GeometryRecord {
  const numeric = (index: number, fallback: number) => readNumber(args[index]) ?? fallback;

  switch (type) {
    case "BoxGeometry":
      return { kind: "primitive", shape: "cube", size: vec3(numeric(0, 1), numeric(1, 1), numeric(2, 1)) };
    case "SphereGeometry": {
      const diameter = numeric(0, 0.5) * 2;
      return { kind: "primitive", radialSegments: Math.max(8, Math.round(numeric(1, 24))), shape: "sphere", size: vec3(diameter, diameter, diameter) };
    }
    case "CylinderGeometry": {
      const radius = Math.max(numeric(0, 0.5), numeric(1, 0.5)) * 2;
      return { kind: "primitive", radialSegments: Math.max(8, Math.round(numeric(3, 24))), shape: "cylinder", size: vec3(radius, numeric(2, 1), radius) };
    }
    case "ConeGeometry":
      return { kind: "primitive", radialSegments: Math.max(8, Math.round(numeric(2, 24))), shape: "cone", size: vec3(numeric(0, 0.5) * 2, numeric(1, 1), numeric(0, 0.5) * 2) };
    default:
      return { kind: "unsupported" };
  }
}

function readGeometryArgument(argument: t.Expression | t.SpreadElement | t.ArgumentPlaceholder | undefined, geometryByVariable: Map<string, GeometryRecord>) {
  if (!argument) {
    return undefined;
  }

  if (t.isIdentifier(argument)) {
    return geometryByVariable.get(argument.name);
  }

  if (t.isNewExpression(argument)) {
    const constructorName = t.isIdentifier(argument.callee)
      ? argument.callee.name
      : t.isMemberExpression(argument.callee) && t.isIdentifier(argument.callee.property)
        ? argument.callee.property.name
        : undefined;

    return constructorName ? createGeometryRecord(constructorName, argument.arguments) : undefined;
  }

  return undefined;
}

function applyTransformSetter(
  nodes: Map<string, PendingNodeRecord>,
  cameras: CameraRecord[],
  calleeName: string,
  args: Array<t.Expression | t.SpreadElement | t.ArgumentPlaceholder>
) {
  const targetName = calleeName.split(".")[0];
  const tuple = readVec3Args(args);

  if (!tuple) {
    return;
  }

  const node = nodes.get(targetName);

  if (node) {
    if (calleeName.endsWith(".position.set")) {
      node.transform.position = tuple;
    } else if (calleeName.endsWith(".rotation.set")) {
      node.transform.rotation = tuple;
    } else if (calleeName.endsWith(".scale.set")) {
      node.transform.scale = tuple;
    }
  }

  const camera = cameras.find((entry) => entry.variableName === targetName);

  if (camera) {
    if (calleeName.endsWith(".position.set")) {
      camera.transform.position = tuple;
    } else if (calleeName.endsWith(".rotation.set")) {
      camera.transform.rotation = tuple;
    } else if (calleeName.endsWith(".scale.set")) {
      camera.transform.scale = tuple;
    }
  }
}

function resolveAddParentFromCallback(argument?: t.Expression | t.SpreadElement | t.ArgumentPlaceholder) {
  if (!argument || !t.isFunction(argument)) {
    return undefined;
  }

  let parentName: string | undefined;

  traverse(t.file(t.program([t.expressionStatement(t.callExpression(argument, []))])), {
    noScope: true,
    CallExpression(path) {
      if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.object) && t.isIdentifier(path.node.callee.property, { name: "add" })) {
        parentName = path.node.callee.object.name;
        path.stop();
      }
    }
  });

  return parentName;
}

function resolveMemberName(expression: t.Expression | t.V8IntrinsicIdentifier | t.OptionalMemberExpression): string {
  if (t.isIdentifier(expression)) {
    return expression.name;
  }

  if (!t.isMemberExpression(expression) && !t.isOptionalMemberExpression(expression)) {
    return "";
  }

  const objectName = resolveMemberName(expression.object as t.Expression | t.V8IntrinsicIdentifier | t.OptionalMemberExpression);
  const propertyName = t.isIdentifier(expression.property) ? expression.property.name : t.isStringLiteral(expression.property) ? expression.property.value : "";
  return objectName ? `${objectName}.${propertyName}` : propertyName;
}

function resolveMemberObjectName(expression: t.Expression | t.V8IntrinsicIdentifier | t.OptionalMemberExpression) {
  if (!t.isMemberExpression(expression) && !t.isOptionalMemberExpression(expression)) {
    return undefined;
  }

  return t.isIdentifier(expression.object) ? expression.object.name : undefined;
}

function resolveMemberPropertyName(expression: t.Expression | t.V8IntrinsicIdentifier | t.OptionalMemberExpression) {
  if (!t.isMemberExpression(expression) && !t.isOptionalMemberExpression(expression)) {
    return undefined;
  }

  if (t.isIdentifier(expression.property)) {
    return expression.property.name;
  }

  if (t.isStringLiteral(expression.property)) {
    return expression.property.value;
  }

  return undefined;
}

function readProperty(objectExpression: t.ObjectExpression, propertyName: string) {
  const property = objectExpression.properties.find(
    (candidate): candidate is t.ObjectProperty =>
      t.isObjectProperty(candidate) &&
      ((t.isIdentifier(candidate.key) && candidate.key.name === propertyName) ||
        (t.isStringLiteral(candidate.key) && candidate.key.value === propertyName))
  );

  return property && t.isExpression(property.value) ? property.value : undefined;
}

function readNumber(input?: t.Expression | t.SpreadElement | t.ArgumentPlaceholder) {
  if (!input || !t.isExpression(input)) {
    return undefined;
  }

  if (t.isNumericLiteral(input)) {
    return input.value;
  }

  if (t.isUnaryExpression(input) && input.operator === "-" && t.isNumericLiteral(input.argument)) {
    return input.argument.value * -1;
  }

  return undefined;
}

function readBoolean(input?: t.Expression) {
  return t.isBooleanLiteral(input) ? input.value : undefined;
}

function readVec3Args(args: Array<t.Expression | t.SpreadElement | t.ArgumentPlaceholder>) {
  const x = readNumber(args[0]);
  const y = readNumber(args[1]);
  const z = readNumber(args[2]);

  if (x === undefined || y === undefined || z === undefined) {
    return undefined;
  }

  return vec3(x, y, z);
}

function readVec3Object(input?: t.Expression | t.SpreadElement | t.ArgumentPlaceholder) {
  if (!t.isObjectExpression(input)) {
    return undefined;
  }

  const x = readNumber(readProperty(input, "x"));
  const y = readNumber(readProperty(input, "y"));
  const z = readNumber(readProperty(input, "z"));

  if (x === undefined || y === undefined || z === undefined) {
    return undefined;
  }

  return vec3(x, y, z);
}

function normalizeColor(input?: t.Expression | t.SpreadElement | t.ArgumentPlaceholder) {
  if (!input || !t.isExpression(input)) {
    return undefined;
  }

  if (t.isStringLiteral(input)) {
    return input.value;
  }

  if (t.isNumericLiteral(input)) {
    return `#${input.value.toString(16).padStart(6, "0").slice(-6)}`;
  }

  if (t.isUnaryExpression(input) && input.operator === "-" && t.isNumericLiteral(input.argument)) {
    return `#${Math.abs(input.argument.value).toString(16).padStart(6, "0").slice(-6)}`;
  }

  return undefined;
}

function createDiagnostic(code: string, severity: ImportDiagnostic["severity"], message: string, file?: string): ImportDiagnostic {
  return { code, file, message, severity };
}

function emptySummary(): ImportReport["summary"] {
  return {
    assets: 0,
    cameras: 0,
    customScripts: 0,
    entities: 0,
    lights: 0,
    materials: 0,
    nodes: 0,
    unsupportedFeatures: 0
  };
}

function hasExtension(path: string, extensions: Set<string>) {
  return Array.from(extensions.values()).some((extension) => path.toLowerCase().endsWith(extension));
}

function isTextFile(path: string) {
  return hasExtension(path, HTML_EXTENSIONS) || hasExtension(path, SCRIPT_EXTENSIONS) || path.toLowerCase().endsWith(".json");
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/{2,}/g, "/");
}

function basename(path: string) {
  const parts = normalizePath(path).split("/");
  return parts[parts.length - 1] ?? path;
}

function dirname(path: string) {
  const parts = normalizePath(path).split("/");
  parts.pop();
  return parts.join("/");
}

function resolveRelativePath(fromPath: string, targetPath: string) {
  if (targetPath.startsWith("/")) {
    return normalizePath(targetPath.slice(1));
  }

  const segments = `${dirname(fromPath)}/${targetPath}`.split("/");
  const resolved: string[] = [];

  segments.forEach((segment) => {
    if (!segment || segment === ".") {
      return;
    }

    if (segment === "..") {
      resolved.pop();
      return;
    }

    resolved.push(segment);
  });

  return normalizePath(resolved.join("/"));
}

function walkHtml(node: any, visitor: (node: any) => void) {
  visitor(node);
  node.childNodes?.forEach((child: any) => walkHtml(child, visitor));
}

function guessMimeType(path: string) {
  const extension = `.${path.toLowerCase().split(".").pop() ?? ""}`;

  if (extension === ".html" || extension === ".htm") {
    return "text/html";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".gltf") {
    return "model/gltf+json";
  }

  if (extension === ".glb") {
    return "model/gltf-binary";
  }

  if (extension === ".obj") {
    return "text/plain";
  }

  if (extension === ".json") {
    return "application/json";
  }

  return "application/javascript";
}

function isJavaScriptScriptType(type: string) {
  const normalized = type.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return (
    normalized === "module" ||
    normalized === "text/javascript" ||
    normalized === "application/javascript" ||
    normalized === "text/ecmascript" ||
    normalized === "application/ecmascript"
  );
}

function createDataUrl(bytes: Uint8Array, mimeType: string) {
  if (typeof Buffer !== "undefined") {
    return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return `data:${mimeType};base64,${btoa(binary)}`;
}

function deriveLabelFromVariable(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function deriveLabelFromPath(path: string, fallback: string) {
  const label = basename(path).replace(/\.[^.]+$/, "");
  return label ? deriveLabelFromVariable(label) : fallback;
}

function slugify(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "item";
}

function resolveTraversalFilename(hub: unknown, fallback: string) {
  const typedHub = hub as {
    file?: {
      opts?: {
        filename?: string;
      };
    };
    getFilename?: () => string | undefined;
  };

  return typedHub.getFilename?.() || typedHub.file?.opts?.filename || fallback;
}

function resolveTraverse(moduleValue: unknown): BabelTraverse {
  if (typeof moduleValue === "function") {
    return moduleValue as unknown as BabelTraverse;
  }

  if (moduleValue && typeof moduleValue === "object") {
    const defaultExport = (moduleValue as { default?: unknown }).default;

    if (typeof defaultExport === "function") {
      return defaultExport as unknown as BabelTraverse;
    }

    if (defaultExport && typeof defaultExport === "object") {
      const nestedDefaultExport = (defaultExport as { default?: unknown }).default;

      if (typeof nestedDefaultExport === "function") {
        return nestedDefaultExport as unknown as BabelTraverse;
      }
    }
  }

  throw new Error("Failed to resolve @babel/traverse runtime export.");
}
