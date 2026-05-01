// @ts-check

import { defineElement } from "./dom.js"

/** @typedef {{ type?: string, message?: string, savedAt?: string, fileName?: string, kind?: string, sessionID?: string, paths?: string[] }} OpenCodeChatServerMessage */

const OPEN_CODE_CHAT_ELEMENTS = [
  "oc-chat",
  "oc-session-card",
  "oc-runtime-panel",
  "oc-transcript",
  "oc-system-prompt",
  "oc-user-message",
  "oc-assistant-message",
  "oc-message-meta",
  "oc-text-part",
  "oc-reasoning-part",
  "oc-file-part",
  "oc-tool-call",
  "oc-tool-input",
  "oc-tool-output",
  "oc-patch-part",
  "oc-snapshot-part",
  "oc-step-start",
  "oc-step-finish",
  "oc-agent-part",
  "oc-subtask-part",
  "oc-retry-part",
  "oc-compaction-part",
  "oc-unknown-part",
  "oc-connection-status",
]

class OpenCodeComposer extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return
    this.dataset.ready = "true"
    this.innerHTML = `<form data-oc-runtime><textarea name="prompt" placeholder="Continue this OpenCode session..." aria-label="Continue this OpenCode session"></textarea><button type="submit">Send</button></form>`

    const form = this.querySelector("form")
    const textarea = this.querySelector("textarea")
    form?.addEventListener("submit", (event) => {
      event.preventDefault()
      const text = textarea?.value.trim() ?? ""
      if (!text || !textarea) return
      textarea.value = ""
      this.dispatchEvent(
        new CustomEvent("oc-submit", {
          bubbles: true,
          detail: { text },
        }),
      )
    })
  }
}

export function registerOpenCodeChatElements() {
  for (const name of OPEN_CODE_CHAT_ELEMENTS) {
    defineElement(name, class extends HTMLElement {})
  }
  defineElement("oc-composer", OpenCodeComposer)
}

export function hasOpenCodeChat() {
  return document.querySelector("oc-chat") !== null
}

/** @returns {HTMLElement | null} */
function runtimePanel() {
  let panel = /** @type {HTMLElement | null} */ (
    document.querySelector("oc-runtime-panel[data-oc-runtime]")
  )
  if (!panel) {
    panel = document.createElement("oc-runtime-panel")
    panel.dataset.ocRuntime = ""
    document.querySelector("oc-chat")?.prepend(panel)
  }
  if (!panel) return null
  panel.hidden = false
  if (!panel.querySelector("oc-connection-status")) {
    panel.append(document.createElement("oc-connection-status"))
  }
  if (!panel.querySelector("oc-composer")) {
    panel.append(document.createElement("oc-composer"))
  }
  return panel
}

/** @param {string} text */
export function setOpenCodeChatStatus(text) {
  const status = runtimePanel()?.querySelector("oc-connection-status")
  if (status) status.textContent = text
}

/**
 * @param {WebSocket} socket
 * @param {(text: string) => void} setStatus
 */
export function connectOpenCodeChat(socket, setStatus) {
  document.body.addEventListener("oc-submit", (event) => {
    if (!(event instanceof CustomEvent)) return
    if (socket.readyState !== WebSocket.OPEN) {
      setStatus("OpenCode bridge is disconnected.")
      return
    }
    socket.send(JSON.stringify({ type: "oc.prompt", text: event.detail.text }))
    setStatus("Prompt sent. Waiting for OpenCode...")
  })
}

/**
 * @param {OpenCodeChatServerMessage} message
 * @param {(text: string) => void} setStatus
 */
export function handleOpenCodeChatMessage(message, setStatus) {
  if (message.type === "ready" && message.sessionID) {
    setStatus(`Connected to OpenCode session ${message.sessionID}.`)
  }

  if (message.type === "oc.status" && message.message) {
    setStatus(message.message)
  }

  if (message.type === "oc.saved" && message.savedAt) {
    setStatus(
      `OpenCode response saved ${new Date(message.savedAt).toLocaleTimeString()}.`,
    )
  }

  if ((message.type === "oc.error" || message.type === "error") && message.message) {
    setStatus(`OC chat error: ${message.message}`)
  }
}
