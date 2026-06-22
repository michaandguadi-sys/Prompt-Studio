/**
 * FCPXML export — hand a Mapanisy render off to Final Cut Pro or DaVinci Resolve
 * as an editable timeline clip. Generates FCPXML 1.10 referencing the rendered
 * MP4 (by relative path) at the composition's exact format + duration, so the
 * "keep my grade in DaVinci but use your maps" workflow just works: drop the
 * .fcpxml next to the .mp4 and import it.
 */
export interface FcpxmlOpts {
  name: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  /** Rendered clip filename the FCPXML references (relative to the .fcpxml). */
  src?: string;
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const safeFileName = (s: string) => (s || "mapanisy").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "mapanisy";

export function buildFcpxml(o: FcpxmlOpts): string {
  const fps = Math.max(1, Math.round(o.fps));
  const frames = Math.max(1, Math.round(o.durationSec * fps));
  const dur = `${frames}/${fps}s`;      // FCPXML rational time
  const fd = `1/${fps}s`;
  const name = xmlEscape(o.name || "Mapanisy");
  const src = o.src || `${safeFileName(o.name)}.mp4`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat${o.height}p${fps}" frameDuration="${fd}" width="${Math.round(o.width)}" height="${Math.round(o.height)}" colorSpace="1-1-1 (Rec. 709)"/>
    <asset id="r2" name="${name}" start="0s" duration="${dur}" hasVideo="1" videoSources="1" format="r1">
      <media-rep kind="original-media" src="file://./${xmlEscape(src)}"/>
    </asset>
  </resources>
  <library>
    <event name="Mapanisy">
      <project name="${name}">
        <sequence format="r1" duration="${dur}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            <asset-clip ref="r2" name="${name}" offset="0s" duration="${dur}" start="0s"/>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}
