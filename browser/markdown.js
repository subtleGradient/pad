// @ts-check

import { escapeHtml } from "./dom.js"

export const MARKED_MODULE_URL =
  "https://cdn.jsdelivr.net/npm/marked@16.2.1/lib/marked.esm.js"
export const DOMPURIFY_MODULE_URL =
  "https://cdn.jsdelivr.net/npm/dompurify@3.2.7/dist/purify.es.mjs"

/** @type {Promise<((markdown: string) => string) | null> | undefined} */
let rendererPromise

/** @param {string} text */
function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" rel="noreferrer" target="_blank">$1</a>',
    )
}

/** @param {string} markdown */
export function fallbackMarkdownToHtml(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n")
  /** @type {string[]} */
  const blocks = []
  /** @type {string[]} */
  let paragraph = []
  let inCode = false
  /** @type {string[]} */
  let codeLines = []

  function flushParagraph() {
    if (paragraph.length === 0) return
    blocks.push(`<p>${inlineMarkdown(paragraph.join("\n")).replaceAll("\n", "<br>")}</p>`)
    paragraph = []
  }

  function flushCode() {
    blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`)
    codeLines = []
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) flushCode()
      else flushParagraph()
      inCode = !inCode
      continue
    }

    if (inCode) {
      codeLines.push(line)
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      flushParagraph()
      const level = heading[1]?.length ?? 1
      blocks.push(`<h${level}>${inlineMarkdown(heading[2] ?? "")}</h${level}>`)
      continue
    }

    if (line.trim() === "") {
      flushParagraph()
      continue
    }

    paragraph.push(line)
  }

  if (inCode) flushCode()
  flushParagraph()
  return blocks.join("\n") || "<p></p>"
}

/**
 * @param {string} name
 * @param {string} fallback
 */
function configuredUrl(name, fallback) {
  const configured = /** @type {Record<string, unknown>} */ (globalThis)[name]
  return typeof configured === "string" && configured ? configured : fallback
}

async function loadMarkdownRenderer() {
  try {
    const [markedModule, purifyModule] = await Promise.all([
      import(configuredUrl("PAD_MARKDOWN_MARKED_URL", MARKED_MODULE_URL)),
      import(configuredUrl("PAD_MARKDOWN_DOMPURIFY_URL", DOMPURIFY_MODULE_URL)),
    ])
    const marked = /** @type {{ parse?: (markdown: string) => string }} */ (
      markedModule.marked ?? markedModule.default ?? markedModule
    )
    const purify = /** @type {{ sanitize?: (html: string) => string }} */ (
      purifyModule.default ?? purifyModule
    )
    const parse = marked.parse
    const sanitize = purify.sanitize
    if (typeof parse !== "function" || typeof sanitize !== "function") {
      return null
    }
    /** @param {string} markdown */
    const render = (markdown) => sanitize(parse(markdown))
    return render
  } catch {
    return null
  }
}

/** @param {string} markdown */
export async function markdownToSafeHtml(markdown) {
  rendererPromise ??= loadMarkdownRenderer()
  const renderer = await rendererPromise
  return renderer ? renderer(markdown) : fallbackMarkdownToHtml(markdown)
}

/**
 * @param {HTMLElement} element
 * @param {string} markdown
 */
export function renderMarkdownPreview(element, markdown) {
  element.dataset.padMarkdownSource = markdown
  element.innerHTML = fallbackMarkdownToHtml(markdown)
  void markdownToSafeHtml(markdown).then((html) => {
    if (element.dataset.padMarkdownSource === markdown) element.innerHTML = html
  })
}
