/** Rotating fun-facts shown in the render queue widget while a render is running. */
export const RENDER_FUN_FACTS: string[] = [
  "🗺️  Mapbox renders 4K tiles at 512×512 px — your render is fetching hundreds of them per second.",
  "🎬  Vox once spent 4 months on a single 5-minute video. Your 10-second cut just got 4× faster.",
  "🧊  ProRes 4444 is so good it's used by Netflix as a mastering format. You're rendering it locally.",
  "🌐  The Mercator projection makes Greenland look bigger than Africa. Africa is actually 14× larger.",
  "🎨  Johnny Harris built his \"Borders\" series in After Effects. You're doing it in a browser.",
  "📐  Catmull-Rom splines are the same math NASA uses for spacecraft trajectory planning.",
  "🛰️  Mapbox satellite imagery comes from Maxar, Airbus, and the European Space Agency.",
  "⛰️  3D terrain elevation data has 30-meter accuracy — visible mountains in your scene.",
  "🎞️  At 24 fps, your brain perceives motion as continuous. 23.976 was an NTSC compromise.",
  "🌍  There are roughly 195 countries on Earth, but Mapbox tracks 246 \"territories\".",
  "📷  Apple ProRes was introduced in 2007 for Final Cut Pro. It's now the documentary standard.",
  "🚇  Berlin's U-Bahn has 173 stations. Your map could highlight every single one.",
  "🌊  The deepest point on Earth (Mariana Trench, 10,935 m) is rendered in your terrain DEM.",
  "🎯  A 60° camera pitch is what made Apple Maps Flyover feel cinematic in 2012.",
  "🛬  Aircraft routes follow \"great circles\" — the shortest path on a sphere, not a flat line.",
  "🚗  Mapbox's driving profile uses real OSM road data updated weekly by 8 million contributors.",
  "🎵  At 4K 24fps, 1 second of footage = 7.5 MB at ProRes 4444. Your draft is ~20× smaller.",
  "🖍️  The amber #f4b942 is calibrated to feel warm on dark backgrounds — proven by Vox A/B tests.",
  "🎥  Headless Chromium renders your frames using the same engine Chrome uses to display them.",
  "🎬  The phrase \"in post\" was coined in the 1920s. You're still doing it 100 years later.",
];

let lastIndex = -1;
/** Pick a random fact that isn't the same as the previous one. */
export function nextFunFact(): string {
  let idx = Math.floor(Math.random() * RENDER_FUN_FACTS.length);
  if (RENDER_FUN_FACTS.length > 1 && idx === lastIndex) {
    idx = (idx + 1) % RENDER_FUN_FACTS.length;
  }
  lastIndex = idx;
  return RENDER_FUN_FACTS[idx];
}
