export type FloorPresetId =
  | "polished-concrete"
  | "dark-hardwood"
  | "white-marble"
  | "ceramic-tile"
  | "brushed-steel"
  | "worn-stone"
  | "terracotta"
  | "desert-sand";

export type FloorPreset = {
  id: FloorPresetId;
  name: string;
  description: string;
  color: string;
  roughness: number;
  metalness: number;
  swatchColor: string;
  swatchAccent?: string;
  /** Hex color for the minor grid lines when this floor is active */
  gridMinorColor: string;
  /** Hex color for the major grid lines when this floor is active */
  gridMajorColor: string;
};

export const FLOOR_PRESETS: FloorPreset[] = [
  {
    id: "polished-concrete",
    name: "Polished Concrete",
    description: "Smooth industrial surface with subtle sheen and micro-pores",
    color: "#8a9aa6",
    roughness: 0.28,
    metalness: 0.06,
    swatchColor: "#8a9aa6",
    swatchAccent: "#a0b0bc",
    gridMinorColor: "#2a3c4a",
    gridMajorColor: "#4a6880"
  },
  {
    id: "dark-hardwood",
    name: "Dark Hardwood",
    description: "Rich mahogany-toned oak planks with natural wood grain",
    color: "#3a1f0e",
    roughness: 0.72,
    metalness: 0.0,
    swatchColor: "#5c3320",
    swatchAccent: "#7a4a2e",
    gridMinorColor: "#2e1a0c",
    gridMajorColor: "#6a3a18"
  },
  {
    id: "white-marble",
    name: "White Marble",
    description: "Pristine Carrara marble with high gloss mirror finish",
    color: "#e6e2dc",
    roughness: 0.09,
    metalness: 0.02,
    swatchColor: "#e6e2dc",
    swatchAccent: "#f0ece8",
    gridMinorColor: "#2a3848",
    gridMajorColor: "#5a7898"
  },
  {
    id: "ceramic-tile",
    name: "Ceramic Tile",
    description: "Polished porcelain tiles with hairline grout joints",
    color: "#cac5bc",
    roughness: 0.22,
    metalness: 0.0,
    swatchColor: "#cac5bc",
    swatchAccent: "#dedad4",
    gridMinorColor: "#283038",
    gridMajorColor: "#4a5c6a"
  },
  {
    id: "brushed-steel",
    name: "Brushed Steel",
    description: "Industrial-grade anisotropic metal with directional brushing",
    color: "#60717e",
    roughness: 0.16,
    metalness: 0.94,
    swatchColor: "#60717e",
    swatchAccent: "#8096a6",
    gridMinorColor: "#1e3448",
    gridMajorColor: "#3a6888"
  },
  {
    id: "worn-stone",
    name: "Worn Stone",
    description: "Ancient cobblestone weathered by centuries of foot traffic",
    color: "#4c4740",
    roughness: 0.92,
    metalness: 0.0,
    swatchColor: "#655e55",
    swatchAccent: "#7a7268",
    gridMinorColor: "#28221e",
    gridMajorColor: "#504438"
  },
  {
    id: "terracotta",
    name: "Terracotta",
    description: "Warm Mediterranean clay tiles fired in traditional kilns",
    color: "#9a5c3e",
    roughness: 0.8,
    metalness: 0.0,
    swatchColor: "#9a5c3e",
    swatchAccent: "#b87050",
    gridMinorColor: "#2e1610",
    gridMajorColor: "#7a3818"
  },
  {
    id: "desert-sand",
    name: "Desert Sand",
    description: "Fine-grain wind-swept sandstone with natural imperfections",
    color: "#c6a87a",
    roughness: 0.96,
    metalness: 0.0,
    swatchColor: "#c6a87a",
    swatchAccent: "#d8c090",
    gridMinorColor: "#2a2010",
    gridMajorColor: "#685028"
  }
];

export function getFloorPreset(id: FloorPresetId): FloorPreset | undefined {
  return FLOOR_PRESETS.find((p) => p.id === id);
}
