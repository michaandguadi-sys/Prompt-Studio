/**
 * GET /api/agent/script?key=AGENT_KEY
 *
 * Returns the agent.mjs source with the PS_HOST injected to match
 * the requesting server (works on localhost, staging, and production).
 * The agent key is NOT embedded here — the user passes --key on CLI.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  // Determine the host from the request so the downloaded script points
  // to the right server (localhost in dev, production domain when deployed).
  const origin = req.headers.get("origin")
    ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  // Read the bundled agent source from the packages directory
  const agentPath = path.resolve(process.cwd(), "packages/agent/agent.mjs");
  let source: string;
  try {
    source = readFileSync(agentPath, "utf8");
  } catch {
    return NextResponse.json({ error: "Agent script not found" }, { status: 500 });
  }

  // Inject the actual server URL so the downloaded script auto-connects
  // without the user needing to pass --url manually.
  source = source.replace(
    `"https://app.promptstudio.io"`,
    JSON.stringify(origin),
  );

  return new NextResponse(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Content-Disposition": `attachment; filename="ps-agent.mjs"`,
      "Cache-Control": "no-store",
    },
  });
}
