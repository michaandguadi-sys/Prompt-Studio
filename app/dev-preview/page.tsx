import { HomeContent } from "@/components/home/HomeContent";

/** TEMPORARY dev-only preview of the generate experience — DELETE BEFORE SHIP. */
export default function DevPreview() {
  if (process.env.NODE_ENV === "production") return null;
  return <HomeContent />;
}
