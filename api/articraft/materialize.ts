import type { VercelRequest, VercelResponse } from "@vercel/node";

import { isArticraftMaterializeRequest } from "../../src/lib/articraft-contract.js";

const DEFAULT_PROXY_TIMEOUT_MS = 240_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const endpoint = resolveEngineEndpoint();
  if (!endpoint) {
    return res.status(503).json({
      error: "Articraft Cloud Run engine is not configured.",
      detail: "Set ARTICRAFT_ENGINE_URL on the Vercel project."
    });
  }

  try {
    const payload = parsePayload(req.body);
    if (!isArticraftMaterializeRequest(payload)) {
      return res.status(400).json({ error: "Invalid Articraft materialization request." });
    }

    const response = await forwardToEngine(endpoint, payload);
    relayHeaders(response, res);

    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).send(text || JSON.stringify({
        error: `Articraft engine returned HTTP ${response.status}.`
      }));
    }

    return res.status(200).send(text);
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? "Articraft Cloud Run engine timed out." : "Articraft proxy failed.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Origin", "*");
}

function parsePayload(body: unknown) {
  if (Buffer.isBuffer(body)) {
    return JSON.parse(body.toString("utf8")) as unknown;
  }

  return typeof body === "string" ? JSON.parse(body) as unknown : body;
}

async function forwardToEngine(endpoint: string, payload: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveProxyTimeoutMs());

  try {
    return await fetch(endpoint, {
      body: JSON.stringify(payload),
      headers: buildEngineHeaders(),
      method: "POST",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildEngineHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const apiKey = process.env.ARTICRAFT_ENGINE_API_KEY?.trim();

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function resolveEngineEndpoint() {
  const base = process.env.ARTICRAFT_ENGINE_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    return undefined;
  }

  const path = process.env.ARTICRAFT_ENGINE_PATH?.trim() || "/materialize";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function resolveProxyTimeoutMs() {
  const value = Number(process.env.ARTICRAFT_PROXY_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PROXY_TIMEOUT_MS;
}

function relayHeaders(response: Response, res: VercelResponse) {
  const contentType = response.headers.get("content-type");
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
  res.setHeader("Cache-Control", "no-store");
}
