import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import { importHtmlJsProject } from "./importer";
import type { HtmlJsImportFile } from "./types";

const encoder = new TextEncoder();

describe("scene-importer", () => {
  test("imports a single JS scene into native nodes", async () => {
    const result = await importHtmlJsProject({
      files: [
        textFile(
          "main.js",
          `
            import * as THREE from "three";
            const scene = new THREE.Scene();
            const material = new THREE.MeshStandardMaterial({ color: "#ff5533", roughness: 0.2 });
            const box = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3), material);
            box.position.set(1, 2, 3);
            scene.add(box);

            const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
            camera.position.set(4, 5, 6);
          `
        )
      ],
      projectName: "Vehicle Sandbox"
    });

    expect(result.report.status).toBe("imported");
    expect(result.snapshot?.nodes.some((node) => node.kind === "primitive")).toBe(true);
    expect(result.report.summary.materials).toBe(1);
    expect(result.snapshot?.materials.some((material) => material.id.startsWith("material:import:"))).toBe(true);
    expect(result.snapshot?.entities.some((entity) => entity.type === "player-spawn")).toBe(true);
  });

  test("imports HTML with an inline module", async () => {
    const result = await importHtmlJsProject({
      files: [
        textFile(
          "index.html",
          `
            <!doctype html>
            <html>
              <body>
                <script type="module">
                  import * as THREE from "three";
                  const scene = new THREE.Scene();
                  const light = new THREE.AmbientLight("#ffffff", 0.8);
                  scene.add(light);
                </script>
              </body>
            </html>
          `
        )
      ]
    });

    expect(result.report.entrypoint).toBe("index.html");
    expect(result.snapshot?.nodes.some((node) => node.kind === "light")).toBe(true);
  });

  test("ignores importmap scripts and analyzes the executable module entry", async () => {
    const result = await importHtmlJsProject({
      files: [
        textFile(
          "index.html",
          `
            <!doctype html>
            <html>
              <head>
                <script type="importmap">
                  {
                    "imports": {
                      "three": "https://cdn.example.com/three.module.js"
                    }
                  }
                </script>
              </head>
              <body>
                <script type="module">
                  import * as THREE from "three";
                  const scene = new THREE.Scene();
                  scene.add(new THREE.AmbientLight("#ffffff", 0.8));
                </script>
              </body>
            </html>
          `
        )
      ]
    });

    expect(result.report.status).toBe("imported");
    expect(result.report.diagnostics.some((diagnostic) => diagnostic.code === "script-parse-failed")).toBe(false);
    expect(result.report.entrypoint).toBe("index.html");
    expect(result.snapshot?.nodes.length).toBeGreaterThan(0);
  });

  test("imports HTML with linked local scripts and model assets", async () => {
    const result = await importHtmlJsProject({
      files: [
        textFile(
          "index.html",
          `
            <!doctype html>
            <html>
              <body>
                <script type="module" src="./main.js"></script>
              </body>
            </html>
          `
        ),
        textFile(
          "main.js",
          `
            import * as THREE from "three";
            import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
            const scene = new THREE.Scene();
            const loader = new GLTFLoader();
            loader.load("./models/buggy.glb", (gltf) => {
              scene.add(gltf.scene);
            });
          `
        ),
        binaryFile("models/buggy.glb", new Uint8Array([1, 2, 3, 4]), "model/gltf-binary")
      ]
    });

    expect(result.report.status).toBe("imported");
    expect(result.snapshot?.assets.some((asset) => asset.type === "model")).toBe(true);
    expect(result.snapshot?.nodes.some((node) => node.kind === "model")).toBe(true);
  });

  test("prefers index.html when resolving ZIP entrypoints", async () => {
    const zip = new JSZip();
    zip.file("demo.js", "console.log('ignore');");
    zip.file(
      "index.html",
      `
        <!doctype html>
        <html>
          <body>
            <script type="module">
              import * as THREE from "three";
              const scene = new THREE.Scene();
              scene.add(new THREE.Group());
            </script>
          </body>
        </html>
      `
    );
    zip.file("other.html", "<html><body>other</body></html>");

    const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
    const result = await importHtmlJsProject({
      files: [binaryFile("scene.zip", bytes, "application/zip")]
    });

    expect(result.report.entrypoint).toBe("index.html");
    expect(result.snapshot?.nodes.length).toBeGreaterThan(1);
  });

  test("partially imports Three.js and Rapier vehicle scenes into a generated custom script bridge", async () => {
    const result = await importHtmlJsProject({
      files: [
        textFile(
          "vehicle.js",
          `
            import * as THREE from "three";
            import RAPIER from "@dimforge/rapier3d-compat";

            const scene = new THREE.Scene();
            const renderer = new THREE.WebGLRenderer();
            document.body.appendChild(renderer.domElement);

            const chassis = new THREE.Group();
            scene.add(chassis);

            const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 200);
            camera.position.set(0, 4, 10);

            const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
            const vehicle = world.createVehicleController?.(null);
            renderer.setAnimationLoop(() => {});
          `
        )
      ]
    });

    expect(result.report.status).toBe("partially-imported");
    expect(result.snapshot?.nodes.flatMap((node) => node.hooks ?? []).some((hook) => hook.type === "custom_script")).toBe(true);
    expect(result.report.diagnostics.some((diagnostic) => diagnostic.code === "advanced-physics")).toBe(true);
  });

  test("marks DOM-heavy projects as unsupported when no native scene graph can be extracted", async () => {
    const result = await importHtmlJsProject({
      files: [
        textFile(
          "app.js",
          `
            const button = document.createElement("button");
            button.textContent = "Launch";
            document.body.appendChild(button);
            requestAnimationFrame(() => {});
          `
        )
      ]
    });

    expect(result.report.status).toBe("unsupported");
    expect(result.snapshot).toBeUndefined();
    expect(result.report.diagnostics.some((diagnostic) => diagnostic.code === "dom-ownership")).toBe(true);
  });
});

function textFile(path: string, text: string): HtmlJsImportFile {
  return {
    bytes: encoder.encode(text),
    mimeType: "text/plain",
    path
  };
}

function binaryFile(path: string, bytes: Uint8Array, mimeType: string): HtmlJsImportFile {
  return {
    bytes,
    mimeType,
    path
  };
}
