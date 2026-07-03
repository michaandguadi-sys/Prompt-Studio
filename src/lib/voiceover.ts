"use client";

const STORAGE_KEY = "mapanisy-voiceover";

export type VoiceoverSettings = {
  apiKey: string;
  voiceId: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
};

/** Well-known ElevenLabs voice presets best suited to documentary narration. */
export const PRESET_VOICES = [
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", desc: "Deep · clear narrator" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", desc: "Calm · professional" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", desc: "Warm · authoritative" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", desc: "Well-rounded · expressive" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", desc: "Crisp · commanding" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", desc: "Dynamic · energetic" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", desc: "Emotional · relatable" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", desc: "Strong · expressive" },
];

export const DEFAULT_VOICEOVER_SETTINGS: VoiceoverSettings = {
  apiKey: "",
  voiceId: "pNInz6obpgDQGcFmaJgB",
  modelId: "eleven_multilingual_v2",
  stability: 0.5,
  similarityBoost: 0.75,
};

export function loadVoiceoverSettings(): VoiceoverSettings {
  if (typeof window === "undefined") return DEFAULT_VOICEOVER_SETTINGS;
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return v ? { ...DEFAULT_VOICEOVER_SETTINGS, ...v } : DEFAULT_VOICEOVER_SETTINGS;
  } catch { return DEFAULT_VOICEOVER_SETTINGS; }
}

export function saveVoiceoverSettings(s: VoiceoverSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export function hasVoiceoverKey(): boolean {
  return !!loadVoiceoverSettings().apiKey?.trim();
}

/** Generate TTS audio for a given text and return a data URL (base64 MP3).
 *  Calls /api/v2/voiceover which proxies to ElevenLabs. */
export async function generateVoiceover(
  text: string,
  settings: VoiceoverSettings,
): Promise<{ dataUrl: string; durationSec: number; voice: string }> {
  const resp = await fetch("/api/v2/voiceover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      apiKey: settings.apiKey,
      voiceId: settings.voiceId || undefined,
      modelId: settings.modelId || undefined,
      stability: settings.stability,
      similarityBoost: settings.similarityBoost,
    }),
  });
  const d = await resp.json();
  if (!resp.ok || !d.audioBase64) throw new Error(d.error ?? "Voiceover generation failed.");
  const dataUrl = `data:audio/mpeg;base64,${d.audioBase64}`;
  return { dataUrl, durationSec: d.durationSec ?? 5, voice: d.voice ?? settings.voiceId };
}

/** Fetch available voices from the user's ElevenLabs account. */
export async function listVoices(apiKey: string): Promise<{ id: string; name: string; category: string }[]> {
  const resp = await fetch(`/api/v2/voiceover?apiKey=${encodeURIComponent(apiKey)}`);
  if (!resp.ok) throw new Error("Could not load voices.");
  const d = await resp.json();
  return d.voices ?? [];
}

/** Measure the real duration of an audio data URL by loading it into an Audio element. */
export function measureAudioDuration(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const audio = new window.Audio(dataUrl);
      audio.addEventListener("loadedmetadata", () => resolve(audio.duration), { once: true });
      audio.addEventListener("error", () => resolve(0), { once: true });
      setTimeout(() => resolve(0), 5000); // fallback timeout
    } catch { resolve(0); }
  });
}
