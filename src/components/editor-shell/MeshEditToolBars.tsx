import type { MeshEditMode } from "@/viewport/editing";
import {
  ArcEdgeIcon,
  BevelIcon,
  BridgeEdgesIcon,
  CutMeshIcon,
  DeleteFacesIcon,
  DeflateIcon,
  EdgeModeIcon,
  FaceModeIcon,
  ExtrudeIcon,
  FillFaceIcon,
  FlipNormalsIcon,
  InflateIcon,
  InsetFaceIcon,
  LowerTopIcon,
  MergeFacesIcon,
  MirrorXIcon,
  PokeFaceIcon,
  QuadrangulateIcon,
  RaiseTopIcon,
  RotateModeIcon,
  ScaleModeIcon,
  SolidifyIcon,
  SubdivideIcon,
  TargetWeldIcon,
  TranslateModeIcon,
  TriangulateIcon,
  VertexModeIcon,
  WeldDistanceIcon
} from "@/components/editor-shell/icons";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function MeshEditToolBars({
  onArc,
  onBevel,
  onBridge,
  onDelete,
  onInset,
  onExtrude,
  onFillFace,
  onDeflate,
  onInflate,
  onInvertNormals,
  onLowerTop,
  onMerge,
  onMirrorX,
  onPoke,
  onQuadrangulate,
  onRaiseTop,
  onSetMeshEditMode,
  onSetSculptBrushRadius,
  onSetSculptBrushStrength,
  onSolidify,
  onSubdivide,
  onCut,
  onSetTransformMode,
  onTriangulate,
  onWeldDistance,
  onWeldTarget,
  meshEditMode,
  sculptMode,
  sculptBrushRadius,
  sculptBrushStrength,
  selectedGeometry,
  selectedMesh,
  transformMode
}: {
  onArc: () => void;
  onBevel: () => void;
  onBridge: () => void;
  onDelete: () => void;
  onInset: () => void;
  onExtrude: () => void;
  onFillFace: () => void;
  onDeflate: () => void;
  onInflate: () => void;
  onInvertNormals: () => void;
  onLowerTop: () => void;
  onMerge: () => void;
  onMirrorX: () => void;
  onPoke: () => void;
  onQuadrangulate: () => void;
  onRaiseTop: () => void;
  onSetMeshEditMode: (mode: MeshEditMode) => void;
  onSetSculptBrushRadius: (value: number) => void;
  onSetSculptBrushStrength: (value: number) => void;
  onSolidify: () => void;
  onSubdivide: () => void;
  onCut: () => void;
  onSetTransformMode: (mode: "rotate" | "scale" | "translate") => void;
  onTriangulate: () => void;
  onWeldDistance: () => void;
  onWeldTarget: () => void;
  meshEditMode: MeshEditMode;
  sculptMode?: string | null;
  sculptBrushRadius: number;
  sculptBrushStrength: number;
  selectedGeometry: boolean;
  selectedMesh: boolean;
  transformMode: "rotate" | "scale" | "translate";
}) {
  const mergeTooltip =
    meshEditMode === "face" ? "Merge faces" : meshEditMode === "edge" ? "Merge edges" : "Merge vertices";

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-stretch gap-2">
        <MeshToolbarSection label="Selection">
          <MeshBarButton active={meshEditMode === "vertex"} icon={VertexModeIcon} onClick={() => onSetMeshEditMode("vertex")} shortcut="V" tooltip="Vertex mode" />
          <MeshBarButton active={meshEditMode === "edge"} icon={EdgeModeIcon} onClick={() => onSetMeshEditMode("edge")} shortcut="E" tooltip="Edge mode" />
          <MeshBarButton active={meshEditMode === "face"} icon={FaceModeIcon} onClick={() => onSetMeshEditMode("face")} shortcut="F" tooltip="Face mode" />
        </MeshToolbarSection>
        <MeshToolbarSection label="Transform">
          <MeshBarButton active={transformMode === "translate"} disabled={!selectedGeometry} icon={TranslateModeIcon} onClick={() => onSetTransformMode("translate")} shortcut="G" tooltip="Translate" />
          <MeshBarButton active={transformMode === "rotate"} disabled={!selectedGeometry} icon={RotateModeIcon} onClick={() => onSetTransformMode("rotate")} shortcut="R" tooltip="Rotate" />
          <MeshBarButton active={transformMode === "scale"} disabled={!selectedGeometry} icon={ScaleModeIcon} onClick={() => onSetTransformMode("scale")} shortcut="S" tooltip="Scale" />
          <div className="editor-toolbar-divider mx-0.5 h-5" />
          <MeshBarButton disabled={!selectedMesh} icon={InflateIcon} onClick={onInflate} tooltip="Inflate" />
          <MeshBarButton disabled={!selectedMesh} icon={DeflateIcon} onClick={onDeflate} tooltip="Deflate" />
          <MeshBarButton disabled={!selectedMesh} icon={RaiseTopIcon} onClick={onRaiseTop} tooltip="Raise top" />
          <MeshBarButton disabled={!selectedMesh} icon={LowerTopIcon} onClick={onLowerTop} tooltip="Lower top" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "edge"} icon={ArcEdgeIcon} onClick={onArc} shortcut="A" tooltip="Arc" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "edge"} icon={BevelIcon} onClick={onBevel} shortcut="B" tooltip="Bevel" />
        </MeshToolbarSection>
        <MeshToolbarSection label="Topology">
          <MeshBarButton disabled={!selectedGeometry || meshEditMode === "vertex"} icon={ExtrudeIcon} onClick={onExtrude} shortcut="X" tooltip="Extrude" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode === "vertex"} icon={CutMeshIcon} onClick={onCut} shortcut={meshEditMode === "face" ? "Shift+K" : "K"} tooltip={meshEditMode === "face" ? "Face cut" : "Edge cut"} />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "edge"} icon={BridgeEdgesIcon} onClick={onBridge} tooltip="Bridge boundary edges" />
          <MeshBarButton disabled={!selectedGeometry} icon={MergeFacesIcon} onClick={onMerge} shortcut="M" tooltip={mergeTooltip} />
          <MeshBarButton disabled={!selectedGeometry} icon={FillFaceIcon} onClick={onFillFace} shortcut="Shift+F" tooltip={meshEditMode === "vertex" ? "Fill from vertices" : "Fill from edges"} />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "face"} icon={SubdivideIcon} onClick={onSubdivide} shortcut="D" tooltip="Subdivide face" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "face"} icon={DeleteFacesIcon} onClick={onDelete} shortcut="Del" tooltip="Delete faces" />
          <MeshBarButton disabled={!selectedGeometry} icon={FlipNormalsIcon} onClick={onInvertNormals} shortcut="N" tooltip="Invert normals" />
        </MeshToolbarSection>
        <MeshToolbarSection label="Advanced">
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "face"} icon={InsetFaceIcon} onClick={onInset} tooltip="Inset faces" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "face"} icon={PokeFaceIcon} onClick={onPoke} tooltip="Poke faces" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "face"} icon={TriangulateIcon} onClick={onTriangulate} tooltip="Triangulate faces" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "face"} icon={QuadrangulateIcon} onClick={onQuadrangulate} tooltip="Quadrangulate triangles" />
          <MeshBarButton disabled={!selectedGeometry && !selectedMesh} icon={SolidifyIcon} onClick={onSolidify} tooltip="Solidify / shell" />
          <MeshBarButton disabled={!selectedGeometry && !selectedMesh} icon={MirrorXIcon} onClick={onMirrorX} tooltip="Mirror across X" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "vertex"} icon={WeldDistanceIcon} onClick={onWeldDistance} tooltip="Weld by distance" />
          <MeshBarButton disabled={!selectedGeometry || meshEditMode !== "vertex"} icon={TargetWeldIcon} onClick={onWeldTarget} tooltip="Target weld" />
        </MeshToolbarSection>
      </div>
      {sculptMode ? (
        <MeshToolbarSection label="Sculpt">
          <DragInput
            className="w-[150px]"
            compact
            disabled={!selectedMesh}
            label="Size"
            min={0.25}
            onChange={onSetSculptBrushRadius}
            precision={2}
            step={0.02}
            value={sculptBrushRadius}
          />
          <DragInput
            className="w-[150px]"
            compact
            disabled={!selectedMesh}
            label="Strength"
            min={0.01}
            onChange={onSetSculptBrushStrength}
            precision={3}
            step={0.005}
            value={sculptBrushStrength}
          />
        </MeshToolbarSection>
      ) : null}
    </div>
  );
}

function MeshToolbarSection({
  children,
  label
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="pl-1.5 text-[9px] font-semibold tracking-[0.22em] text-[#f6d07d]/58 uppercase">{label}</div>
      <div className="editor-toolbar-segment flex min-h-11 items-center gap-1.5 rounded-[14px] p-1.5">
        {children}
      </div>
    </div>
  );
}

function MeshBarButton({
  active = false,
  disabled = false,
  icon: Icon,
  onClick,
  shortcut,
  tooltip
}: {
  active?: boolean;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  shortcut?: string;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={cn(
              "editor-toolbar-button size-8 rounded-[10px] hover:translate-y-0 active:scale-100",
              active && "editor-toolbar-button-active text-[#fff0cb]"
            )}
            disabled={disabled}
            onClick={onClick}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-medium text-foreground">{tooltip}</span>
          {shortcut ? <span className="text-foreground/45">{shortcut}</span> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
