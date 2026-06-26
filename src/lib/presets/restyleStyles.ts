/** Style presets for the AI restyle stage — a label + the prompt sent to the
 *  image/video model. Operators/users can also type a custom prompt.
 *
 *  `cinematic` presets turn a single rendered frame (or clip) into the
 *  ultra-realistic 3D drone-cinema look that performs best on social — true
 *  depth + parallax, motivated camera moves, film-grade color. They share a
 *  rigorous quality scaffold (no morphing, stabilized motion, HDR, shallow DoF)
 *  so the output stays premium and on-composition. `art` presets are stylised
 *  re-imaginings. */
export type RestyleStyle = {
  id: string;
  label: string;
  /** "cinematic" = photoreal 3D motion look · "art" = stylised re-imagining. */
  kind: "cinematic" | "art";
  tagline: string;
  prompt: string;
};

/** Shared quality scaffold appended to every cinematic prompt — the difference
 *  between an amateur morph and a premium drone-cinema shot. */
const CINE_TAIL =
  "Preserve the original composition, geography and details exactly — no scene change, no morphing, no hallucinated objects. Smooth stabilized drone motion, zero jitter. Film-grade color science, high dynamic range, realistic shadows, global illumination, shallow depth of field, ultra-sharp micro-detail. 24fps, epic cinematic reveal.";

export const RESTYLE_STYLES: RestyleStyle[] = [
  {
    id: "drone-orbit", label: "Drone orbit", kind: "cinematic",
    tagline: "Premium orbital reveal — the viral look",
    prompt:
      "Convert this frame into an ultra-realistic cinematic 3D drone video. Add true 3D depth and parallax. The camera begins slightly elevated and angled, then performs a smooth clockwise orbital rotation around the central focal landmark with a subtle forward dolly to enhance scale and depth. Realistic perspective shift on buildings, domes, terrain and water; gentle water ripples, soft wind movement in trees, natural atmospheric depth. Golden-hour cinematic lighting, volumetric light rays, mild haze. " + CINE_TAIL,
  },
  {
    id: "golden-reveal", label: "Golden-hour reveal", kind: "cinematic",
    tagline: "Slow push-in, warm light, lens flare",
    prompt:
      "Transform this frame into a cinematic golden-hour reveal. Add genuine 3D depth and a slow, motivated forward push-in toward the focal landmark. Warm low-angle sun, long soft shadows, subtle anamorphic lens flares, drifting atmospheric haze and god rays. Rich amber-and-teal grade, glowing highlights. " + CINE_TAIL,
  },
  {
    id: "aerial-sweep", label: "Epic aerial sweep", kind: "cinematic",
    tagline: "High-altitude sweeping fly-over",
    prompt:
      "Turn this frame into an epic high-altitude aerial drone sweep. Add true 3D parallax between foreground and distant terrain. The camera glides laterally and banks gently, revealing the scale of the landscape; soft volumetric clouds drift with parallax, distant haze fades to the horizon. Grand, awe-inspiring scale, crisp HDR daylight. " + CINE_TAIL,
  },
  {
    id: "hyperreal-depth", label: "Hyperreal 3D depth", kind: "cinematic",
    tagline: "Flat frame → true depth & parallax",
    prompt:
      "Re-render this flat frame as a hyperreal 3D scene with true depth and parallax. Subtle, slow dolly with a mild parallax shift so foreground and background separate believably. Photoreal materials, ray-traced reflections on water and glass, physically based lighting, crisp shallow depth of field. Restrained, elegant motion. " + CINE_TAIL,
  },
  {
    id: "neon-nightfall", label: "Neon nightfall", kind: "cinematic",
    tagline: "Blade-runner night drone, neon glow",
    prompt:
      "Transform this frame into a cinematic night drone shot. Add 3D depth and a slow orbital move around the focal landmark. Neon city glow, wet reflective surfaces, volumetric fog catching coloured light, teal-and-magenta blade-runner palette, glistening highlights. Moody, premium, atmospheric. " + CINE_TAIL,
  },
  {
    id: "volumetric-dawn", label: "Volumetric dawn", kind: "cinematic",
    tagline: "Misty dawn, god rays, ethereal",
    prompt:
      "Transform this frame into an ethereal dawn reveal with true 3D depth. A gentle rising crane move lifts over the focal landmark as low mist clings to the ground and dramatic god rays pierce through clouds. Cool-to-warm sunrise gradient, soft diffused light, delicate atmosphere. " + CINE_TAIL,
  },

  { id: "anime", label: "Anime", kind: "art", tagline: "Cel-shaded, Ghibli-inspired", prompt: "anime style, cel shaded, bold outlines, vibrant flat colors, Studio Ghibli inspired" },
  { id: "watercolor", label: "Watercolor", kind: "art", tagline: "Soft washes, paper texture", prompt: "hand-painted watercolor illustration, soft washes, paper texture, gentle bleeding edges" },
  { id: "oil", label: "Oil painting", kind: "art", tagline: "Impasto, classical fine-art", prompt: "thick oil painting, visible brush strokes, impasto, classical fine-art look" },
  { id: "ink", label: "Ink & paper", kind: "art", tagline: "Vintage cartographic engraving", prompt: "black ink on aged paper, cross-hatching, vintage cartographic engraving style" },
  { id: "cyberpunk", label: "Cyberpunk", kind: "art", tagline: "Neon, rain, blade-runner mood", prompt: "cyberpunk neon, glowing edges, rain-soaked night, teal and magenta palette, blade-runner mood" },
  { id: "lowpoly", label: "Low-poly 3D", kind: "art", tagline: "Flat-shaded triangles", prompt: "stylised low-poly 3D render, flat-shaded triangles, soft ambient lighting" },
];
