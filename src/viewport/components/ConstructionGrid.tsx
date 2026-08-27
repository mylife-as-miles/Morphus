import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ViewportCanvasProps } from "@/viewport/types";
import { getFloorPreset } from "@/lib/floor-presets";

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform vec3 uMinorColor;
  uniform vec3 uMajorColor;
  uniform float uMinorStep;
  uniform float uMajorStep;
  uniform float uFadeDist;
  uniform float uBaseAlpha;

  varying vec3 vWorldPos;

  float gridLine(float coord, float step, float pixelWidth) {
    float fw = fwidth(coord);
    float half_step = step * 0.5;
    float d = abs(mod(coord + half_step, step) - half_step);
    return clamp((fw * pixelWidth - d) / fw, 0.0, 1.0);
  }

  void main() {
    float dist = length(vWorldPos.xz);
    float fade = 1.0 - smoothstep(uFadeDist * 0.2, uFadeDist, dist);

    float mx = gridLine(vWorldPos.x, uMinorStep, 0.5);
    float mz = gridLine(vWorldPos.z, uMinorStep, 0.5);
    float minor = max(mx, mz) * fade;

    float Mx = gridLine(vWorldPos.x, uMajorStep, 1.2);
    float Mz = gridLine(vWorldPos.z, uMajorStep, 1.2);
    float major = max(Mx, Mz) * fade;

    vec3 color = mix(uBaseColor, uMinorColor, minor * 0.65);
    color = mix(color, uMajorColor, major);

    float gridAlpha = max(minor * 0.65, major);
    float alpha = uBaseAlpha + gridAlpha * (1.0 - uBaseAlpha);

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.96));
  }
`;

const DEFAULT_MINOR = new THREE.Color("#2a3c4a");
const DEFAULT_MAJOR = new THREE.Color("#4a6880");

/** Lift the grid slightly above the construction plane so it does not Z-fight with floor meshes at the same Y. */
const GRID_ABOVE_PLANE = 0.02;

function hexToThreeColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

export function ConstructionGrid({
  activeToolId,
  onPlaceAsset,
  renderMode,
  sceneSettings,
  viewport,
  viewportPlane
}: Pick<ViewportCanvasProps, "activeToolId" | "onPlaceAsset" | "renderMode" | "sceneSettings" | "viewport" | "viewportPlane">) {
  if (!viewport.grid.visible) {
    return null;
  }

  const infinite = viewport.grid.infinite ?? false;
  const minorStep = viewport.grid.snapSize;
  const majorStep = minorStep * viewport.grid.majorLineEvery;
  const extent = infinite ? 16384 : viewport.grid.size;
  const transform = resolveConstructionPlaneTransform(viewportPlane, viewport);
  const editorFloorVisible = renderMode === "lit" && viewport.projection === "perspective";
  const showPerimeterWalls = viewportPlane === "xz" && !infinite;

  const floorPresetId = sceneSettings.world.floorPresetId;
  const preset = floorPresetId ? getFloorPreset(floorPresetId as Parameters<typeof getFloorPreset>[0]) : undefined;
  const baseColor = preset ? hexToThreeColor(preset.color) : new THREE.Color(editorFloorVisible ? "#cec8c0" : "#657a90");
  const minorColor = preset ? hexToThreeColor(preset.gridMinorColor) : DEFAULT_MINOR;
  const majorColor = preset ? hexToThreeColor(preset.gridMajorColor) : DEFAULT_MAJOR;

  return (
    <group position={transform.position} rotation={transform.rotation}>
      {editorFloorVisible && !infinite ? (
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
          <planeGeometry args={[extent, extent]} />
          <meshStandardMaterial
            color={baseColor}
            depthWrite
            metalness={preset?.metalness ?? 0}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
            roughness={preset?.roughness ?? 0.96}
          />
        </mesh>
      ) : null}
      {showPerimeterWalls ? (
        <PerimeterWalls
          baseColor={baseColor}
          majorColor={majorColor}
          minorColor={minorColor}
          renderMode={renderMode}
          size={viewport.grid.size}
        />
      ) : null}
      <GridShaderPlane
        baseAlpha={editorFloorVisible ? 0.78 : 0.32}
        baseColor={editorFloorVisible ? baseColor : new THREE.Color("#657a90")}
        extent={extent}
        fadeDist={infinite ? extent * 0.5 : extent * 0.5}
        majorColor={majorColor}
        majorStep={majorStep}
        minorColor={minorColor}
        minorStep={minorStep}
        verticalOffset={viewportPlane === "xz" ? GRID_ABOVE_PLANE : 0}
      />
    </group>
  );
}

function resolveConstructionPlaneTransform(
  plane: ViewportCanvasProps["viewportPlane"],
  viewport: ViewportCanvasProps["viewport"]
) {
  switch (plane) {
    case "xy":
      return {
        position: [0, 0, viewport.camera.target.z] as [number, number, number],
        rotation: [Math.PI / 2, 0, 0] as [number, number, number]
      };
    case "yz":
      return {
        position: [viewport.camera.target.x, 0, 0] as [number, number, number],
        rotation: [0, 0, Math.PI / 2] as [number, number, number]
      };
    case "xz":
    default:
      return {
        position: [0, viewport.grid.elevation, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number]
      };
  }
}

function PerimeterWalls({
  baseColor,
  majorColor,
  minorColor,
  renderMode,
  size
}: {
  baseColor: THREE.Color;
  majorColor: THREE.Color;
  minorColor: THREE.Color;
  renderMode: "lit" | "wireframe";
  size: number;
}) {
  const wallHeight = THREE.MathUtils.clamp(size * 0.14, 12, 28);
  const wallThickness = THREE.MathUtils.clamp(size * 0.016, 1.8, 4.5);
  const capHeight = THREE.MathUtils.clamp(wallThickness * 0.35, 0.45, 1.25);
  const halfSize = size * 0.5;
  const halfWallHeight = wallHeight * 0.5;
  const wallOffset = halfSize - wallThickness * 0.5;
  const wallColor = baseColor.clone().lerp(new THREE.Color("#4a535c"), 0.46);
  const capColor = majorColor.clone().lerp(baseColor, 0.35);
  const wireColor = majorColor.clone().lerp(minorColor, 0.32);
  const horizontalSpan = size + wallThickness * 2;
  const verticalSpan = size;
  const capY = wallHeight + capHeight * 0.5;
  const renderWallMaterial = () =>
    renderMode === "lit" ? (
      <meshStandardMaterial color={wallColor} metalness={0.08} roughness={0.88} />
    ) : (
      <meshBasicMaterial color={wireColor} opacity={0.88} transparent wireframe />
    );
  const renderCapMaterial = () =>
    renderMode === "lit" ? (
      <meshStandardMaterial color={capColor} metalness={0.1} roughness={0.62} />
    ) : (
      <meshBasicMaterial color={wireColor.clone().offsetHSL(0, 0, 0.08)} opacity={0.96} transparent wireframe />
    );

  return (
    <group>
      <mesh castShadow={renderMode === "lit"} position={[0, halfWallHeight, -wallOffset]} receiveShadow>
        <boxGeometry args={[horizontalSpan, wallHeight, wallThickness]} />
        {renderWallMaterial()}
      </mesh>
      <mesh castShadow={renderMode === "lit"} position={[0, halfWallHeight, wallOffset]} receiveShadow>
        <boxGeometry args={[horizontalSpan, wallHeight, wallThickness]} />
        {renderWallMaterial()}
      </mesh>
      <mesh castShadow={renderMode === "lit"} position={[-wallOffset, halfWallHeight, 0]} receiveShadow>
        <boxGeometry args={[wallThickness, wallHeight, verticalSpan]} />
        {renderWallMaterial()}
      </mesh>
      <mesh castShadow={renderMode === "lit"} position={[wallOffset, halfWallHeight, 0]} receiveShadow>
        <boxGeometry args={[wallThickness, wallHeight, verticalSpan]} />
        {renderWallMaterial()}
      </mesh>

      <mesh castShadow={renderMode === "lit"} position={[0, capY, -wallOffset]} receiveShadow>
        <boxGeometry args={[horizontalSpan, capHeight, wallThickness + 0.2]} />
        {renderCapMaterial()}
      </mesh>
      <mesh castShadow={renderMode === "lit"} position={[0, capY, wallOffset]} receiveShadow>
        <boxGeometry args={[horizontalSpan, capHeight, wallThickness + 0.2]} />
        {renderCapMaterial()}
      </mesh>
      <mesh castShadow={renderMode === "lit"} position={[-wallOffset, capY, 0]} receiveShadow>
        <boxGeometry args={[wallThickness + 0.2, capHeight, verticalSpan]} />
        {renderCapMaterial()}
      </mesh>
      <mesh castShadow={renderMode === "lit"} position={[wallOffset, capY, 0]} receiveShadow>
        <boxGeometry args={[wallThickness + 0.2, capHeight, verticalSpan]} />
        {renderCapMaterial()}
      </mesh>
    </group>
  );
}

function GridShaderPlane({
  baseAlpha,
  baseColor,
  extent,
  fadeDist,
  majorColor,
  majorStep,
  minorColor,
  minorStep,
  verticalOffset
}: {
  baseAlpha: number;
  baseColor: THREE.Color;
  extent: number;
  fadeDist: number;
  majorColor: THREE.Color;
  majorStep: number;
  minorColor: THREE.Color;
  minorStep: number;
  verticalOffset: number;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uBaseAlpha: { value: baseAlpha },
      uBaseColor: { value: baseColor.clone() },
      uMinorColor: { value: minorColor.clone() },
      uMajorColor: { value: majorColor.clone() },
      uMinorStep: { value: minorStep },
      uMajorStep: { value: majorStep },
      uFadeDist: { value: fadeDist }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (!matRef.current) {
      return;
    }

    matRef.current.uniforms.uBaseAlpha.value = baseAlpha;
    matRef.current.uniforms.uBaseColor.value.copy(baseColor);
    matRef.current.uniforms.uMinorColor.value.copy(minorColor);
    matRef.current.uniforms.uMajorColor.value.copy(majorColor);
    matRef.current.uniforms.uMinorStep.value = minorStep;
    matRef.current.uniforms.uMajorStep.value = majorStep;
    matRef.current.uniforms.uFadeDist.value = fadeDist;
  }, [baseAlpha, baseColor, minorColor, majorColor, minorStep, majorStep, fadeDist]);

  return (
    <mesh position={[0, verticalOffset, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[extent, extent, 1, 1]} />
      <shaderMaterial
        ref={matRef}
        depthTest
        depthWrite={false}
        fragmentShader={FRAGMENT_SHADER}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
        side={THREE.DoubleSide}
        transparent
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
      />
    </mesh>
  );
}
