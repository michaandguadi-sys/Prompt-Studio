/**
 * POST /api/v2/addon/apply  → { layers: Layer[], look?, focus? }
 *
 * Expand a saved AI ADD-ON (a parameterised plan-fragment) with the user's param
 * values into REAL, geocoded layers, by running it through the SAME build
 * pipeline as a normal AI plan (so places resolve to coords, fills/flags/routes
 * are assembled and Zod-validated). The client then merges the returned layers
 * into the current scene — turning an invented feature into a one-click block.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildFromPlan, type Plan } from "../../generate/route";
import { normalizeAddon, expandAddon } from "@/lib/addons";

export async function POST(req: NextRequest) {
  let body: { addon?: unknown; values?: Record<string, string> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const addon = normalizeAddon(body.addon);
  if (!addon) return NextResponse.json({ error: "Invalid add-on." }, { status: 400 });

  const expanded = expandAddon(addon, body.values ?? {});
  if (!expanded.layers.length) return NextResponse.json({ error: "Add-on produced no layers." }, { status: 400 });

  // Shape the expanded fragment as a minimal Plan and reuse the full builder
  // (geocoding, fill/flag/route resolution, Zod validation) — never trust the
  // fragment to be coordinate-ready.
  const plan = {
    title: addon.name,
    durationSec: 8,
    focus: expanded.focus || "",
    motion: expanded.motion,
    look: expanded.look,
    layers: expanded.layers,
  } as unknown as Plan;

  try {
    const project = await buildFromPlan(plan, {});
    // Return everything EXCEPT the camera — the add-on contributes content layers
    // to the user's existing scene; their camera/framing stays in control.
    const layers = project.composition.layers.filter((l) => l.type !== "camera");
    if (!layers.length) return NextResponse.json({ error: "Could not resolve the add-on's places." }, { status: 422 });
    return NextResponse.json({ layers, look: expanded.look ?? null, focus: expanded.focus || null });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to apply add-on", detail: String(e?.message ?? e) }, { status: 500 });
  }
}
