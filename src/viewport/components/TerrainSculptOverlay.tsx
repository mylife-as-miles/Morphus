/**
 * In-canvas half of terrain sculpting: the frame pump and the brush ring.
 *
 * The sculpt hook lives outside the R3F canvas, because that is where the DOM
 * pointer events arrive. Two things it needs happen inside: `advance` has to run
 * once a frame so held strokes keep depositing while the pointer is still, and
 * the cursor has to be drawn. This component is that inside half.
 *
 * It reads `cursorRef` rather than the throttled `cursor` value, so the ring
 * tracks the pointer at frame rate instead of at the 100 ms publish interval --
 * a ring that lags the pointer reads as broken even when the stroke underneath
 * it is perfectly accurate.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { DoubleSide, type Mesh, Quaternion, Vector3 } from "three";
import type { TerrainSculptSession } from "@/viewport/hooks/useTerrainSculpt";

const UP = new Vector3(0, 1, 0);
const WORLD_UP = new Vector3(0, 1, 0);

/** Lifts the ring off the surface so it does not z-fight the terrain it hugs. */
const SURFACE_OFFSET = 0.05;

export type TerrainSculptOverlayProps = {
  session: TerrainSculptSession;
  /** Subtractive tools read red, additive and neutral ones read editor gold. */
  tone?: "neutral" | "additive" | "subtractive";
};

export function TerrainSculptOverlay({ session, tone = "neutral" }: TerrainSculptOverlayProps) {
  const outerRef = useRef<Mesh | null>(null);
  const innerRef = useRef<Mesh | null>(null);
  const orientation = useMemo(() => new Quaternion(), []);
  const normal = useMemo(() => new Vector3(), []);

  const color = tone === "subtractive" ? "#f2686b" : tone === "additive" ? "#7ce7b0" : "#f6d07d";

  useFrame((_, delta) => {
    session.advance(delta);

    const cursor = session.cursorRef.current;
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    outer.visible = cursor.visible;
    inner.visible = cursor.visible && cursor.innerRadius > 0.001;
    if (!cursor.visible) return;

    // A heightfield stroke displaces along world Y no matter what it is drawn
    // over, so its ring lies flat; a mesh stroke follows the picked normal and
    // the ring has to lie in the surface to show where the dab will land.
    normal.set(cursor.normal.x, cursor.normal.y, cursor.normal.z);
    if (!cursor.followsSurface || normal.lengthSq() < 1e-6) {
      normal.copy(WORLD_UP);
    } else {
      normal.normalize();
    }
    orientation.setFromUnitVectors(UP, normal);

    for (const [mesh, radius] of [
      [outer, cursor.radius],
      [inner, cursor.innerRadius]
    ] as const) {
      mesh.position.set(
        cursor.position.x + normal.x * SURFACE_OFFSET,
        cursor.position.y + normal.y * SURFACE_OFFSET,
        cursor.position.z + normal.z * SURFACE_OFFSET
      );
      mesh.quaternion.copy(orientation);
      // The ring geometry is authored at unit radius, so scale is the radius.
      mesh.scale.setScalar(Math.max(radius, 0.001));
    }
  });

  return (
    <group renderOrder={999}>
      <mesh ref={outerRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => null}>
        <ringGeometry args={[0.97, 1, 64]} />
        <meshBasicMaterial color={color} depthTest={false} opacity={0.85} side={DoubleSide} transparent />
      </mesh>
      <mesh ref={innerRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => null}>
        <ringGeometry args={[0.97, 1, 48]} />
        <meshBasicMaterial color={color} depthTest={false} opacity={0.4} side={DoubleSide} transparent />
      </mesh>
    </group>
  );
}
