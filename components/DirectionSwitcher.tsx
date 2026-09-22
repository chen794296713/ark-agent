"use client";

/**
 * Brand-direction picker — Terminal Lime / Ivory Studio / Midnight Console.
 *
 * A sibling of ThemeToggle rather than part of it: direction and mode are two
 * independent axes in the design source (ArkAgent.dc.html), so folding six
 * combinations into one menu would make choosing "light" mean re-picking the
 * brand as well.
 *
 * The swatch, not a glyph, is the icon. Three line-icons for three brand looks
 * would be arbitrary — the accent colour IS the difference, so each option
 * shows its own signal colour on its own surface, sampled live from the
 * palette that option would apply.
 */
import { useRef, type CSSProperties } from "react";
import { c, font } from "@/lib/theme";
import { useApp, DIRECTIONS, type Direction } from "@/lib/store";
import { common } from "@/lib/i18n/common";
import { Btn } from "@/components/ui";
import { MenuPopover } from "@/components/MenuPopover";

/**
 * Each direction's bg + accent, duplicated from app/globals.css.
 *
 * A CSS var would resolve to the ACTIVE palette, so every swatch would show the
 * current look and the menu would be three identical dots. These are the only
 * hard-coded colours in the app and exist so the picker can show a look you are
 * not currently in.
 */
const SWATCH: Record<Direction, { dark: [string, string]; light: [string, string] }> = {
  terminal: { dark: ["#0A0D12", "#D8FF3E"], light: ["#F3F5F8", "#4C7A00"] },
  ivory: { dark: ["#1A1714", "#D8814F"], light: ["#F4EFE6", "#B65C36"] },
  midnight: { dark: ["#0A0F1E", "#5B8CFF"], light: ["#EEF2FA", "#2F62E6"] },
};

function Swatch({ direction, mode, size = 15 }: { direction: Direction; mode: "dark" | "light"; size?: number }) {
  const [bg, accent] = SWATCH[direction][mode];
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        // The ring keeps a light swatch visible on a light menu.
        boxShadow: `inset 0 0 0 1px ${c.border}`,
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: size * 0.28,
          borderRadius: "50%",
          background: accent,
        }}
      />
    </span>
  );
}

export function DirectionSwitcher({
  compact = true,
  drop,
  style,
}: {
  /** `false` renders the three options inline, for the mobile drawer. */
  compact?: boolean;
  drop?: "up" | "down";
  style?: CSSProperties;
}) {
  const { lang, theme, direction, setDirection } = useApp();
  const t = common[lang];
  const labels: Record<Direction, string> = {
    terminal: t.dirTerminal,
    ivory: t.dirIvory,
    midnight: t.dirMidnight,
  };

  if (!compact) {
    return <Segments direction={direction} mode={theme} setDirection={setDirection} labels={labels} t={t} style={style} />;
  }

  return (
    <MenuPopover
      label={t.direction}
      icon={<Swatch direction={direction} mode={theme} size={16} />}
      valueLabel={labels[direction]}
      compact
      drop={drop}
      style={style}
      options={DIRECTIONS.map((name) => ({
        key: name,
        selected: name === direction,
        onSelect: () => setDirection(name),
        lead: <Swatch direction={name} mode={theme} />,
        label: labels[name],
        title: t.switchDirection(labels[name]),
      }))}
    />
  );
}

/** Inline radiogroup for the mobile drawer, where there is room for all three. */
function Segments({
  direction,
  mode,
  setDirection,
  labels,
  t,
  style,
}: {
  direction: Direction;
  mode: "dark" | "light";
  setDirection: (d: Direction) => void;
  labels: Record<Direction, string>;
  t: (typeof common)["en"];
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Btn declares no `ref` prop, so the group moves focus by querying its own
  // rendered radios — the same pattern ThemeToggle's segments use.
  const focusAt = (i: number) =>
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus();

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const last = DIRECTIONS.length - 1;
    let next: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return; // Enter/Space already fire click on a native <button>.
    e.preventDefault();
    setDirection(DIRECTIONS[next]); // arrows select as well as move
    focusAt(next);
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={t.direction}
      style={{
        display: "flex",
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        overflow: "hidden",
        ...style,
      }}
    >
      {DIRECTIONS.map((name, i) => {
        const on = name === direction;
        return (
          <Btn
            key={name}
            role="radio"
            aria-checked={on}
            // Roving tabindex: the group is one tab stop, arrows move inside it.
            tabIndex={on ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => setDirection(name)}
            title={t.switchDirection(labels[name])}
            hoverStyle={{ background: c.hover }}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: on ? c.navSelected : "transparent",
              color: on ? c.text : c.muted,
              border: "none",
              borderRight: i < DIRECTIONS.length - 1 ? `1px solid ${c.border}` : undefined,
              padding: "10px 8px",
              fontFamily: font.sans,
              fontSize: 13,
              cursor: "pointer",
              minWidth: 0,
            }}
          >
            <Swatch direction={name} mode={mode} size={13} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {labels[name]}
            </span>
          </Btn>
        );
      })}
    </div>
  );
}
