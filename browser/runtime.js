// @ts-check

import { normalizePadChats } from "./chat.js"
import { cleanBodyHtml, setEditableState } from "./editing.js"
import { normalizeAfterListInput, normalizePadLists } from "./list.js"
import { PadStatus } from "./elements.js"
import {
  connectOpenCodeChat,
  handleOpenCodeChatMessage,
  hasOpenCodeChat,
  setOpenCodeChatStatus,
} from "./open-code-chat.js"

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

/**
 * @param {string} text
 * @param {boolean} [openCodeChat]
 */
function setStatus(text, openCodeChat = hasOpenCodeChat()) {
  if (openCodeChat) {
    setOpenCodeChatStatus(text)
    return
  }
  statusElement().message = text
}

function normalizeAll() {
  normalizePadLists()
  normalizePadChats()
}

/** @param {Element | null} target */
function normalizeAfterInput(target) {
  normalizeAfterListInput(target)
  normalizePadChats()
}

export function connect() {
  const openCodeChat = hasOpenCodeChat()
  normalizeAll()

  if (location.protocol !== "http:" && location.protocol !== "https:") {
    if (openCodeChat) {
      setStatus(
        "Run this chat file as a program to continue the OpenCode session.",
        openCodeChat,
      )
      return
    }
    setEditableState(false, "Read-only: run this PAD as a program to enable autosave.")
    setStatus("Read-only. Run this PAD as a program to enable autosave.", openCodeChat)
    return
  }

  if (!openCodeChat) {
    setEditableState(false, "Read-only: connecting to the PAD server.")
  }
  setStatus(
    openCodeChat ? "Connecting to OC chat server..." : "Connecting to PAD server...",
    openCodeChat,
  )

  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  const socket = new WebSocket(
    `${protocol}//${location.host}/ws${location.search}`,
  )
  if (openCodeChat) connectOpenCodeChat(socket, (text) => setStatus(text, true))
  /** @type {number | undefined} */
  let saveTimer = undefined
  let dirty = false

  function sendBody() {
    if (socket.readyState !== WebSocket.OPEN) return
    normalizeAll()
    dirty = false
    socket.send(JSON.stringify({ type: "body", html: cleanBodyHtml() }))
    setStatus("Saving...", openCodeChat)
  }

  /** @param {Event} event */
  function scheduleSave(event) {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest("[data-pad-runtime]")) return
    if (openCodeChat) return
    if (!document.body.hasAttribute("data-pad-editable")) return
    normalizeAfterInput(target)
    dirty = true
    setStatus("Editing... autosave queued", openCodeChat)
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(sendBody, SAVE_DELAY_MS)
  }

  socket.addEventListener("open", () => {
    normalizeAll()
    if (openCodeChat) {
      setStatus("Connected. This archive can continue its OpenCode session.", true)
      return
    }
    setEditableState(true, "")
    setStatus("Editable. Changes autosave to the source file.", openCodeChat)
  })

  socket.addEventListener("message", (event) => {
    /** @type {PadServerMessage} */
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    if (openCodeChat) {
      handleOpenCodeChatMessage(message, (text) => setStatus(text, true))
    }

    if (message.type === "saved" && message.savedAt) {
      setStatus(`Saved ${new Date(message.savedAt).toLocaleTimeString()}`, openCodeChat)
    }

    if (message.type === "reload") {
      setStatus(openCodeChat ? "Archive changed. Reloading..." : "Source changed. Reloading...", openCodeChat)
      location.reload()
    }

    if (!openCodeChat && message.type === "error") {
      setStatus(`PAD error: ${message.message}`, openCodeChat)
    }
  })

  socket.addEventListener("error", () => {
    if (!openCodeChat) {
      setEditableState(false, "Read-only: PAD server connection failed.")
    }
    setStatus(
      openCodeChat
        ? "OC chat server connection failed."
        : "Read-only. PAD server connection failed.",
      openCodeChat,
    )
  })

  socket.addEventListener("close", () => {
    if (!openCodeChat) {
      setEditableState(false, "Read-only: PAD server disconnected.")
    }
    setStatus(
      openCodeChat ? "OC chat server disconnected." : "Read-only. PAD server disconnected.",
      openCodeChat,
    )
  })

  document.body.addEventListener("input", scheduleSave)

  window.addEventListener("pagehide", () => {
    window.clearTimeout(saveTimer)
    if (dirty) sendBody()
  })
}
