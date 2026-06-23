import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LandingExperience } from "@/components/landing/LandingExperience";

/**
 * Public marketing landing — an immersive, scroll-driven cinematic fly-through
 * (map-radar loader → descend from space into the map into the studio). Signed-in
 * users skip straight to the app; everything else lives behind auth (middleware).
 */
export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/home");
  return <LandingExperience />;
}
