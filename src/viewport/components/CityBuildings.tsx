/**
 * Draws the generated landmark buildings.
 *
 * The grammar hands back one `BufferGeometry` per material slot -- limestone,
 * granite, glass, bronze, black metal, ornament, roof -- rather than one mesh
 * with groups, so each slot becomes its own mesh under a shared transform. That
 * is more draw calls than a merged buffer would be, but only a few dozen
 * buildings exist and splitting by material is what lets glass read as glass
 * next to stone.
 *
 * These are expensive: about 140k triangles each. `buildBuildings` caps how
 * many are generated; this only draws what it is given.
 */

import { useEffect, useMemo } from "react";
import { Color, DoubleSide, type BufferGeometry } from "three";
import type { BuildingInstance } from "@blud/city";

export type CityBuildingsProps = {
  buildings: readonly BuildingInstance[];
  visible?: boolean;
};

/**
 * Rough physical values per material slot.
 *
 * The grammar names its slots after materials rather than after surfaces, which
 * is the useful way round: it means the renderer can say what limestone is once
 * and have every building agree.
 */
const SLOT_MATERIALS: Record<
  string,
  { color: string; roughness: number; metalness: number; opacity?: number }
> = {
  bronze: { color: "#7d5a2b", metalness: 0.85, roughness: 0.42 },
  "black-metal": { color: "#1c1c1f", metalness: 0.7, roughness: 0.5 },
  glass: { color: "#8ea6b8", metalness: 0.25, opacity: 0.72, roughness: 0.12 },
  granite: { color: "#5d5d61", metalness: 0.02, roughness: 0.75 },
  limestone: { color: "#cfc6b2", metalness: 0, roughness: 0.86 },
  ornament: { color: "#bdb298", metalness: 0.05, roughness: 0.7 },
  roof: { color: "#4a4a4e", metalness: 0.1, roughness: 0.8 }
};

const FALLBACK = { color: "#b9b2a2", metalness: 0, roughness: 0.85 };

export function CityBuildings({ buildings, visible = true }: CityBuildingsProps) {
  // The geometries belong to the generator, not to this component, so they are
  // disposed when a new set replaces them rather than on every render.
  useEffect(() => {
    const geometries = buildings.flatMap((building) =>
      Object.values(building.generated.geometries).filter(Boolean)
    ) as BufferGeometry[];

    return () => {
      for (const geometry of geometries) geometry.dispose();
    };
  }, [buildings]);

  const entries = useMemo(
    () =>
      buildings.map((building) => ({
        building,
        slots: Object.entries(building.generated.geometries).filter(
          (entry): entry is [string, BufferGeometry] => Boolean(entry[1])
        )
      })),
    [buildings]
  );

  if (!visible || entries.length === 0) return null;

  return (
    <group name="CityBuildings">
      {entries.map(({ building, slots }) => (
        <group
          key={building.lotId}
          position={[building.x, building.y, building.z]}
          rotation={[0, building.rotation, 0]}
        >
          {slots.map(([slot, geometry]) => {
            const material = SLOT_MATERIALS[slot] ?? FALLBACK;
            const transparent = material.opacity !== undefined;

            return (
              <mesh castShadow geometry={geometry} key={slot} receiveShadow>
                <meshStandardMaterial
                  color={new Color(material.color)}
                  metalness={material.metalness}
                  opacity={material.opacity ?? 1}
                  roughness={material.roughness}
                  // Ornament and tracery are modelled as thin single-sided
                  // pieces; without this they vanish from one side.
                  side={DoubleSide}
                  transparent={transparent}
                />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}
