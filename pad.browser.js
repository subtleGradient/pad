// @ts-check

const SAVE_DELAY_MS = 180

/** @typedef {{ type?: string, message?: string, savedAt?: string, paths?: string[] }} PadServerMessage */

/**
 * @param {string} name
 * @param {CustomElementConstructor} constructor
 */
function defineElement(name, constructor) {
  if (!customElements.get(name)) customElements.define(name, constructor)
}

class PadDocument extends HTMLElement {}

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

class PadStatus extends HTMLElement {
  /** @param {string} value */
  set message(value) {
    this.textContent = value
  }
}

defineElement("pad-document", PadDocument)
defineElement("pad-text", PadText)
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
    if (node.getAttribute("spellcheck") === "true") node.removeAttribute("spellcheck")
    if (node.getAttribute("role") === "textbox") node.removeAttribute("role")
    if (node.getAttribute("aria-multiline") === "true") {
      node.removeAttribute("aria-multiline")
    }
  })
  return clone.innerHTML.trim()
}

function connect() {
  if (location.protocol !== "http:" && location.protocol !== "https:") {
    setStatus("Run this PAD as a program to enable autosave.")
    return
  }

  setStatus("Connecting to PAD server...")

  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  const socket = new WebSocket(`${protocol}//${location.host}/ws${location.search}`)
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
