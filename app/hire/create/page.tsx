"use client";

/**
 * `/hire/create` — the AI-guided alternative to the four-step hire wizard
 * (docs/UI_DESIGN_V2.md §C). The wizard at `/hire` is NOT replaced: a user who
 * knows exactly which role they want still picks a tile there.
 *
 * `useSearchParams` reads `?generation=` to resume a run started in another
 * tab, which is why the flow sits behind a Suspense boundary.
 */
import { Suspense } from "react";
import CreateFlow from "./CreateFlow";

export default function CreateAgentPage() {
  return (
    <Suspense fallback={null}>
      <CreateFlow />
    </Suspense>
  );
}
