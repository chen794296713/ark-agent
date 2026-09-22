"use client";

/**
 * CONTEXT — the documents an agent can look things up in. §E.4 / §6.6.
 *
 * Three ways in, one list out. A file is bytes we have to accept, store and index;
 * a paste is text we already have; a link is a string the RUNTIME may fetch later,
 * from inside its own egress sandbox — never from the control plane, and never
 * because someone clicked it here. That last distinction is why a `url` item is
 * rendered as plain text with a sentence saying so: a stored address that becomes a
 * clickable link is an SSRF and a phishing vector wearing a document icon.
 *
 * Everything is pre-flighted before a byte moves. `validateContextUpload` refuses on
 * size, on an empty file and on a MIME type we cannot read — an allowlist, so a
 * format nobody has thought about yet is refused rather than billed for. A blank
 * MIME is refused too: browsers report `""` often, and "probably text" is how a
 * binary ends up in a prompt.
 *
 * `awaiting_upload` means NO BYTES EXIST. When the caller gives us no upload
 * handler — the endpoint is not in this build — a chosen file is listed in exactly
 * that state, with a sentence saying nothing was stored. Silently pretending the
 * upload worked is the failure mode this panel is built to avoid.
 */
import { useRef, useState } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { manage, mt } from "@/lib/i18n/manage";
import type { ManageDict } from "@/lib/i18n/manage";
import type { Lang } from "@/lib/types";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorPanel,
  Field,
  InlineError,
  LinkBtn,
  Seg,
  SettingCard,
  sInput,
} from "./primitives";
import {
  CONTEXT_MIME_ALLOWLIST,
  LIMITS,
  contextUsage,
  draftId,
  formatBytes,
  validateContextText,
  validateContextUpload,
  validateContextUrl,
} from "./logic";
import type { ErrorMap, FieldError } from "./logic";
import type { ContextItemRow, ContextKind, ContextState } from "./types";
import { errText, formatWhen, localeOf } from "./DirtyBar";

const STATE_COLOR: Record<ContextState, string> = {
  awaiting_upload: c.amber,
  pending: c.muted,
  indexing: c.blue,
  indexed: c.accent,
  failed: c.red,
  removed: c.faint,
};

const STATE_GLYPH: Record<ContextState, string> = {
  awaiting_upload: "⚠",
  pending: "·",
  indexing: "◍",
  indexed: "✓",
  failed: "▲",
  removed: "✕",
};

function stateLabel(t: ManageDict, s: ContextState): string {
  switch (s) {
    case "awaiting_upload":
      return t.cAwaitingUpload;
    case "pending":
      return t.cPending;
    case "indexing":
      return t.cIndexing;
    case "indexed":
      return t.cIndexed;
    case "failed":
      return t.cFailed;
    case "removed":
      return t.cRemoved;
  }
}

function kindLabel(t: ManageDict, k: ContextKind): string {
  return k === "file" ? t.kFile : k === "text" ? t.kText : t.kUrl;
}

export function ContextPanel({
  lang,
  items,
  baseItems,
  errors,
  disabled = false,
  unavailable = false,
  loadError = null,
  uploadingIds = [],
  onRetry,
  onChange,
  onUpload,
  onRetryIndex,
}: {
  lang: Lang;
  items: ContextItemRow[];
  baseItems: ContextItemRow[];
  errors: ErrorMap;
  disabled?: boolean;
  /** The context endpoint is absent from this build. */
  unavailable?: boolean;
  loadError?: string | null;
  /** Ids whose bytes are in flight right now. */
  uploadingIds?: string[];
  onRetry?: () => void;
  onChange: (next: ContextItemRow[]) => void;
  /**
   * Hands the caller a validated file to transfer. Absent means uploads are not
   * wired up: the file is listed as `awaiting_upload` and the user is told so.
   */
  onUpload?: (file: File) => void;
  onRetryIndex?: (id: string) => void;
}) {
  const t = manage[lang];
  const locale = localeOf(lang);
  const fileInput = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<ContextKind>("file");
  const [dragOver, setDragOver] = useState(false);
  const [addError, setAddError] = useState<FieldError | null>(null);
  const [textName, setTextName] = useState("");
  const [textBody, setTextBody] = useState("");
  const [urlName, setUrlName] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [removing, setRemoving] = useState<ContextItemRow | null>(null);

  const baseIds = new Set(baseItems.map((x) => x.id));
  const dirtyCount =
    items.filter((x) => !baseIds.has(x.id)).length +
    baseItems.filter((x) => !items.some((y) => y.id === x.id)).length;

  const errorCount = Object.keys(errors).filter(
    (k) => k === "context" || k.startsWith("context."),
  ).length;
  const quotaError = errText(t, errors["context"]);
  const usage = contextUsage(items);
  const uploading = new Set(uploadingIds);

  function acceptFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    // Quota is charged against a RUNNING tally, not against the list as it was when
    // the drop started: three 8 MB files dropped together must be judged as 24 MB,
    // which is exactly the case a per-file check against `items` waves through.
    const accounting: ContextItemRow[] = [...items];
    const staged: ContextItemRow[] = [];
    const toUpload: File[] = [];

    for (const file of Array.from(list)) {
      const bad = validateContextUpload(file, accounting);
      if (bad) {
        // The first refusal stops the batch. A user who dropped six files and sees
        // one error needs to know WHICH one, and a list of six errors is a wall.
        setAddError(bad);
        if (staged.length > 0) onChange([...items, ...staged]);
        toUpload.forEach((f) => onUpload?.(f));
        return;
      }
      const row: ContextItemRow = {
        id: draftId("ctx"),
        kind: "file",
        title: file.name,
        mime: file.type,
        // Bytes are what the file WOULD cost. The state says none are stored yet.
        bytes: file.size,
        sourceUrl: null,
        state: "awaiting_upload",
        stateError: null,
        chunks: null,
        createdAt: new Date().toISOString(),
      };
      accounting.push(row);
      if (onUpload) toUpload.push(file);
      else staged.push(row);
    }

    setAddError(null);
    if (staged.length > 0) onChange([...items, ...staged]);
    toUpload.forEach((f) => onUpload?.(f));
  }

  function addText() {
    const bad = validateContextText(textBody, items);
    if (bad) {
      setAddError(bad);
      return;
    }
    const name = textName.trim();
    if (!name) {
      setAddError({ code: "errContextName" });
      return;
    }
    const body = textBody.trim();
    onChange([
      ...items,
      {
        id: draftId("ctx"),
        kind: "text",
        title: name,
        mime: "text/plain",
        bytes: new TextEncoder().encode(body).length,
        sourceUrl: null,
        state: "pending",
        stateError: null,
        chunks: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    setAddError(null);
    setTextName("");
    setTextBody("");
  }

  function addUrl() {
    const bad = validateContextUrl(urlValue);
    if (bad) {
      setAddError(bad);
      return;
    }
    const name = urlName.trim() || urlValue.trim();
    onChange([
      ...items,
      {
        id: draftId("ctx"),
        kind: "url",
        title: name,
        mime: null,
        // Nothing has been fetched, so nothing is charged against the quota yet.
        bytes: 0,
        sourceUrl: urlValue.trim(),
        state: "pending",
        stateError: null,
        chunks: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    setAddError(null);
    setUrlName("");
    setUrlValue("");
  }

  const addErrText = errText(t, addError);
  const canAdd = !disabled && !unavailable;

  return (
    <SettingCard
      title={t.contextTitle}
      sectionId="cfg-context"
      desc={t.contextDesc}
      dirtyCount={dirtyCount}
      errorCount={errorCount}
      editedLabel={t.edited}
      problemLabel={mt(errorCount === 1 ? t.problemOne : t.problemMany, { n: errorCount })}
      actions={
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: ".08em",
            color: quotaError ? c.red : c.muted,
          }}
        >
          {mt(t.contextQuota, {
            count: usage.count,
            maxItems: LIMITS.contextItemCountMax,
            used: formatBytes(usage.bytes, locale),
            maxSize: formatBytes(LIMITS.contextTotalMaxBytes, locale),
          })}
        </span>
      }
    >
      {loadError && (
        <ErrorPanel
          title={t.configLoadError}
          body={loadError}
          onRetry={onRetry}
          retryLabel={t.tryAgain}
        />
      )}
      {unavailable && <ErrorPanel title={t.contextUnavailable} />}
      {quotaError && <InlineError text={quotaError} />}

      <div style={{ display: "grid", gap: 12 }}>
        <Seg<ContextKind>
          value={tab}
          label={t.contextTitle}
          onChange={(v) => {
            setTab(v);
            setAddError(null);
          }}
          options={[
            { id: "file", label: t.kFile },
            { id: "text", label: t.kText },
            { id: "url", label: t.kUrl },
          ]}
        />

        {tab === "file" && (
          <div
            onDragOver={(e) => {
              if (!canAdd) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!canAdd) return;
              acceptFiles(e.dataTransfer?.files ?? null);
            }}
            style={{
              border: `1px dashed ${dragOver ? c.limeBorder : c.border}`,
              background: dragOver ? c.limeWash : c.panelDeep,
              borderRadius: r.radiusMd,
              padding: "22px 18px",
              textAlign: "center",
              display: "grid",
              gap: 10,
              justifyItems: "center",
            }}
          >
            <div style={{ fontSize: 13.5, color: c.text2 }}>{t.dropHere}</div>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={CONTEXT_MIME_ALLOWLIST.join(",")}
              disabled={!canAdd}
              onChange={(e) => {
                acceptFiles(e.target.files);
                // Let the same file be chosen twice in a row after a failure.
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
            <Btn
              type="button"
              disabled={!canAdd}
              onClick={() => fileInput.current?.click()}
              hoverStyle={canAdd ? { borderColor: c.limeBorder, color: c.accent } : undefined}
              style={{
                border: `1px solid ${c.borderField}`,
                background: "transparent",
                color: canAdd ? c.muted : c.faint,
                padding: "8px 14px",
                fontFamily: font.mono,
                fontSize: 12,
                borderRadius: r.radiusSm,
                cursor: canAdd ? "pointer" : "not-allowed",
              }}
            >
              {t.browseFiles}
            </Btn>
            <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>{t.allowedTypes}</div>
            {!onUpload && <div style={{ fontSize: 12, color: c.muted }}>{t.uploadDeferred}</div>}
          </div>
        )}

        {tab === "text" && (
          <div style={{ display: "grid", gap: 12 }}>
            <Field label={t.textNameLabel} htmlFor="cfg-context-text-name">
              <input
                id="cfg-context-text-name"
                type="text"
                value={textName}
                disabled={!canAdd}
                onChange={(e) => setTextName(e.target.value)}
                placeholder={t.textNamePlaceholder}
                style={sInput}
              />
            </Field>
            <Field
              label={t.textBodyLabel}
              hint={mt(t.charCounter, {
                n: textBody.trim().length.toLocaleString(locale),
                max: LIMITS.contextTextMax.toLocaleString(locale),
              })}
              htmlFor="cfg-context-text-body"
            >
              <textarea
                id="cfg-context-text-body"
                value={textBody}
                disabled={!canAdd}
                onChange={(e) => setTextBody(e.target.value)}
                placeholder={t.textBodyPlaceholder}
                rows={5}
                style={{ ...sInput, resize: "vertical", lineHeight: 1.6 }}
              />
            </Field>
            <div>
              <AddBtn label={t.addTextAction} onClick={addText} disabled={!canAdd} />
            </div>
          </div>
        )}

        {tab === "url" && (
          <div style={{ display: "grid", gap: 12 }}>
            <Field label={t.textNameLabel} htmlFor="cfg-context-url-name">
              <input
                id="cfg-context-url-name"
                type="text"
                value={urlName}
                disabled={!canAdd}
                onChange={(e) => setUrlName(e.target.value)}
                placeholder={t.textNamePlaceholder}
                style={sInput}
              />
            </Field>
            <Field label={t.urlLabel} hint={t.urlIsText} htmlFor="cfg-context-url">
              <input
                id="cfg-context-url"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={urlValue}
                disabled={!canAdd}
                onChange={(e) => setUrlValue(e.target.value)}
                placeholder={t.urlPlaceholder}
                style={{ ...sInput, fontFamily: font.mono, fontSize: 13 }}
              />
            </Field>
            <div>
              <AddBtn label={t.addUrlAction} onClick={addUrl} disabled={!canAdd} />
            </div>
          </div>
        )}

        {addErrText && <InlineError text={addErrText} />}
      </div>

      {items.length === 0 ? (
        <EmptyState glyph="▤" title={t.noContextTitle} body={t.noContextBody} />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {items.map((item) => {
            const isNew = !baseIds.has(item.id);
            const busy = uploading.has(item.id);
            return (
              <li
                key={item.id}
                style={{
                  border: `1px solid ${item.state === "failed" ? c.redBorder : c.border}`,
                  borderLeft: `2px solid ${isNew ? c.amber : c.border}`,
                  borderRadius: r.radiusSm,
                  background: c.panelDeep,
                  padding: "12px 14px",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  opacity: item.state === "removed" ? 0.55 : 1,
                }}
              >
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge text={kindLabel(t, item.kind)} />
                    <span style={{ fontSize: 13.5, color: c.text, overflowWrap: "anywhere" }}>
                      {item.title}
                    </span>
                    <Badge
                      text={busy ? t.uploading : stateLabel(t, item.state)}
                      color={STATE_COLOR[item.state]}
                      glyph={STATE_GLYPH[item.state]}
                    />
                  </div>

                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      color: c.faint,
                      marginTop: 4,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.mime ? `${item.mime} · ` : ""}
                    {formatBytes(item.bytes, locale)}
                    {item.chunks !== null ? ` · ${mt(t.chunksLabel, { n: item.chunks })}` : ""}
                    {` · ${formatWhen(item.createdAt, lang)}`}
                  </div>

                  {item.sourceUrl && (
                    <div style={{ marginTop: 6 }}>
                      {/* Text, never an href. §6.6: the runtime fetches this from its
                          own sandbox; the control plane must not make it clickable. */}
                      <div
                        style={{
                          fontFamily: font.mono,
                          fontSize: 11.5,
                          color: c.text2,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {item.sourceUrl}
                      </div>
                      <div style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>{t.urlIsText}</div>
                    </div>
                  )}

                  {item.state === "awaiting_upload" && !onUpload && (
                    <div style={{ fontSize: 12, color: c.muted, marginTop: 6, lineHeight: 1.5 }}>
                      {t.uploadDeferred}
                    </div>
                  )}

                  {item.stateError && (
                    <div style={{ fontSize: 12.5, color: c.text2, marginTop: 6, lineHeight: 1.5 }}>
                      <span aria-hidden="true" style={{ color: c.red }}>
                        ▲{" "}
                      </span>
                      <span style={{ fontFamily: font.mono, fontSize: 11.5 }}>{item.stateError}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {item.state === "failed" && onRetryIndex && (
                    <LinkBtn onClick={() => onRetryIndex(item.id)} disabled={disabled}>
                      {t.retryIndexing}
                    </LinkBtn>
                  )}
                  <LinkBtn onClick={() => setRemoving(item)} danger disabled={disabled || busy}>
                    {t.removeItem}
                  </LinkBtn>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {removing && (
        <ConfirmDialog
          title={mt(t.removeItemTitle, { name: removing.title })}
          body={t.removeItemBody}
          confirmLabel={t.removeItem}
          cancelLabel={t.cancel}
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onChange(items.filter((x) => x.id !== removing.id));
            setRemoving(null);
          }}
        />
      )}
    </SettingCard>
  );
}

function AddBtn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Btn
      type="button"
      onClick={onClick}
      disabled={disabled}
      hoverStyle={disabled ? undefined : { borderColor: c.limeBorder, color: c.accent }}
      style={{
        border: `1px solid ${c.borderField}`,
        background: "transparent",
        color: disabled ? c.faint : c.muted,
        padding: "8px 14px",
        fontFamily: font.mono,
        fontSize: 12,
        borderRadius: r.radiusSm,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </Btn>
  );
}
