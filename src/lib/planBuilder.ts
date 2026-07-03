/**
 * Plan-builder registry — lets other API routes call the generate route's
 * `buildFromPlan` without the route EXPORTING it (Next.js route modules may
 * only export HTTP handlers/config; a cross-route value import breaks the
 * generated route types). The generate route registers its builder as a
 * module side-effect; consumers import the route for effect and read it here.
 */

type Builder = (plan: any, opts?: { story?: boolean }) => Promise<any>;

let builder: Builder | null = null;

export function _registerPlanBuilder(fn: Builder): void {
  builder = fn;
}

export function getPlanBuilder(): Builder {
  if (!builder) throw new Error("Plan builder not registered — import the generate route first");
  return builder;
}
