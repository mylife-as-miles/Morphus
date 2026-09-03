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

// `Origin-Agent-Cluster: ?1` on every HTML response.
//
// WebMCP is gated on origin-isolated documents: without isolation
// `document.modelContext` is simply absent, with no error to notice. The header
// has to be asked for on the document itself, and the asset binding does not
// send it, so the worker adds it on the way out. It is also sticky per origin
// for the browsing session, which is a reason to send it consistently rather
// than only on the routes that happen to need it today.
const source = `const ISOLATE = "Origin-Agent-Cluster";

function isolated(response) {
  if (!response.headers.get("content-type")?.includes("text/html")) return response;

  // Headers on a fetched Response are immutable, so this rebuilds rather than
  // sets in place.
  const headers = new Headers(response.headers);
  headers.set(ISOLATE, "?1");
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") url.pathname = "/index.html";

    const response = await env.ASSETS.fetch(new Request(url, request));
    if (response.status !== 404) return isolated(response);

    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    if (request.method === "GET" && acceptsHtml) {
      url.pathname = "/index.html";
      return isolated(await env.ASSETS.fetch(new Request(url, request)));
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
