import { type Material } from "@blud/shared";

// PBR setup for materials, using standard values
export const skateparkMaterials: Record<string, Material> = {
  "concrete-smooth": {
    id: "concrete-smooth",
    name: "Smooth Concrete",
    color: "#b0b0b5",
    roughness: 0.7,
    metalness: 0.05
  },
  "concrete-rough": {
    id: "concrete-rough",
    name: "Rough Concrete",
    color: "#9a9a9f",
    roughness: 0.9,
    metalness: 0.0
  },
  "plywood-birch": {
    id: "plywood-birch",
    name: "Birch Plywood",
    color: "#e2c08d",
    roughness: 0.6,
    metalness: 0.0
  },
  "skatelite-black": {
    id: "skatelite-black",
    name: "Black Skatelite",
    color: "#2a2a2a",
    roughness: 0.4,
    metalness: 0.2
  },
  "rail-metal": {
    id: "rail-metal",
    name: "Grind Rail Metal",
    color: "#cfcfcf",
    roughness: 0.3,
    metalness: 0.8
  },
  "coping-metal": {
    id: "coping-metal",
    name: "Coping Steel",
    color: "#bcbcbc",
    roughness: 0.4,
    metalness: 0.7
  },
  "painted-blue": {
    id: "painted-blue",
    name: "Painted Blue",
    color: "#3b82f6",
    roughness: 0.6,
    metalness: 0.1
  },
  "painted-red": {
    id: "painted-red",
    name: "Painted Red",
    color: "#ef4444",
    roughness: 0.6,
    metalness: 0.1
  }
};
