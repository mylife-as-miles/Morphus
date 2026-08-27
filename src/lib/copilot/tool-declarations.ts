import type { CopilotToolDeclaration } from "./types";

const PROCEDURAL_WORLD_TOOL_DECLARATIONS: CopilotToolDeclaration[] = [
  {
    name: "create_procedural_world",
    description: "Creates a persistent LAAS procedural-world node. It is WebGPU-only and stores deterministic generator settings rather than generated GPU data.",
    parameters: { type: "object", properties: {
      name: { type: "string" }, seed: { type: "number" }, preset: { type: "string", enum: ["low", "high", "ultra"] },
      worldSizeMeters: { type: "number" }, timeOfDay: { type: "number" }, allowDuplicate: { type: "boolean" }
    } }
  },
  { name: "inspect_procedural_world", description: "Returns persisted settings and current deterministic configuration for a procedural world.", parameters: { type: "object", properties: { nodeId: { type: "string" } } } },
  { name: "regenerate_procedural_world", description: "Queues regeneration from the persisted LAAS seed and settings. Does not claim GPU generation succeeded before the viewport reports it.", parameters: { type: "object", properties: { nodeId: { type: "string" } } } },
  { name: "set_procedural_world_seed", description: "Sets the deterministic uint32 seed for a procedural world.", parameters: { type: "object", properties: { nodeId: { type: "string" }, seed: { type: "number" } }, required: ["seed"] } },
  { name: "set_procedural_world_preset", description: "Selects the low, high, or ultra LAAS quality preset.", parameters: { type: "object", properties: { nodeId: { type: "string" }, preset: { type: "string", enum: ["low", "high", "ultra"] } }, required: ["preset"] } },
  { name: "configure_procedural_terrain", description: "Configures LAAS terrain/hydrology authoring controls.", parameters: { type: "object", properties: { nodeId: { type: "string" }, heightAmplitude: { type: "number" }, noiseScale: { type: "number" }, hydraulicErosion: { type: "number" }, thermalErosion: { type: "number" }, riverThreshold: { type: "number" }, lakeBehavior: { type: "string", enum: ["connected", "natural", "off"] }, moisture: { type: "number" }, snow: { type: "number" }, terrainRange: { type: "number" }, farShell: { type: "boolean" } } } },
  { name: "configure_procedural_vegetation", description: "Configures LAAS GPU scatter densities, species, slopes, impostors, and wind response.", parameters: { type: "object", properties: { nodeId: { type: "string" }, enabledSpecies: { type: "array", items: { type: "string" } }, treeDensity: { type: "number" }, understoryDensity: { type: "number" }, grassDensity: { type: "number" }, slopeLimit: { type: "number" }, scatterSeedOffset: { type: "number" }, impostorRange: { type: "number" }, windResponse: { type: "number" } } } },
  { name: "configure_procedural_lighting", description: "Configures LAAS sun, cascaded shadows, and canopy-aware GI.", parameters: { type: "object", properties: { nodeId: { type: "string" }, giEnabled: { type: "boolean" }, shadowQuality: { type: "string", enum: ["low", "high", "ultra"] }, sunAzimuth: { type: "number" }, sunElevation: { type: "number" } } } },
  { name: "configure_procedural_atmosphere", description: "Configures LAAS clouds, fog, and froxel volumetrics.", parameters: { type: "object", properties: { nodeId: { type: "string" }, cloudCoverage: { type: "number" }, cloudSpeed: { type: "number" }, fogDensity: { type: "number" }, volumetrics: { type: "boolean" } } } },
  { name: "configure_procedural_water", description: "Configures LAAS rivers/lakes, reflections, caustics, foam, wet margins, and clipmap distance.", parameters: { type: "object", properties: { nodeId: { type: "string" }, enabled: { type: "boolean" }, reflectionQuality: { type: "string", enum: ["low", "high", "ultra"] }, caustics: { type: "boolean" }, foam: { type: "boolean" }, wetMargins: { type: "boolean" }, clipmapDistance: { type: "number" } } } },
  { name: "configure_procedural_motion", description: "Configures LAAS wind, cloud motion, particle classes, and deterministic freeze mode.", parameters: { type: "object", properties: { nodeId: { type: "string" }, windDirection: { type: "number" }, windStrength: { type: "number" }, cloudSpeed: { type: "number" }, particlePreset: { type: "string", enum: ["low", "high", "ultra"] }, particleTypes: { type: "array", items: { type: "string", enum: ["leaves", "pollen", "snow"] } }, freezeSimulation: { type: "boolean" } } } },
  { name: "configure_procedural_post", description: "Configures LAAS TAA, GTAO, bounce, bloom, exposure, and debug view settings.", parameters: { type: "object", properties: { nodeId: { type: "string" }, taa: { type: "boolean" }, gtao: { type: "boolean" }, screenSpaceBounce: { type: "boolean" }, bloom: { type: "boolean" }, autoExposure: { type: "boolean" }, debugView: { type: "string", enum: ["none", "ao", "clouds", "velocity"] } } } },
  { name: "set_world_time_of_day", description: "Sets LAAS physical sky time of day in hours from 0 through 24.", parameters: { type: "object", properties: { nodeId: { type: "string" }, timeOfDay: { type: "number" } }, required: ["timeOfDay"] } },
  { name: "set_world_weather", description: "Applies a concise cloud/fog/particle weather configuration.", parameters: { type: "object", properties: { nodeId: { type: "string" }, cloudCoverage: { type: "number" }, fogDensity: { type: "number" }, particleTypes: { type: "array", items: { type: "string" } } } } },
  { name: "set_world_exploration_mode", description: "Sets editor, walk, or fly exploration mode for the world preview/runtime.", parameters: { type: "object", properties: { nodeId: { type: "string" }, mode: { type: "string", enum: ["editor", "walk", "fly"] } }, required: ["mode"] } },
  { name: "create_world_bookmark", description: "Adds a serialized procedural-world camera bookmark.", parameters: { type: "object", properties: { nodeId: { type: "string" }, name: { type: "string" }, x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, yaw: { type: "number" }, pitch: { type: "number" }, timeOfDay: { type: "number" } }, required: ["name", "x", "y", "z"] } },
  { name: "update_world_bookmark", description: "Updates a serialized procedural-world camera bookmark.", parameters: { type: "object", properties: { nodeId: { type: "string" }, bookmarkId: { type: "string" }, name: { type: "string" }, x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, yaw: { type: "number" }, pitch: { type: "number" }, timeOfDay: { type: "number" } }, required: ["bookmarkId"] } },
  { name: "delete_world_bookmark", description: "Deletes a serialized procedural-world camera bookmark.", parameters: { type: "object", properties: { nodeId: { type: "string" }, bookmarkId: { type: "string" } }, required: ["bookmarkId"] } },
  { name: "play_world_flythrough", description: "Enters LAAS fly exploration mode so its composed bookmark flythrough controls can run.", parameters: { type: "object", properties: { nodeId: { type: "string" } } } },
  { name: "stop_world_flythrough", description: "Returns the procedural world to editor exploration mode.", parameters: { type: "object", properties: { nodeId: { type: "string" } } } },
  { name: "inspect_world_performance", description: "Returns persisted quality/capacity expectations; live GPU timings are available only after a WebGPU world is running.", parameters: { type: "object", properties: { nodeId: { type: "string" } } } },
  { name: "capture_world_verification_screenshot", description: "Captures the current viewport for procedural-world verification when screenshot capture is available.", parameters: { type: "object", properties: {} } }
];

const COPILOT_SKILL_REFERENCE_TOOL_DECLARATIONS: CopilotToolDeclaration[] = [
  {
    name: "list_copilot_skill_references",
    description: "Lists available read-only Copilot skill references. Use this before reading a deeper reference when the active skill names several documents.",
    parameters: {
      type: "object",
      properties: { skillId: { type: "string", description: "Optional active Copilot skill ID" } }
    }
  },
  {
    name: "read_copilot_skill_reference",
    description: "Reads a bounded line range from an active Copilot skill reference. Do not reread an identical range during this run.",
    parameters: {
      type: "object",
      properties: {
        skillId: { type: "string" },
        referenceId: { type: "string" },
        startLine: { type: "number" },
        endLine: { type: "number" },
        maxChars: { type: "number", description: "Maximum 24000 characters" }
      },
      required: ["skillId", "referenceId"]
    }
  },
  {
    name: "search_copilot_skill_references",
    description: "Searches active Copilot skill references and returns focused line ranges. Search before reading a long document.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        skillId: { type: "string" },
        referenceIds: { type: "array", items: { type: "string" } },
        maxResults: { type: "number", description: "Maximum 24 results" }
      },
      required: ["query"]
    }
  }
];

export const COPILOT_TOOL_DECLARATIONS: CopilotToolDeclaration[] = [
  ...PROCEDURAL_WORLD_TOOL_DECLARATIONS,
  ...COPILOT_SKILL_REFERENCE_TOOL_DECLARATIONS,
  // ── Placement ───────────────────────────────────────────────
  {
    name: "place_blockout_room",
    description:
      "Places a blockout room (enclosed box with walls, floor, ceiling). Open sides remove entire wall/floor/ceiling planes for coarse full-side openings only. Position is the center-bottom of the room.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position of room center" },
        y: { type: "number", description: "World Y position of room bottom (usually 0 for ground level)" },
        z: { type: "number", description: "World Z position of room center" },
        sizeX: { type: "number", description: "Room width in meters (X axis)" },
        sizeY: { type: "number", description: "Room height in meters (Y axis)" },
        sizeZ: { type: "number", description: "Room depth in meters (Z axis)" },
        openSides: {
          type: "array",
          items: { type: "string", enum: ["north", "south", "east", "west", "top", "bottom"] },
          description: "Whole sides to leave open. This removes the entire wall, floor, or ceiling plane and is not suitable for doorway- or hallway-sized openings."
        },
        materialId: { type: "string", description: "Material ID to apply. Use list_materials to see available IDs." },
        name: { type: "string", description: "Display name for the room node" }
      },
      required: ["x", "y", "z", "sizeX", "sizeY", "sizeZ"]
    }
  },
  {
    name: "place_blockout_platform",
    description:
      "Places a flat blockout mesh platform (floor slab, roof, shelf). Position is the center of the platform volume.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position (center of slab thickness)" },
        z: { type: "number", description: "World Z position" },
        sizeX: { type: "number", description: "Platform width (X)" },
        sizeY: { type: "number", description: "Platform thickness (Y), typically 0.25-0.5" },
        sizeZ: { type: "number", description: "Platform depth (Z)" },
        materialId: { type: "string", description: "Material ID" },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z", "sizeX", "sizeY", "sizeZ"]
    }
  },
  {
    name: "place_blockout_stairs",
    description:
      "Places a parametric staircase with optional landings. Position is the center-bottom of the bottom landing. Returns topLandingCenter for chaining connections.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position of stair base" },
        y: { type: "number", description: "World Y position of stair base (bottom)" },
        z: { type: "number", description: "World Z position of stair base" },
        stepCount: { type: "number", description: "Number of steps" },
        stepHeight: { type: "number", description: "Height of each step in meters (typical: 0.2)" },
        treadDepth: { type: "number", description: "Depth of each step tread in meters (typical: 0.3)" },
        width: { type: "number", description: "Stair width in meters" },
        direction: {
          type: "string",
          enum: ["north", "south", "east", "west"],
          description: "Direction the stairs ascend toward (default: north)"
        },
        materialId: { type: "string", description: "Material ID" },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z", "stepCount", "stepHeight", "treadDepth", "width"]
    }
  },
  {
    name: "place_primitive",
    description:
      "Places a parametric primitive shape (cube, sphere, cylinder, cone). Use it for static blockout primitives or physics props.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position" },
        z: { type: "number", description: "World Z position" },
        role: { type: "string", enum: ["brush", "prop"], description: "brush = static blockout primitive, prop = physics object" },
        shape: { type: "string", enum: ["cube", "sphere", "cylinder", "cone"], description: "Primitive shape" },
        sizeX: { type: "number", description: "Size X (default: 2)" },
        sizeY: { type: "number", description: "Size Y (default: 2, or 3 for cylinder/cone)" },
        sizeZ: { type: "number", description: "Size Z (default: 2)" },
        materialId: { type: "string", description: "Material ID to apply directly. Avoids needing a separate assign_material call." },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z", "role", "shape"]
    }
  },
  {
    name: "place_brush",
    description:
      "Legacy-named compatibility tool that places a simple axis-aligned mesh box. Default is a 4x3x4 box. Prefer mesh editing workflows after placement.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position" },
        z: { type: "number", description: "World Z position" },
        sizeX: { type: "number", description: "Brush width (default: 4)" },
        sizeY: { type: "number", description: "Brush height (default: 3)" },
        sizeZ: { type: "number", description: "Brush depth (default: 4)" },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z"]
    }
  },
  {
    name: "place_light",
    description: "Places a light in the scene. Types: point (local area), directional (sun), spot (focused cone), ambient (global fill), hemisphere (sky/ground).",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position" },
        z: { type: "number", description: "World Z position" },
        type: {
          type: "string",
          enum: ["point", "directional", "spot", "ambient", "hemisphere"],
          description: "Light type"
        },
        color: { type: "string", description: "Hex color (e.g. '#ffffff')" },
        intensity: { type: "number", description: "Light intensity" }
      },
      required: ["x", "y", "z", "type"]
    }
  },
  {
    name: "place_entity",
    description: "Places a gameplay entity (spawn point, NPC, or interactive object). Prefer place_player_spawn for playable start positions.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position" },
        z: { type: "number", description: "World Z position" },
        rotationY: { type: "number", description: "Yaw rotation in radians" },
        type: {
          type: "string",
          enum: ["player-spawn", "npc-spawn", "smart-object"],
          description: "Entity type"
        },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z", "type"]
    }
  },
  {
    name: "place_player_spawn",
    description: "Places a player-spawn entity. Use this for playable maps instead of generic entity placement.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position" },
        z: { type: "number", description: "World Z position" },
        rotationY: { type: "number", description: "Yaw rotation in radians" },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z"]
    }
  },

  {
    name: "place_skatepark_element",
    description: "Places a procedural skatepark element (ramps, rails, bowls, etc.). Position is the center-bottom of the element.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position (bottom)" },
        z: { type: "number", description: "World Z position" },
        type: {
          type: "string",
          enum: [
            "quarter-pipe", "half-pipe", "bank", "spine", "gap-to-rail", "floor",
            "ledge", "rail", "stair-set", "hubba", "bowl", "taco", "handrail", "kicker"
          ],
          description: "Type of skatepark element"
        },
        rotationY: { type: "number", description: "Rotation around Y axis in radians (default: 0)" },
        width: { type: "number", description: "Standard width (default: 4)" },
        height: { type: "number", description: "Standard height (default: 2)" },
        length: { type: "number", description: "Standard length/depth (default: 4)" },
        materialId: { type: "string", description: "Specific material ID (e.g. 'material:skate:concrete', 'material:skate:plywood', 'material:skate:metal')" },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z", "type"]
    }
  },

  // ── Transform ───────────────────────────────────────────────
  {
    name: "place_architecture_element",
    description: "Places an architecture element (wall, slab, ceiling, roof, door, window, light fixture). Position is the center-bottom of the element.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position (bottom)" },
        z: { type: "number", description: "World Z position" },
        type: {
          type: "string",
          enum: ["wall", "slab", "ceiling", "roof", "item"],
          description: "Architecture element type"
        },
        width: { type: "number", description: "Width in meters (default: 4)" },
        height: { type: "number", description: "Height in meters (default: 3 for walls, 0.2 for slabs)" },
        depth: { type: "number", description: "Depth in meters (default: 4 for slabs/ceilings/roofs)" },
        thickness: { type: "number", description: "Thickness in meters (default: 0.2 for walls, 0.15 for ceilings)" },
        pitchAngle: { type: "number", description: "Roof pitch angle in degrees, 0 for flat (default: 30)" },
        overhang: { type: "number", description: "Roof overhang in meters (default: 0.3)" },
        itemType: { type: "string", enum: ["door", "window", "light-fixture"], description: "Item sub-type (required when type is 'item')" },
        rotationY: { type: "number", description: "Rotation around Y axis in radians (default: 0)" },
        materialId: { type: "string", description: "Material ID (defaults to architecture material for the element type)" },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z", "type"]
    }
  },

  // ── Transform ───────────────────────────────────────────────
  {
    name: "translate_nodes",
    description: "Moves nodes by a relative offset (delta). Does not set absolute position — adds delta to current position.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Node IDs to move" },
        dx: { type: "number", description: "X offset" },
        dy: { type: "number", description: "Y offset" },
        dz: { type: "number", description: "Z offset" }
      },
      required: ["nodeIds", "dx", "dy", "dz"]
    }
  },
  {
    name: "set_node_transform",
    description: "Sets a node's absolute position, rotation, and scale.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Node ID" },
        x: { type: "number", description: "Absolute X position" },
        y: { type: "number", description: "Absolute Y position" },
        z: { type: "number", description: "Absolute Z position" },
        rotationX: { type: "number", description: "Rotation X in radians" },
        rotationY: { type: "number", description: "Rotation Y in radians" },
        rotationZ: { type: "number", description: "Rotation Z in radians" },
        scaleX: { type: "number", description: "Scale X" },
        scaleY: { type: "number", description: "Scale Y" },
        scaleZ: { type: "number", description: "Scale Z" }
      },
      required: ["nodeId", "x", "y", "z"]
    }
  },
  {
    name: "duplicate_nodes",
    description: "Duplicates nodes with a position offset. Returns the new node IDs.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Node IDs to duplicate" },
        offsetX: { type: "number", description: "X offset for duplicates" },
        offsetY: { type: "number", description: "Y offset for duplicates" },
        offsetZ: { type: "number", description: "Z offset for duplicates" }
      },
      required: ["nodeIds", "offsetX", "offsetY", "offsetZ"]
    }
  },
  {
    name: "mirror_nodes",
    description: "Mirrors (flips) nodes across the specified axis.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Node IDs to mirror" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Axis to mirror across" }
      },
      required: ["nodeIds", "axis"]
    }
  },
  {
    name: "delete_nodes",
    description: "Deletes nodes and/or entities by their IDs. Also removes all children.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Node or entity IDs to delete" }
      },
      required: ["ids"]
    }
  },

  // ── Brush ───────────────────────────────────────────────────
  {
    name: "split_brush",
    description: "Legacy brush-only tool. Splits brush nodes at their midpoint along the specified axis. Returns the new node IDs.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Brush node IDs to split" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Axis to split along" }
      },
      required: ["nodeIds", "axis"]
    }
  },
  {
    name: "extrude_brush",
    description: "Legacy brush-only tool. Extrudes (grows) brush nodes along an axis by a given amount.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Brush node IDs" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Extrusion axis" },
        amount: { type: "number", description: "Extrusion distance in meters" },
        direction: { type: "string", enum: ["-1", "1"], description: "Extrusion direction: '-1' (negative) or '1' (positive)" }
      },
      required: ["nodeIds", "axis", "amount", "direction"]
    }
  },
  {
    name: "offset_brush_face",
    description: "Legacy brush-only tool. Moves a single face of a brush inward or outward.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Brush node ID" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Face axis" },
        side: { type: "string", enum: ["min", "max"], description: "Which face (min or max)" },
        amount: { type: "number", description: "Offset amount (positive = outward)" }
      },
      required: ["nodeId", "axis", "side", "amount"]
    }
  },
  {
    name: "assign_material_to_brushes",
    description: "Legacy brush-only tool. Assigns a material to all faces of the specified brush nodes.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Brush node IDs" },
        materialId: { type: "string", description: "Material ID to assign" }
      },
      required: ["nodeIds", "materialId"]
    }
  },

  // ── Materials ───────────────────────────────────────────────
  {
    name: "create_material",
    description: "Creates or updates a material in the scene library. The ID is auto-generated as 'material:custom:<slug>' from the name (e.g. name 'Dark Wood' → id 'material:custom:dark-wood'). You can use this predictable ID immediately in assign_material calls.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Material display name" },
        color: { type: "string", description: "Hex color (e.g. '#ff6633')" },
        category: { type: "string", enum: ["flat", "blockout", "custom"], description: "Material category (default: custom)" },
        metalness: { type: "number", description: "Metalness 0-1 (default: 0)" },
        roughness: { type: "number", description: "Roughness 0-1 (default: 0.8)" }
      },
      required: ["name", "color"]
    }
  },
  {
    name: "assign_material",
    description: "Assigns a material to nodes (all faces) or specific faces on nodes.",
    parameters: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nodeId: { type: "string", description: "Node ID" },
              faceIds: { type: "array", items: { type: "string" }, description: "Optional face IDs (omit for all faces)" }
            },
            required: ["nodeId"]
          },
          description: "Nodes (and optional faces) to assign material to"
        },
        materialId: { type: "string", description: "Material ID to assign" }
      },
      required: ["targets", "materialId"]
    }
  },
  {
    name: "set_uv_scale",
    description: "Sets UV texture tiling scale on nodes or specific faces.",
    parameters: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nodeId: { type: "string" },
              faceIds: { type: "array", items: { type: "string" } }
            },
            required: ["nodeId"]
          }
        },
        scaleX: { type: "number", description: "UV scale X" },
        scaleY: { type: "number", description: "UV scale Y" }
      },
      required: ["targets", "scaleX", "scaleY"]
    }
  },

  // ── Scene management ────────────────────────────────────────
  {
    name: "group_nodes",
    description: "Groups nodes/entities under a new group node. Returns the group ID.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Node/entity IDs to group" }
      },
      required: ["ids"]
    }
  },
  {
    name: "select_nodes",
    description: "Sets the editor selection to the given node/entity IDs.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "IDs to select" }
      },
      required: ["ids"]
    }
  },
  {
    name: "clear_selection",
    description: "Clears the current editor selection.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "undo",
    description: "Undoes the last editor command.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "set_scene_settings",
    description:
      "Updates scene settings (world physics, fog, ambient, skybox, grass wind, player config). Skybox uses world.skybox; grass wind animates the procedural grass field shader.",
    parameters: {
      type: "object",
      properties: {
        gravityX: { type: "number", description: "Gravity X (default: 0)" },
        gravityY: { type: "number", description: "Gravity Y (default: -9.81)" },
        gravityZ: { type: "number", description: "Gravity Z (default: 0)" },
        physicsEnabled: { type: "boolean", description: "Enable physics simulation" },
        ambientColor: { type: "string", description: "Ambient light hex color" },
        ambientIntensity: { type: "number", description: "Ambient light intensity" },
        fogColor: { type: "string", description: "Fog hex color" },
        fogNear: { type: "number", description: "Fog near distance" },
        fogFar: { type: "number", description: "Fog far distance" },
        skyboxEnabled: { type: "boolean", description: "Enable HDR/image skybox" },
        skyboxSource: { type: "string", description: "Skybox URL or asset path (HDR or image per skyboxFormat)" },
        skyboxFormat: { type: "string", enum: ["hdr", "image"], description: "Skybox file type" },
        skyboxName: { type: "string", description: "Display label for the sky preset" },
        skyboxIntensity: { type: "number", description: "Skybox display intensity" },
        skyboxLightingIntensity: { type: "number", description: "How strongly the sky contributes to scene lighting (when affectsLighting)" },
        skyboxBlur: { type: "number", description: "IBL / sky blur amount" },
        skyboxAffectsLighting: { type: "boolean", description: "Whether skybox drives environmental lighting" },
        grassEnabled: { type: "boolean", description: "Enable procedural grass field in lit viewport" },
        grassWindSpeed: { type: "number", description: "Grass shader wind speed" },
        grassWindStrength: { type: "number", description: "Grass shader wind displacement strength" },
        cameraMode: { type: "string", enum: ["fps", "third-person", "top-down"], description: "Player camera mode" },
        playerHeight: { type: "number", description: "Player height in meters" },
        movementSpeed: { type: "number", description: "Player movement speed" },
        jumpHeight: { type: "number", description: "Player jump height" }
      }
    }
  },
  {
    name: "generate_game_html",
    description:
      "Call this after you have written the complete standalone HTML game in a ```html code block in your message. This tool registers the game artifact so it appears as a playable card in the UI. Do NOT put the HTML in the tool arguments — write it in your message text first, then call this tool with only the title. Default to a premium, polished UI/HUD/layout for game, HTML, browser-based, and viewport-facing experiences unless the user explicitly wants a minimal or debug look.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "A short, descriptive title for the game shown in the UI (e.g. 'Terrain Vehicle Demo')"
        },
        html: {
          type: "string",
          description: "Optional complete standalone index.html for provider fallback mode."
        },
        files: {
          type: "array",
          description: "Optional multi-file project bundle for provider fallback mode. Prefer this over html when possible.",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Project-relative path such as index.html, main.js, scene.js, or style.css" },
              content: { type: "string", description: "Complete file contents" }
            },
            required: ["path", "content"]
          }
        }
      },
      required: ["title"]
    }
  },
  {
    name: "capture_viewport_screenshot",
    description:
      "Capture a screenshot of the active editor viewport so you can inspect what has actually been built. Use this after meaningful scene changes when visual confirmation would help.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Optional short note about what you want to inspect in the screenshot"
        }
      }
    }
  },
  {
    name: "morphus_list_files",
    description:
      "List files in the current Morphus HTML game workspace. Use this before follow-up edits so you can inspect the existing project instead of regenerating it.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "morphus_read_file",
    description:
      "Read a bounded slice of one existing text file from the current Morphus workspace. Use only for files you truly need to edit, and do not reread the same file in one run.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project-relative file path, for example index.html, style.css, or main.js" },
        startLine: { type: "number", description: "Optional 1-based first line to read when you only need a slice." },
        endLine: { type: "number", description: "Optional 1-based last line to read when you only need a slice." },
        maxChars: { type: "number", description: "Optional character cap for the returned content. Defaults to a small safe cap." }
      },
      required: ["path"]
    }
  },
  {
    name: "morphus_search_files",
    description:
      "Search Morphus workspace file paths and text content before reading files. Use this for bug fixes and follow-up edits to find relevant files cheaply, then read only the returned line ranges you need.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Plain text or regex query, for example Audio, morphusAudio, play\\(, goal.mp3, or audio|Audio|play\\(" },
        useRegex: { type: "boolean", description: "Treat query as a JavaScript regular expression. Defaults to false." },
        pathGlob: { type: "string", description: "Optional path substring filter such as .js, audio, index.html, or assets/audio." },
        maxResults: { type: "number", description: "Maximum matches to return. Defaults to 12 and is capped." },
        includeAssets: { type: "boolean", description: "Whether to include binary/asset files in path-only search results. Defaults to false." }
      },
      required: ["query"]
    }
  },
  {
    name: "morphus_write_file",
    description:
      "Replace the full contents of an existing Morphus workspace file. Use only after reading or otherwise knowing the current file contents.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Existing project-relative file path to update" },
        content: { type: "string", description: "Complete replacement file contents" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "morphus_create_file",
    description:
      "Create a new file in the current Morphus workspace. Prefer editing existing files for continue/follow-up requests; create a file only when a new module or asset manifest is genuinely needed.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "New project-relative file path" },
        content: { type: "string", description: "Complete file contents" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "morphus_request_delete_file",
    description:
      "Request user approval to delete a Morphus workspace file. This tool does not delete anything; it records the requested path and reason so the assistant can ask the user before removal.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project-relative file path proposed for deletion" },
        reason: { type: "string", description: "Why deleting this file is necessary" }
      },
      required: ["path", "reason"]
    }
  },
  {
    name: "morphus_request_rename_file",
    description:
      "Request user approval to rename or move a Morphus workspace file. This tool does not rename anything; it records the requested source, destination, and reason.",
    parameters: {
      type: "object",
      properties: {
        fromPath: { type: "string", description: "Existing project-relative file path" },
        toPath: { type: "string", description: "Requested new project-relative file path" },
        reason: { type: "string", description: "Why this rename or move is necessary" }
      },
      required: ["fromPath", "toPath", "reason"]
    }
  },
  {
    name: "push_scene_to_connected_game",
    description:
      "Pushes the current editor scene into the connected scaffolded game dev server. Use it when the user asks to sync or send the current scene to the game.",
    parameters: {
      type: "object",
      properties: {
        forceSwitch: {
          type: "boolean",
          description: "If true, request the game to reload directly into the pushed scene after syncing."
        },
        gameId: {
          type: "string",
          description: "Optional specific connected game ID when more than one game is available."
        },
        projectName: {
          type: "string",
          description: "Optional project display name override for the pushed scene."
        },
        projectSlug: {
          type: "string",
          description: "Optional slug override for the target scene folder."
        }
      }
    }
  },

  // ── Read-only queries ───────────────────────────────────────
  {
    name: "create_articulated_asset",
    description:
      "Creates a true Articraft-generated articulated 3D asset in the editor viewport by calling the local Articraft Python SDK/compiler, compiling an Articraft model.py into URDF/mesh assets, and importing the result. Use this for objects with semantic parts and joints such as robot arms, desk lamps, cabinets with drawers, vehicles with wheels, doors, lids, sliders, hinges, levers, grippers, and mechanisms.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Asset display name, e.g. 'Articulated Desk Lamp'" },
        prompt: {
          type: "string",
          description: "The original natural-language asset request. Used as Articraft provenance metadata."
        },
        x: { type: "number", description: "Root world X position" },
        y: { type: "number", description: "Root world Y position" },
        z: { type: "number", description: "Root world Z position" },
        showJointGuides: {
          type: "boolean",
          description: "Whether to add visible pivot/axis guide primitives for each joint. Default true."
        },
        parts: {
          type: "array",
          description:
            "Semantic parts. Each part becomes a viewport node. Positions are local to parentPartId when provided, otherwise local to the asset root.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Stable part id such as 'base', 'upper_arm', 'drawer'" },
              name: { type: "string", description: "Part display name" },
              parentPartId: { type: "string", description: "Optional parent part id. Use 'root' or omit for root-level parts." },
              semanticRole: {
                type: "string",
                description: "Semantic role such as base, housing, hinge, arm, wheel, drawer, lid, handle, bracket, knob"
              },
              shape: {
                type: "string",
                enum: ["cube", "box", "sphere", "cylinder", "cone"],
                description: "Simple viewport primitive shape"
              },
              x: { type: "number", description: "Local X position" },
              y: { type: "number", description: "Local Y position" },
              z: { type: "number", description: "Local Z position" },
              sizeX: { type: "number", description: "Part size along X" },
              sizeY: { type: "number", description: "Part size along Y" },
              sizeZ: { type: "number", description: "Part size along Z" },
              rotationX: { type: "number", description: "Local X rotation in radians" },
              rotationY: { type: "number", description: "Local Y rotation in radians" },
              rotationZ: { type: "number", description: "Local Z rotation in radians" },
              pivotX: { type: "number", description: "Optional local pivot X for hinge/slider previews" },
              pivotY: { type: "number", description: "Optional local pivot Y for hinge/slider previews" },
              pivotZ: { type: "number", description: "Optional local pivot Z for hinge/slider previews" },
              materialId: { type: "string", description: "Existing material id to use" },
              color: { type: "string", description: "Hex color if a new material should be created for this part" },
              metalness: { type: "number", description: "Optional material metalness 0-1" },
              roughness: { type: "number", description: "Optional material roughness 0-1" },
              mass: { type: "number", description: "Optional physical mass metadata" }
            },
            required: ["id", "name", "shape", "x", "y", "z", "sizeX", "sizeY", "sizeZ"]
          }
        },
        joints: {
          type: "array",
          description:
            "Articulations between parts, using Articraft/URDF-style conventions: origin is in the parent part frame; axis is in the joint frame; revolute values are radians and prismatic values are meters.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Stable joint id, e.g. 'base_to_arm'" },
              name: { type: "string", description: "Joint display name" },
              type: {
                type: "string",
                enum: ["fixed", "revolute", "continuous", "prismatic", "ball"],
                description: "Joint/articulation type"
              },
              parentPartId: { type: "string", description: "Parent part id" },
              childPartId: { type: "string", description: "Child part id" },
              originX: { type: "number", description: "Joint origin X in parent part frame" },
              originY: { type: "number", description: "Joint origin Y in parent part frame" },
              originZ: { type: "number", description: "Joint origin Z in parent part frame" },
              axisX: { type: "number", description: "Joint axis X" },
              axisY: { type: "number", description: "Joint axis Y" },
              axisZ: { type: "number", description: "Joint axis Z" },
              lower: { type: "number", description: "Lower motion limit; radians for revolute, meters for prismatic" },
              upper: { type: "number", description: "Upper motion limit; radians for revolute, meters for prismatic" },
              defaultValue: { type: "number", description: "Optional default preview value" },
              effort: { type: "number", description: "Optional effort limit metadata" },
              velocity: { type: "number", description: "Optional velocity limit metadata" },
              mimicJointId: { type: "string", description: "Optional source joint id this joint mimics" },
              mimicMultiplier: { type: "number", description: "Optional mimic multiplier" },
              mimicOffset: { type: "number", description: "Optional mimic offset" }
            },
            required: ["id", "type", "parentPartId", "childPartId"]
          }
        }
      },
      required: ["name", "parts", "joints"]
    }
  },
  {
    name: "pose_articulated_joint",
    description:
      "Sets a preview pose for one articulated asset joint in the viewport. Revolute/continuous values are radians; prismatic values are meters. The pose is stored on the asset metadata and applied from the child part's saved base transform.",
    parameters: {
      type: "object",
      properties: {
        assetNodeId: { type: "string", description: "Root articulated asset group node id" },
        jointId: { type: "string", description: "Joint id or joint name to pose" },
        value: { type: "number", description: "Joint value in radians or meters" },
        clampToLimits: { type: "boolean", description: "Clamp value to lower/upper limits when present. Default true." }
      },
      required: ["assetNodeId", "jointId", "value"]
    }
  },
  {
    name: "list_nodes",
    description: "Lists the scene node outline as a lightweight hierarchy. Returns IDs, names, kinds, child nodes, and attached entities, but not full node data.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_entities",
    description: "Lists entities in a lightweight form with ID, name, type, and parentId. Use get_entity_details for full data.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_materials",
    description: "Lists all materials in the scene with their ID, name, color, and category.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_scene_paths",
    description: "Lists all scene-level waypoint paths with ids, names, loop state, and points.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_scene_events",
    description: "Lists the standard and custom gameplay events available in the scene.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_hook_types",
    description: "Lists all supported gameplay hook types, including field paths, defaults, emitted events, and listened events.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_articulated_assets",
    description:
      "Lists articulated asset roots created in the viewport, including part/joint counts and current pose metadata.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "get_articulated_asset_details",
    description:
      "Gets full structured part, joint, pose, and node details for one articulated asset root.",
    parameters: {
      type: "object",
      properties: {
        assetNodeId: { type: "string", description: "Root articulated asset group node id" }
      },
      required: ["assetNodeId"]
    }
  },
  {
    name: "get_node_details",
    description: "Gets full details of a specific node, including transform, worldTransform, hierarchy links, hooks, metadata, and node data.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Node ID to inspect" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "get_entity_details",
    description: "Gets full details of a specific entity, including transform, worldTransform, parentId, properties, and hooks.",
    parameters: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Entity ID to inspect" }
      },
      required: ["entityId"]
    }
  },
  {
    name: "get_scene_settings",
    description: "Gets current scene settings. This is the canonical source for player scale, jump height, movement, camera mode, physics, fog, and ambient lighting.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "create_scene_path",
    description: "Creates a new scene-level waypoint path. Paths are referenced by hook config such as path_mover.pathId.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Optional explicit path id" },
        name: { type: "string", description: "Display name" },
        loop: { type: "boolean", description: "Whether the path loops" },
        points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" }
            },
            required: ["x", "y", "z"]
          },
          description: "Waypoint points in world space"
        }
      },
      required: ["name", "points"]
    }
  },
  {
    name: "update_scene_path",
    description: "Updates a scene path by replacing any provided fields such as name, loop, or points.",
    parameters: {
      type: "object",
      properties: {
        pathId: { type: "string", description: "Path id to update" },
        name: { type: "string", description: "New display name" },
        loop: { type: "boolean", description: "Whether the path loops" },
        points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" }
            },
            required: ["x", "y", "z"]
          },
          description: "Replacement waypoint points in world space"
        }
      },
      required: ["pathId"]
    }
  },
  {
    name: "delete_scene_path",
    description: "Deletes a scene-level waypoint path.",
    parameters: {
      type: "object",
      properties: {
        pathId: { type: "string", description: "Path id to delete" }
      },
      required: ["pathId"]
    }
  },
  {
    name: "add_hook",
    description: "Attaches a gameplay hook to a node or entity using the canonical default config for that hook type, then applies any provided config overrides.",
    parameters: {
      type: "object",
      properties: {
        targetKind: { type: "string", enum: ["node", "entity"], description: "Whether the hook attaches to a node or entity" },
        targetId: { type: "string", description: "Node or entity id" },
        hookType: { type: "string", description: "Hook type. Use list_hook_types to inspect supported types." },
        enabled: { type: "boolean", description: "Whether the hook starts enabled" },
        defaultPathId: { type: "string", description: "Optional default path id for path_mover hooks" },
        config: {
          type: "object",
          additionalProperties: true,
          description: "Optional config override object merged into the canonical default config"
        }
      },
      required: ["targetKind", "targetId", "hookType"]
    }
  },
  {
    name: "set_hook_value",
    description: "Sets a specific hook config value by dot path on an existing node/entity hook.",
    parameters: {
      type: "object",
      properties: {
        targetKind: { type: "string", enum: ["node", "entity"], description: "Whether the hook is on a node or entity" },
        targetId: { type: "string", description: "Node or entity id" },
        hookId: { type: "string", description: "Hook id to edit" },
        path: { type: "string", description: "Dot path inside hook.config, for example 'pathId' or 'trigger.event'" },
        value: {
          description: "New value to write at the config path"
        }
      },
      required: ["targetKind", "targetId", "hookId", "path", "value"]
    }
  },
  {
    name: "remove_hook",
    description: "Removes a gameplay hook from a node or entity.",
    parameters: {
      type: "object",
      properties: {
        targetKind: { type: "string", enum: ["node", "entity"], description: "Whether the hook is on a node or entity" },
        targetId: { type: "string", description: "Node or entity id" },
        hookId: { type: "string", description: "Hook id to remove" }
      },
      required: ["targetKind", "targetId", "hookId"]
    }
  },
  {
    name: "list_behavior_trees",
    description: "Lists locally saved behavior trees from the AI Behavior Tree Editor.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_behavior_tree",
    description: "Gets the full nodes and edges for a saved behavior tree by id.",
    parameters: {
      type: "object",
      properties: {
        treeId: { type: "string", description: "Behavior tree id" }
      },
      required: ["treeId"]
    }
  },
  {
    name: "create_behavior_tree",
    description: "Creates a new behavior tree in local storage. By default it starts with a root node only. Set useDefaultTemplate to true for the starter attack/patrol example tree.",
    parameters: {
      type: "object",
      properties: {
        treeId: { type: "string", description: "Optional requested tree id. If omitted, one is derived from the name." },
        name: { type: "string", description: "Tree display name" },
        useDefaultTemplate: { type: "boolean", description: "Whether to start from the built-in sample tree instead of an empty root-only tree" }
      },
      required: ["name"]
    }
  },
  {
    name: "add_behavior_tree_node",
    description: "Adds a node to a behavior tree, optionally connecting it under a parent node.",
    parameters: {
      type: "object",
      properties: {
        treeId: { type: "string", description: "Behavior tree id" },
        nodeType: { type: "string", enum: ["root", "selector", "sequence", "parallel", "inverter", "repeater", "condition", "action"], description: "Behavior tree node type" },
        label: { type: "string", description: "Optional node label" },
        parentNodeId: { type: "string", description: "Optional parent node id to connect from" },
        positionX: { type: "number", description: "Optional canvas X position" },
        positionY: { type: "number", description: "Optional canvas Y position" },
        event: { type: "string", description: "Condition event name" },
        mode: { type: "string", enum: ["allOf", "anyOf"], description: "Condition mode" },
        actionType: { type: "string", description: "Action type, usually emit" },
        actionTarget: { type: "string", description: "Action target/event name" },
        actionValue: { type: "string", description: "Optional action value" },
        count: { type: "number", description: "Repeater count" }
      },
      required: ["treeId", "nodeType"]
    }
  },
  {
    name: "update_behavior_tree_node",
    description: "Updates label, behavior data, or canvas position for an existing behavior tree node.",
    parameters: {
      type: "object",
      properties: {
        treeId: { type: "string", description: "Behavior tree id" },
        nodeId: { type: "string", description: "Node id" },
        label: { type: "string", description: "Updated node label" },
        event: { type: "string", description: "Condition event name" },
        mode: { type: "string", enum: ["allOf", "anyOf"], description: "Condition mode" },
        actionType: { type: "string", description: "Action type" },
        actionTarget: { type: "string", description: "Action target/event name" },
        actionValue: { type: "string", description: "Optional action value" },
        count: { type: "number", description: "Repeater count" },
        positionX: { type: "number", description: "Canvas X position" },
        positionY: { type: "number", description: "Canvas Y position" }
      },
      required: ["treeId", "nodeId"]
    }
  },
  {
    name: "connect_behavior_tree_nodes",
    description: "Creates a directed edge from one behavior tree node to another.",
    parameters: {
      type: "object",
      properties: {
        treeId: { type: "string", description: "Behavior tree id" },
        sourceNodeId: { type: "string", description: "Parent/source node id" },
        targetNodeId: { type: "string", description: "Child/target node id" }
      },
      required: ["treeId", "sourceNodeId", "targetNodeId"]
    }
  },
  {
    name: "delete_behavior_tree_node",
    description: "Deletes a node and any connected edges from a behavior tree.",
    parameters: {
      type: "object",
      properties: {
        treeId: { type: "string", description: "Behavior tree id" },
        nodeId: { type: "string", description: "Node id" }
      },
      required: ["treeId", "nodeId"]
    }
  },
  {
    name: "apply_behavior_tree_layout",
    description: "Automatically lays out the nodes in a behavior tree.",
    parameters: {
      type: "object",
      properties: {
        treeId: { type: "string", description: "Behavior tree id" }
      },
      required: ["treeId"]
    }
  },
  {
    name: "delete_behavior_tree",
    description: "Deletes a saved behavior tree from local storage.",
    parameters: {
      type: "object",
      properties: {
        treeId: { type: "string", description: "Behavior tree id" }
      },
      required: ["treeId"]
    }
  },
  {
    name: "get_mesh_topology",
    description: "Returns the face IDs, vertex IDs with positions, face centers, face normals, and edges for a mesh node. Use this before mesh editing operations to discover which faces/vertices/edges to target.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID to inspect" }
      },
      required: ["nodeId"]
    }
  },

  // ── Mesh editing ────────────────────────────────────────────
  {
    name: "extrude_mesh_faces",
    description: "Extrude one or more faces of a mesh node along their normal by an amount. Use get_mesh_topology first to find face IDs.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to extrude" },
        amount: { type: "number", description: "Extrusion distance in meters (positive = outward)" }
      },
      required: ["nodeId", "faceIds", "amount"]
    }
  },
  {
    name: "extrude_mesh_edge",
    description: "Extrude a boundary edge of a mesh outward, creating a new quad face.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        vertexId1: { type: "string", description: "First vertex ID of the edge" },
        vertexId2: { type: "string", description: "Second vertex ID of the edge" },
        amount: { type: "number", description: "Extrusion distance" }
      },
      required: ["nodeId", "vertexId1", "vertexId2", "amount"]
    }
  },
  {
    name: "bevel_mesh_edges",
    description: "Bevel (chamfer/round) edges of a mesh. Creates smooth transitions at sharp edges.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        edges: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Edges as [[vertexId1, vertexId2], ...] pairs" },
        width: { type: "number", description: "Bevel width in meters" },
        steps: { type: "number", description: "Number of bevel segments (1=flat chamfer, 3+=smooth round)" },
        profile: { type: "string", enum: ["flat", "round"], description: "Bevel profile shape (default: flat)" }
      },
      required: ["nodeId", "edges", "width", "steps"]
    }
  },
  {
    name: "inset_mesh_faces",
    description: "Inset selected faces to create an inner face loop. Use it for panel lines, door/window frames, and prep before extrusion.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to inset" },
        amount: { type: "number", description: "Inset amount in meters" }
      },
      required: ["nodeId", "faceIds", "amount"]
    }
  },
  {
    name: "bridge_mesh_edges",
    description: "Bridge two selected boundary edges with a new face. Use get_mesh_topology first and pass exactly two edge pairs.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        edges: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Two edges as [[vertexId1, vertexId2], [vertexId3, vertexId4]]" }
      },
      required: ["nodeId", "edges"]
    }
  },
  {
    name: "poke_mesh_faces",
    description: "Poke selected faces into triangles from a new center vertex. Useful for radial detail, peaks, and controlled triangulation.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to poke" }
      },
      required: ["nodeId", "faceIds"]
    }
  },
  {
    name: "triangulate_mesh_faces",
    description: "Triangulate selected faces, or all faces when faceIds is omitted. Useful before runtime baking or cleanup.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Optional face IDs to triangulate" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "quadrangulate_mesh_faces",
    description: "Attempt to rebuild selected triangle pairs into quads. Use after triangulation or cleanup when quad authoring is preferred.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to quadrangulate" }
      },
      required: ["nodeId", "faceIds"]
    }
  },
  {
    name: "solidify_mesh",
    description: "Add shell thickness to a mesh as a one-shot topology edit. Prefer add_mesh_modeling_modifier type=solidify for live/non-destructive work.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        thickness: { type: "number", description: "Shell thickness in meters" }
      },
      required: ["nodeId", "thickness"]
    }
  },
  {
    name: "mirror_mesh",
    description: "Mirror a mesh across one local axis as a one-shot topology edit. Prefer the modeling stack for reusable symmetry.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Mirror axis" }
      },
      required: ["nodeId", "axis"]
    }
  },
  {
    name: "weld_mesh_vertices_by_distance",
    description: "Merge vertices within a distance threshold. Use for cleanup after boolean, bridge, mirror, import, or remesh-style edits.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        vertexIds: { type: "array", items: { type: "string" }, description: "Optional vertex IDs to restrict the weld" },
        distance: { type: "number", description: "Maximum merge distance in meters" }
      },
      required: ["nodeId", "distance"]
    }
  },
  {
    name: "weld_mesh_vertices_to_target",
    description: "Target-weld source vertices into one target vertex. Use for precise cleanup and snapping holes shut.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        targetVertexId: { type: "string", description: "Vertex ID that receives the weld" },
        sourceVertexIds: { type: "array", items: { type: "string" }, description: "Vertex IDs to merge into the target" }
      },
      required: ["nodeId", "targetVertexId", "sourceVertexIds"]
    }
  },
  {
    name: "subdivide_mesh_face",
    description: "Subdivide a mesh face into smaller faces. Quad faces get a grid pattern, others get radial.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceId: { type: "string", description: "Face ID to subdivide" },
        cuts: { type: "number", description: "Number of cuts (1=2x2 for quads, 2=3x3, etc.)" }
      },
      required: ["nodeId", "faceId", "cuts"]
    }
  },
  {
    name: "cut_mesh_face",
    description: "Cut a mesh face with a line passing through a point, splitting it into two faces.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceId: { type: "string", description: "Face ID to cut" },
        pointX: { type: "number", description: "X coordinate of cut point on the face" },
        pointY: { type: "number", description: "Y coordinate" },
        pointZ: { type: "number", description: "Z coordinate" },
        snapSize: { type: "number", description: "Snap resolution (default: 1)" }
      },
      required: ["nodeId", "faceId", "pointX", "pointY", "pointZ"]
    }
  },
  {
    name: "cut_mesh_between_edges",
    description: "Knife-cut a polygon by connecting the midpoints of two non-adjacent edges on the same face.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        edges: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Exactly two non-adjacent edges as [[vertexId1, vertexId2], [vertexId3, vertexId4]]" }
      },
      required: ["nodeId", "edges"]
    }
  },
  {
    name: "delete_mesh_faces",
    description: "Delete faces from a mesh, leaving real holes. Use only for intentional openings to empty space or adjacent voids, not as a shortcut for doorway- or hallway-sized passages.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to delete" }
      },
      required: ["nodeId", "faceIds"]
    }
  },
  {
    name: "merge_mesh_faces",
    description: "Merge adjacent coplanar faces into a single face.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to merge (must be coplanar and adjacent)" }
      },
      required: ["nodeId", "faceIds"]
    }
  },
  {
    name: "merge_mesh_vertices",
    description: "Merge multiple vertices to their average position.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        vertexIds: { type: "array", items: { type: "string" }, description: "Vertex IDs to merge" }
      },
      required: ["nodeId", "vertexIds"]
    }
  },
  {
    name: "translate_mesh_vertices",
    description: "Translate selected mesh vertices in world space. Use this to reposition a cap or face region after cutting or extruding.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        vertexIds: { type: "array", items: { type: "string" }, description: "Vertex IDs to move" },
        offsetX: { type: "number", description: "World X offset in meters" },
        offsetY: { type: "number", description: "World Y offset in meters" },
        offsetZ: { type: "number", description: "World Z offset in meters" }
      },
      required: ["nodeId", "vertexIds", "offsetX", "offsetY", "offsetZ"]
    }
  },
  {
    name: "scale_mesh_vertices",
    description: "Scale selected mesh vertices around their centroid or an optional pivot. Use this to widen or narrow an extruded cap before the next extrusion.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        vertexIds: { type: "array", items: { type: "string" }, description: "Vertex IDs to scale" },
        scaleX: { type: "number", description: "World-axis scale factor around the pivot for X" },
        scaleY: { type: "number", description: "World-axis scale factor around the pivot for Y" },
        scaleZ: { type: "number", description: "World-axis scale factor around the pivot for Z" },
        pivotX: { type: "number", description: "Optional pivot X. Defaults to the selected vertices centroid." },
        pivotY: { type: "number", description: "Optional pivot Y. Defaults to the selected vertices centroid." },
        pivotZ: { type: "number", description: "Optional pivot Z. Defaults to the selected vertices centroid." }
      },
      required: ["nodeId", "vertexIds", "scaleX", "scaleY", "scaleZ"]
    }
  },
  {
    name: "fill_mesh_face",
    description: "Create a new face from a loop of boundary vertices, filling a hole in the mesh.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        vertexIds: { type: "array", items: { type: "string" }, description: "Vertex IDs forming the boundary loop (>=3, must be boundary vertices)" }
      },
      required: ["nodeId", "vertexIds"]
    }
  },
  {
    name: "invert_mesh_normals",
    description: "Flip face normals (winding order) on selected or all faces of a mesh.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to invert (omit for all faces)" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "arc_mesh_edges",
    description: "Curve straight edges into arcs by inserting interpolated vertices.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        edges: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Edges as [[vertexId1, vertexId2], ...] pairs" },
        offset: { type: "number", description: "Arc height/offset in meters" },
        segments: { type: "number", description: "Number of arc segments (minimum 2)" }
      },
      required: ["nodeId", "edges", "offset", "segments"]
    }
  },
  {
    name: "inflate_mesh",
    description: "Move all vertices of mesh nodes along their averaged normals (inflate/deflate).",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Mesh node IDs" },
        factor: { type: "number", description: "Inflate factor (positive = outward, negative = inward)" }
      },
      required: ["nodeIds", "factor"]
    }
  },
  {
    name: "convert_brush_to_mesh",
    description: "Convert a legacy brush node into an editable mesh node, enabling the preferred face/edge/vertex editing workflow.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Brush node ID to convert" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "capture_mesh_modeling_base",
    description: "Capture the current mesh topology as the base for a live/non-destructive modeling stack.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "rebuild_mesh_modeling_stack",
    description: "Re-evaluate the mesh modeling stack from its captured base topology and current modifiers.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "add_mesh_modeling_modifier",
    description: "Add a live/non-destructive modeling modifier. Supports boolean, mirror, solidify, lattice, remesh, and retopo modifiers.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        type: { type: "string", enum: ["boolean", "mirror", "solidify", "lattice", "remesh", "retopo"], description: "Modifier type" },
        label: { type: "string", description: "Display label" },
        enabled: { type: "boolean", description: "Whether the modifier is enabled" },
        operation: { type: "string", enum: ["union", "difference", "intersect"], description: "Boolean operation" },
        targetNodeId: { type: "string", description: "Boolean target mesh node ID" },
        mode: { type: "string", description: "Boolean mode apply/live, lattice mode bend/twist/taper/shear, or remesh mode cleanup/quad/voxel" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Mirror/lattice axis" },
        weld: { type: "boolean", description: "Mirror weld/symmetry weld toggle" },
        thickness: { type: "number", description: "Solidify thickness in meters" },
        intensity: { type: "number", description: "Lattice intensity" },
        falloff: { type: "number", description: "Lattice falloff" },
        resolution: { type: "number", description: "Remesh resolution" },
        smoothing: { type: "number", description: "Remesh smoothing amount" },
        weldDistance: { type: "number", description: "Cleanup weld distance" },
        preserveBorders: { type: "boolean", description: "Retopo preserve-border toggle" },
        targetFaceCount: { type: "number", description: "Retopo target face count" }
      },
      required: ["nodeId", "type"]
    }
  },
  {
    name: "update_mesh_modeling_modifier",
    description: "Update fields on an existing live modeling modifier by modifierId.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        modifierId: { type: "string", description: "Modifier ID to update" },
        label: { type: "string", description: "Display label" },
        enabled: { type: "boolean", description: "Whether the modifier is enabled" },
        operation: { type: "string", enum: ["union", "difference", "intersect"], description: "Boolean operation" },
        targetNodeId: { type: "string", description: "Boolean target mesh node ID" },
        mode: { type: "string", description: "Boolean, lattice, or remesh mode" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Mirror/lattice axis" },
        weld: { type: "boolean", description: "Mirror weld/symmetry weld toggle" },
        thickness: { type: "number", description: "Solidify thickness in meters" },
        intensity: { type: "number", description: "Lattice intensity" },
        falloff: { type: "number", description: "Lattice falloff" },
        resolution: { type: "number", description: "Remesh resolution" },
        smoothing: { type: "number", description: "Remesh smoothing amount" },
        weldDistance: { type: "number", description: "Cleanup weld distance" },
        preserveBorders: { type: "boolean", description: "Retopo preserve-border toggle" },
        targetFaceCount: { type: "number", description: "Retopo target face count" }
      },
      required: ["nodeId", "modifierId"]
    }
  },
  {
    name: "remove_mesh_modeling_modifier",
    description: "Remove a live/non-destructive modeling modifier from a mesh.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        modifierId: { type: "string", description: "Modifier ID to remove" }
      },
      required: ["nodeId", "modifierId"]
    }
  },
  {
    name: "set_mesh_symmetry",
    description: "Enable or update live symmetry settings for a mesh modeling stack.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        enabled: { type: "boolean", description: "Whether symmetry is enabled" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Symmetry mirror axis" },
        weld: { type: "boolean", description: "Whether symmetry should weld mirrored seams" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "create_mesh_polygroup",
    description: "Create a PolyGroup/face group from selected face IDs for material IDs, retopo regions, LOD planning, and bake masks.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to include" },
        name: { type: "string", description: "Group display name" },
        groupId: { type: "string", description: "Optional stable group ID" },
        color: { type: "string", description: "Hex color for the group" }
      },
      required: ["nodeId", "faceIds"]
    }
  },
  {
    name: "assign_faces_to_mesh_polygroup",
    description: "Add more face IDs to an existing PolyGroup.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        groupId: { type: "string", description: "Existing PolyGroup ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to add" }
      },
      required: ["nodeId", "groupId", "faceIds"]
    }
  },
  {
    name: "create_mesh_smoothing_group",
    description: "Create a smoothing group over selected faces with a target smoothing angle.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to include" },
        name: { type: "string", description: "Group display name" },
        groupId: { type: "string", description: "Optional stable group ID" },
        angle: { type: "number", description: "Smoothing angle in degrees" }
      },
      required: ["nodeId", "faceIds"]
    }
  },
  {
    name: "set_mesh_lod_profiles",
    description: "Author LOD targets for runtime export. Pass profiles with ratios/faceCounts, or ratios for generated profiles.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        ratios: { type: "array", items: { type: "number" }, description: "LOD reduction ratios such as [0.7, 0.4, 0.18]" },
        profiles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              ratio: { type: "number" },
              faceCount: { type: "number" }
            }
          },
          description: "Explicit LOD profiles"
        }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "queue_mesh_bake_outputs",
    description: "Queue bake-map output slots for runtime asset production: normals, AO, curvature, ID masks, and vertex colors.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        kinds: { type: "array", items: { type: "string", enum: ["normals", "ao", "curvature", "id-mask", "vertex-colors"] }, description: "Bake map kinds to queue" },
        resolution: { type: "number", description: "Bake texture resolution, default 2048" },
        sourceGroupId: { type: "string", description: "Optional PolyGroup/source group ID" },
        replaceExisting: { type: "boolean", description: "Replace existing queued outputs for the same kind, default true" }
      },
      required: ["nodeId", "kinds"]
    }
  },
  {
    name: "unwrap_mesh_uvs",
    description: "Create or replace explicit UVs on mesh faces using smart unwrap, planar, box, or cylindrical projection.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Optional face IDs; omit for whole mesh" },
        mode: { type: "string", enum: ["smart", "planar", "box", "cylindrical"], description: "UV unwrap/projection mode" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Projection axis for planar/cylindrical modes" },
        angleThresholdDegrees: { type: "number", description: "Smart unwrap hard-edge seam angle, default 66" },
        margin: { type: "number", description: "Packing margin 0-0.2, default 0.02" },
        scaleU: { type: "number", description: "U scale for projection" },
        scaleV: { type: "number", description: "V scale for projection" },
        offsetU: { type: "number", description: "U offset for projection" },
        offsetV: { type: "number", description: "V offset for projection" }
      },
      required: ["nodeId", "mode"]
    }
  },
  {
    name: "pack_mesh_uvs",
    description: "Pack existing mesh UV islands into 0-1 UV space with deterministic shelf packing.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Optional face IDs; omit for whole mesh" },
        margin: { type: "number", description: "Island margin, default 0.02" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "mark_mesh_uv_seams",
    description: "Mark UV seams using vertex-id edge pairs. Use list_mesh_topology first to inspect vertex IDs and edges.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        edges: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Edges as [[vertexId1, vertexId2], ...]" },
        append: { type: "boolean", description: "Append to existing seams, default true" }
      },
      required: ["nodeId", "edges"]
    }
  },
  {
    name: "normalize_mesh_texel_density",
    description: "Scale selected face UVs to a target texel density for game-production texture consistency.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Optional face IDs; omit for whole mesh" },
        pixelsPerMeter: { type: "number", description: "Target pixels per meter, default 512" },
        textureResolution: { type: "number", description: "Texture resolution in pixels, default 1024" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "paint_mesh_face_material",
    description: "Assign a material to mesh faces and register it as a mesh-local material slot.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to paint; omit for all faces" },
        materialId: { type: "string", description: "Material ID from list_materials" }
      },
      required: ["nodeId", "materialId"]
    }
  },
  {
    name: "paint_mesh_vertex_color",
    description: "Paint RGBA vertex colors onto mesh face corners. Hex color is easiest, e.g. #ff8844.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to paint; omit for all faces" },
        color: { type: "string", description: "Hex color such as #ffffff" },
        r: { type: "number", description: "Red 0-1 when not using color" },
        g: { type: "number", description: "Green 0-1 when not using color" },
        b: { type: "number", description: "Blue 0-1 when not using color" },
        alpha: { type: "number", description: "Alpha 0-1, default 1" },
        strength: { type: "number", description: "Paint strength 0-1, default 1" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "add_mesh_surface_blend_layer",
    description: "Add or update one of the mesh's up-to-4 PBR texture blend layers, usually from an existing material.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        layerId: { type: "string", description: "Stable blend layer ID. Defaults to blend:<materialId>" },
        materialId: { type: "string", description: "Existing material ID to copy color/textures from" },
        name: { type: "string", description: "Layer display name" },
        color: { type: "string", description: "Fallback layer color" },
        colorTexture: { type: "string", description: "Color texture URL/data URI" },
        normalTexture: { type: "string", description: "Normal texture URL/data URI" },
        metalnessTexture: { type: "string", description: "Metalness texture URL/data URI" },
        roughnessTexture: { type: "string", description: "Roughness texture URL/data URI" },
        metalness: { type: "number", description: "Layer metalness 0-1" },
        roughness: { type: "number", description: "Layer roughness 0-1" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "paint_mesh_texture_blend",
    description: "Paint normalized per-corner weights for a mesh surface blend layer.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to paint; omit for all faces" },
        layerId: { type: "string", description: "Blend layer ID to paint" },
        strength: { type: "number", description: "Paint strength 0-1, default 1" }
      },
      required: ["nodeId", "layerId"]
    }
  },
  {
    name: "add_mesh_projected_decal",
    description: "Add a live projected decal record to a mesh for editor and runtime overlay rendering.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        decalId: { type: "string", description: "Optional stable decal ID" },
        name: { type: "string", description: "Decal display name" },
        materialId: { type: "string", description: "Optional material ID to copy texture/color from" },
        texture: { type: "string", description: "Optional decal texture URL/data URI" },
        color: { type: "string", description: "Fallback decal color" },
        blendMode: { type: "string", enum: ["normal", "multiply", "add"], description: "Decal blend mode" },
        opacity: { type: "number", description: "Opacity 0-1" },
        x: { type: "number", description: "Local projected decal center X" },
        y: { type: "number", description: "Local projected decal center Y" },
        z: { type: "number", description: "Local projected decal center Z" },
        normalX: { type: "number", description: "Projection normal X" },
        normalY: { type: "number", description: "Projection normal Y" },
        normalZ: { type: "number", description: "Projection normal Z" },
        upX: { type: "number", description: "Decal up vector X" },
        upY: { type: "number", description: "Decal up vector Y" },
        upZ: { type: "number", description: "Decal up vector Z" },
        sizeX: { type: "number", description: "Decal width in mesh-local units" },
        sizeY: { type: "number", description: "Decal height in mesh-local units" },
        depth: { type: "number", description: "Projection depth" },
        faceIds: { type: "array", items: { type: "string" }, description: "Optional target face IDs" }
      },
      required: ["nodeId", "x", "y", "z", "normalX", "normalY", "normalZ", "sizeX", "sizeY"]
    }
  },
  {
    name: "split_brush_at_coordinate",
    description: "Split a brush node at an exact world coordinate along an axis (more precise than split_brush which only splits at the midpoint).",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Brush node ID" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Axis to split along" },
        coordinate: { type: "number", description: "World coordinate to split at" }
      },
      required: ["nodeId", "axis", "coordinate"]
    }
  }
];

/** Viewport-editor Copilot tools only. Standalone HTML generation belongs to Morphus. */
export const EDITOR_COPILOT_TOOL_DECLARATIONS: CopilotToolDeclaration[] =
  COPILOT_TOOL_DECLARATIONS.filter((tool) => !tool.name.startsWith("morphus_") && tool.name !== "generate_game_html");

/** Only `generate_game_html` — used when the model's task is a standalone game or browser-based interactive experience */
export const GAME_TOOL_DECLARATIONS: CopilotToolDeclaration[] =
  COPILOT_TOOL_DECLARATIONS.filter((tool) =>
    tool.name === "generate_game_html" || tool.name.startsWith("morphus_")
  );

/**
 * Return `true` when the user's prompt is clearly a standalone-game or browser-based
 * interactive request (not a scene-editing request). In that case we expose only
 * `generate_game_html`
 * instead of the full editor tool catalog so the model context stays lean.
 */
export function isGameGenerationPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const gameKeywords = [
    "make me a game",
    "create a game",
    "build a game",
    "make a game",
    "generate a game",
    "make a playable",
    "create a playable",
    "build a playable",
    "create a prototype",
    "make a prototype",
    "build a prototype",
    "generate a prototype",
    "create a demo",
    "make a demo",
    "build a demo",
    "generate a demo",
    "open world",
    "car game",
    "vehicle game",
    "terrain vehicle",
    "3d game",
    "webgpu game",
    "three.js game",
    "threejs game",
    "standalone game",
    "html game",
    "browser game",
    "browser-based experience",
    "browser based experience",
    "web-based experience",
    "web based experience",
    "standalone html",
    "html prototype",
    "html demo",
    "html experience",
    "interactive prototype",
    "interactive demo",
    "viewport demo",
    "premium viewport demo",
    "platformer",
    "fps game",
    "racing game",
    "shooter game",
    "sandbox game",
    "brick builder",
    "lego",
    "voxel",
    "city builder",
    "build and place",
    "place blocks",
    "block builder",
    "sculpting tool",
    "building tool",
    "building simulator",
    "construction game",
  ];
  return gameKeywords.some((kw) => lower.includes(kw));
}
