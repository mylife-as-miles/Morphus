import { useMemo, useState, type ReactNode } from "react";
import {
  clearEditableMeshUvSeams,
  getFaceVertexIds,
  getFaceVertices,
  markEditableMeshUvSeams,
  normalizeEditableMeshTexelDensity,
  packEditableMeshUvs,
  paintEditableMeshFacesMaterial,
  paintEditableMeshTextureBlend,
  paintEditableMeshVertexColors,
  projectEditableMeshUvs,
  smartUnwrapEditableMesh,
  triangulateMeshFace,
  upsertEditableMeshBlendLayer
} from "@blud/geometry-kernel";
import { isMeshNode, vec2, vec3, type ColorRGBA, type EditableMesh, type GeometryNode, type Material } from "@blud/shared";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type SurfaceAuthoringPanelProps = {
  materials: Material[];
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
  selectedFaceIds: string[];
  selectedMaterialId: string;
  selectedNode?: GeometryNode;
};

export function SurfaceAuthoringPanel({
  materials,
  onUpdateMeshData,
  selectedFaceIds,
  selectedMaterialId,
  selectedNode
}: SurfaceAuthoringPanelProps) {
  const [paintColor, setPaintColor] = useState("#ffffff");
  const [paintStrength, setPaintStrength] = useState(1);
  const [texelDensity, setTexelDensity] = useState(512);
  const meshNode = selectedNode && isMeshNode(selectedNode) ? selectedNode : undefined;
  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId);
  const actionFaceIds = useMemo(
    () => meshNode ? (selectedFaceIds.length > 0 ? selectedFaceIds : meshNode.data.faces.map((face) => face.id)) : [],
    [meshNode, selectedFaceIds]
  );
  const uvPreviewFaces = useMemo(() => {
    if (!meshNode) {
      return [];
    }

    return meshNode.data.faces
      .map((face) => ({
        id: face.id,
        selected: actionFaceIds.includes(face.id),
        uvs: face.uvs
      }))
      .filter((face): face is { id: string; selected: boolean; uvs: Array<{ x: number; y: number }> } => Boolean(face.uvs?.length));
  }, [actionFaceIds, meshNode]);

  const commit = (label: string, recipe: (mesh: EditableMesh) => EditableMesh | undefined) => {
    if (!meshNode) {
      return;
    }

    const next = recipe(meshNode.data);

    if (next) {
      onUpdateMeshData(meshNode.id, next, meshNode.data);
    }
  };

  const createBlendLayer = () => {
    if (!selectedMaterial) {
      return;
    }

    commit("Add blend layer", (mesh) =>
      upsertEditableMeshBlendLayer(mesh, {
        color: selectedMaterial.color,
        colorTexture: selectedMaterial.colorTexture,
        id: `blend:${selectedMaterial.id}`,
        materialId: selectedMaterial.id,
        metalness: selectedMaterial.metalness,
        metalnessTexture: selectedMaterial.metalnessTexture,
        name: selectedMaterial.name,
        normalTexture: selectedMaterial.normalTexture,
        roughness: selectedMaterial.roughness,
        roughnessTexture: selectedMaterial.roughnessTexture
      })
    );
  };

  const createDecal = () => {
    if (!selectedMaterial) {
      return;
    }

    commit("Add projected decal", (mesh) => {
      const faceId = actionFaceIds[0];
      const vertices = faceId ? getFaceVertices(mesh, faceId).map((vertex) => vertex.position) : [];
      const triangulated = faceId ? triangulateMeshFace(mesh, faceId) : undefined;

      if (!faceId || vertices.length === 0 || !triangulated) {
        return mesh;
      }

      const center = vertices.reduce((sum, vertex) => vec3(sum.x + vertex.x, sum.y + vertex.y, sum.z + vertex.z), vec3(0, 0, 0));
      const averaged = vec3(center.x / vertices.length, center.y / vertices.length, center.z / vertices.length);
      const radius = Math.max(
        0.25,
        ...vertices.map((vertex) =>
          Math.sqrt((vertex.x - averaged.x) ** 2 + (vertex.y - averaged.y) ** 2 + (vertex.z - averaged.z) ** 2)
        )
      );

      return {
        ...mesh,
        surface: {
          ...(mesh.surface ?? {}),
          decals: [
            ...(mesh.surface?.decals ?? []),
            {
              blendMode: "normal",
              color: selectedMaterial.color,
              depth: 0.25,
              id: `decal:${Date.now()}`,
              materialId: selectedMaterial.id,
              name: `${selectedMaterial.name} Decal`,
              normal: triangulated.normal,
              opacity: selectedMaterial.opacity ?? 1,
              position: averaged,
              size: vec2(radius * 2, radius * 2),
              targetFaceIds: actionFaceIds,
              texture: selectedMaterial.colorTexture,
              up: vec3(0, 1, 0)
            }
          ]
        }
      };
    });
  };

  if (!meshNode) {
    return (
      <div className="editor-dock-panel flex min-h-0 flex-1 flex-col rounded-[18px] p-4">
        <SectionTitle>Surface Workspace</SectionTitle>
        <div className="editor-dock-note mt-3 rounded-xl px-3 py-3 text-xs text-foreground/60">
          Select an editable mesh to unwrap UVs, assign material slots, paint vertex colors, blend textures, and place live projected decals.
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1 pr-1">
      <div className="space-y-3 px-1 pb-1">
        <SurfaceSection title="UV Editor">
          <UvPreview faces={uvPreviewFaces} />
          <div className="grid grid-cols-2 gap-1.5">
            <Button onClick={() => commit("Smart unwrap", (mesh) => smartUnwrapEditableMesh(mesh, { faceIds: actionFaceIds }))} size="xs" variant="ghost">
              Smart Unwrap
            </Button>
            <Button onClick={() => commit("Pack UVs", (mesh) => packEditableMeshUvs(mesh, { faceIds: actionFaceIds }))} size="xs" variant="ghost">
              Pack Islands
            </Button>
            <Button onClick={() => commit("Planar UVs", (mesh) => projectEditableMeshUvs(mesh, { faceIds: actionFaceIds, mode: "planar" }))} size="xs" variant="ghost">
              Planar
            </Button>
            <Button onClick={() => commit("Box UVs", (mesh) => projectEditableMeshUvs(mesh, { faceIds: actionFaceIds, mode: "box" }))} size="xs" variant="ghost">
              Box
            </Button>
            <Button onClick={() => commit("Cylindrical UVs", (mesh) => projectEditableMeshUvs(mesh, { axis: "y", faceIds: actionFaceIds, mode: "cylindrical" }))} size="xs" variant="ghost">
              Cylindrical
            </Button>
            <Button onClick={() => commit("Normalize texel density", (mesh) => normalizeEditableMeshTexelDensity(mesh, { faceIds: actionFaceIds, pixelsPerMeter: texelDensity }))} size="xs" variant="ghost">
              Normalize
            </Button>
          </div>
          <DragInput compact label="Texel / m" min={1} onChange={setTexelDensity} onValueCommit={() => undefined} precision={0} step={16} value={texelDensity} />
        </SurfaceSection>

        <SurfaceSection title="Seams">
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              onClick={() =>
                commit("Mark boundary seams", (mesh) =>
                  markEditableMeshUvSeams(mesh, collectBoundaryEdges(mesh, actionFaceIds), { append: true })
                )
              }
              size="xs"
              variant="ghost"
            >
              Mark Boundaries
            </Button>
            <Button onClick={() => commit("Clear seams", (mesh) => clearEditableMeshUvSeams(mesh))} size="xs" variant="ghost">
              Clear Seams
            </Button>
          </div>
          <div className="editor-dock-note rounded-xl px-3 py-2 text-[11px] text-foreground/56">
            {meshNode.data.surface?.uvSeams?.length ?? 0} UV seam edges stored on this mesh.
          </div>
        </SurfaceSection>

        <SurfaceSection title="Material Slots">
          <div className="editor-dock-note rounded-xl px-3 py-2 text-[11px]">
            Active material: <span className="font-medium text-foreground/80">{selectedMaterial?.name ?? selectedMaterialId}</span>
          </div>
          <Button
            disabled={!selectedMaterial}
            onClick={() => commit("Assign face material", (mesh) => paintEditableMeshFacesMaterial(mesh, actionFaceIds, selectedMaterialId))}
            size="xs"
            variant="ghost"
          >
            Paint Selected Faces
          </Button>
          <div className="space-y-1.5">
            {(meshNode.data.surface?.materialSlots ?? []).map((slot) => (
              <div className="editor-dock-note flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px]" key={slot.id}>
                <span className="truncate">{slot.name ?? materials.find((material) => material.id === slot.materialId)?.name ?? slot.materialId}</span>
                <span className="text-foreground/42">{meshNode.data.faces.filter((face) => face.materialId === slot.materialId).length} faces</span>
              </div>
            ))}
          </div>
        </SurfaceSection>

        <SurfaceSection title="Paint">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input className="h-9 rounded-xl border-white/8 bg-black/24 text-xs" onChange={(event) => setPaintColor(event.target.value)} type="color" value={paintColor} />
            <Button onClick={() => commit("Paint vertex color", (mesh) => paintEditableMeshVertexColors(mesh, actionFaceIds, hexToColor(paintColor), paintStrength))} size="xs" variant="ghost">
              Vertex Color
            </Button>
          </div>
          <DragInput compact label="Strength" max={1} min={0} onChange={setPaintStrength} onValueCommit={() => undefined} precision={2} step={0.05} value={paintStrength} />
        </SurfaceSection>

        <SurfaceSection title="Texture Blending">
          <div className="grid grid-cols-2 gap-1.5">
            <Button disabled={!selectedMaterial} onClick={createBlendLayer} size="xs" variant="ghost">
              Add Active Layer
            </Button>
            <Button disabled={!selectedMaterial} onClick={() => commit("Blend paint", (mesh) => paintEditableMeshTextureBlend(mesh, actionFaceIds, `blend:${selectedMaterialId}`, paintStrength))} size="xs" variant="ghost">
              Paint Blend
            </Button>
          </div>
          <div className="space-y-1.5">
            {(meshNode.data.surface?.blendLayers ?? []).map((layer, index) => (
              <div className="editor-dock-note flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px]" key={layer.id}>
                <span className="truncate">{index + 1}. {layer.name}</span>
                <Button onClick={() => commit("Paint blend layer", (mesh) => paintEditableMeshTextureBlend(mesh, actionFaceIds, layer.id, paintStrength))} size="xs" variant="ghost">
                  Paint
                </Button>
              </div>
            ))}
          </div>
        </SurfaceSection>

        <SurfaceSection title="Projected Decals">
          <Button disabled={!selectedMaterial || actionFaceIds.length === 0} onClick={createDecal} size="xs" variant="ghost">
            Project Active Material
          </Button>
          <div className="editor-dock-note rounded-xl px-3 py-2 text-[11px] text-foreground/56">
            {meshNode.data.surface?.decals?.length ?? 0} live projected decals. They stay editable and export as runtime overlay meshes.
          </div>
        </SurfaceSection>
      </div>
    </ScrollArea>
  );
}

function UvPreview({ faces }: { faces: Array<{ id: string; selected: boolean; uvs: Array<{ x: number; y: number }> }> }) {
  const allUvs = faces.flatMap((face) => face.uvs);

  if (allUvs.length === 0) {
    return (
      <div className="editor-dock-note flex h-36 items-center justify-center rounded-xl text-[11px] text-foreground/50">
        No explicit UVs yet. Run Smart Unwrap or a projection mode.
      </div>
    );
  }

  const minX = Math.min(...allUvs.map((uv) => uv.x));
  const minY = Math.min(...allUvs.map((uv) => uv.y));
  const maxX = Math.max(...allUvs.map((uv) => uv.x));
  const maxY = Math.max(...allUvs.map((uv) => uv.y));
  const width = Math.max(0.0001, maxX - minX);
  const height = Math.max(0.0001, maxY - minY);

  const point = (uv: { x: number; y: number }) => {
    const x = 12 + ((uv.x - minX) / width) * 156;
    const y = 168 - ((uv.y - minY) / height) * 156;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };

  return (
    <svg className="h-44 w-full rounded-xl border border-white/8 bg-[#08100f]" viewBox="0 0 180 180">
      {Array.from({ length: 9 }, (_, index) => (
        <line className="stroke-white/8" key={`v-${index}`} x1={12 + index * 19.5} x2={12 + index * 19.5} y1="12" y2="168" />
      ))}
      {Array.from({ length: 9 }, (_, index) => (
        <line className="stroke-white/8" key={`h-${index}`} x1="12" x2="168" y1={12 + index * 19.5} y2={12 + index * 19.5} />
      ))}
      {faces.map((face) => (
        <polygon
          className={cn(face.selected ? "fill-[#f6d07d]/26 stroke-[#f6d07d]" : "fill-emerald-400/12 stroke-emerald-200/60")}
          key={face.id}
          points={face.uvs.map(point).join(" ")}
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

function collectBoundaryEdges(mesh: EditableMesh, faceIds: string[]) {
  const selected = new Set(faceIds);
  const edges = new Map<string, [string, string]>();

  mesh.faces.forEach((face) => {
    if (!selected.has(face.id)) {
      return;
    }

    const vertexIds = getFaceVertexIds(mesh, face.id);
    vertexIds.forEach((vertexId, index) => {
      const nextVertexId = vertexIds[(index + 1) % vertexIds.length];
      const key = [vertexId, nextVertexId].sort().join(":");
      edges.set(key, key.split(":") as [string, string]);
    });
  });

  return Array.from(edges.values());
}

function hexToColor(value: string): ColorRGBA {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  const int = Number.parseInt(normalized.slice(1), 16);

  return {
    a: 1,
    b: ((int >> 0) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    r: ((int >> 16) & 255) / 255
  };
}

function SurfaceSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="editor-dock-section space-y-2 rounded-[16px] p-3">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <div className="px-1 text-[10px] font-semibold tracking-[0.18em] text-[#f6d07d]/58 uppercase">{children}</div>;
}
