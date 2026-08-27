import type { VercelRequest, VercelResponse } from "@vercel/node";

const ELEVENLABS_BASE = "https://api.elevenlabs.io";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-elevenlabs-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = req.headers["x-elevenlabs-api-key"] as string | undefined;
  if (!apiKey) return res.status(401).json({ error: "No ElevenLabs API key provided. Set it in Vibe Settings." });

  try {
    const response = await fetch(`${ELEVENLABS_BASE}/v1/voices`, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error("[elevenlabs/voices] error", err);
    return res.status(500).json({ error: "Failed to fetch voices." });
  }
}
