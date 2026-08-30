/**
 * Server wrapper for the internal design-direction review page.
 *
 * The view itself is a client component (it reads the app store to show which
 * direction is live), and `notFound()` is server-only — so the gate lives here,
 * where it can actually render a 404 instead of an empty screen behind a real
 * URL. With NEXT_PUBLIC_SHOW_DIRECTIONS unset, the route does not exist.
 */
import { notFound } from "next/navigation";
import { SHOW_DIRECTIONS } from "@/lib/feature-flags";
import { DirectionsView } from "./DirectionsView";

export default function DirectionsPage() {
  if (!SHOW_DIRECTIONS) notFound();
  return <DirectionsView />;
}
