export type JsonObject = { [key: string]: unknown }

export interface OpenCodeSessionLike extends JsonObject {
  id: string
  title?: string
  projectID?: string
  directory?: string
  version?: string
  time?: {
    created?: number
    updated?: number
    compacting?: number
  }
}

export interface OpenCodeMessageLike extends JsonObject {
  id: string
  sessionID?: string
  role: "user" | "assistant" | string
  time?: {
    created?: number
    completed?: number
  }
  system?: string
  agent?: string
  model?: {
    providerID?: string
    modelID?: string
  }
  providerID?: string
  modelID?: string
  mode?: string
  cost?: number
  tokens?: unknown
  error?: unknown
}

export interface OpenCodePartLike extends JsonObject {
  id: string
  sessionID?: string
  messageID?: string
  type: string
}

export interface OpenCodeMessageBundle {
  info: OpenCodeMessageLike
  parts: OpenCodePartLike[]
}

export interface RenderChatDocumentOptions {
  session: OpenCodeSessionLike
  messages: OpenCodeMessageBundle[]
  runner?: string
  cssHref?: string
  scriptSrc?: string
  exportedAt?: Date
}

export const OC_CHAT_FORMAT = "oc-session-pad/v1"
export const OC_CHAT_BRANCH = "pad-oc"
export const OC_CHAT_PUBLIC_RUNNER = `#!/usr/bin/env -S bunx --bun -p https://github.com/subtleGradient/pad/archive/refs/heads/${OC_CHAT_BRANCH}.tar.gz pad`
export const OC_CHAT_PUBLIC_ASSET_BASE = `https://cdn.jsdelivr.net/gh/subtleGradient/pad@refs/heads/${OC_CHAT_BRANCH}`

export const OC_CHAT_STATIC_CSS = String.raw`
:root {
  color-scheme: light dark;
  background: #f5f1e8;
  color: #171411;
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
}

* {
  box-sizing: border-box;
}

body {
  width: min(72rem, calc(100vw - 2rem));
  min-height: 100vh;
  margin: 0 auto;
  padding: clamp(2rem, 6vw, 5rem) 0;
  background: #f5f1e8;
  color: #171411;
  font-size: clamp(1rem, 1.8vw, 1.15rem);
  line-height: 1.55;
}

oc-chat,
oc-session-card,
oc-runtime-panel,
oc-transcript,
oc-system-prompt,
oc-user-message,
oc-assistant-message,
oc-message-meta,
oc-text-part,
oc-reasoning-part,
oc-file-part,
oc-tool-call,
oc-tool-input,
oc-tool-output,
oc-patch-part,
oc-snapshot-part,
oc-step-start,
oc-step-finish,
oc-agent-part,
oc-subtask-part,
oc-retry-part,
oc-compaction-part,
oc-unknown-part,
oc-connection-status,
oc-composer {
  display: block;
}

oc-chat {
  display: grid;
  gap: 1.25rem;
}

oc-session-card {
  border-bottom: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  padding-bottom: 1.25rem;
}

oc-session-card h1 {
  max-width: 16ch;
  margin: 0 0 0.5rem;
  font-size: clamp(2.4rem, 9vw, 5.8rem);
  font-weight: 850;
  letter-spacing: -0.07em;
  line-height: 0.9;
}

oc-session-card dl,
oc-message-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.7rem;
  margin: 0;
  color: color-mix(in srgb, currentColor 62%, transparent);
  font: 0.78rem/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
}

oc-session-card dd,
oc-session-card dt {
  margin: 0;
}

oc-session-card dt::after {
  content: ":";
}

oc-runtime-panel {
  position: sticky;
  bottom: 1rem;
  z-index: 10;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 1rem;
  padding: 0.85rem;
  background: color-mix(in srgb, Canvas 86%, transparent);
  box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.12);
  backdrop-filter: blur(16px);
}

oc-runtime-panel[hidden] {
  display: none;
}

oc-transcript {
  display: grid;
  gap: 1rem;
}

oc-system-prompt,
oc-user-message,
oc-assistant-message {
  --rail: #777;
  border-left: 0.35rem solid var(--rail);
  padding: 0.95rem 1rem;
  background: color-mix(in srgb, currentColor 4%, transparent);
}

oc-system-prompt {
  --rail: #a66a00;
}

oc-user-message {
  --rail: #3157d5;
}

oc-assistant-message {
  --rail: #16815f;
}

oc-tool-call,
oc-file-part,
oc-patch-part,
oc-snapshot-part,
oc-step-finish,
oc-retry-part,
oc-unknown-part {
  margin: 0.75rem 0;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 0.6rem;
  padding: 0.75rem;
  background: color-mix(in srgb, currentColor 3%, transparent);
  font: 0.88rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
}

pre {
  max-width: 100%;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

oc-text-part > pre,
oc-reasoning-part pre,
oc-tool-input pre,
oc-tool-output pre {
  margin: 0.65rem 0 0;
}

oc-composer form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.6rem;
  margin-top: 0.7rem;
}

oc-composer textarea {
  min-height: 4.5rem;
  resize: vertical;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 0.7rem;
  padding: 0.7rem 0.8rem;
  background: color-mix(in srgb, Canvas 92%, transparent);
  color: inherit;
  font: inherit;
}

oc-composer button {
  align-self: end;
  border: 0;
  border-radius: 999px;
  padding: 0.7rem 1rem;
  background: #171411;
  color: #f5f1e8;
  font: 700 0.9rem/1 ui-sans-serif, system-ui, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root,
  body {
    background: #11110f;
    color: #f3ead7;
  }

  oc-composer button {
    background: #f3ead7;
    color: #11110f;
  }
}
`.trim()

const DEFAULT_RUNNER = OC_CHAT_PUBLIC_RUNNER

function escapeText(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function escapeAttribute(value: unknown) {
  return escapeText(value).replaceAll('"', "&quot;")
}

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2).replaceAll("<", "\\u003c")
}

function dataAttribute(name: string, value: unknown) {
  if (value === undefined || value === null || value === "") return ""
  return ` ${name}="${escapeAttribute(value)}"`
}

function dateAttribute(name: string, value: unknown) {
  if (typeof value !== "number") return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return dataAttribute(name, date.toISOString())
}

function renderJsonScript(attribute: string, value: unknown) {
  return `<script type="application/json" ${attribute}>${safeJson(value)}</script>`
}

function partScript(part: OpenCodePartLike) {
  return renderJsonScript("data-oc-part", part)
}

function messageScript(message: OpenCodeMessageLike) {
  return renderJsonScript("data-oc-message", message)
}

function renderPre(value: unknown) {
  return `<pre>${escapeText(value)}</pre>`
}

function readableTitle(session: OpenCodeSessionLike) {
  return session.title?.trim() || session.id
}

function messageModelAttributes(info: OpenCodeMessageLike) {
  return [
    dataAttribute("data-agent", info.agent),
    dataAttribute("data-provider-id", info.providerID ?? info.model?.providerID),
    dataAttribute("data-model-id", info.modelID ?? info.model?.modelID),
    dataAttribute("data-mode", info.mode),
    dataAttribute("data-cost", info.cost),
  ].join("")
}

function renderMessageMeta(info: OpenCodeMessageLike) {
  const provider = info.providerID ?? info.model?.providerID
  const model = info.modelID ?? info.model?.modelID
  const created =
    typeof info.time?.created === "number"
      ? new Date(info.time.created).toISOString()
      : undefined
  const completed =
    typeof info.time?.completed === "number"
      ? new Date(info.time.completed).toISOString()
      : undefined

  return `<oc-message-meta><span>${escapeText(info.role)}</span>${provider ? `<span>${escapeText(provider)}</span>` : ""}${model ? `<span>${escapeText(model)}</span>` : ""}${created ? `<time datetime="${escapeAttribute(created)}">${escapeText(created)}</time>` : ""}${completed ? `<time datetime="${escapeAttribute(completed)}">completed ${escapeText(completed)}</time>` : ""}</oc-message-meta>`
}

function renderSystemPrompt(info: OpenCodeMessageLike) {
  if (!info.system) return ""
  return `<oc-system-prompt${dataAttribute("data-message-id", info.id)}${dateAttribute("data-created", info.time?.created)}>
<details>
<summary>System Prompt</summary>
${renderPre(info.system)}
</details>
</oc-system-prompt>`
}

function renderTextPart(part: OpenCodePartLike) {
  return `<oc-text-part${dataAttribute("data-part-id", part.id)} data-format="markdown">
${partScript(part)}
${renderPre(part.text)}
</oc-text-part>`
}

function renderReasoningPart(part: OpenCodePartLike) {
  return `<oc-reasoning-part${dataAttribute("data-part-id", part.id)}>
${partScript(part)}
<details>
<summary>Reasoning</summary>
${renderPre(part.text)}
</details>
</oc-reasoning-part>`
}

function renderFilePart(part: OpenCodePartLike) {
  return `<oc-file-part${dataAttribute("data-part-id", part.id)}${dataAttribute("data-mime", part.mime)}${dataAttribute("data-filename", part.filename)}${dataAttribute("data-url", part.url)}>
${partScript(part)}
<strong>${escapeText(part.filename ?? part.url ?? "file")}</strong>
</oc-file-part>`
}

function renderToolPart(part: OpenCodePartLike) {
  const state = (part.state ?? {}) as JsonObject
  const status = typeof state.status === "string" ? state.status : undefined
  const title = typeof state.title === "string" ? state.title : undefined
  const output = typeof state.output === "string" ? state.output : undefined
  const error = typeof state.error === "string" ? state.error : undefined

  return `<oc-tool-call${dataAttribute("data-part-id", part.id)}${dataAttribute("data-call-id", part.callID)}${dataAttribute("data-tool", part.tool)}${dataAttribute("data-status", status)}>
${partScript(part)}
<details open>
<summary>${escapeText(part.tool ?? "tool")}${status ? ` ${escapeText(status)}` : ""}${title ? `: ${escapeText(title)}` : ""}</summary>
<oc-tool-input>${renderPre(safeJson(state.input ?? {}))}</oc-tool-input>
${output !== undefined ? `<oc-tool-output>${renderPre(output)}</oc-tool-output>` : ""}
${error !== undefined ? `<oc-tool-output data-error>${renderPre(error)}</oc-tool-output>` : ""}
</details>
</oc-tool-call>`
}

function renderStepStartPart(part: OpenCodePartLike) {
  return `<oc-step-start${dataAttribute("data-part-id", part.id)}${dataAttribute("data-snapshot", part.snapshot)}>${partScript(part)}</oc-step-start>`
}

function renderStepFinishPart(part: OpenCodePartLike) {
  return `<oc-step-finish${dataAttribute("data-part-id", part.id)}${dataAttribute("data-reason", part.reason)}${dataAttribute("data-cost", part.cost)}${dataAttribute("data-snapshot", part.snapshot)}>
${partScript(part)}
<strong>Step finished${part.reason ? `: ${escapeText(part.reason)}` : ""}</strong>
</oc-step-finish>`
}

function renderSnapshotPart(part: OpenCodePartLike) {
  return `<oc-snapshot-part${dataAttribute("data-part-id", part.id)}${dataAttribute("data-snapshot", part.snapshot)}>
${partScript(part)}
<strong>Snapshot</strong> ${escapeText(part.snapshot)}
</oc-snapshot-part>`
}

function renderPatchPart(part: OpenCodePartLike) {
  const files = Array.isArray(part.files) ? part.files : []
  return `<oc-patch-part${dataAttribute("data-part-id", part.id)}${dataAttribute("data-hash", part.hash)}>
${partScript(part)}
<strong>Patch</strong>${files.length ? ` ${escapeText(files.join(", "))}` : ""}
</oc-patch-part>`
}

function renderAgentPart(part: OpenCodePartLike) {
  return `<oc-agent-part${dataAttribute("data-part-id", part.id)}${dataAttribute("data-name", part.name)}>
${partScript(part)}
<strong>Agent</strong> ${escapeText(part.name)}
</oc-agent-part>`
}

function renderSubtaskPart(part: OpenCodePartLike) {
  return `<oc-subtask-part${dataAttribute("data-part-id", part.id)}${dataAttribute("data-agent", part.agent)}>
${partScript(part)}
<strong>${escapeText(part.description ?? "Subtask")}</strong>
${renderPre(part.prompt)}
</oc-subtask-part>`
}

function renderRetryPart(part: OpenCodePartLike) {
  return `<oc-retry-part${dataAttribute("data-part-id", part.id)}${dataAttribute("data-attempt", part.attempt)}>
${partScript(part)}
<strong>Retry ${escapeText(part.attempt)}</strong>
</oc-retry-part>`
}

function renderCompactionPart(part: OpenCodePartLike) {
  return `<oc-compaction-part${dataAttribute("data-part-id", part.id)}${dataAttribute("data-auto", part.auto)}>
${partScript(part)}
<strong>Compaction</strong>${part.auto ? " automatic" : ""}
</oc-compaction-part>`
}

function renderUnknownPart(part: OpenCodePartLike) {
  return `<oc-unknown-part${dataAttribute("data-part-id", part.id)}${dataAttribute("data-type", part.type)}>
${partScript(part)}
${renderPre(safeJson(part))}
</oc-unknown-part>`
}

export function renderOpenCodePart(part: OpenCodePartLike) {
  switch (part.type) {
    case "text":
      return renderTextPart(part)
    case "reasoning":
      return renderReasoningPart(part)
    case "file":
      return renderFilePart(part)
    case "tool":
      return renderToolPart(part)
    case "step-start":
      return renderStepStartPart(part)
    case "step-finish":
      return renderStepFinishPart(part)
    case "snapshot":
      return renderSnapshotPart(part)
    case "patch":
      return renderPatchPart(part)
    case "agent":
      return renderAgentPart(part)
    case "subtask":
      return renderSubtaskPart(part)
    case "retry":
      return renderRetryPart(part)
    case "compaction":
      return renderCompactionPart(part)
    default:
      return renderUnknownPart(part)
  }
}

export function renderOpenCodeMessageBundle(bundle: OpenCodeMessageBundle) {
  const { info, parts } = bundle
  const tag = info.role === "user" ? "oc-user-message" : "oc-assistant-message"
  const systemPrompt = info.role === "user" ? renderSystemPrompt(info) : ""
  const body = parts.map(renderOpenCodePart).join("\n")

  return `${systemPrompt}${systemPrompt ? "\n" : ""}<${tag}${dataAttribute("data-message-id", info.id)}${dateAttribute("data-created", info.time?.created)}${dateAttribute("data-completed", info.time?.completed)}${messageModelAttributes(info)}>
${messageScript(info)}
${renderMessageMeta(info)}
${body}
</${tag}>`
}

export function renderChatBody({
  session,
  messages,
  exportedAt = new Date(),
}: {
  session: OpenCodeSessionLike
  messages: OpenCodeMessageBundle[]
  exportedAt?: Date
}) {
  const title = readableTitle(session)
  const created =
    typeof session.time?.created === "number"
      ? new Date(session.time.created).toISOString()
      : undefined
  const updated =
    typeof session.time?.updated === "number"
      ? new Date(session.time.updated).toISOString()
      : undefined

  return `<oc-chat data-format="${OC_CHAT_FORMAT}"${dataAttribute("data-session-id", session.id)}${dataAttribute("data-project-id", session.projectID)}${dataAttribute("data-directory", session.directory)}${dataAttribute("data-title", title)}${dataAttribute("data-exported-at", exportedAt.toISOString())}>
${renderJsonScript("data-oc-session", session)}
<oc-session-card>
<h1>${escapeText(title)}</h1>
<dl>
<dt>session</dt><dd><code>${escapeText(session.id)}</code></dd>
${session.directory ? `<dt>directory</dt><dd><code>${escapeText(session.directory)}</code></dd>` : ""}
${session.version ? `<dt>version</dt><dd>${escapeText(session.version)}</dd>` : ""}
${created ? `<dt>created</dt><dd><time datetime="${escapeAttribute(created)}">${escapeText(created)}</time></dd>` : ""}
${updated ? `<dt>updated</dt><dd><time datetime="${escapeAttribute(updated)}">${escapeText(updated)}</time></dd>` : ""}
<dt>exported</dt><dd><time datetime="${escapeAttribute(exportedAt.toISOString())}">${escapeText(exportedAt.toISOString())}</time></dd>
</dl>
</oc-session-card>
<oc-runtime-panel data-oc-runtime hidden>
<oc-connection-status>Run this chat file as a program to continue the session.</oc-connection-status>
<oc-composer></oc-composer>
</oc-runtime-panel>
<oc-transcript>
${messages.map(renderOpenCodeMessageBundle).join("\n")}
</oc-transcript>
</oc-chat>`
}

export function renderChatDocument({
  session,
  messages,
  runner = DEFAULT_RUNNER,
  cssHref = `${OC_CHAT_PUBLIC_ASSET_BASE}/oc-chat.css`,
  scriptSrc = `${OC_CHAT_PUBLIC_ASSET_BASE}/oc-chat.browser.js`,
  exportedAt = new Date(),
}: RenderChatDocumentOptions) {
  const title = `${readableTitle(session)}.chat.html`
  return `${runner}
<!-- OC Session Pad: executable local HTML. Run only if you trust this file. -->
<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="oc-chat-format" content="${OC_CHAT_FORMAT}" />
<title>${escapeText(title)}</title>
<link rel="stylesheet" href="${escapeAttribute(cssHref)}" />
<style data-oc-static>
${OC_CHAT_STATIC_CSS}
</style>
<script type="module" src="${escapeAttribute(scriptSrc)}"></script>

${renderChatBody({ session, messages, exportedAt })}
`
}

export function extractRenderedMessageIds(source: string) {
  const ids = new Set<string>()
  const pattern = /\bdata-message-id\s*=\s*(["'])(.*?)\1/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    if (match[2]) ids.add(decodeHtmlAttribute(match[2]))
  }
  return ids
}

export function extractChatSessionId(source: string) {
  const match = /<oc-chat\b[^>]*\bdata-session-id\s*=\s*(["'])(.*?)\1/i.exec(
    source,
  )
  return match?.[2] ? decodeHtmlAttribute(match[2]) : undefined
}

function decodeHtmlAttribute(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#x22;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}

export function appendOpenCodeBundlesToChatSource(
  source: string,
  bundles: OpenCodeMessageBundle[],
) {
  const renderedIds = extractRenderedMessageIds(source)
  const newBundles = bundles.filter((bundle) => !renderedIds.has(bundle.info.id))
  if (newBundles.length === 0) return source

  const closeIndex = source.lastIndexOf("</oc-transcript>")
  if (closeIndex < 0) {
    throw new Error("OC chat source must include an oc-transcript element.")
  }

  const insertion = newBundles.map(renderOpenCodeMessageBundle).join("\n")
  return `${source.slice(0, closeIndex).trimEnd()}\n${insertion}\n${source.slice(closeIndex)}`
}
