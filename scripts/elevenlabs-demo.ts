/**
 * ElevenLabs Text-to-Speech Demo
 *
 * Usage:
 *   1. Set your API key:  export ELEVENLABS_API_KEY="your-key-here"
 *   2. Run:               npx tsx apps/editor/scripts/elevenlabs-demo.ts
 *
 * This generates speech from text and saves it as an MP3 file.
 */

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

async function main() {
  // The client reads ELEVENLABS_API_KEY from the environment automatically
  const client = new ElevenLabsClient();

  console.log("Generating speech...");

  // Generate speech using a built-in voice
  const audioStream = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
    text: "Hello! This is a test of the ElevenLabs text to speech API, running from the Blud editor.",
    model_id: "eleven_multilingual_v2",
  });

  // Save to file
  const outputPath = "apps/editor/scripts/demo-output.mp3";
  const writeStream = createWriteStream(outputPath);
  await pipeline(audioStream, writeStream);

  console.log(`Audio saved to ${outputPath}`);
}

main().catch(console.error);
