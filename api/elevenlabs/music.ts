import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = getClientKey(req);
  if (!apiKey) return res.status(401).json({ error: "No ElevenLabs API key provided. Set it in Vibe Settings." });

  const { description, durationSeconds } = parseBody(req.body);
  if (!description?.trim()) return res.status(400).json({ error: "description is required." });

  try {
    const client = new ElevenLabsClient({ apiKey });
    const musicLengthMs = typeof durationSeconds === "number"
      ? Math.max(3000, Math.min(600000, Math.round(durationSeconds * 1000)))
      : 10000;

    const audio = await client.music.compose({
      forceInstrumental: true,
      musicLengthMs,
      outputFormat: "mp3_44100_128",
      prompt: description,
    });

    await pipeAudioStream(res, audio);
  } catch (error) {
    const detail = readSdkErrorDetail(error);
    console.error("[elevenlabs/music] error", detail);
    return res.status(readSdkStatus(error)).json({ error: "ElevenLabs music failed.", detail });
  }
}

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-elevenlabs-api-key");
}

function getClientKey(req: VercelRequest) {
  const value = req.headers["x-elevenlabs-api-key"];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseBody(body: unknown): { description?: string; durationSeconds?: number } {
  return typeof body === "string"
    ? JSON.parse(body) as { description?: string; durationSeconds?: number }
    : (body ?? {}) as { description?: string; durationSeconds?: number };
}

async function pipeAudioStream(res: VercelResponse, stream: ReadableStream<Uint8Array>) {
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");

  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }

  res.end();
}

function readSdkStatus(error: unknown) {
  if (typeof error === "object" && error) {
    const maybeError = error as { statusCode?: unknown; status?: unknown };
    const status = typeof maybeError.statusCode === "number"
      ? maybeError.statusCode
      : typeof maybeError.status === "number"
        ? maybeError.status
        : undefined;

    if (status && status >= 400 && status < 600) {
      return status;
    }
  }

  return 500;
}

function readSdkErrorDetail(error: unknown) {
  if (typeof error === "object" && error) {
    const maybeError = error as {
      body?: unknown;
      message?: unknown;
      statusCode?: unknown;
    };

    if (typeof maybeError.body === "string") return maybeError.body;

    if (maybeError.body) {
      try {
        return JSON.stringify(maybeError.body);
      } catch {
        return String(maybeError.body);
      }
    }

    if (typeof maybeError.message === "string") return maybeError.message;
  }

  return error instanceof Error ? error.message : "ElevenLabs request failed.";
}
