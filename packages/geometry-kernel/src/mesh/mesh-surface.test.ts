import { describe, expect, test } from "bun:test";
import { vec3 } from "@blud/shared";
import { createEditableMeshFromPolygons } from "./editable-mesh";
import {
  markEditableMeshUvSeams,
  normalizeEditableMeshTexelDensity,
  packEditableMeshUvs,
  paintEditableMeshTextureBlend,
  paintEditableMeshVertexColors,
  projectEditableMeshUvs,
  smartUnwrapEditableMesh,
  upsertEditableMeshBlendLayer
} from "./mesh-surface";

describe("mesh surface authoring", () => {
  test("projects, packs, and normalizes explicit UVs", () => {
    const mesh = createPlaneMesh();
    const projected = projectEditableMeshUvs(mesh, { mode: "planar" });
    const packed = packEditableMeshUvs(projected, { margin: 0.02 });
    const normalized = normalizeEditableMeshTexelDensity(packed, { pixelsPerMeter: 512, textureResolution: 1024 });

    expect(projected.faces[0]?.uvs).toHaveLength(4);
    expect(packed.faces[0]?.uvIslandId).toBeDefined();
    expect(normalized.surface?.texelDensity?.pixelsPerMeter).toBe(512);
  });

  test("smart unwrap marks hard/boundary seams", () => {
    const mesh = createPlaneMesh();
    const unwrapped = smartUnwrapEditableMesh(mesh);

    expect(unwrapped.surface?.uvSeams?.length).toBeGreaterThan(0);
    expect(unwrapped.faces[0]?.uvs).toHaveLength(4);
  });

  test("paints vertex colors and normalized blend weights", () => {
    const mesh = upsertEditableMeshBlendLayer(createPlaneMesh(), {
      color: "#ff0000",
      id: "blend:red",
      name: "Red"
    });
    const colored = paintEditableMeshVertexColors(mesh, ["quad"], { a: 1, b: 0, g: 0.5, r: 1 });
    const blended = paintEditableMeshTextureBlend(colored, ["quad"], "blend:red", 1);

    expect(colored.faces[0]?.vertexColors?.[0]?.r).toBe(1);
    expect(blended.faces[0]?.blendWeights?.[0]?.["blend:red"]).toBe(1);
  });

  test("stores seam edges deterministically", () => {
    const mesh = markEditableMeshUvSeams(createPlaneMesh(), [["a", "b"], ["d", "c"]], { append: false });

    expect(mesh.surface?.uvSeams?.map((seam) => seam.edge.join(":"))).toEqual(["a:b", "c:d"]);
  });
});

function createPlaneMesh() {
  return createEditableMeshFromPolygons([
    {
      id: "quad",
      positions: [vec3(0, 0, 0), vec3(2, 0, 0), vec3(2, 0, 2), vec3(0, 0, 2)],
      vertexIds: ["a", "b", "c", "d"]
    }
  ]);
}
