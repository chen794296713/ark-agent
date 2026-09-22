"use client";

import { useState } from "react";
import { LlmChannelsPanel } from "@/components/llm/LlmChannelsPanel";
import { useApp } from "@/lib/store";
import { llmSettings } from "@/lib/i18n/llm-settings";
import { c, font, r } from "@/lib/theme";

type LlmTab = "system" | "custom";

export default function LlmSettingsPage() {
  const { lang } = useApp();
  const t = llmSettings[lang];
  const [tab, setTab] = useState<LlmTab>("system");

  return (
    <div data-screen-label="LLM configuration" style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <div role="tablist" aria-label={t.manageTitle} style={{ display: "flex", gap: 26, borderBottom: `1px solid ${c.border}`, marginBottom: 2, overflowX: "auto" }}>
        {(["system", "custom"] as const).map((item) => {
          const label = item === "system" ? t.systemTab : t.customTab;
          return <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} style={{ flex: "0 0 auto", border: 0, borderBottom: `2px solid ${tab === item ? c.accent : "transparent"}`, background: "transparent", color: tab === item ? c.text : c.muted, padding: "11px 2px", marginBottom: -1, cursor: "pointer", fontFamily: font.space, fontWeight: tab === item ? 700 : 500, fontSize: 14 }}>{label}</button>;
        })}
      </div>
      <LlmChannelsPanel fixedTab={tab} embedded />
    </div>
  );
}
