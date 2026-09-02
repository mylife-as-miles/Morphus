import { type Material } from "@blud/shared";

export const architectureMaterials: Record<string, Material> = {
  "arch-wall": {
    id: "arch-wall",
    name: "Wall Default",
    color: "#C8C8C8",
    roughness: 0.8,
    metalness: 0.0,
  },
  "arch-slab": {
    id: "arch-slab",
    name: "Slab Default",
    color: "#A0A0A0",
    roughness: 0.85,
    metalness: 0.0,
  },
  "arch-ceiling": {
    id: "arch-ceiling",
    name: "Ceiling Default",
    color: "#E8E8E8",
    roughness: 0.7,
    metalness: 0.0,
  },
  "arch-roof": {
    id: "arch-roof",
    name: "Roof Default",
    color: "#B86F50",
    roughness: 0.75,
    metalness: 0.0,
  },
};
