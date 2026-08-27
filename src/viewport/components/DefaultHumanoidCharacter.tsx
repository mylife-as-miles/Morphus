import { useEffect, useMemo, type MutableRefObject } from "react";
import {
  createDefaultHumanoidRig,
  disposeDefaultHumanoidRig,
  type DefaultHumanoidEmphasis,
  type DefaultHumanoidPose,
  type DefaultHumanoidVariant
} from "@blud/three-runtime";
import type { ColorRepresentation, Object3D } from "three";

export type DefaultHumanoidRigRefs = {
  chestRef?: MutableRefObject<Object3D | null>;
  coreRef?: MutableRefObject<Object3D | null>;
  headRef?: MutableRefObject<Object3D | null>;
  leftArmRef?: MutableRefObject<Object3D | null>;
  leftLegRef?: MutableRefObject<Object3D | null>;
  rightArmRef?: MutableRefObject<Object3D | null>;
  rightLegRef?: MutableRefObject<Object3D | null>;
};

export function DefaultHumanoidCharacter({
  accentColor,
  emphasis = "default",
  height,
  pose = "idle",
  rigRefs,
  showSpawnBase = false,
  variant = "neutral"
}: {
  accentColor?: ColorRepresentation;
  emphasis?: DefaultHumanoidEmphasis;
  height: number;
  pose?: DefaultHumanoidPose;
  rigRefs?: DefaultHumanoidRigRefs;
  showSpawnBase?: boolean;
  variant?: DefaultHumanoidVariant;
}) {
  const rig = useMemo(
    () =>
      createDefaultHumanoidRig({
        accentColor,
        emphasis,
        height,
        pose,
        showSpawnBase,
        variant
      }),
    [accentColor, emphasis, height, pose, showSpawnBase, variant]
  );

  useEffect(() => {
    return () => {
      disposeDefaultHumanoidRig(rig);
    };
  }, [rig]);

  useEffect(() => {
    if (!rigRefs) {
      return;
    }

    if (rigRefs.chestRef) {
      rigRefs.chestRef.current = rig.chest;
    }
    if (rigRefs.coreRef) {
      rigRefs.coreRef.current = rig.core;
    }
    if (rigRefs.headRef) {
      rigRefs.headRef.current = rig.head;
    }
    if (rigRefs.leftArmRef) {
      rigRefs.leftArmRef.current = rig.leftArm;
    }
    if (rigRefs.leftLegRef) {
      rigRefs.leftLegRef.current = rig.leftLeg;
    }
    if (rigRefs.rightArmRef) {
      rigRefs.rightArmRef.current = rig.rightArm;
    }
    if (rigRefs.rightLegRef) {
      rigRefs.rightLegRef.current = rig.rightLeg;
    }

    return () => {
      if (rigRefs.chestRef?.current === rig.chest) {
        rigRefs.chestRef.current = null;
      }
      if (rigRefs.coreRef?.current === rig.core) {
        rigRefs.coreRef.current = null;
      }
      if (rigRefs.headRef?.current === rig.head) {
        rigRefs.headRef.current = null;
      }
      if (rigRefs.leftArmRef?.current === rig.leftArm) {
        rigRefs.leftArmRef.current = null;
      }
      if (rigRefs.leftLegRef?.current === rig.leftLeg) {
        rigRefs.leftLegRef.current = null;
      }
      if (rigRefs.rightArmRef?.current === rig.rightArm) {
        rigRefs.rightArmRef.current = null;
      }
      if (rigRefs.rightLegRef?.current === rig.rightLeg) {
        rigRefs.rightLegRef.current = null;
      }
    };
  }, [rig, rigRefs]);

  return <primitive object={rig.root} />;
}
