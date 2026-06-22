/**
 * The Mapanisy Director Doctrine — distilled from research into how professional
 * map-journalism (Vox / Johnny Harris / NYT / Reuters graphics) is planned,
 * sourced and fact-checked. Baked into the AI Director's prompts so generated
 * stories feel like a journalist (not a generator) made them: ONE story, told
 * visually, fact-checked, attributed, and cohesively art-directed.
 *
 * Also drives the NO-KEY path: `matchArchetype` maps a plain idea to the right
 * visual recipe (e.g. "expansion" → a highlight that GROWS from an origin) so
 * the built-in logic alone still picks the right story shape.
 */

/** The story-first principles, condensed to the operational essence. */
export const DIRECTOR_PRINCIPLES = `STORY-FIRST MAP JOURNALISM:
- ONE MAP = ONE SENTENCE. First write the single sentence the animation proves. If you can't, it's a topic not a story.
- Pick ONE lead angle (scale / change-over-time / ranking-outlier / variation / relationship). Everything else is a secondary beat.
- Map only when PLACE is causal or surprising (proximity, borders, chokepoints, spread, distance). If location is incidental, it's decoration.
- The ANNOTATION layer is the journalism: every label/marker/highlight STATES the point ("crossed HERE", "worst here") — never "here is data".
- ONE focal point: the subject is LOUD (full accent, 150-200% bigger), context is QUIET (muted basemap, ~60%), incidental ~20%.
- VISUAL-FIRST: the graphic carries the meaning; text only confirms it. If the point lands only via the caption, redesign the visual.
- REVEAL IN BEATS: establish PLACE → add ACTOR → add MOVEMENT/ACTION → add CONSEQUENCE/STAKES. Control the order the viewer learns things.
- CAMERA: start WIDE to orient → push IN for the action → pull BACK for scale. Hold still on the key frame (the moment of meaning).
- Open a curiosity gap early, close it with the reveal. Be TRUTHFUL before pretty. Cut every element that doesn't serve the sentence.`;

export type Archetype = {
  name: string;
  triggers: string[];
  storyFocus: string;
  /** The recipe in MAPANISY's own layer vocabulary. */
  recipe: string;
};

/** Story archetypes → the concrete Mapanisy visual recipe (our layer types). */
export const ARCHETYPES: Archetype[] = [
  { name: "Expansion / growth-from-origin", triggers: ["expand", "expansion", "grew", "growth of", "conquer", "annex", "rise of", "at its peak", "greatest extent", "took over", "empire"],
    storyFocus: "From an origin, control GREW to this extent by this date. The story is the growth itself — show it spreading, never a finished blob.",
    recipe: "A highlight layer with animation:\"grow\", growOrigin = the capital/heartland, growSpanSec stretched for weight. Drop a pulsing marker at the origin first, then the fill blooms outward to the borders; hold on the peak extent. Title states the era ('at its greatest extent, c.YEAR'). For pre-modern polities keep borderDash:\"dashed\" (extents are fuzzy, not surveyed)." },
  { name: "Contraction / then-vs-now", triggers: ["shrink", "shrank", "receded", "contract", "collapse", "lost territory", "decline of", "over time", "since", "by 19", "by 20", "changed", "before and after", "evolution"],
    storyFocus: "Between year X and Y this changed in this direction — the change IS the news.",
    recipe: "Either a highlight animation:\"shrink\" (fill recedes toward a core), or OHM historical basemap with mapYear → mapYearEnd so borders morph as the date ticks. Two holds (start state, end state). Period-correct names; date-stamp every state." },
  { name: "Movement / route / invasion / migration", triggers: ["route", "journey", "traveled", "invaded", "invasion", "crossed", "marched", "fled", "migration", "supply line", "advance on", "trade route", "from .* to "],
    storyFocus: "An actor moved A→B along this path, and the path is why it matters (chokepoint, distance, border crossed).",
    recipe: "A route layer that DRAWS ON origin→destination with the camera following; a marker at the origin and the crossing/chokepoint annotated. Start wide on both endpoints, push to the action, pull back to show distance." },
  { name: "Spread / diffusion", triggers: ["outbreak", "pandemic", "spread of", "diffus", "viral", "wildfire", "contagion", "reached", "diaspora"],
    storyFocus: "From an origin, this reached these places in this order/speed — tie hard to TIME.",
    recipe: "A connections layer in mode:\"chain\" (step-by-step) or hub, OR multiple highlight grow fronts; pace it to a year/date. Restrained tone for illness/disaster. Attribute estimates." },
  { name: "Influence / alliances / network", triggers: ["alliance", "alliances", "influence", "network", "bloc", "allies", "partners", "trade with", "controls", "sphere", "reach"],
    storyFocus: "What connects to what, from one hub.",
    recipe: "A connections layer mode:\"hub\" (hub = the power, points = its partners) with arcs drawing in. The hub is the loud focal node." },
  { name: "Conflict / war / tension", triggers: ["war", "conflict", "tension", "fighting", "civil war", "battle", "clash", "front line", "ceasefire", "strike"],
    storyFocus: "Where the fighting is and why this ground matters.",
    recipe: "Two highlights (the parties, contrasting colours) + a contested border drawn distinctly + crossing-swords / explosion markers on the flashpoints. Noir grade. Mark contested lines as disputed (dashed)." },
  { name: "Comparison / variation", triggers: ["compared", "comparison", "difference between", "inequality", "vs", "versus", "highest", "lowest", "gap between", "richest", "poorest", "every country"],
    storyFocus: "Place A differs sharply from place B on this metric; the geography of the difference is the point.",
    recipe: "Multiple highlights with a light→dark accent ramp (loudest on the outlier), revealed one tier at a time; annotate the gap ('3× higher here'). For 'every country in X' use regionFlags." },
  { name: "Chokepoint / strategic location", triggers: ["strait", "chokepoint", "border crossing", "base near", "controls access", "strategic", "blockade", "how close", "canal"],
    storyFocus: "One location controls/threatens something because of where it sits.",
    recipe: "Push in tight on the chokepoint; a marker on the asset + a proximity/measure line to make 'how close' visceral; everything else muted. Hold tight." },
  { name: "Scale / magnitude", triggers: ["how big", "size of", "as large as", "fits inside", "bigger than", "magnitude", "enormous"],
    storyFocus: "This is THIS big — a familiar comparison makes the size graspable.",
    recipe: "Highlight the subject's footprint over a familiar reference geography; pull back to reveal scale; annotate the comparison ('larger than France'). Honest projection only." },
];

/** No-AI archetype match (keyword heuristic) → the recipe to follow. */
export function matchArchetype(idea: string): Archetype | null {
  const t = (idea || "").toLowerCase();
  let best: Archetype | null = null, bestScore = 0;
  for (const a of ARCHETYPES) {
    let score = 0;
    for (const k of a.triggers) {
      const isRe = k.includes(".*");
      const hit = isRe ? new RegExp(k).test(t) : t.includes(k);
      // Specific multi-word / regex phrases ("spread of", "from … to") outweigh
      // single ambiguous words, so e.g. "spread of COVID" → diffusion, not growth.
      if (hit) score += (isRe || k.includes(" ")) ? 2 : 1;
    }
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return bestScore > 0 ? best : null;
}

/** Trusted-source taxonomy + verification discipline (for the research pass). */
export const SOURCE_AND_VERIFY = `RESEARCH LIKE A FACT-CHECKER. Use ONLY well-established facts from authoritative/official/primary sources — never invent specifics:
- Current stats (one country): national statistics office / census. Cross-country / rankings: UN, World Bank, IMF, WHO, Eurostat (they harmonise methods).
- Modern borders/geography: UN, Natural Earth, official government data, OpenStreetMap (cities/features only — verify sovereignty elsewhere).
- History / past extents: peer-reviewed academic atlases, university-press scholarship, primary archives; Encyclopaedia Britannica to cross-check dates. Treat historical extents as APPROXIMATE, not surveyed.
ASSIGN CONFIDENCE to every fact and ACT ON IT:
- high (authoritative primary, or several independent corroborations) → may state as fact.
- medium (single authoritative source, or an estimate) → state WITH on-screen attribution ("per [source], YEAR").
- low / contested (weak or disagreeing sources) → hedge ("estimated/approximately/reported"), show a range, or don't assert.
DATE-STAMP every statistic and border. Trend is the strong claim; the exact digit is soft. Repetition is not corroboration. If sourcing can't be made transparent, don't animate it.
DISPUTED TERRITORY — be neutral, attribute the claim, never let the visual imply a verdict: solid line = recognised border, DASHED = disputed; say "administered by X, claimed by Y" (never "belongs to"). Kashmir = Line of Control (dashed, Indian-/Pakistan-administered). Crimea = "annexed by Russia 2014, not widely recognised". Taiwan = self-governed, claimed by China. Western Sahara = disputed, Moroccan-administered/SADR-claimed. Uncertain historical extents get the same soft/dashed treatment + a date.`;

/** Cohesion "Style Bible" — locked once, obeyed by every scene. */
export const COHESION_LAW = `COHESION — feel like ONE artist made it. Lock a Style Bible ONCE and reuse it UNCHANGED in every scene:
- PALETTE = 5 roles: background, land/ink, water, ONE accent ("the highlighter" — the through-line, used sparingly only for the element each scene is about), one muted secondary.
- ONE basemap style, ONE projection, ONE label density. ONE type family. ONE motion language (enter = decelerate/expressive, exit = accelerate/fast, camera = one steady ease). ONE grade/grain/vignette over every scene.
- Decide the THESIS and the ENDING first. Three acts: pose the geographic question → escalate → resolve. Every scene must serve the thesis and foreground one pillar (geography / numbers / time) — if it serves neither, cut it.`;
