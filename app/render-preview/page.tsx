"use client";

/**
 * /render-preview
 *
 * Headless render page used by the Render Agent (Puppeteer).
 * Accepts ?spec=BASE64_JSON query param.
 *
 * What it does for the agent:
 *  1. Parses and renders the SceneSpec passed via query string.
 *  2. Sets window.RENDER_READY = true when the map tiles (or other async
 *     resources) have finished loading — the agent waits for this.
 *  3. Exposes window.seekToFrame(n) so the agent can control playback frame
 *     by frame for screenshot capture.
 *  4. Sets window.CURRENT_FRAME = n after each seek resolves.
 *
 * Security: the page only loads when a valid ?key= agent key is provided.
 * The key is validated client-side (one API call on mount) so this page
 * does NOT appear in Next.js middleware protected routes.
 */

import dynamic from "next/dynamic";
import React, { useEffect, useRef, useState } from "react";

// Avoid SSR for the whole page — Remotion Player is browser-only
const Inner = dynamic(() => import("./_inner"), { ssr: false });

export default function RenderPreviewPage() {
  return <Inner />;
}
