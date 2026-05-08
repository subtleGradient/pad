// @ts-check

import { cleanBodyHtml, setEditableState } from "./editing.js"
import { normalizeAfterListInput, normalizePadLists } from "./list.js"
import { PadStatus } from "./elements.js"

const SAVE_DELAY_MS = 180

/** @typedef {{ type?: string, message?: string, savedAt?: string, paths?: string[] }} PadServerMessage */

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

function normalizeAll() {
  normalizePadLists()
}

/** @param {Element | null} target */
function normalizeAfterInput(target) {
  normalizeAfterListInput(target)
}

export function connect() {
  normalizeAll()

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
    normalizeAll()
    dirty = false
    socket.send(JSON.stringify({ type: "body", html: cleanBodyHtml() }))
    setStatus("Saving...")
  }

  /** @param {Event} event */
  function scheduleSave(event) {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest("[data-pad-runtime]")) return
    if (!document.body.hasAttribute("data-pad-editable")) return
    normalizeAfterInput(target)
    dirty = true
    setStatus("Editing... autosave queued")
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(sendBody, SAVE_DELAY_MS)
  }

  socket.addEventListener("open", () => {
    normalizeAll()
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
