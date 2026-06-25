import Link from "next/link";
import { Sparkles, Layers } from "lucide-react";
import { OnboardingModal } from "@/components/home/OnboardingModal";
import { HomeContent } from "@/components/home/HomeContent";

/**
 * REDESIGNED HOME — a well-organized dashboard that surfaces all tools and
 * entry points at a glance. No more full-screen hero to scroll past.
 *
 * Layout (top to bottom):
 *   1. Greeting header + brand link
 *   2. Quick AI prompt bar (compact, inline)
 *   3. Tools grid — bento-style cards for every builder
 *   4. Your projects (saved work)
 *   5. Templates / sparks (curated starting points)
 *   6. Import track / GPS route entry
 */
export default function StudioHome() {
  return (
    <div className="h-full overflow-y-auto bg-paper-50">
      <OnboardingModal />
      <HomeContent />
    </div>
  );
}
