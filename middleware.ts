import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher([
  "/",            // landing page
  "/pricing",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  // Deploy-verification endpoint — booleans only, safe to leave open so you can
  // confirm env wiring right after a deploy (before Clerk is fully set up).
  "/api/health",
  // Public read-only shared-project viewer + its read API (capability is the
  // unguessable share token in the URL; only published projects are reachable).
  "/v/(.*)",
  "/api/v2/share/(.*)",
  // Render-agent endpoints: the CLI agent has no Clerk session — it
  // authenticates with its --key (verified against users.agentKey / dev
  // store) inside each handler. Must be Clerk-public or the agent gets a
  // 404 HTML page instead of JSON/script.
  "/api/agent/script(.*)",
  "/api/agent/job(.*)",
  "/api/agent/bundle-url(.*)",
  "/api/agent/heartbeat(.*)",
  "/api/agent/progress(.*)",
  "/api/agent/complete(.*)",
  // DEM tile proxy (CORS) for 3-D terrain — read-only, fixed upstream, no auth
  // needed (the render agent / map tiles fetch it with no Clerk session).
  "/api/dem(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  // Signed-out users hitting a gated page get REDIRECTED to sign-in (with a
  // return URL) rather than a dead-end 404 — so deep links and testing work.
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: req.url });
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
