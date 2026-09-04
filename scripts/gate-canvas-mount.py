"""Defers the R3F Canvas until the viewport has a real size.

The previous fix dispatched a window resize once the viewport gained size,
which did make R3F claim the canvas -- but by then the WebGPU renderer had
already been created against the 300x150 default and had allocated its depth
texture at that size. Colour attachments then resized with the canvas and the
depth attachment did not, so every frame failed validation:

  The depth stencil attachment size (width: 300, height: 150) does not match
  the size of the other attachments' base plane (width: 883, height: 501)

and the viewport rendered black. Waking a renderer that was built wrong is a
worse position than not having built it yet, so this waits instead.
"""

import io
from pathlib import Path

P = Path("src/viewport/ViewportCanvas.tsx")
s = io.open(P, encoding="utf-8").read()

if "canvasReady" in s:
    print("already applied")
    raise SystemExit

# 1. Replace the wake effect's body: set state rather than dispatch a resize.
OLD_EFFECT = """    // A timer rather than `requestAnimationFrame`. The case this exists for is
    // a viewport that is not being composited -- a hidden pane, a background
    // tab, a collapsed panel -- and a page in that state does not run animation
    // frames at all, so a rAF loop is precisely the one mechanism guaranteed to
    // be asleep exactly when it is needed. Timers keep running there, throttled.
    const POLL_MS = 250;
    let sizedTicks = 0;

    const timer = window.setInterval(() => {
      if (!needsWaking()) {
        window.clearInterval(timer);
        return;
      }

      const { height, width } = host.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      // `react-use-measure`, which R3F measures through, listens for window
      // resizes; this is the signal that reaches it from out here.
      window.dispatchEvent(new Event("resize"));

      // Give up only after the viewport has had a real size for a while --
      // never while it is still collapsed. A viewport can sit at zero for
      // minutes behind a hidden pane, and a budget that counts those ticks
      // expires long before anyone looks at the page.
      sizedTicks += 1;
      if (sizedTicks > 40) window.clearInterval(timer);
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, []);"""

NEW_EFFECT = """    // A timer rather than `requestAnimationFrame`. The case this exists for is
    // a viewport that is not being composited -- a hidden pane, a background
    // tab, a collapsed panel -- and a page in that state does not run animation
    // frames at all, so a rAF loop is precisely the one mechanism guaranteed to
    // be asleep exactly when it is needed. Timers keep running there, throttled.
    const POLL_MS = 250;

    const check = () => {
      const { height, width } = host.getBoundingClientRect();
      if (width === 0 || height === 0) return false;
      setCanvasReady(true);
      return true;
    };

    if (check()) return;

    const timer = window.setInterval(() => {
      if (check()) window.clearInterval(timer);
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, []);"""

assert OLD_EFFECT in s, "wake effect body not found"
s = s.replace(OLD_EFFECT, NEW_EFFECT, 1)

# 2. Replace the effect's preamble, which described the old approach.
OLD_PREAMBLE = """  // Wakes R3F when the viewport goes from zero-sized to visible.
  //
  // `offsetSize` above covers the ordinary case, but there is one it cannot:
  // if the whole document is zero-sized when the editor mounts -- a hidden
  // pane, a collapsed split, a tab restored in the background -- R3F declines
  // to build its root, and the size change that follows can be coalesced into
  // the same layout pass that the observer already reported on. The canvas
  // then sits at its intrinsic 300x150 with no renderer for the life of the
  // page, which reads as "the 3D viewport is broken" rather than as a
  // measurement problem.
  //
  // Watching for the zero-to-nonzero transition and re-broadcasting it costs a
  // single observer and turns a dead viewport into a late one.
  useEffect(() => {
    const host = viewportRootRef.current;
    if (!host) return;

    // The wake-up is only *needed* while the canvas sits at the HTML default of
    // 300x150, which is what an unclaimed canvas looks like. Once R3F has sized
    // it to the container there is nothing left to do and this stops for good.
    const needsWaking = () => {
      const canvas = host.querySelector("canvas");
      if (!canvas) return true;
      return canvas.clientWidth === 300 && canvas.clientHeight === 150;
    };
"""

NEW_PREAMBLE = """  // Holds the R3F canvas back until the viewport has a real size.
  //
  // If the whole document is zero-sized when the editor mounts -- a hidden
  // pane, a collapsed split, a tab restored in the background -- R3F declines
  // to build its root, correctly, because a zero-sized canvas has nothing to
  // render into. The size that arrives afterwards never reaches its own
  // measurement, and the canvas sits at its intrinsic 300x150 for the life of
  // the page, which reads as "the 3D viewport is broken".
  //
  // An earlier version of this dispatched a window resize once the viewport
  // gained size, which did wake R3F -- but on WebGPU the renderer had by then
  // been built against the 300x150 default and had allocated its depth texture
  // at that size. The colour attachments resized with the canvas and the depth
  // attachment did not, so every frame failed validation and the viewport went
  // black. Waking a renderer that was built wrong is worse than not having
  // built it yet, so this defers the mount instead.
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    const host = viewportRootRef.current;
    if (!host) return;
"""

assert OLD_PREAMBLE in s, "wake effect preamble not found"
s = s.replace(OLD_PREAMBLE, NEW_PREAMBLE, 1)

# 3. Gate the Canvas element itself.
OLD_OPEN = """      >
        <Canvas
          camera={canvasCamera}"""
NEW_OPEN = """      >
        {canvasReady ? (
        <Canvas
          camera={canvasCamera}"""
assert OLD_OPEN in s, "Canvas open anchor not found"
s = s.replace(OLD_OPEN, NEW_OPEN, 1)

OLD_CLOSE = "        </Canvas>"
assert OLD_CLOSE in s, "Canvas close anchor not found"
s = s.replace(OLD_CLOSE, "        </Canvas>\n        ) : null}", 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("canvas mount gated")
