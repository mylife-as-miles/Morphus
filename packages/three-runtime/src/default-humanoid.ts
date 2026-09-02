import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type ColorRepresentation,
  type Material
} from "three";

export type DefaultHumanoidVariant = "neutral" | "player" | "npc";
export type DefaultHumanoidPose = "a-pose" | "idle" | "runtime";
export type DefaultHumanoidEmphasis = "default" | "hover" | "selected";

export type DefaultHumanoidRig = {
  attachmentPoints: {
    back: Object3D;
    head: Object3D;
    leftHand: Object3D;
    rightHand: Object3D;
  };
  chest: Group;
  core: Group;
  head: Group;
  leftArm: Group;
  leftLeg: Group;
  pelvis: Group;
  rightArm: Group;
  rightLeg: Group;
  root: Group;
};

export type CreateDefaultHumanoidRigOptions = {
  accentColor?: ColorRepresentation;
  emphasis?: DefaultHumanoidEmphasis;
  height?: number;
  pose?: DefaultHumanoidPose;
  showSpawnBase?: boolean;
  variant?: DefaultHumanoidVariant;
};

type HumanoidPalette = {
  accent: ColorRepresentation;
  accentSecondary: ColorRepresentation;
  shell: ColorRepresentation;
  shellSecondary: ColorRepresentation;
  underlay: ColorRepresentation;
  visor: ColorRepresentation;
};

type MeshMaterialSet = {
  accent: MeshStandardMaterial;
  panel: MeshStandardMaterial;
  ring: MeshStandardMaterial;
  shell: MeshStandardMaterial;
  underlay: MeshStandardMaterial;
  visor: MeshStandardMaterial;
};

const HUMANOID_BASE_HEIGHT = 1.8;

export function createDefaultHumanoidRig(options: CreateDefaultHumanoidRigOptions = {}): DefaultHumanoidRig {
  const {
    accentColor,
    emphasis = "default",
    height = HUMANOID_BASE_HEIGHT,
    pose = "idle",
    showSpawnBase = false,
    variant = "neutral"
  } = options;

  const palette = resolvePalette(variant, emphasis, accentColor);
  const materials = createMaterialSet(palette, emphasis);
  const dimensions = resolveDimensions(height);

  const root = new Group();
  root.name = "DefaultHumanoid";
  root.userData.defaultHumanoid = {
    emphasis,
    pose,
    variant
  };

  const pelvis = new Group();
  pelvis.name = "bone:pelvis";
  pelvis.position.set(0, dimensions.pelvisY, 0);
  root.add(pelvis);

  const core = new Group();
  core.name = "bone:spine.01";
  pelvis.add(core);

  const chest = new Group();
  chest.name = "bone:spine.03";
  chest.position.set(0, dimensions.chestY, 0);
  core.add(chest);

  const head = new Group();
  head.name = "bone:head";
  head.position.set(0, dimensions.headY, 0);
  chest.add(head);

  const leftArm = new Group();
  leftArm.name = "bone:upperArm.L";
  leftArm.position.set(dimensions.shoulderX, dimensions.shoulderY, 0);
  chest.add(leftArm);

  const rightArm = new Group();
  rightArm.name = "bone:upperArm.R";
  rightArm.position.set(-dimensions.shoulderX, dimensions.shoulderY, 0);
  chest.add(rightArm);

  const leftLeg = new Group();
  leftLeg.name = "bone:upperLeg.L";
  leftLeg.position.set(dimensions.hipX, dimensions.hipY, 0);
  pelvis.add(leftLeg);

  const rightLeg = new Group();
  rightLeg.name = "bone:upperLeg.R";
  rightLeg.position.set(-dimensions.hipX, dimensions.hipY, 0);
  pelvis.add(rightLeg);

  const headSocket = createSocket("socket:head");
  const backSocket = createSocket("socket:back");
  const leftHandSocket = createSocket("socket:hand.L");
  const rightHandSocket = createSocket("socket:hand.R");
  headSocket.position.set(0, dimensions.headRadius * 0.92, 0);
  backSocket.position.set(0, dimensions.upperTorsoHeight * 0.06, -dimensions.torsoDepth * 0.56);
  leftHandSocket.position.set(0, -dimensions.forearmLength - dimensions.handHeight * 0.1, dimensions.handDepth * 0.2);
  rightHandSocket.position.copy(leftHandSocket.position);
  head.add(headSocket);
  chest.add(backSocket);
  leftArm.add(leftHandSocket);
  rightArm.add(rightHandSocket);

  buildPelvis(pelvis, dimensions, materials);
  buildTorso(core, chest, dimensions, materials);
  buildHead(head, dimensions, materials);
  buildArm(leftArm, "left", dimensions, materials);
  buildArm(rightArm, "right", dimensions, materials);
  buildLeg(leftLeg, dimensions, materials);
  buildLeg(rightLeg, dimensions, materials);

  if (showSpawnBase) {
    buildSpawnBase(root, dimensions, materials);
  }

  applyPose({
    chest,
    core,
    head,
    leftArm,
    leftLeg,
    pose,
    rightArm,
    rightLeg
  });

  return {
    attachmentPoints: {
      back: backSocket,
      head: headSocket,
      leftHand: leftHandSocket,
      rightHand: rightHandSocket
    },
    chest,
    core,
    head,
    leftArm,
    leftLeg,
    pelvis,
    rightArm,
    rightLeg,
    root
  };
}

export function disposeDefaultHumanoidRig(rig: DefaultHumanoidRig) {
  const materials = new Set<Material>();
  const geometries = new Set<BufferGeometry>();

  rig.root.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    geometries.add(child.geometry);

    if (Array.isArray(child.material)) {
      child.material.forEach((material) => materials.add(material));
      return;
    }

    materials.add(child.material);
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function buildPelvis(parent: Group, dimensions: ReturnType<typeof resolveDimensions>, materials: MeshMaterialSet) {
  parent.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.hipWidth, dimensions.pelvisHeight, dimensions.torsoDepth * 0.92),
      material: materials.panel,
      name: "mesh:pelvis-shell",
      position: [0, 0.03, 0]
    })
  );
  parent.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.hipWidth * 0.88, dimensions.pelvisHeight * 0.36, dimensions.torsoDepth * 0.62),
      material: materials.underlay,
      name: "mesh:pelvis-core",
      position: [0, -dimensions.pelvisHeight * 0.04, 0]
    })
  );
  parent.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.hipWidth * 0.52, dimensions.pelvisHeight * 0.14, dimensions.torsoDepth * 1.05),
      material: materials.accent,
      name: "mesh:pelvis-accent",
      position: [0, dimensions.pelvisHeight * 0.22, 0]
    })
  );
}

function buildTorso(
  core: Group,
  chest: Group,
  dimensions: ReturnType<typeof resolveDimensions>,
  materials: MeshMaterialSet
) {
  core.add(
    createMesh({
      geometry: new CapsuleGeometry(dimensions.waistRadius, capsuleCylinderLength(dimensions.abdomenHeight, dimensions.waistRadius), 6, 16),
      material: materials.shell,
      name: "mesh:abdomen-shell",
      position: [0, dimensions.abdomenHeight * 0.42, 0],
      scale: [0.88, 1, 0.76]
    })
  );
  core.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.waistRadius * 1.72, dimensions.abdomenHeight * 0.44, dimensions.torsoDepth * 0.48),
      material: materials.underlay,
      name: "mesh:abdomen-underlay",
      position: [0, dimensions.abdomenHeight * 0.2, -dimensions.torsoDepth * 0.02]
    })
  );
  core.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.waistRadius * 0.8, dimensions.abdomenHeight * 0.22, dimensions.torsoDepth * 0.9),
      material: materials.accent,
      name: "mesh:waist-band",
      position: [0, dimensions.abdomenHeight * 0.62, 0]
    })
  );

  chest.add(
    createMesh({
      geometry: new CapsuleGeometry(dimensions.chestRadius, capsuleCylinderLength(dimensions.upperTorsoHeight, dimensions.chestRadius), 8, 20),
      material: materials.shell,
      name: "mesh:torso-shell",
      position: [0, dimensions.upperTorsoHeight * 0.3, 0],
      scale: [1.02, 1.04, 0.78]
    })
  );
  chest.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.chestWidth * 0.72, dimensions.upperTorsoHeight * 0.34, dimensions.torsoDepth * 0.48),
      material: materials.panel,
      name: "mesh:sternum-shell",
      position: [0, dimensions.upperTorsoHeight * 0.26, dimensions.torsoDepth * 0.28]
    })
  );
  chest.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.chestWidth * 0.28, dimensions.upperTorsoHeight * 0.16, dimensions.torsoDepth * 0.08),
      material: materials.accent,
      name: "mesh:sternum-light",
      position: [0, dimensions.upperTorsoHeight * 0.36, dimensions.torsoDepth * 0.54]
    })
  );
  chest.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.chestWidth * 0.32, dimensions.upperTorsoHeight * 0.52, dimensions.torsoDepth * 0.12),
      material: materials.underlay,
      name: "mesh:spine-shell",
      position: [0, dimensions.upperTorsoHeight * 0.22, -dimensions.torsoDepth * 0.5]
    })
  );
  chest.add(
    createMesh({
      geometry: new SphereGeometry(dimensions.shoulderPodRadius, 14, 14),
      material: materials.panel,
      name: "mesh:shoulder-pad.L",
      position: [dimensions.shoulderX * 0.9, dimensions.shoulderY - dimensions.upperTorsoHeight * 0.04, 0]
    })
  );
  chest.add(
    createMesh({
      geometry: new SphereGeometry(dimensions.shoulderPodRadius, 14, 14),
      material: materials.panel,
      name: "mesh:shoulder-pad.R",
      position: [-dimensions.shoulderX * 0.9, dimensions.shoulderY - dimensions.upperTorsoHeight * 0.04, 0]
    })
  );
}

function buildHead(parent: Group, dimensions: ReturnType<typeof resolveDimensions>, materials: MeshMaterialSet) {
  parent.add(
    createMesh({
      geometry: new CylinderGeometry(dimensions.neckRadius * 0.82, dimensions.neckRadius, dimensions.neckHeight, 12),
      material: materials.underlay,
      name: "mesh:neck-core",
      position: [0, -dimensions.headRadius * 0.84, 0]
    })
  );
  parent.add(
    createMesh({
      geometry: new SphereGeometry(dimensions.headRadius, 20, 18),
      material: materials.shell,
      name: "mesh:head-shell",
      position: [0, 0, 0],
      scale: [0.82, 0.96, 0.84]
    })
  );
  parent.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.headRadius * 1.04, dimensions.headRadius * 0.26, dimensions.headRadius * 0.12),
      material: materials.visor,
      name: "mesh:visor",
      position: [0, dimensions.headRadius * 0.04, dimensions.headRadius * 0.66]
    })
  );
  parent.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.headRadius * 0.42, dimensions.headRadius * 0.08, dimensions.headRadius * 0.06),
      material: materials.accent,
      name: "mesh:visor-highlight",
      position: [0, dimensions.headRadius * 0.03, dimensions.headRadius * 0.74]
    })
  );
}

function buildArm(
  parent: Group,
  side: "left" | "right",
  dimensions: ReturnType<typeof resolveDimensions>,
  materials: MeshMaterialSet
) {
  const sideSign = side === "left" ? 1 : -1;
  const forearmAnchor = new Group();
  forearmAnchor.name = `bone:lowerArm.${side === "left" ? "L" : "R"}`;
  forearmAnchor.position.set(0, -dimensions.upperArmLength, 0);
  parent.add(forearmAnchor);

  parent.add(
    createMesh({
      geometry: new CapsuleGeometry(dimensions.armRadius, capsuleCylinderLength(dimensions.upperArmLength * 0.9, dimensions.armRadius), 6, 14),
      material: materials.shell,
      name: `mesh:upper-arm.${side}`,
      position: [0, -dimensions.upperArmLength * 0.48, 0],
      rotation: [0, 0, sideSign * 0.04],
      scale: [0.96, 1, 0.92]
    })
  );
  parent.add(
    createMesh({
      geometry: new SphereGeometry(dimensions.armRadius * 0.76, 12, 12),
      material: materials.underlay,
      name: `mesh:elbow.${side}`,
      position: [0, -dimensions.upperArmLength * 0.98, 0]
    })
  );

  forearmAnchor.add(
    createMesh({
      geometry: new CapsuleGeometry(dimensions.forearmRadius, capsuleCylinderLength(dimensions.forearmLength * 0.88, dimensions.forearmRadius), 6, 12),
      material: materials.panel,
      name: `mesh:forearm.${side}`,
      position: [0, -dimensions.forearmLength * 0.44, 0],
      rotation: [0, 0, sideSign * 0.02],
      scale: [0.94, 1, 0.9]
    })
  );
  forearmAnchor.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.handWidth, dimensions.handHeight, dimensions.handDepth),
      material: materials.panel,
      name: `mesh:hand.${side}`,
      position: [0, -dimensions.forearmLength - dimensions.handHeight * 0.1, dimensions.handDepth * 0.08],
      rotation: [0.08, 0, 0]
    })
  );
}

function buildLeg(parent: Group, dimensions: ReturnType<typeof resolveDimensions>, materials: MeshMaterialSet) {
  const shinAnchor = new Group();
  shinAnchor.name = `bone:lowerLeg.${parent.name.endsWith(".L") ? "L" : "R"}`;
  shinAnchor.position.set(0, -dimensions.thighLength, 0);
  parent.add(shinAnchor);

  parent.add(
    createMesh({
      geometry: new CapsuleGeometry(dimensions.thighRadius, capsuleCylinderLength(dimensions.thighLength * 0.9, dimensions.thighRadius), 6, 14),
      material: materials.panel,
      name: `mesh:thigh.${parent.name.endsWith(".L") ? "left" : "right"}`,
      position: [0, -dimensions.thighLength * 0.48, 0],
      scale: [1.02, 1, 0.94]
    })
  );
  parent.add(
    createMesh({
      geometry: new SphereGeometry(dimensions.kneeRadius, 12, 12),
      material: materials.underlay,
      name: `mesh:knee.${parent.name.endsWith(".L") ? "left" : "right"}`,
      position: [0, -dimensions.thighLength * 0.98, 0]
    })
  );

  shinAnchor.add(
    createMesh({
      geometry: new CapsuleGeometry(dimensions.calfRadius, capsuleCylinderLength(dimensions.calfLength * 0.92, dimensions.calfRadius), 6, 14),
      material: materials.shell,
      name: `mesh:calf.${parent.name.endsWith(".L") ? "left" : "right"}`,
      position: [0, -dimensions.calfLength * 0.46, 0],
      scale: [0.96, 1, 0.92]
    })
  );
  shinAnchor.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.footWidth, dimensions.footHeight, dimensions.footLength),
      material: materials.panel,
      name: `mesh:foot.${parent.name.endsWith(".L") ? "left" : "right"}`,
      position: [0, -dimensions.calfLength - dimensions.footHeight * 0.16, dimensions.footLength * 0.22],
      rotation: [-0.08, 0, 0]
    })
  );
  shinAnchor.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.footWidth * 0.42, dimensions.footHeight * 0.36, dimensions.footLength * 0.18),
      material: materials.accent,
      name: `mesh:toe-accent.${parent.name.endsWith(".L") ? "left" : "right"}`,
      position: [0, -dimensions.calfLength - dimensions.footHeight * 0.02, dimensions.footLength * 0.45],
      rotation: [-0.08, 0, 0]
    })
  );
}

function buildSpawnBase(parent: Group, dimensions: ReturnType<typeof resolveDimensions>, materials: MeshMaterialSet) {
  parent.add(
    createMesh({
      geometry: new CylinderGeometry(dimensions.baseRadius * 0.92, dimensions.baseRadius, dimensions.baseThickness, 24),
      material: materials.underlay,
      name: "mesh:spawn-disc",
      position: [0, dimensions.baseThickness * 0.48, 0]
    })
  );
  parent.add(
    createMesh({
      geometry: new TorusGeometry(dimensions.baseRadius, dimensions.baseThickness * 0.34, 10, 32),
      material: materials.ring,
      name: "mesh:spawn-ring",
      position: [0, dimensions.baseThickness * 1.1, 0],
      rotation: [Math.PI * 0.5, 0, 0]
    })
  );
  parent.add(
    createMesh({
      geometry: new BoxGeometry(dimensions.baseThickness * 2.8, dimensions.baseThickness * 0.7, dimensions.baseRadius * 0.32),
      material: materials.accent,
      name: "mesh:spawn-heading",
      position: [0, dimensions.baseThickness * 1.08, dimensions.baseRadius * 0.82]
    })
  );
}

function applyPose({
  chest,
  core,
  head,
  leftArm,
  leftLeg,
  pose,
  rightArm,
  rightLeg
}: {
  chest: Group;
  core: Group;
  head: Group;
  leftArm: Group;
  leftLeg: Group;
  pose: DefaultHumanoidPose;
  rightArm: Group;
  rightLeg: Group;
}) {
  core.rotation.set(0.02, 0, 0);
  chest.rotation.set(0.02, 0, 0);
  head.rotation.set(0, 0, 0);
  leftArm.rotation.set(0.06, 0, 0.16);
  rightArm.rotation.set(0.06, 0, -0.16);
  leftLeg.rotation.set(-0.02, 0, 0.01);
  rightLeg.rotation.set(0.02, 0, -0.01);

  if (pose === "a-pose") {
    core.rotation.set(0, 0, 0);
    chest.rotation.set(0.01, 0, 0);
    leftArm.rotation.set(0.04, 0, 0.32);
    rightArm.rotation.set(0.04, 0, -0.32);
    leftLeg.rotation.set(0, 0, 0);
    rightLeg.rotation.set(0, 0, 0);
    return;
  }

  if (pose === "runtime") {
    core.rotation.set(0.04, 0, 0);
    chest.rotation.set(0.04, 0, 0);
    head.rotation.set(-0.02, 0, 0);
    leftArm.rotation.set(0.1, 0, 0.12);
    rightArm.rotation.set(0, 0, -0.12);
    leftLeg.rotation.set(-0.01, 0, 0.012);
    rightLeg.rotation.set(0.01, 0, -0.012);
  }
}

function resolveDimensions(height: number) {
  return {
    abdomenHeight: height * 0.14,
    armRadius: height * 0.039,
    baseRadius: height * 0.18,
    baseThickness: height * 0.024,
    calfLength: height * 0.23,
    calfRadius: height * 0.044,
    chestRadius: height * 0.108,
    chestWidth: height * 0.3,
    chestY: height * 0.05,
    footHeight: height * 0.055,
    footLength: height * 0.135,
    footWidth: height * 0.09,
    forearmLength: height * 0.17,
    forearmRadius: height * 0.032,
    handDepth: height * 0.05,
    handHeight: height * 0.04,
    handWidth: height * 0.064,
    headRadius: height * 0.094,
    headY: height * 0.315,
    hipWidth: height * 0.19,
    hipX: height * 0.062,
    hipY: height * -0.02,
    kneeRadius: height * 0.034,
    neckHeight: height * 0.045,
    neckRadius: height * 0.04,
    pelvisHeight: height * 0.1,
    pelvisY: height * 0.515,
    shoulderPodRadius: height * 0.051,
    shoulderX: height * 0.146,
    shoulderY: height * 0.175,
    thighLength: height * 0.24,
    thighRadius: height * 0.048,
    torsoDepth: height * 0.12,
    upperArmLength: height * 0.185,
    upperTorsoHeight: height * 0.24,
    waistRadius: height * 0.085
  };
}

function resolvePalette(
  variant: DefaultHumanoidVariant,
  emphasis: DefaultHumanoidEmphasis,
  accentColor?: ColorRepresentation
): HumanoidPalette {
  const shell =
    variant === "npc"
      ? "#e5e3df"
      : variant === "player"
        ? "#ecf1f6"
        : "#e8edf3";
  const shellSecondary =
    variant === "npc"
      ? "#c9c1b5"
      : variant === "player"
        ? "#c5d0dd"
        : "#c9d3df";
  const underlay = "#2a3039";
  const visor = variant === "npc" ? "#34312a" : "#232a33";
  const accent =
    accentColor ??
    (variant === "npc"
      ? "#d9b67c"
      : variant === "player"
        ? "#69d9f6"
        : "#8ad2f4");
  const accentSecondary =
    emphasis === "selected"
      ? "#f5d07a"
      : emphasis === "hover"
        ? "#dff8ff"
        : accent;

  return {
    accent,
    accentSecondary,
    shell,
    shellSecondary,
    underlay,
    visor
  };
}

function createMaterialSet(palette: HumanoidPalette, emphasis: DefaultHumanoidEmphasis): MeshMaterialSet {
  const lift = emphasis === "selected" ? 0.18 : emphasis === "hover" ? 0.1 : 0;
  const glow = emphasis === "selected" ? 0.28 : emphasis === "hover" ? 0.18 : 0.1;

  return {
    accent: new MeshStandardMaterial({
      color: palette.accentSecondary,
      emissive: palette.accent,
      emissiveIntensity: glow,
      metalness: 0.08,
      roughness: 0.42
    }),
    panel: new MeshStandardMaterial({
      color: liftColor(palette.shellSecondary, lift * 0.9),
      metalness: 0.06,
      roughness: 0.52
    }),
    ring: new MeshStandardMaterial({
      color: palette.accentSecondary,
      emissive: palette.accent,
      emissiveIntensity: glow * 0.9,
      metalness: 0.04,
      roughness: 0.34
    }),
    shell: new MeshStandardMaterial({
      color: liftColor(palette.shell, lift),
      metalness: 0.05,
      roughness: 0.38
    }),
    underlay: new MeshStandardMaterial({
      color: palette.underlay,
      metalness: 0.12,
      roughness: 0.7
    }),
    visor: new MeshStandardMaterial({
      color: palette.visor,
      emissive: palette.accent,
      emissiveIntensity: glow * 0.72,
      metalness: 0.18,
      roughness: 0.24
    })
  };
}

function liftColor(color: ColorRepresentation, amount: number) {
  return new Color(color).lerp(new Color("#ffffff"), amount).getHexString().padStart(6, "0").replace(/^/, "#");
}

function createMesh({
  geometry,
  material,
  name,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1]
}: {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  name: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}) {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  return mesh;
}

function createSocket(name: string) {
  const socket = new Object3D();
  socket.name = name;
  return socket;
}

function capsuleCylinderLength(totalLength: number, radius: number) {
  return Math.max(totalLength - radius * 2, totalLength * 0.25);
}
