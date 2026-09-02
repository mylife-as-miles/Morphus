import { Color } from "three";
import { settings } from "../config/settings";
import { damp } from "../utils/math";

/**
 * Full-screen colour flash for impacts.
 *
 * Holds nothing but state -- the composite pass reads `color` and `strength`
 * every frame, so a flash costs no extra draw call.
 */
export class ScreenFlash {
  readonly color = new Color(1, 1, 1);
  strength = 0;

  private decayRate = 0.0004;

  /**
   * @param strength 0..1
   * @param decay    fraction remaining after one second
   */
  trigger(color: Color, strength: number, decay = 0.0004): void {
    const scaled = strength * settings.post.flashStrength;
    if (scaled <= this.strength) return;
    this.color.copy(color);
    this.strength = Math.min(1, scaled);
    this.decayRate = decay;
  }

  update(dt: number): void {
    if (this.strength <= 0.0005) {
      this.strength = 0;
      return;
    }
    this.strength = damp(this.strength, 0, this.decayRate, dt);
  }

  reset(): void {
    this.strength = 0;
  }
}
