import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  isArticraftMaterializeRequest,
  type ArticraftMaterializeRequest,
  type ArticraftMaterializeResponse,
  type ArticraftPartInput
} from "../src/lib/articraft-contract.js";

type PythonRunner = {
  command: string;
  argsPrefix: string[];
  label: string;
};

type SpawnResult = {
  stdout: string;
  stderr: string;
};

const BRIDGE_TIMEOUT_MS = Number(process.env.ARTICRAFT_BRIDGE_TIMEOUT_MS ?? 180_000);

export async function materializeArticraftAsset(
  payload: unknown
): Promise<ArticraftMaterializeResponse> {
  if (!isArticraftMaterializeRequest(payload)) {
    throw new Error("Invalid Articraft materialization request.");
  }

  const request = normalizeRequest(payload);
  const articraftRoot = resolveArticraftRoot();
  const outputRoot = resolve(process.cwd(), "generated", "articraft-copilot");
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(request.name)}`;
  const runRoot = resolve(outputRoot, runId);
  const modelPath = resolve(runRoot, "model.py");
  const urdfPath = resolve(runRoot, "model.urdf");

  await mkdir(runRoot, { recursive: true });
  await writeFile(modelPath, buildArticraftModelPy(request), "utf8");

  const runner = await runFirstAvailablePythonRunner(articraftRoot, modelPath, urdfPath);
  const compilerPayload = parseCompilerPayload(runner.stdout);
  const urdfXml = await readFile(urdfPath, "utf8");
  const parts = await Promise.all(
    request.parts.map(async (part) => {
      const meshPath = resolve(runRoot, "assets", "meshes", `${slugify(part.id)}.obj`);
      if (!existsSync(meshPath)) {
        return part;
      }

      const mesh = await readFile(meshPath);
      return {
        ...part,
        meshPath,
        modelDataUrl: `data:model/obj;base64,${mesh.toString("base64")}`,
        modelMimeType: "model/obj"
      };
    })
  );

  return {
    engine: "articraft",
    joints: request.joints,
    modelPath,
    parts,
    rootDir: runRoot,
    success: true,
    urdfPath,
    urdfXml,
    warnings: compilerPayload.warnings
  };
}

function normalizeRequest(request: ArticraftMaterializeRequest): ArticraftMaterializeRequest {
  return {
    ...request,
    name: request.name.trim(),
    parts: request.parts.map((part) => ({
      ...part,
      color: normalizeHexColor(part.color),
      id: slugify(part.id),
      materialName: part.materialName?.trim() || part.name.trim(),
      name: part.name.trim(),
      parentPartId: part.parentPartId ? slugify(part.parentPartId) : undefined,
      shape: normalizeShape(part.shape),
      sizeX: positive(part.sizeX, 1),
      sizeY: positive(part.sizeY, 1),
      sizeZ: positive(part.sizeZ, 1)
    })),
    joints: request.joints.map((joint) => {
      const type = normalizeJointType(joint.type);
      const limits = normalizeJointLimits(type, joint.lower, joint.upper);

      return {
        ...joint,
        childPartId: slugify(joint.childPartId),
        effort: positive(joint.effort, 1),
        id: slugify(joint.id),
        lower: limits.lower,
        mimicJointId: joint.mimicJointId ? slugify(joint.mimicJointId) : undefined,
        name: joint.name?.trim() || slugify(joint.id),
        parentPartId: slugify(joint.parentPartId),
        type,
        upper: limits.upper,
        velocity: positive(joint.velocity, 1)
      };
    })
  };
}

function resolveArticraftRoot() {
  const candidates = [
    process.env.ARTICRAFT_ROOT,
    resolve(process.cwd(), "../articraft"),
    resolve(process.cwd(), "apps/articraft"),
    resolve(process.cwd(), "../../apps/articraft")
  ].filter((candidate): candidate is string => Boolean(candidate));

  const root = candidates.find((candidate) => existsSync(resolve(candidate, "pyproject.toml")));

  if (!root) {
    throw new Error(
      "Articraft root was not found. Set ARTICRAFT_ROOT to C:\\Users\\MILES\\Documents\\Dream-Studio\\apps\\articraft."
    );
  }

  return root;
}

async function runFirstAvailablePythonRunner(
  articraftRoot: string,
  modelPath: string,
  urdfPath: string
): Promise<SpawnResult> {
  const requestedPython = process.env.ARTICRAFT_PYTHON?.trim();
  const runners: PythonRunner[] = [
    ...(requestedPython
      ? [{
          command: requestedPython,
          argsPrefix: [],
          label: `ARTICRAFT_PYTHON (${basename(requestedPython)})`
        }]
      : []),
    { command: "uv", argsPrefix: ["run", "python"], label: "uv run python" },
    { command: "py", argsPrefix: ["-3.12"], label: "py -3.12" },
    { command: "py", argsPrefix: ["-3.11"], label: "py -3.11" },
    { command: "python", argsPrefix: [], label: "python" }
  ];
  const errors: string[] = [];

  for (const runner of runners) {
    try {
      return await runPythonBridge(runner, articraftRoot, modelPath, urdfPath);
    } catch (error) {
      errors.push(`${runner.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    "Unable to run the Articraft Python engine. Install Articraft with `just setup` or set ARTICRAFT_PYTHON to a Python 3.11/3.12 environment with Articraft dependencies. " +
      errors.join(" | ")
  );
}

function runPythonBridge(
  runner: PythonRunner,
  articraftRoot: string,
  modelPath: string,
  urdfPath: string
) {
  const args = [
    ...runner.argsPrefix,
    "-c",
    PYTHON_COMPILE_BRIDGE,
    modelPath,
    urdfPath
  ];

  return new Promise<SpawnResult>((resolvePromise, reject) => {
    const child = spawn(runner.command, args, {
      cwd: articraftRoot,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1"
      },
      shell: false,
      windowsHide: true
    });
    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out after ${Math.round(BRIDGE_TIMEOUT_MS / 1000)}s`));
    }, BRIDGE_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      errorChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(chunks).toString("utf8");
      const stderr = Buffer.concat(errorChunks).toString("utf8");

      if (code !== 0) {
        reject(new Error((stderr || stdout || `exited with code ${code}`).trim()));
        return;
      }

      resolvePromise({ stderr, stdout });
    });
  });
}

function parseCompilerPayload(stdout: string) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  const lastLine = lines[lines.length - 1] ?? "{}";

  try {
    const parsed = JSON.parse(lastLine) as { warnings?: unknown };
    return {
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : []
    };
  } catch {
    return { warnings: [] };
  }
}

function buildArticraftModelPy(request: ArticraftMaterializeRequest) {
  return `from __future__ import annotations

import json

from sdk import (
    ArticulatedObject,
    ArticulationType,
    AssetContext,
    Box,
    BoxGeometry,
    ConeGeometry,
    Cylinder,
    CylinderGeometry,
    Inertial,
    Material,
    Mimic,
    MotionLimits,
    Origin,
    Sphere,
    SphereGeometry,
    TestContext,
    mesh_from_geometry,
)

SPEC = json.loads(r'''${JSON.stringify(request)}''')
ASSETS = AssetContext.from_script(__file__)
HERE = ASSETS.asset_root


def _shape(part):
    return str(part.get("shape") or "cube").lower()


def _size(part):
    return (
        max(float(part.get("sizeX") or 1.0), 0.001),
        max(float(part.get("sizeY") or 1.0), 0.001),
        max(float(part.get("sizeZ") or 1.0), 0.001),
    )


def _articraft_size(part):
    sx, sy, sz = _size(part)
    return (sx, sz, sy)


def _geometry(part):
    sx, sy, sz = _size(part)
    shape = _shape(part)
    if shape == "sphere":
        return Sphere(max(sx, sy, sz) * 0.5)
    if shape in {"cylinder", "cone"}:
        return Cylinder(radius=max(sx, sz) * 0.5, length=sy)
    return Box(_articraft_size(part))


def _mesh_geometry(part):
    sx, sy, sz = _size(part)
    shape = _shape(part)
    if shape == "sphere":
        return SphereGeometry(max(sx, sy, sz) * 0.5)
    if shape == "cylinder":
        return CylinderGeometry(radius=max(sx, sz) * 0.5, height=sy, radial_segments=32)
    if shape == "cone":
        return ConeGeometry(radius=max(sx, sz) * 0.5, height=sy, radial_segments=32)
    return BoxGeometry(_articraft_size(part))


def _vec_from_editor(prefix, item, default=(0.0, 0.0, 0.0)):
    x = float(item.get(f"{prefix}X", default[0]))
    y = float(item.get(f"{prefix}Y", default[1]))
    z = float(item.get(f"{prefix}Z", default[2]))
    return (x, -z, y)


def _color(part):
    value = str(part.get("color") or "#d7c27a").lstrip("#")
    if len(value) != 6:
        value = "d7c27a"
    r = int(value[0:2], 16) / 255.0
    g = int(value[2:4], 16) / 255.0
    b = int(value[4:6], 16) / 255.0
    return (r, g, b, 1.0)


def build_object_model():
    model = ArticulatedObject(name=${JSON.stringify(slugify(request.name))}, assets=ASSETS)
    materials = {}

    for part in SPEC["parts"]:
        material_name = str(part.get("materialName") or part.get("name") or part["id"])
        material = materials.get(material_name)
        if material is None:
            material = model.material(material_name, rgba=_color(part))
            materials[material_name] = material

        link = model.part(
            part["id"],
            meta={
                "display_name": part.get("name", part["id"]),
                "semantic_role": part.get("semanticRole", ""),
                "editor_position": (part.get("x", 0.0), part.get("y", 0.0), part.get("z", 0.0)),
                "editor_shape": part.get("shape", "cube"),
            },
        )
        mesh = mesh_from_geometry(_mesh_geometry(part), f"{part['id']}.obj")
        link.visual(mesh, material=material, name=f"{part['id']}_visual")
        link.inertial = Inertial.from_geometry(
            _geometry(part),
            mass=max(float(part.get("mass") or 1.0), 0.001),
        )

    for joint in SPEC["joints"]:
        joint_type = str(joint.get("type") or "fixed")
        if joint_type == "ball":
            joint_type = "floating"
        limits = None
        if joint_type in {"revolute", "continuous", "prismatic"}:
            lower = joint.get("lower")
            upper = joint.get("upper")
            if joint_type == "continuous":
                lower = None
                upper = None
            limits = MotionLimits(
                effort=max(float(joint.get("effort") or 1.0), 0.001),
                velocity=max(float(joint.get("velocity") or 1.0), 0.001),
                lower=None if lower is None else float(lower),
                upper=None if upper is None else float(upper),
            )
        mimic = None
        if joint.get("mimicJointId"):
            mimic = Mimic(
                joint=str(joint["mimicJointId"]),
                multiplier=float(joint.get("mimicMultiplier") or 1.0),
                offset=float(joint.get("mimicOffset") or 0.0),
            )
        model.articulation(
            str(joint["id"]),
            ArticulationType(joint_type),
            parent=str(joint["parentPartId"]),
            child=str(joint["childPartId"]),
            origin=Origin(xyz=_vec_from_editor("origin", joint)),
            axis=_vec_from_editor("axis", joint, default=(0.0, 1.0, 0.0)),
            motion_limits=limits,
            mimic=mimic,
            meta={"display_name": joint.get("name", joint["id"])},
        )

    return model


object_model = build_object_model()


def run_tests():
    ctx = TestContext(object_model, asset_root=HERE)
    ctx.check_model_valid()
    ctx.check_mesh_files_exist()
    return ctx.report()
`;
}

const PYTHON_COMPILE_BRIDGE = `
from __future__ import annotations

import json
import sys
from pathlib import Path

from agent.compiler import compile_urdf_report

model_path = Path(sys.argv[1]).resolve()
urdf_path = Path(sys.argv[2]).resolve()
report = compile_urdf_report(
    model_path,
    sdk_package="sdk",
    run_checks=False,
    ignore_geom_qc=True,
    target="full",
    rewrite_visual_glb=False,
)
urdf_path.write_text(report.urdf_xml, encoding="utf-8")
print(json.dumps({"warnings": [str(item) for item in report.warnings]}))
`;

function positive(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeShape(value: string) {
  const shape = value === "box" ? "cube" : value.toLowerCase();
  return ["cone", "cube", "cylinder", "sphere"].includes(shape) ? shape : "cube";
}

function normalizeJointType(value: string) {
  return ["ball", "continuous", "fixed", "prismatic", "revolute"].includes(value)
    ? value
    : "fixed";
}

function normalizeJointLimits(type: string, lower: number | undefined, upper: number | undefined) {
  if (type === "revolute") {
    return {
      lower: lower ?? -1.0471975512,
      upper: upper ?? 1.0471975512
    };
  }

  if (type === "prismatic") {
    return {
      lower: lower ?? -0.5,
      upper: upper ?? 0.5
    };
  }

  return {
    lower: undefined,
    upper: undefined
  };
}

function normalizeHexColor(value: string | undefined) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "articraft-asset";
}
