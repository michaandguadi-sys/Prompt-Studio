"use client";

import React from "react";
import { useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { Tile3DLayer } from "@deck.gl/geo-layers";
import { Tiles3DLoader } from "@loaders.gl/3d-tiles";

/**
 * PHOTOREAL 3D (Google Earth) — overlays Google's Photorealistic 3D Tiles on the
 * MapLibre map via a deck.gl interleaved overlay, so the existing camera
 * animation flies through the real Earth 3D world (photoreal buildings, terrain,
 * landmarks). Lazy-loaded so deck.gl never burdens the headless render path; only
 * mounted in the browser preview when a Google Maps key is present.
 *
 * The user's key is theirs (BYO, browser-only, referrer-restricted in Google
 * Cloud). Google requires showing the tileset's data attribution — surfaced via
 * `onAttribution`.
 */
const GooglePhotoreal3D: React.FC<{ apiKey: string; onAttribution?: (s: string) => void }> = ({ apiKey, onAttribution }) => {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: true, layers: [] })) as MapboxOverlay;

  const layer = React.useMemo(
    () =>
      new Tile3DLayer({
        id: "google-photoreal-3d",
        data: "https://tile.googleapis.com/v1/3dtiles/root.json",
        loader: Tiles3DLoader,
        loadOptions: { fetch: { headers: { "X-GOOG-API-KEY": apiKey } } },
        // Draw + occlude against the map so labels/overlays sit correctly.
        operation: "terrain+draw",
        onTilesetLoad: (tileset: any) => {
          try {
            const c = tileset?.tileset?.asset?.copyright || tileset?.tileset?.copyright;
            if (c && onAttribution) onAttribution(String(c));
          } catch { /* attribution optional */ }
        },
      }),
    [apiKey, onAttribution],
  );

  React.useEffect(() => {
    try { overlay.setProps({ layers: [layer] }); } catch { /* overlay not ready */ }
    return () => { try { overlay.setProps({ layers: [] }); } catch {} };
  }, [overlay, layer]);

  return null;
};

export default GooglePhotoreal3D;
