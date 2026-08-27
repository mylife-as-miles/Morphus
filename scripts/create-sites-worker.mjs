import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve(import.meta.dirname, "..");
const distributionDirectory = resolve(outputDirectory, "dist");
const clientDirectory = resolve(distributionDirectory, "client");
const workerDirectory = resolve(outputDirectory, "dist", "server");
const workerPath = resolve(workerDirectory, "index.js");
const workerConfigPath = resolve(distributionDirectory, "wrangler.json");

await rm(clientDirectory, { recursive: true, force: true });
await mkdir(clientDirectory, { recursive: true });

for (const entry of await readdir(distributionDirectory)) {
  if (entry === "client" || entry === "server" || entry === ".openai") continue;

  await rename(
    resolve(distributionDirectory, entry),
    resolve(clientDirectory, entry),
  );
}

const source = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") url.pathname = "/index.html";

    const response = await env.ASSETS.fetch(new Request(url, request));
    if (response.status !== 404) return response;

    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    if (request.method === "GET" && acceptsHtml) {
      url.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    return response;
  },
};
`;

await mkdir(workerDirectory, { recursive: true });
await writeFile(workerPath, source, "utf8");
await writeFile(
  workerConfigPath,
  `${JSON.stringify(
    {
      main: "./server/index.js",
      compatibility_date: "2026-07-21",
      assets: {
        directory: "./client",
        binding: "ASSETS",
        not_found_handling: "single-page-application",
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);
