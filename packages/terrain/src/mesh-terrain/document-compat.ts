/**
 * Compile-time guard that the implementation types and the document types agree.
 *
 * The modifier stack is described twice on purpose. @blud/shared owns the
 * *document* shape, because a scene file has to describe its terrain without
 * depending on the code that evaluates it; this package owns the
 * *implementation* shape, kept in the upstream file layout so the port stays
 * diffable against vibe-stack/super-terrain.
 *
 * TypeScript is structural, so the two interoperate with no conversion at the
 * boundary -- but only for as long as they actually match. Nothing would catch
 * a field added on one side alone, and the failure would surface as terrain
 * silently dropping part of a saved stack. These assertions turn that into a
 * build error instead.
 *
 * If this file fails to compile, the two definitions have diverged: reconcile
 * `packages/shared/src/terrain-document.ts` with the local modifier types
 * rather than deleting the assertion.
 */

import type {
  BrushDomain,
  BrushMode,
  BrushSample,
  BrushStrokeModifier,
  CsgOperation,
  ModifierTransform,
  PaintMode,
  TerrainModifier,
  WeightPaintModifier,
} from "./modifiers/types";
import type { CutterVolume } from "./modifiers/boolean/CutterVolume";
import type { TerrainMaterialSettings } from "./materialSettings";
import type * as Doc from "@blud/shared";

/** Fails to compile unless `A` and `B` are mutually assignable. */
type MutuallyAssignable<A extends B, B extends C, C = A> = true;

// Scalar vocabularies.
export type AssertBrushMode = MutuallyAssignable<BrushMode, Doc.MeshBrushMode>;
export type AssertBrushDomain = MutuallyAssignable<BrushDomain, Doc.MeshBrushDomain>;
export type AssertPaintMode = MutuallyAssignable<PaintMode, Doc.TerrainPaintMode>;
export type AssertCsgOperation = MutuallyAssignable<CsgOperation, Doc.TerrainCsgOperation>;

// Structures carried inside a stroke.
export type AssertBrushSample = MutuallyAssignable<BrushSample, Doc.TerrainBrushSample>;
export type AssertTransform = MutuallyAssignable<ModifierTransform, Doc.TerrainModifierTransform>;
export type AssertMaterials = MutuallyAssignable<TerrainMaterialSettings, Doc.TerrainMaterialSettings>;

// The operands of live CSG.
export type AssertCutterVolume = MutuallyAssignable<CutterVolume, Doc.CutterVolume>;

// The two stack members that carry authored point data, and the whole union.
export type AssertBrushStroke = MutuallyAssignable<BrushStrokeModifier, Doc.BrushStrokeModifier>;
export type AssertWeightPaint = MutuallyAssignable<WeightPaintModifier, Doc.WeightPaintModifier>;
export type AssertModifierUnion = MutuallyAssignable<TerrainModifier, Doc.TerrainModifier>;
