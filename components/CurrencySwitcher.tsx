"use client";

/**
 * USD / CNY segmented control for the pricing section.
 *
 * Only two options, so the popover the language switcher uses for its four
 * would hide half the choice behind a click. This borrows the region and cycle
 * tabs from the checkout screen instead: both currencies stay on screen, one
 * tap apart. Choosing one pins it in the store, which persists the choice and
 * stops it following the UI language.
 */
import { useRef } from "react";
import { c, font } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { CURRENCIES, type Currency } from "@/lib/pricing";
import { landing } from "@/lib/i18n/landing";
import { Btn } from "@/components/ui";

export function CurrencySwitcher({ style }: { style?: React.CSSProperties }) {
  const { lang, currency, setCurrency } = useApp();
  const t = landing[lang];
  const labels: Record<Currency, string> = { usd: t.currencyUSD, cny: t.currencyCNY };
  const ref = useRef<HTMLDivElement>(null);

  // `role="radiogroup"` promises the WAI-ARIA radio contract: ONE tab stop for
  // the group, arrows moving (and selecting) within it. Declaring the role
  // without the behaviour is worse than using plain buttons — a screen-reader
  // user is told to press arrows and nothing happens.
  const focusAt = (i: number) =>
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus();

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const last = CURRENCIES.length - 1;
    let next: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return; // Enter/Space already fire click on a native <button>.
    e.preventDefault();
    setCurrency(CURRENCIES[next]);
    focusAt(next);
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={t.currencyLabel}
      style={{
        display: "flex",
        gap: 2,
        border: `1px solid ${c.border}`,
        padding: 3,
        width: "fit-content",
        ...style,
      }}
    >
      {CURRENCIES.map((code, i) => {
        const on = code === currency;
        return (
          <Btn
            key={code}
            role="radio"
            aria-checked={on}
            // Roving tabindex: the group is a single tab stop.
            tabIndex={on ? 0 : -1}
            onClick={() => setCurrency(code)}
            onKeyDown={(e) => onKey(e, i)}
            // The active chip is already a lime fill; only the idle one lifts.
            hoverStyle={on ? undefined : { color: c.text }}
            style={{
              background: on ? c.lime : "transparent",
              color: on ? c.ink : c.muted,
              border: "none",
              padding: "7px 14px",
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".04em",
              cursor: "pointer",
            }}
          >
            {labels[code]}
          </Btn>
        );
      })}
    </div>
  );
}
