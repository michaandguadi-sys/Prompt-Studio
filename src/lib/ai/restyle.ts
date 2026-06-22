/**
 * AI restyle stage — turn a rendered map animation into a different art style.
 *
 * Mapanisy renders a clean, deterministic 4K map video. THIS module is the
 * optional post-step: feed that video (by URL) + a style prompt to a
 * video-to-video model and get back a re-styled clip (anime, oil paint,
 * claymation, cyberpunk, …). Like the director, it's provider-agnostic so an
 * operator can plug in Replicate-hosted models, Higgsfield, Runway, Kling, etc.
 *
 * It's an async job: submit → poll → output URL.
 *
 * Configure (server-only):
 *   RESTYLE_PROVIDER   replicate | generic   (inferred from keys if unset)
 *   RESTYLE_MODEL      model id / version
 *   REPLICATE_API_TOKEN          for provider=replicate
 *   RESTYLE_URL + RESTYLE_KEY    for provider=generic (your own / Higgsfield / Runway endpoint)
 *
 * NOTE: the input video must be a PUBLICLY FETCHABLE URL (e.g. the render
 * uploaded to R2), since the restyle model fetches it server-side.
 */

export type RestyleStatus = "queued" | "processing" | "succeeded" | "failed";
export type RestyleJob = { id: string; status: RestyleStatus; outputUrl?: string; error?: string };

export type RestyleConfig = {
  provider: "replicate" | "generic";
  apiKey: string;
  model?: string;
  baseUrl?: string;
  label: string;
};

export function resolveRestyleConfig(): RestyleConfig | null {
  const explicit = (process.env.RESTYLE_PROVIDER || "").toLowerCase();
  const provider =
    explicit ||
    (process.env.REPLICATE_API_TOKEN ? "replicate" : process.env.RESTYLE_URL && process.env.RESTYLE_KEY ? "generic" : "");
  if (provider === "replicate") {
    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) return null;
    return { provider: "replicate", apiKey, model: process.env.RESTYLE_MODEL, label: `Replicate · ${process.env.RESTYLE_MODEL || "model"}` };
  }
  if (provider === "generic") {
    const apiKey = process.env.RESTYLE_KEY;
    const baseUrl = process.env.RESTYLE_URL;
    if (!apiKey || !baseUrl) return null;
    return { provider: "generic", apiKey, baseUrl: baseUrl.replace(/\/$/, ""), model: process.env.RESTYLE_MODEL, label: `Custom · ${baseUrl}` };
  }
  return null;
}

export function restyleConfigured(): boolean {
  return resolveRestyleConfig() !== null;
}

/** Build a restyle config from a USER object (BYO key from the client). */
export type UserRestyleConfig = { provider?: string; model?: string; apiKey?: string; baseUrl?: string };
export function restyleConfigFromUser(u?: UserRestyleConfig): RestyleConfig | null {
  if (!u || !u.apiKey || !u.provider) return null;
  const provider = u.provider.toLowerCase();
  if (provider === "replicate") return { provider: "replicate", apiKey: u.apiKey, model: u.model, label: `Replicate · ${u.model || "model"}` };
  if (provider === "generic") {
    if (!u.baseUrl) return null;
    return { provider: "generic", apiKey: u.apiKey, baseUrl: u.baseUrl.replace(/\/$/, ""), model: u.model, label: `Custom · ${u.baseUrl}` };
  }
  return null;
}

const mapReplicateStatus = (s: string): RestyleStatus =>
  s === "succeeded" ? "succeeded" : s === "failed" || s === "canceled" ? "failed" : s === "starting" ? "queued" : "processing";

const firstUrl = (output: unknown): string | undefined =>
  Array.isArray(output) ? (typeof output[output.length - 1] === "string" ? (output[output.length - 1] as string) : undefined)
    : typeof output === "string" ? output : undefined;

/** Submit a restyle job. Returns the job (with id) or null if unconfigured. */
export async function submitRestyle(videoUrl: string, prompt: string, cfg = resolveRestyleConfig()): Promise<RestyleJob | null> {
  if (!cfg) return null;
  if (!videoUrl) return { id: "", status: "failed", error: "Missing video URL" };
  try {
    if (cfg.provider === "replicate") {
      const res = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ version: cfg.model, input: { video: videoUrl, prompt } }),
      });
      if (!res.ok) return { id: "", status: "failed", error: `Replicate ${res.status}: ${(await res.text()).slice(0, 160)}` };
      const d = await res.json();
      return { id: d.id, status: mapReplicateStatus(d.status), outputUrl: firstUrl(d.output) };
    }
    // generic endpoint: POST { video, prompt, model } → { id }
    const res = await fetch(cfg.baseUrl!, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ video: videoUrl, prompt, model: cfg.model }),
    });
    if (!res.ok) return { id: "", status: "failed", error: `Restyle ${res.status}` };
    const d = await res.json();
    return { id: d.id ?? d.jobId ?? "", status: (d.status as RestyleStatus) ?? "queued", outputUrl: firstUrl(d.output ?? d.url) };
  } catch (e: any) {
    return { id: "", status: "failed", error: String(e?.message ?? e) };
  }
}

/** Poll a restyle job's status / output. */
export async function pollRestyle(id: string, cfg = resolveRestyleConfig()): Promise<RestyleJob | null> {
  if (!cfg || !id) return null;
  try {
    if (cfg.provider === "replicate") {
      const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers: { authorization: `Bearer ${cfg.apiKey}` } });
      if (!res.ok) return null;
      const d = await res.json();
      return { id, status: mapReplicateStatus(d.status), outputUrl: firstUrl(d.output), error: d.error ? String(d.error) : undefined };
    }
    const res = await fetch(`${cfg.baseUrl}/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${cfg.apiKey}` } });
    if (!res.ok) return null;
    const d = await res.json();
    return { id, status: (d.status as RestyleStatus) ?? "processing", outputUrl: firstUrl(d.output ?? d.url), error: d.error ? String(d.error) : undefined };
  } catch {
    return null;
  }
}
