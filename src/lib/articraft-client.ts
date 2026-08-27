import type {
  ArticraftMaterializeRequest,
  ArticraftMaterializeResponse
} from "@/lib/articraft-contract";

export async function materializeArticraftAsset(
  request: ArticraftMaterializeRequest,
  signal?: AbortSignal
): Promise<ArticraftMaterializeResponse> {
  const errors: string[] = [];

  for (const endpoint of resolveArticraftEndpoints()) {
    try {
      return await postArticraftRequest(endpoint, request, signal);
    } catch (error) {
      errors.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const hint = isLocalHost(location.hostname)
    ? "Make sure the local editor dev server is running."
    : "Make sure the Vercel project has ARTICRAFT_ENGINE_URL pointing at the Cloud Run Articraft engine.";

  throw new Error(
    `Articraft materialization failed. ${hint} Tried ${errors.length} local endpoint(s). ${errors.join(" | ")}`
  );
}

async function postArticraftRequest(
  endpoint: string,
  request: ArticraftMaterializeRequest,
  signal?: AbortSignal
) {
  const response = await fetch(endpoint, {
    body: JSON.stringify(request),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST",
    signal
  });
  const payload = await readResponseJson(response);

  if (!response.ok) {
    const error = stringField(payload, "error");
    const detail = stringField(payload, "detail");
    throw new Error([error, detail].filter(Boolean).join(": ") || `HTTP ${response.status}`);
  }

  if (!("success" in payload) || payload.success !== true) {
    throw new Error("Articraft materialization returned an invalid response.");
  }

  return payload;
}

async function readResponseJson(response: Response) {
  try {
    return await response.json() as ArticraftMaterializeResponse | {
      detail?: string;
      error?: string;
    };
  } catch {
    return {
      error: `HTTP ${response.status}`,
      detail: await response.text().catch(() => "")
    };
  }
}

function resolveArticraftEndpoints() {
  const path = "/api/articraft/materialize";
  const configured = normalizeBaseUrl(import.meta.env.VITE_ARTICRAFT_BRIDGE_URL);
  const saved = normalizeBaseUrl(readSavedBridgeUrl());
  const bridgeEndpoints = [
    path,
    configured ? `${configured}${path}` : "",
    saved ? `${saved}${path}` : "",
    `http://localhost:5173${path}`,
    `http://127.0.0.1:5173${path}`
  ].filter(Boolean);

  return uniqueStrings(bridgeEndpoints);
}

function readSavedBridgeUrl() {
  try {
    return localStorage.getItem("dream-studio:articraft-bridge-url");
  } catch {
    return undefined;
  }
}

function normalizeBaseUrl(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined;
  }

  const field = value[key];
  return typeof field === "string" ? field : undefined;
}
