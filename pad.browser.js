// @ts-check

const SAVE_DELAY_MS = 180

/** @typedef {{ type?: string, message?: string, savedAt?: string, paths?: string[] }} PadServerMessage */

let canEdit = false

/**
 * @param {string} name
 * @param {CustomElementConstructor} constructor
 */
function defineElement(name, constructor) {
  if (!customElements.get(name)) customElements.define(name, constructor)
}

class PadDocument extends HTMLElement {}
defineElement("pad-document", PadDocument)

class PadStack extends HTMLElement {}
defineElement("pad-stack", PadStack)

class PadGrid extends HTMLElement {}
defineElement("pad-grid", PadGrid)

class PadPanel extends HTMLElement {}
defineElement("pad-panel", PadPanel)

class PadText extends HTMLElement {
  connectedCallback() {
    if (!this.hasAttribute("spellcheck")) this.spellcheck = true
    if (!this.hasAttribute("role")) this.setAttribute("role", "textbox")
    if (!this.hasAttribute("aria-multiline")) {
      this.setAttribute("aria-multiline", "true")
    }
  }
}
defineElement("pad-text", PadText)

class PadList extends HTMLElement {
  connectedCallback() {
    if (!this.hasAttribute("role")) this.setAttribute("role", "list")
    queueMicrotask(() => normalizePadList(this))
  }
}
defineElement("pad-list", PadList)

class PadListItem extends HTMLElement {
  connectedCallback() {
    if (!this.hasAttribute("spellcheck")) this.spellcheck = true
    if (!this.hasAttribute("role")) this.setAttribute("role", "textbox")
    if (!this.hasAttribute("aria-multiline")) {
      this.setAttribute("aria-multiline", "true")
    }
    markListItemEmptyState(this)
  }
}
defineElement("pad-list-item", PadListItem)

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

/** @param {Element} item */
function markListItemEmptyState(item) {
  item.toggleAttribute("data-pad-empty", item.textContent.trim() === "")
}

/** @param {Element} list */
function listItems(list) {
  return Array.from(list.children).filter(
    (child) => child.localName === "pad-list-item",
  )
}

/** @returns {HTMLElement} */
function createListItem() {
  const item = document.createElement("pad-list-item")
  applyEditableElementState(item, canEdit)
  return item
}

/** @param {Element} list */
function normalizePadList(list) {
  const items = listItems(list)

  if (items.length === 0) {
    list.append(createListItem())
    markListItemEmptyState(/** @type {Element} */ (list.lastElementChild))
    return
  }

  let lastNonEmptyIndex = -1
  for (let index = 0; index < items.length; index += 1) {
    if (items[index]?.textContent.trim() !== "") lastNonEmptyIndex = index
  }

  const trailingEmptyItems = items.slice(lastNonEmptyIndex + 1)
  for (const item of trailingEmptyItems.slice(1)) item.remove()

  if (trailingEmptyItems.length === 0) {
    list.append(createListItem())
  }

  for (const item of listItems(list)) markListItemEmptyState(item)
}

function normalizePadLists() {
  document.querySelectorAll("pad-list").forEach(normalizePadList)
}

function editableElements() {
  return document.querySelectorAll("pad-text, pad-list-item")
}

/**
 * @param {Element} element
 * @param {boolean} editable
 */
function applyEditableElementState(element, editable) {
  if (element.hasAttribute("static")) return
  element.setAttribute("contenteditable", editable ? "true" : "false")
  element.setAttribute("aria-disabled", editable ? "false" : "true")
}

/**
 * @param {boolean} editable
 * @param {string} reason
 */
function setEditableState(editable, reason) {
  canEdit = editable
  document.body.toggleAttribute("data-pad-editable", editable)
  document.body.toggleAttribute("data-pad-readonly", !editable)
  if (editable) {
    delete document.body.dataset.padReadonlyReason
  } else {
    document.body.dataset.padReadonlyReason = reason
  }

  editableElements().forEach((element) => {
    applyEditableElementState(element, editable)
  })
}

/** @returns {string} */
function cleanBodyHtml() {
  const clone = /** @type {HTMLElement} */ (document.body.cloneNode(true))
  clone.querySelectorAll("[data-pad-runtime]").forEach((node) => node.remove())
  clone.querySelectorAll("pad-list-item").forEach((node) => {
    node.removeAttribute("data-pad-empty")
  })
  clone.querySelectorAll("pad-text, pad-list-item").forEach((node) => {
    if (node.hasAttribute("contenteditable")) node.removeAttribute("contenteditable")
    if (node.getAttribute("spellcheck") === "true")
      node.removeAttribute("spellcheck")
    if (node.getAttribute("role") === "textbox") node.removeAttribute("role")
    if (node.getAttribute("aria-multiline") === "true") {
      node.removeAttribute("aria-multiline")
    }
    if (node.hasAttribute("aria-disabled")) node.removeAttribute("aria-disabled")
  })
  return clone.innerHTML.trim()
}

function connect() {
  normalizePadLists()

  if (location.protocol !== "http:" && location.protocol !== "https:") {
    setEditableState(false, "Read-only: run this PAD as a program to enable autosave.")
    setStatus("Read-only. Run this PAD as a program to enable autosave.")
    return
  }

  setEditableState(false, "Read-only: connecting to the PAD server.")
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
    normalizePadLists()
    dirty = false
    socket.send(JSON.stringify({ type: "body", html: cleanBodyHtml() }))
    setStatus("Saving...")
  }

  /** @param {Event} event */
  function scheduleSave(event) {
    if (!canEdit) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest("[data-pad-runtime]")) return
    normalizePadLists()
    dirty = true
    setStatus("Editing... autosave queued")
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(sendBody, SAVE_DELAY_MS)
  }

  socket.addEventListener("open", () => {
    normalizePadLists()
    setEditableState(true, "")
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

  socket.addEventListener("error", () => {
    setEditableState(false, "Read-only: PAD server connection failed.")
    setStatus("Read-only. PAD server connection failed.")
  })

  socket.addEventListener("close", () => {
    setEditableState(false, "Read-only: PAD server disconnected.")
    setStatus("Read-only. PAD server disconnected.")
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
