"use client";

/**
 * Section 5 of 6 — CONTEXT.
 *
 * What the agent is given to read: text pasted straight into the draft, files,
 * and links it fetches from its own machine. This is the card that decides
 * whether the agent guesses or knows, so it is also the card that has to be
 * honest about what it can and cannot do YET.
 *
 * The honesty, spelled out, because it is the whole design of this screen:
 *
 *  - There is no agent yet, so there is nowhere to upload a file to. A small
 *    text file is therefore READ INTO the draft as pasted text — the user's ICP
 *    doc is attached in one drop. Anything else (a PDF, a spreadsheet, a big
 *    file) becomes a `file_request`: a row that remembers what to ask for once
 *    the agent exists, and says so in those words.
 *  - Every limit is shown BEFORE the picker opens — accepted types, the
 *    per-item ceiling, the quota used and the slots left — so a rejection is
 *    something the user was warned about rather than something that happens to
 *    them. `acceptFile` mirrors the server's allowlist; the upload route owns
 *    the real check, including magic-byte sniffing. If they disagree, the
 *    server wins.
 *  - A URL is validated against `isSafePublicHttpsUrl` before it can be saved.
 *    ArkAgent never fetches it, but a template is a stored instruction, and a
 *    link-local address in one is an SSRF payload with our name on it.
 *  - File names and pasted text are shown exactly as they arrived, sanitised
 *    of invisible reordering characters, and are never instructions.
 */
import { useState } from "react";
import { c, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import type { TemplateContextItem } from "@/lib/atg/types";
import { create } from "@/lib/i18n/create";
import {
  Card,
  Mono,
  Notice,
  Skeleton,
  TextArea,
  TextField,
  Toggle,
  IconBtn,
  ghostBtn,
  ghostBtnHover,
} from "@/components/create/shared";
import {
  AGENT_CONTEXT_MAX_BYTES,
  AGENT_CONTEXT_MAX_ITEMS,
  CONTEXT_ACCEPT,
  CONTEXT_TYPE_LABEL,
  DEFAULT_MAX_BYTES,
  INLINE_TEXT_MAX_CHARS,
  PLATFORM_MAX_BYTES,
  acceptFile,
  formatBytes,
  isInlineableMime,
  isSafePublicHttpsUrl,
  sanitizeMultiline,
  sanitizeUntrusted,
  type ManagerMode,
} from "@/components/create/logic";
import { SECTION_ROW, replaceAt, type SectionProps } from "./ReviewSections";

type Editor = "none" | "paste" | "url";

/** Per-row note, set when a row is created from a dropped file. */
type RowNote = "inlined" | "deferred";

export default function SectionContext({
  lang,
  draft,
  onChange,
  state,
  stateLabel,
  ready,
  domId,
  managerMode,
}: SectionProps & { managerMode: ManagerMode }) {
  const t = create[lang].context;
  const [editor, setEditor] = useState<Editor>("none");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [rejected, setRejected] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notes, setNotes] = useState<Record<string, RowNote>>({});

  // What is actually staged in this tab: the pasted bodies. A `file_request`
  // has no bytes yet by definition, so counting its ceiling here would show a
  // quota the user has not spent.
  const usedBytes = draft.context.reduce((sum, item) => sum + (item.body?.length ?? 0), 0);
  const slotsLeft = Math.max(0, AGENT_CONTEXT_MAX_ITEMS - draft.context.length);
  // The tightest ceiling any item in THIS draft declares, floored by the
  // platform's — the drop zone must name the effective limit, not a constant.
  const perItemMax = Math.min(
    PLATFORM_MAX_BYTES,
    draft.context.reduce(
      (min, item) => Math.min(min, item.maxBytes ?? DEFAULT_MAX_BYTES),
      DEFAULT_MAX_BYTES,
    ),
  );

  if (!ready) {
    return (
      <Card id={domId} title={t.title}>
        <Skeleton rows={3} />
      </Card>
    );
  }

  const addItem = (item: TemplateContextItem, note?: RowNote) => {
    if (note) setNotes((prev) => ({ ...prev, [item.key]: note }));
    onChange({ ...draft, context: [...draft.context, item] });
  };

  /**
   * A whole drop, committed as ONE write.
   *
   * Both halves of that matter. The accepted rows are accumulated locally and
   * handed to `onChange` once at the end, because `draft` is a prop that does
   * not change until the caller re-renders — appending inside the loop reads
   * the same stale array every time and silently keeps only the last file. And
   * the running counters advance inside the loop, because checking every file
   * against the starting quota lets a five-file drop sail past the ceiling.
   */
  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setRejected([]);
    // Every rejection is collected; dropping five files and being told about
    // one is how a user concludes the drop zone is broken.
    const problems: string[] = [];
    const added: TemplateContextItem[] = [];
    const addedNotes: Record<string, RowNote> = {};
    let items = draft.context.length;
    let bytes = usedBytes;
    const titles = draft.context.map((x) => x.title);

    setReading(true);
    try {
      for (const file of Array.from(files)) {
        const verdict = acceptFile(
          { name: file.name, type: file.type, size: file.size },
          { maxBytes: perItemMax, usedBytes: bytes, itemCount: items, existingTitles: titles },
        );
        if (!verdict.ok) {
          problems.push(
            verdict.code === "type"
              ? t.rejectedType(verdict.title, file.type || "?")
              : verdict.code === "size"
                ? t.rejectedSize(
                    verdict.title,
                    formatBytes(file.size, lang),
                    formatBytes(perItemMax, lang),
                  )
                : verdict.code === "empty"
                  ? t.rejectedEmpty(verdict.title)
                  : verdict.code === "duplicate"
                    ? t.duplicate(verdict.title)
                    : t.rejectedQuota(verdict.title),
          );
          continue;
        }

        // A small text file becomes a `pasted_text` item straight away: there
        // is no agent yet, so an upload has nowhere to go, and making someone
        // wait for materialisation to attach a one-pager is how people abandon.
        if (isInlineableMime(verdict.mime) && file.size <= INLINE_TEXT_MAX_CHARS * 2) {
          try {
            const text = await file.text();
            const body = sanitizeMultiline(text, INLINE_TEXT_MAX_CHARS);
            const item = contextItem({ kind: "pasted_text", title: verdict.title, body });
            added.push(item);
            addedNotes[item.key] = "inlined";
            items += 1;
            bytes += body.length;
            titles.push(verdict.title);
          } catch {
            problems.push(t.readInlineFailed);
          }
          continue;
        }

        const item = contextItem({
          kind: "file_request",
          title: verdict.title,
          acceptedMimeTypes: [verdict.mime],
          maxBytes: perItemMax,
        });
        added.push(item);
        addedNotes[item.key] = "deferred";
        items += 1;
        titles.push(verdict.title);
      }
    } finally {
      setReading(false);
    }

    if (added.length > 0) {
      setNotes((prev) => ({ ...prev, ...addedNotes }));
      onChange({ ...draft, context: [...draft.context, ...added] });
    }
    setRejected(problems);
  };

  const urlOk = urlValue.trim() !== "" && isSafePublicHttpsUrl(urlValue.trim());
  const full = slotsLeft === 0;

  return (
    <Card
      id={domId}
      title={t.title}
      state={state}
      stateLabel={stateLabel}
      meta={<Mono>{t.summary(draft.context.length, formatBytes(usedBytes, lang))}</Mono>}
    >
      <Notice>{t.untrusted}</Notice>

      {draft.context.length === 0 && (
        <div>
          <div style={{ fontSize: 13, color: c.muted }}>{t.empty}</div>
          <div style={{ fontSize: 12.5, color: c.muted, marginTop: 4 }}>{t.emptyHint}</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {draft.context.map((item, i) => {
          const patch = (next: Partial<TemplateContextItem>) =>
            onChange({ ...draft, context: replaceAt(draft.context, i, { ...item, ...next }) });
          const unsafeUrl = item.kind === "url" && (!item.url || !isSafePublicHttpsUrl(item.url));
          const note = notes[item.key];

          return (
            <div key={item.key} style={SECTION_ROW}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Mono color={c.muted}>{t.kind[item.kind]}</Mono>
                <span
                  style={{ fontSize: 13.5, color: c.text, minWidth: 0, overflowWrap: "anywhere" }}
                >
                  {sanitizeUntrusted(item.title, 80)}
                </span>
                {/* c.muted, not c.faint: "waiting for a file" and "the agent
                    fetches it, not us" are sentences the user has to read to
                    understand why a row is not doing anything. */}
                <Mono color={c.muted}>
                  {item.kind === "pasted_text"
                    ? t.stateStaged
                    : item.kind === "file_request"
                      ? t.stateAwaiting
                      : managerMode === "live"
                        ? t.statePending
                        : t.urlPending}
                </Mono>
                {note === "inlined" && <Mono color={c.muted}>{t.readInline}</Mono>}
                <span style={{ marginLeft: "auto" }}>
                  <IconBtn
                    label={`${t.remove}: ${sanitizeUntrusted(item.title, 40)}`}
                    glyph="✕"
                    tone="danger"
                    onClick={() => {
                      onChange({ ...draft, context: draft.context.filter((_, j) => j !== i) });
                      setNotes((prev) => {
                        const next = { ...prev };
                        delete next[item.key];
                        return next;
                      });
                    }}
                  />
                </span>
              </div>

              {note === "deferred" && (
                <div style={{ fontSize: 12.5, color: c.muted }}>{t.fileDeferred}</div>
              )}

              <TextField
                label={t.titleField}
                value={item.title}
                maxLength={80}
                onChange={(v) => patch({ title: v })}
              />
              <TextField
                label={t.purposeField}
                value={item.purpose}
                maxLength={200}
                onChange={(v) => patch({ purpose: v })}
              />

              {item.kind === "url" && (
                <>
                  <TextField
                    label={t.urlField}
                    hint={t.urlHint}
                    type="url"
                    inputMode="url"
                    value={item.url ?? ""}
                    onChange={(v) => patch({ url: v })}
                  />
                  {unsafeUrl && <Notice tone="error">{t.urlInvalid}</Notice>}
                </>
              )}

              {item.kind === "pasted_text" && (
                <TextArea
                  label={t.bodyField}
                  value={item.body ?? ""}
                  rows={4}
                  maxLength={INLINE_TEXT_MAX_CHARS}
                  counter={t.bodyChars((item.body ?? "").length, INLINE_TEXT_MAX_CHARS)}
                  onChange={(v) => patch({ body: sanitizeMultiline(v, INLINE_TEXT_MAX_CHARS) })}
                />
              )}

              {item.kind === "file_request" && item.maxBytes !== null && (
                <Mono color={c.muted}>{t.dropLimit(formatBytes(item.maxBytes, lang))}</Mono>
              )}

              <Toggle
                label={t.requiredToggle}
                on={item.required}
                onChange={(on) => patch({ required: on })}
              />
            </div>
          );
        })}
      </div>

      {rejected.length > 0 && (
        <Notice tone="warn">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {rejected.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Notice>
      )}

      {editor === "paste" ? (
        <div style={SECTION_ROW}>
          <TextField
            label={t.titleField}
            value={pasteTitle}
            maxLength={80}
            onChange={setPasteTitle}
          />
          <TextArea
            label={t.bodyField}
            value={pasteBody}
            rows={8}
            maxLength={INLINE_TEXT_MAX_CHARS}
            counter={t.bodyChars(pasteBody.length, INLINE_TEXT_MAX_CHARS)}
            onChange={(v) => setPasteBody(sanitizeMultiline(v, INLINE_TEXT_MAX_CHARS))}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn
              type="button"
              onClick={() => setEditor("none")}
              style={ghostBtn}
              hoverStyle={ghostBtnHover}
            >
              {t.cancel}
            </Btn>
            <Btn
              type="button"
              disabled={!pasteTitle.trim() || !pasteBody.trim()}
              onClick={() => {
                addItem(
                  contextItem({
                    kind: "pasted_text",
                    title: sanitizeUntrusted(pasteTitle, 80),
                    body: pasteBody,
                  }),
                );
                setPasteTitle("");
                setPasteBody("");
                setEditor("none");
              }}
              style={{ ...ghostBtn, opacity: pasteTitle.trim() && pasteBody.trim() ? 1 : 0.5 }}
              hoverStyle={ghostBtnHover}
            >
              {t.save}
            </Btn>
          </div>
        </div>
      ) : editor === "url" ? (
        <div style={SECTION_ROW}>
          <TextField label={t.titleField} value={urlTitle} maxLength={80} onChange={setUrlTitle} />
          <TextField
            label={t.urlField}
            hint={t.urlHint}
            type="url"
            inputMode="url"
            value={urlValue}
            onChange={setUrlValue}
          />
          {urlValue.trim() !== "" && !urlOk && <Notice tone="error">{t.urlInvalid}</Notice>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn
              type="button"
              onClick={() => setEditor("none")}
              style={ghostBtn}
              hoverStyle={ghostBtnHover}
            >
              {t.cancel}
            </Btn>
            <Btn
              type="button"
              disabled={!urlOk || !urlTitle.trim()}
              onClick={() => {
                addItem(
                  contextItem({
                    kind: "url",
                    title: sanitizeUntrusted(urlTitle, 80),
                    url: urlValue.trim(),
                  }),
                );
                setUrlTitle("");
                setUrlValue("");
                setEditor("none");
              }}
              style={{ ...ghostBtn, opacity: urlOk && urlTitle.trim() ? 1 : 0.5 }}
              hoverStyle={ghostBtnHover}
            >
              {t.save}
            </Btn>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* The copy says "drop files here", so a drop has to work. `dragOver`
              MUST preventDefault, or the browser navigates away to the dropped
              file and takes the half-edited draft with it. */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              if (!full) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!full) void onFiles(e.dataTransfer?.files ?? null);
            }}
            style={{
              position: "relative",
              border: `1px dashed ${dragging ? c.accent : c.borderField}`,
              background: dragging ? c.limeWash : "transparent",
              borderRadius: r.radiusMd,
              minHeight: 92,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              cursor: full ? "not-allowed" : "pointer",
              opacity: full ? 0.6 : 1,
              padding: 16,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 13.5, color: c.text2 }}>
              {reading ? t.dropBusy : t.dropTitle}
            </span>
            {/* Every limit, before the picker opens. */}
            <Mono color={c.muted}>{t.dropTypes(CONTEXT_TYPE_LABEL)}</Mono>
            <Mono color={c.muted}>{t.dropLimit(formatBytes(perItemMax, lang))}</Mono>
            <Mono color={c.muted}>
              {t.quota(formatBytes(usedBytes, lang), formatBytes(AGENT_CONTEXT_MAX_BYTES, lang))} ·{" "}
              {t.slotsLeft(slotsLeft)}
            </Mono>
            <input
              type="file"
              multiple
              disabled={full}
              accept={CONTEXT_ACCEPT}
              aria-label={t.addFile}
              onChange={(e) => {
                void onFiles(e.target.files);
                // Cleared so re-picking the same file fires `change` again.
                e.target.value = "";
              }}
              style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn
              type="button"
              disabled={full}
              onClick={() => setEditor("paste")}
              style={{ ...ghostBtn, opacity: full ? 0.5 : 1 }}
              hoverStyle={full ? undefined : ghostBtnHover}
            >
              {t.paste}
            </Btn>
            <Btn
              type="button"
              disabled={full}
              onClick={() => setEditor("url")}
              style={{ ...ghostBtn, opacity: full ? 0.5 : 1 }}
              hoverStyle={full ? undefined : ghostBtnHover}
            >
              {t.addUrl}
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

/** A fresh draft-local row. `key` only has to be unique within the draft. */
function contextItem(
  partial: Partial<TemplateContextItem> & { kind: TemplateContextItem["kind"] },
): TemplateContextItem {
  return {
    key: `ctx-${Math.random().toString(36).slice(2, 10)}`,
    title: "",
    purpose: "",
    required: false,
    body: null,
    url: null,
    acceptedMimeTypes: [],
    maxBytes: null,
    placeholder: null,
    // Set by the LINTER on the server, never guessed here.
    containsPii: false,
    ...partial,
  };
}
