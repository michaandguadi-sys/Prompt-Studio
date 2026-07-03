/**
 * POST /api/v2/voiceover
 * ElevenLabs TTS proxy — converts narration text to an MP3 audio clip.
 * Returns the audio as base64 JSON so the browser can create a data URL,
 * which works both for in-browser preview and Remotion <Audio> during export.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

const DEFAULT_VOICE = "pNInz6obpgDQGcFmaJgB"; // Adam — deep, clear narrator
const DEFAULT_MODEL  = "eleven_multilingual_v2";

export type VoiceoverResponse = {
  audioBase64: string;   // base64 MP3 — convert to data URL: "data:audio/mpeg;base64," + audioBase64
  durationSec: number;   // estimated from text length (actual duration from the blob)
  voice: string;
};

function estimateDuration(text: string): number {
  // Average speaking rate: ~150 words/min = 2.5 words/sec
  const words = text.trim().split(/\s+/).length;
  return Math.max(2, Math.round((words / 2.5) * 10) / 10);
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!rateLimit("voiceover", clerkId, { maxRequests: 10, windowSec: 60 })) {
    return NextResponse.json({ error: "Too many requests — max 10 per minute." }, { status: 429 });
  }

  let body: { text: string; apiKey: string; voiceId?: string; modelId?: string; stability?: number; similarityBoost?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const { text, apiKey, voiceId, modelId, stability = 0.5, similarityBoost = 0.75 } = body;

  if (!text?.trim()) return NextResponse.json({ error: "No text provided." }, { status: 400 });
  if (!apiKey?.trim()) return NextResponse.json({ error: "ElevenLabs API key required — add it in Settings." }, { status: 400 });

  const voice = voiceId?.trim() || DEFAULT_VOICE;
  const model = modelId?.trim() || DEFAULT_MODEL;

  try {
    const resp = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text.slice(0, 5000),
        model_id: model,
        voice_settings: { stability, similarity_boost: similarityBoost, style: 0.0, use_speaker_boost: true },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      const detail = (() => { try { return JSON.parse(errText)?.detail?.message ?? errText; } catch { return errText; } })();
      return NextResponse.json({ error: `ElevenLabs error: ${detail || resp.statusText}` }, { status: resp.status });
    }

    const audioBuffer = await resp.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");
    const durationSec = estimateDuration(text);

    return NextResponse.json({ audioBase64, durationSec, voice } satisfies VoiceoverResponse);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Voiceover generation failed." }, { status: 500 });
  }
}

/** GET /api/v2/voiceover/voices — list available ElevenLabs voices for the user's account. */
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!rateLimit("voiceover-voices", clerkId, { maxRequests: 10, windowSec: 60 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const apiKey = req.headers.get("xi-api-key") ?? "";
  if (!apiKey) return NextResponse.json({ error: "API key required." }, { status: 400 });

  try {
    const resp = await fetch(`${ELEVENLABS_BASE}/voices`, { headers: { "xi-api-key": apiKey } });
    if (!resp.ok) return NextResponse.json({ error: "Could not list voices." }, { status: resp.status });
    const d = await resp.json();
    const voices = (d.voices ?? []).map((v: any) => ({
      id: v.voice_id, name: v.name, category: v.category ?? "generated",
      labels: v.labels ?? {},
    }));
    return NextResponse.json({ voices });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed." }, { status: 500 });
  }
}
