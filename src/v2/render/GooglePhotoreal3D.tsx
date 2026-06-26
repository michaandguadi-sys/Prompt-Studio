"use client";

import React from "react";
import { useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { Tile3DLayer } from "@deck.gl/geo-layers";
import { Tiles3DLoader } from "@loaders.gl/3d-tiles";
import { LightingEffect, AmbientLight, _SunLight as SunLight } from "@deck.gl/core";
import { delayRender, continueRender, getRemotionEnvironment } from "remotion";

/**
 * PHOTOREAL 3D (Google Earth) — overlays Google's Photorealistic 3D Tiles on the
 * MapLibre map via a deck.gl interleaved overlay, so the existing camera
 * animation flies through the real Earth 3D world (photoreal buildings, terrain,
 * landmarks). Lazy-loaded so deck.gl never burdens the headless render path; only
 * mounted in the browser preview when a Google Maps key is present.
 *
 * TIME OF DAY (Google-Earth style): a deck.gl SunLight is positioned from a real
 * timestamp (date + hour). SunLight computes the true solar azimuth/altitude for
 * the view's lat/lon, so the whole 3-D world is lit + casts shadows for that
 * moment — sunrise rakes long shadows, noon is flat, dusk goes golden.
 *
 * The user's key is theirs (BYO, browser-only, referrer-restricted in Google
 * Cloud). Google requires showing the tileset's data attribution — surfaced via
 * `onAttribution`.
 */
const GooglePhotoreal3D: React.FC<{ apiKey: string; onAttribution?: (s: string) => void; timeOfDay?: number; sunDate?: string }> = ({ apiKey, onAttribution, timeOfDay = 13, sunDate }) => {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: true, layers: [], effects: [] })) as MapboxOverlay;

  const layer = React.useMemo(
    () =>
      new Tile3DLayer({
        id: "google-photoreal-3d",
        data: "https://tile.googleapis.com/v1/3dtiles/root.json",
        loader: Tiles3DLoader,
        loadOptions: { fetch: { headers: { "X-GOOG-API-KEY": apiKey } } },
        // Draw + occlude against the map so labels/overlays sit correctly.
        operation: "terrain+draw",
        // Receive + cast the sun's shadows (the Google-Earth time-of-day look).
        _shadow: true,
        onTilesetLoad: (tileset: any) => {
          try {
            const c = tileset?.tileset?.asset?.copyright || tileset?.tileset?.copyright;
            if (c && onAttribution) onAttribution(String(c));
          } catch { /* attribution optional */ }
        },
      }),
    [apiKey, onAttribution],
  );

  // Real sun for the chosen date + hour. SunLight derives the solar position from
  // the timestamp + the current viewport location, so the world is lit correctly.
  const effects = React.useMemo(() => {
    const base = sunDate ? new Date(`${sunDate}T00:00:00`) : new Date();
    if (Number.isFinite(timeOfDay)) base.setHours(Math.floor(timeOfDay), Math.round((timeOfDay % 1) * 60), 0, 0);
    // Warm the light toward dawn/dusk, cool + dim it at night.
    const day = Math.max(0, Math.sin(((timeOfDay - 6) / 12) * Math.PI)); // 0 dawn/dusk, 1 noon
    const night = timeOfDay < 5.5 || timeOfDay > 19.5;
    const warm = day < 0.5 && !night ? (0.5 - day) / 0.5 : 0;
    const sunColor: [number, number, number] = night ? [120, 140, 200] : [255, 255 - warm * 60, 235 - warm * 90];
    const sun = new SunLight({ timestamp: base.getTime(), color: sunColor, intensity: night ? 0.35 : 1.5 + day * 0.6, _shadow: true });
    const ambient = new AmbientLight({ color: night ? [140, 160, 210] : [255, 255, 255], intensity: night ? 1.4 : 0.9 });
    const eff = new LightingEffect({ ambient, sun });
    // Soft, slightly transparent shadows.
    (eff as any).shadowColor = [0, 0, 0, 0.32];
    return [eff];
  }, [timeOfDay, sunDate]);

  React.useEffect(() => {
    try { overlay.setProps({ layers: [layer], effects }); } catch { /* overlay not ready */ }
    return () => { try { overlay.setProps({ layers: [], effects: [] }); } catch {} };
  }, [overlay, layer, effects]);

  return null;
};

export default GooglePhotoreal3D;
