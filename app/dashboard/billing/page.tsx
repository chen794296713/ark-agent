"use client";

/**
 * Dashboard → Billing & usage. Pixel-ported from ArkAgent.dc.html (markup lines
 * 880-958, billing datasets 1800-1849). The sidebar/dashboard chrome is supplied
 * by app/dashboard/layout.tsx; this page renders only the billing screen. Range
 * tabs + custom date pickers drive which dataset is shown.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { basePlanRows, getBillDatasets, invoices } from "@/lib/data";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";

const billTabDefs: Array<[string, string]> = [
  ["cycle", "THIS CYCLE"],
  ["last", "LAST CYCLE"],
  ["d90", "LAST 90 DAYS"],
  ["custom", "CUSTOM"],
];

export default function BillingPage() {
  const router = useRouter();
  const [billRange, setBillRange] = useState<string>("cycle");
  const [billFrom, setBillFrom] = useState("2026-06-01");
  const [billTo, setBillTo] = useState("2026-06-13");

  const datasets = getBillDatasets(billFrom, billTo);
  const bd = datasets[billRange] || datasets.cycle;
  const billCustom = billRange === "custom";

  const planRows = basePlanRows.map((b, i) =>
    Object.assign({}, b, (bd.pr && bd.pr[i]) || {}),
  );

  return (
    <div data-screen-label="Billing" style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 28,
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <h2
          style={{
            fontFamily: font.space,
            fontWeight: 700,
            fontSize: 26,
            margin: 0,
          }}
        >
          Billing &amp; usage
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: c.faint }}>
            VISA ••4242 · OVERAGE $2 / 1K CREDITS
          </span>
          <Btn
            onClick={() => router.push("/payment")}
            hoverStyle={{ borderColor: c.limeBorder, background: c.limeWash }}
            style={{
              background: "none",
              border: `1px solid ${c.border}`,
              color: c.lime,
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".04em",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            UPDATE PAYMENT →
          </Btn>
        </div>
      </div>

      {/* Range tabs */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 2,
            border: `1px solid ${c.border}`,
            padding: 3,
            width: "fit-content",
          }}
        >
          {billTabDefs.map(([id, label]) => {
            const on = billRange === id;
            return (
              <button
                key={id}
                onClick={() => setBillRange(id)}
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
                {label}
              </button>
            );
          })}
        </div>
        {billCustom && (
          <>
            <input
              type="date"
              value={billFrom}
              onChange={(e) => setBillFrom(e.target.value)}
              style={{
                background: c.panel,
                border: `1px solid ${c.border}`,
                color: c.text,
                padding: "8px 10px",
                fontFamily: font.mono,
                fontSize: 12,
                outline: "none",
                colorScheme: "dark",
              }}
            />
            <span style={{ color: c.faint }}>→</span>
            <input
              type="date"
              value={billTo}
              onChange={(e) => setBillTo(e.target.value)}
              style={{
                background: c.panel,
                border: `1px solid ${c.border}`,
                color: c.text,
                padding: "8px 10px",
                fontFamily: font.mono,
                fontSize: 12,
                outline: "none",
                colorScheme: "dark",
              }}
            />
          </>
        )}
      </div>

      {/* Top grid: credits + invoice estimate */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: r.billing,
          gap: 20,
          marginBottom: 28,
          alignItems: "stretch",
        }}
      >
        {/* Credits card */}
        <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                letterSpacing: ".1em",
                color: c.faint,
              }}
            >
              {bd.label}
            </span>
            <span style={{ fontFamily: font.space, fontWeight: 700, fontSize: 22 }}>
              {bd.cr}{" "}
              <span style={{ fontSize: 13, color: c.faint, fontWeight: 400 }}>
                / {bd.inc} included
              </span>
            </span>
          </div>
          <div style={{ height: 8, background: c.line, marginBottom: 20 }}>
            <div style={{ height: 8, width: bd.w, background: c.lime }} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 90 }}>
            {bd.bars.map((bar, i) => (
              <div
                key={i}
                style={{ flex: 1, background: bar[1], height: `${bar[0]}%` }}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: font.mono,
              fontSize: 10.5,
              color: c.faint,
              marginTop: 8,
            }}
          >
            <span>{bd.x[0]}</span>
            <span>{bd.x[1]}</span>
            <span>{bd.x[2]}</span>
          </div>
        </div>

        {/* Invoice estimate card */}
        <div
          style={{
            border: `1px solid ${c.border}`,
            background: c.panel,
            padding: 24,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".1em",
              color: c.faint,
              marginBottom: 14,
            }}
          >
            {bd.inv}
          </span>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 11,
              fontSize: 14,
              flex: 1,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.muted }}>{bd.seatsLabel}</span>
              <span style={{ fontFamily: font.mono }}>{bd.seats}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.muted }}>{bd.overLabel}</span>
              <span style={{ fontFamily: font.mono }}>{bd.over}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.muted }}>Annual discount</span>
              <span style={{ fontFamily: font.mono, color: c.green }}>{bd.disc}</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: `1px solid ${c.line}`,
              paddingTop: 14,
              marginTop: 14,
            }}
          >
            <span style={{ fontFamily: font.space, fontWeight: 700 }}>Total</span>
            <span style={{ fontFamily: font.space, fontWeight: 700, fontSize: 20 }}>
              {bd.total}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom grid: per-agent usage + invoices */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: r.billing,
          gap: 20,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".12em",
              color: c.faint,
              marginBottom: 12,
            }}
          >
            PER-AGENT USAGE
          </div>
          <div className="ark-scroll" style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 440 }}>
          <div style={{ border: `1px solid ${c.border}`, background: c.panel }}>
            {planRows.map((b, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 20px",
                  borderBottom: `1px solid ${c.lineSoft}`,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    background: b.hue,
                    color: c.ink,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: font.space,
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {b.mono}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14 }}>
                    {b.name}{" "}
                    <span style={{ color: c.faint, fontSize: 12.5 }}>· {b.plan}</span>
                  </div>
                </div>
                <div style={{ width: 150 }}>
                  <div style={{ height: 4, background: c.line }}>
                    <div style={{ height: 4, width: b.w, background: b.hue }} />
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 12.5,
                    color: c.text2,
                    width: 120,
                    textAlign: "right",
                  }}
                >
                  {b.cr}
                </span>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 12.5,
                    color: c.muted,
                    width: 64,
                    textAlign: "right",
                  }}
                >
                  {b.price}
                </span>
              </div>
            ))}
          </div>
          </div>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".12em",
              color: c.faint,
              marginBottom: 12,
            }}
          >
            INVOICES
          </div>
          <div className="ark-scroll" style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 360 }}>
          <div style={{ border: `1px solid ${c.border}`, background: c.panel }}>
            {invoices.map((v, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 20px",
                  borderBottom: `1px solid ${c.lineSoft}`,
                }}
              >
                <span style={{ fontSize: 14, color: c.text2 }}>{v.d}</span>
                <span style={{ fontFamily: font.mono, fontSize: 13 }}>{v.amt}</span>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.green }}>
                  {v.st}
                </span>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 11,
                    color: c.faint,
                    cursor: "pointer",
                  }}
                >
                  PDF ↓
                </span>
              </div>
            ))}
          </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
