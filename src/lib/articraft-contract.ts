export type ArticraftPartInput = {
  id: string;
  name: string;
  parentPartId?: string;
  semanticRole?: string;
  shape: "box" | "cone" | "cube" | "cylinder" | "sphere" | string;
  x: number;
  y: number;
  z: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  pivotX?: number;
  pivotY?: number;
  pivotZ?: number;
  materialId?: string;
  materialName?: string;
  color?: string;
  metalness?: number;
  roughness?: number;
  mass?: number;
};

export type ArticraftJointInput = {
  id: string;
  name?: string;
  type: "ball" | "continuous" | "fixed" | "prismatic" | "revolute" | string;
  parentPartId: string;
  childPartId: string;
  originX?: number;
  originY?: number;
  originZ?: number;
  axisX?: number;
  axisY?: number;
  axisZ?: number;
  lower?: number;
  upper?: number;
  defaultValue?: number;
  effort?: number;
  velocity?: number;
  mimicJointId?: string;
  mimicMultiplier?: number;
  mimicOffset?: number;
};

export type ArticraftMaterializeRequest = {
  name: string;
  prompt?: string;
  x?: number;
  y?: number;
  z?: number;
  showJointGuides?: boolean;
  parts: ArticraftPartInput[];
  joints: ArticraftJointInput[];
};

export type ArticraftMaterializedPart = ArticraftPartInput & {
  meshPath?: string;
  modelDataUrl?: string;
  modelMimeType?: string;
};

export type ArticraftMaterializeResponse = {
  engine: "articraft";
  modelPath: string;
  rootDir: string;
  success: true;
  urdfPath: string;
  urdfXml: string;
  warnings: string[];
  parts: ArticraftMaterializedPart[];
  joints: ArticraftJointInput[];
};

export function isArticraftMaterializeRequest(value: unknown): value is ArticraftMaterializeRequest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    Array.isArray(value.parts) &&
    value.parts.every(isArticraftPartInput) &&
    Array.isArray(value.joints) &&
    value.joints.every(isArticraftJointInput)
  );
}

function isArticraftPartInput(value: unknown): value is ArticraftPartInput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.shape === "string" &&
    finiteNumber(value.x) &&
    finiteNumber(value.y) &&
    finiteNumber(value.z) &&
    finiteNumber(value.sizeX) &&
    finiteNumber(value.sizeY) &&
    finiteNumber(value.sizeZ)
  );
}

function isArticraftJointInput(value: unknown): value is ArticraftJointInput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.parentPartId === "string" &&
    typeof value.childPartId === "string"
  );
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
