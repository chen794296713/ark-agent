"use client";

/**
 * Which harnesses a picker may offer.
 *
 * The enablement rule lives on the server — it reads `ATG_ENABLED_HARNESSES` and
 * the OpenClaw Manager's `category_id` map, neither of which a client component
 * can see. Before this hook, every picker rendered all four harnesses and a user
 * could choose Codex, write a whole brief, and only find out on submit that
 * `POST /api/agents` refuses it with a 422.
 *
 * The result is cached at module scope: four separate pickers exist across the
 * hire flow, the create flow, the template gallery and agent settings, and there
 * is no reason for four requests.
 */
import { useEffect, useState } from "react";
import { HARNESS_IDS, HARNESS_LIST, type Harness, type HarnessDef } from "./index";

export interface HarnessOption extends HarnessDef {
  enabled: boolean;
  confirms: readonly string[];
}

let cache: HarnessOption[] | null = null;
let inFlight: Promise<HarnessOption[]> | null = null;

async function load(): Promise<HarnessOption[]> {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = fetch("/api/harnesses", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { harnesses: HarnessOption[] };
        cache = body.harnesses;
        return cache;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * `HarnessDef`s a picker should show, with `enabled` telling it which are
 * selectable.
 *
 * Until the fetch resolves — and if it fails — every harness comes back
 * `enabled: true`. That is deliberately the pre-existing behaviour rather than
 * an empty picker: the server refuses an unavailable harness either way, so the
 * worst case is the 422 we already had, while an empty picker would block a
 * user whose only problem was a slow network.
 */
export function useHarnessOptions(): { options: HarnessOption[]; ready: boolean } {
  const [options, setOptions] = useState<HarnessOption[]>(
    () => cache ?? HARNESS_LIST.map((h) => ({ ...h, enabled: true, confirms: [] })),
  );
  const [ready, setReady] = useState(cache !== null);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    load()
      .then((list) => {
        if (cancelled) return;
        setOptions(list);
        setReady(true);
      })
      .catch(() => {
        // Leave the optimistic list in place; the server is still the gate.
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { options, ready };
}

/**
 * The `{ id, label }` options for a `<SelectField>`, narrowed to what this
 * deployment allows.
 *
 * `current` is always included even when it is disabled: an agent already
 * running on a harness that has since been turned off must still see its own
 * value, or the select renders blank and the next save silently moves it.
 */
export function selectableHarnesses(
  options: HarnessOption[],
  current?: Harness | null,
): { id: Harness; label: string }[] {
  const usable = options.filter((h) => h.enabled || h.id === current);
  // Never return an empty picker — a misconfigured allowlist should not make the
  // form unusable, and the server will still refuse a bad choice.
  const list = usable.length ? usable : options;
  return list
    .slice()
    .sort((a, b) => HARNESS_IDS.indexOf(a.id) - HARNESS_IDS.indexOf(b.id))
    .map((h) => ({ id: h.id, label: h.label }));
}
