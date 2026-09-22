"use client";

/**
 * Password input with a show/hide toggle.
 *
 * The toggle lives inside the field's own box rather than beside it, so the
 * control travels with the input on every screen width without any layout
 * arithmetic at the call sites.
 *
 * Labels are props rather than a dictionary import: this component is used from
 * screens that own different dictionaries (auth, account), and passing the two
 * strings in keeps it from reaching across into either one.
 */
import { useId, useState, type CSSProperties } from "react";
import { c, font } from "@/lib/theme";
import { Btn } from "@/components/ui";

/** Matches the line-icon frame used by ThemeToggle / LanguageSwitcher. */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3.2" />
      {off ? <path d="M4 20 20 4" /> : null}
    </svg>
  );
}

export function PasswordField({
  value,
  onChange,
  placeholder,
  showLabel,
  hideLabel,
  autoComplete = "current-password",
  id,
  name,
  required,
  disabled,
  style,
  onKeyDown,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Accessible label for the toggle while the password is hidden. */
  showLabel: string;
  /** …and while it is visible. */
  hideLabel: string;
  autoComplete?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  /** Merged over the input's base style so callers keep their own field metrics. */
  style?: CSSProperties;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);
  const fallbackId = useId();
  const inputId = id ?? fallbackId;

  return (
    <div style={{ position: "relative", display: "block" }}>
      <input
        id={inputId}
        name={name}
        // Swapping `type` preserves the element, so the value and the caret
        // survive the toggle — re-mounting a second input would not.
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: c.panel,
          border: `1px solid ${c.border}`,
          color: c.text,
          padding: "12px 14px",
          // Room for the toggle, so a long value scrolls under it instead of
          // running beneath the icon.
          paddingRight: 46,
          fontSize: 15,
          fontFamily: font.sans,
          outline: "none",
          ...style,
        }}
      />
      <Btn
        // Never "submit": these fields sit inside real <form>s on the account
        // screen, where a default-type button would save the form instead.
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-controls={inputId}
        aria-pressed={visible}
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
        hoverStyle={{ color: c.text }}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: 42,
          display: "grid",
          placeItems: "center",
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          color: c.muted,
          cursor: disabled ? "default" : "pointer",
        }}
        disabled={disabled}
        // The input already announces itself; the button carries its own label.
        tabIndex={0}
      >
        <EyeIcon off={visible} />
      </Btn>
    </div>
  );
}
