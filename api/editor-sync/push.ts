import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  return res.status(501).json({
    error: "Live editor sync is only available in the local Dream Studio dev server."
  });
}
