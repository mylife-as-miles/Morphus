import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Plane,
  PlaneGeometry,
  Vector3
} from "three";
import type { SceneSettings, Vec3 } from "@blud/shared";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GRASS_POINTER_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const OFFSCREEN_INTERACTION_POINT = new Vector3(99999, 0, 99999);

type GrassFieldProps = {
  center: Vec3;
  settings: SceneSettings["world"]["grass"];
};

type GrassShader = Parameters<NonNullable<MeshStandardMaterial["onBeforeCompile"]>>[0];

export function GrassField({ center, settings }: GrassFieldProps) {
  const domElement = useThree((state) => state.gl.domElement);
  const meshRef = useRef<InstancedMesh>(null);
  const pointerActiveRef = useRef(false);
  const hitPointRef = useRef(new Vector3());
  const count = useMemo(() => computeGrassBladeCount(settings), [settings]);
  const bladeMatrices = useMemo(() => createBladeMatrices(center, settings, count), [center, count, settings]);
  const bladeGeometry = useMemo(() => createBladeGeometry(settings), [settings]);
  const material = useMemo(() => createGrassMaterial(settings), [settings]);

  useEffect(() => {
    return () => {
      bladeGeometry.dispose();
    };
  }, [bladeGeometry]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  useEffect(() => {
    const mesh = meshRef.current;

    if (!mesh) {
      return;
    }

    bladeMatrices.forEach((matrix, index) => {
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [bladeMatrices]);

  useEffect(() => {
    const handlePointerEnter = () => {
      pointerActiveRef.current = true;
    };
    const handlePointerLeave = () => {
      pointerActiveRef.current = false;
    };

    domElement.addEventListener("pointerenter", handlePointerEnter);
    domElement.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      domElement.removeEventListener("pointerenter", handlePointerEnter);
      domElement.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [domElement]);

  useFrame((state) => {
    const shader = material.userData.grassShader as GrassShader | undefined;

    if (!shader) {
      return;
    }

    shader.uniforms.uTime.value = state.clock.elapsedTime;

    if (pointerActiveRef.current && state.raycaster.ray.intersectPlane(GRASS_POINTER_PLANE, hitPointRef.current)) {
      shader.uniforms.uInteractionPoint.value.copy(hitPointRef.current);
      return;
    }

    shader.uniforms.uInteractionPoint.value.copy(OFFSCREEN_INTERACTION_POINT);
  });

  if (!settings.enabled || count === 0) {
    return null;
  }

  return (
    <instancedMesh
      args={[bladeGeometry, material, count]}
      castShadow={false}
      count={count}
      frustumCulled={false}
      key={`grass:${count}:${settings.bladeHeight}:${settings.bladeWidth}`}
      receiveShadow={false}
      ref={meshRef}
    />
  );
}

function computeGrassBladeCount(settings: SceneSettings["world"]["grass"]) {
  if (!settings.enabled || settings.density <= 0 || settings.radius <= 0) {
    return 0;
  }

  return Math.min(6000, Math.max(240, Math.round(settings.radius * settings.radius * settings.density * 6.5)));
}

function createBladeGeometry(settings: SceneSettings["world"]["grass"]) {
  const geometry = new PlaneGeometry(settings.bladeWidth, settings.bladeHeight, 1, 5);
  geometry.translate(0, settings.bladeHeight * 0.5, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function createBladeMatrices(center: Vec3, settings: SceneSettings["world"]["grass"], count: number) {
  const matrices: Matrix4[] = [];
  const blade = new Object3D();

  for (let index = 0; index < count; index += 1) {
    const angleNoise = hashFloat(index * 17.371 + 4.12);
    const radiusNoise = hashFloat(index * 31.733 + 8.51);
    const scaleNoise = hashFloat(index * 9.137 + 12.74);
    const positionNoise = hashFloat(index * 41.913 + 2.37);
    const angle = GOLDEN_ANGLE * index + angleNoise * 0.95;
    const distance = settings.radius * Math.sqrt((index + radiusNoise) / count);
    const offsetX = Math.cos(angle) * distance + (positionNoise - 0.5) * 0.85;
    const offsetZ = Math.sin(angle) * distance + (angleNoise - 0.5) * 0.85;
    const widthScale = 0.72 + positionNoise * 0.6;
    const heightScale = 0.72 + scaleNoise * 0.95;

    blade.position.set(center.x + offsetX, 0, center.z + offsetZ);
    blade.rotation.set(0, hashFloat(index * 5.913 + 18.2) * Math.PI * 2, 0);
    blade.scale.set(widthScale, heightScale, 1);
    blade.updateMatrix();
    matrices.push(blade.matrix.clone());
  }

  return matrices;
}

function createGrassMaterial(settings: SceneSettings["world"]["grass"]) {
  const material = new MeshStandardMaterial({
    color: new Color(settings.tipColor),
    metalness: 0.02,
    roughness: 0.94,
    side: DoubleSide
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBaseColor = { value: new Color(settings.baseColor) };
    shader.uniforms.uInteractionPoint = { value: OFFSCREEN_INTERACTION_POINT.clone() };
    shader.uniforms.uInteractionRadius = { value: settings.interactionRadius };
    shader.uniforms.uInteractionStrength = { value: settings.interactionStrength };
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uTipColor = { value: new Color(settings.tipColor) };
    shader.uniforms.uWindSpeed = { value: settings.windSpeed };
    shader.uniforms.uWindStrength = { value: settings.windStrength };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uInteractionRadius;
uniform float uInteractionStrength;
uniform float uTime;
uniform float uWindSpeed;
uniform float uWindStrength;
uniform vec3 uInteractionPoint;
varying float vBladeMix;
float hash13(vec3 value) {
  return fract(sin(dot(value, vec3(12.9898, 78.233, 45.164))) * 43758.5453123);
}`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float bladeMix = pow(uv.y, 1.55);
float widthTaper = mix(1.0, 0.16, uv.y);
transformed.x *= widthTaper;
vec3 instanceOffset = instanceMatrix[3].xyz;
float randomPhase = hash13(instanceOffset * 0.173 + vec3(uv.y, uv.x, 1.0));
float windPhase = uTime * uWindSpeed + instanceOffset.x * 0.18 + instanceOffset.z * 0.22 + randomPhase * 6.28318530718;
vec2 wind = vec2(
  sin(windPhase) + sin(windPhase * 0.43 + randomPhase * 4.0) * 0.45,
  cos(windPhase * 0.71 + randomPhase * 2.0)
) * uWindStrength;
vec2 interactionDelta = instanceOffset.xz - uInteractionPoint.xz;
float interactionDistance = length(interactionDelta);
float interactionFalloff = (1.0 - smoothstep(0.0, uInteractionRadius, interactionDistance)) * uInteractionStrength;
vec2 interactionPush = interactionDistance > 0.0001 ? normalize(interactionDelta) * interactionFalloff : vec2(0.0);
transformed.x += (wind.x + interactionPush.x) * bladeMix;
transformed.z += (wind.y + interactionPush.y) * bladeMix;
transformed.y += sin(windPhase * 0.82 + randomPhase * 5.2) * 0.03 * bladeMix;
vBladeMix = bladeMix;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uBaseColor;
uniform vec3 uTipColor;
varying float vBladeMix;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
diffuseColor.rgb *= mix(uBaseColor, uTipColor, smoothstep(0.0, 1.0, vBladeMix));`
      );

    material.userData.grassShader = shader;
  };

  material.customProgramCacheKey = () =>
    [
      settings.baseColor,
      settings.tipColor,
      settings.windSpeed,
      settings.windStrength,
      settings.interactionRadius,
      settings.interactionStrength
    ].join("|");

  return material;
}

function hashFloat(value: number) {
  return (Math.sin(value * 127.1) + 1) * 0.5 % 1;
}
