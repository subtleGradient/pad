// @ts-check

const SAVE_DELAY_MS = 180

/** @typedef {{ type?: string, message?: string, savedAt?: string, paths?: string[] }} PadServerMessage */

const GENERATED_ID_PREFIXES = new Map([
  ["pad-story", "story"],
  ["spec-wish", "wish"],
  ["spec-judgement", "judge"],
  ["spec-razor", "razor"],
  ["spec-thread", "thread"],
  ["spec-golf", "golf"],
  ["real-pointer", "pointer"],
  ["real-observation", "obs"],
  ["real-judgement", "judge"],
  ["gap-item", "gap"],
  ["work-item", "work"],
  ["work-judgement", "judge"],
  ["proof-check", "check"],
])

const DIFF_PAD_ELEMENTS = [
  "pad-diff",
  "pad-story",
  "story-spec",
  "story-real",
  "story-gaps",
  "story-next",
  "spec-wish",
  "spec-judgement",
  "spec-razor",
  "spec-thread",
  "spec-golf",
  "thread-left",
  "thread-right",
  "thread-band",
  "golf-axis",
  "real-pointer",
  "real-file",
  "real-observation",
  "real-judgement",
  "gap-item",
  "gap-vector",
  "gap-axis",
  "work-item",
  "work-judgement",
  "proof-check",
  "proof-link",
]

const GENERATED_ID_SELECTOR = [...GENERATED_ID_PREFIXES.keys()].join(",")

/**
 * @param {string} name
 * @param {CustomElementConstructor} constructor
 */
function defineElement(name, constructor) {
  if (!customElements.get(name)) customElements.define(name, constructor)
}

/** @param {string} prefix */
function generatedId(prefix) {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "")
  return `${prefix}_${random ?? Math.random().toString(36).slice(2)}`
}

/** @param {Element & { localName: string }} element */
function ensureGeneratedId(element) {
  const prefix = GENERATED_ID_PREFIXES.get(element.localName)
  if (!prefix || element.hasAttribute("id")) return false
  element.setAttribute("id", generatedId(prefix))
  return true
}

/** @param {string} name */
function makeDiffPadElement(name) {
  const assignsId = GENERATED_ID_PREFIXES.has(name)
  return class extends HTMLElement {
    connectedCallback() {
      if (assignsId) ensureGeneratedId(this)
    }
  }
}

function assignMissingGeneratedIds() {
  if (typeof document.querySelectorAll !== "function") return false

  let changed = false
  for (const element of Array.from(
    document.querySelectorAll(GENERATED_ID_SELECTOR),
  )) {
    changed = ensureGeneratedId(
      /** @type {Element & { localName: string }} */ (element),
    ) || changed
  }
  return changed
}

class PadDocument extends HTMLElement {}
defineElement("pad-document", PadDocument)

for (const name of DIFF_PAD_ELEMENTS) defineElement(name, makeDiffPadElement(name))

class PadText extends HTMLElement {
  connectedCallback() {
    if (!this.hasAttribute("contenteditable")) this.contentEditable = "true"
    if (!this.hasAttribute("spellcheck")) this.spellcheck = true
    if (!this.hasAttribute("role")) this.setAttribute("role", "textbox")
    if (!this.hasAttribute("aria-multiline")) {
      this.setAttribute("aria-multiline", "true")
    }
  }
}
defineElement("pad-text", PadText)

class PadStatus extends HTMLElement {
  /** @param {string} value */
  set message(value) {
    this.textContent = value
  }
}
defineElement("pad-status", PadStatus)

/** @returns {PadStatus} */
function statusElement() {
  let status = /** @type {PadStatus | null} */ (
    document.querySelector("pad-status[data-pad-runtime]")
  )
  if (!status) {
    status = /** @type {PadStatus} */ (document.createElement("pad-status"))
    status.dataset.padRuntime = ""
    document.body.append(status)
  }
  return status
}

/** @param {string} text */
function setStatus(text) {
  statusElement().message = text
}

/** @returns {string} */
function cleanBodyHtml() {
  const clone = /** @type {HTMLElement} */ (document.body.cloneNode(true))
  clone.querySelectorAll("[data-pad-runtime]").forEach((node) => node.remove())
  clone.querySelectorAll("pad-text").forEach((node) => {
    if (node.getAttribute("contenteditable") === "true") {
      node.removeAttribute("contenteditable")
    }
    if (node.getAttribute("spellcheck") === "true")
      node.removeAttribute("spellcheck")
    if (node.getAttribute("role") === "textbox") node.removeAttribute("role")
    if (node.getAttribute("aria-multiline") === "true") {
      node.removeAttribute("aria-multiline")
    }
  })
  return clone.innerHTML.trim()
}

function connect() {
  const shouldSaveGeneratedIds = assignMissingGeneratedIds()

  if (location.protocol !== "http:" && location.protocol !== "https:") {
    setStatus("Run this PAD as a program to enable autosave.")
    return
  }

  setStatus("Connecting to PAD server...")

  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  const socket = new WebSocket(
    `${protocol}//${location.host}/ws${location.search}`,
  )
  /** @type {number | undefined} */
  let saveTimer = undefined
  let dirty = false

  function sendBody() {
    if (socket.readyState !== WebSocket.OPEN) return
    dirty = false
    socket.send(JSON.stringify({ type: "body", html: cleanBodyHtml() }))
    setStatus("Saving...")
  }

  /** @param {Event} event */
  function scheduleSave(event) {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest("[data-pad-runtime]")) return
    dirty = true
    setStatus("Editing... autosave queued")
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(sendBody, SAVE_DELAY_MS)
  }

  socket.addEventListener("open", () => {
    setStatus("Editable. Changes autosave to the source file.")
    if (shouldSaveGeneratedIds) {
      dirty = true
      sendBody()
    }
  })

  socket.addEventListener("message", (event) => {
    /** @type {PadServerMessage} */
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    if (message.type === "saved" && message.savedAt) {
      setStatus(`Saved ${new Date(message.savedAt).toLocaleTimeString()}`)
    }

    if (message.type === "reload") {
      setStatus("Source changed. Reloading...")
      location.reload()
    }

    if (message.type === "error") setStatus(`PAD error: ${message.message}`)
  })

  socket.addEventListener("close", () => {
    setStatus("PAD server disconnected.")
  })

  document.body.addEventListener("input", scheduleSave)

  window.addEventListener("pagehide", () => {
    window.clearTimeout(saveTimer)
    if (dirty) sendBody()
  })
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", connect, { once: true })
} else {
  connect()
}
