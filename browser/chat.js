// @ts-check

import { defineElement, focusEditableEnd } from "./dom.js"
import { applyEditableElementState, canEditNow } from "./editing.js"
import { markListItemEmptyState } from "./list.js"
import { renderMarkdownPreview } from "./markdown.js"
import {
  CHAT_ROLES,
  chatMessages,
  messageIsEmpty,
  messageMarkdown,
  messageRole,
  normalizePadChatSource,
} from "./chat-model.js"

const CHAT_SHADOW_STYLE = `
:host { display: block; }
pad-list { display: grid; gap: 0.75rem; min-width: 0; }
pad-list-item {
  display: grid;
  gap: 0.55rem;
  min-width: 0;
  min-height: 2.75rem;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 0.8rem;
  padding: 0.75rem;
  background: color-mix(in srgb, Canvas 74%, transparent);
  overflow-wrap: anywhere;
}
pad-list-item[data-pad-empty] [data-pad-message-editor]::before {
  content: "New message...";
  color: color-mix(in srgb, currentColor 42%, transparent);
  font-style: italic;
}
[data-pad-message-controls] {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: color-mix(in srgb, currentColor 68%, transparent);
  font: 0.78rem/1.2 ui-sans-serif, system-ui, sans-serif;
}
[data-pad-message-controls] select {
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 999px;
  padding: 0.24rem 0.45rem;
  background: Canvas;
  color: inherit;
  font: inherit;
}
[data-pad-message-editor] {
  min-height: 2.5rem;
  border-radius: 0.35rem;
  outline: 0 solid transparent;
  white-space: pre-wrap;
}
[data-pad-message-editor][contenteditable="true"]:focus {
  outline: 2px solid color-mix(in srgb, currentColor 26%, transparent);
  outline-offset: 0.28rem;
}
[data-pad-markdown-preview] {
  border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  padding-top: 0.55rem;
  color: color-mix(in srgb, currentColor 80%, transparent);
}
[data-pad-markdown-preview] :first-child { margin-top: 0; }
[data-pad-markdown-preview] :last-child { margin-bottom: 0; }
[data-pad-markdown-preview] pre {
  overflow: auto;
  border-radius: 0.5rem;
  padding: 0.65rem;
  background: color-mix(in srgb, currentColor 8%, transparent);
}
`

class PadMessage extends HTMLElement {
  connectedCallback() {
    if (!this.hasAttribute("role")) this.setAttribute("role", "user")
  }
}

class PadChat extends HTMLElement {
  /** @type {ShadowRoot} */
  #root
  /** @type {WeakMap<Element, HTMLElement>} */
  #editors = new WeakMap()
  /** @type {Element | null} */
  #activeMessage = null

  constructor() {
    super()
    this.#root = this.attachShadow({ mode: "open" })
  }

  connectedCallback() {
    this.normalizePadChat()
    document.addEventListener("pad-editable-change", this.#editableChanged)
  }

  disconnectedCallback() {
    document.removeEventListener("pad-editable-change", this.#editableChanged)
  }

  /** @param {Event} event */
  #editableChanged = (event) => {
    const customEvent = /** @type {CustomEvent<{ editable?: boolean }>} */ (event)
    this.#applyEditableState(Boolean(customEvent.detail?.editable))
  }

  /**
   * @param {{ focusClearedMessage?: Element | null, focusMessage?: Element | null }} [options]
   */
  normalizePadChat(options = {}) {
    const result = normalizePadChatSource(this, {
      activeMessage: this.#activeMessage,
      focusClearedMessage: options.focusClearedMessage ?? null,
    })
    this.#render(options.focusMessage ?? result.previousNonEmptyItem)
    if (result.previousNonEmptyItem) this.#focusMessage(result.previousNonEmptyItem)
  }

  /** @param {Element | null} focusMessage */
  #render(focusMessage = null) {
    this.#editors = new WeakMap()
    this.#root.innerHTML = `<style>${CHAT_SHADOW_STYLE}</style><pad-list data-pad-managed aria-label="Chat messages"></pad-list>`
    const list = this.#root.querySelector("pad-list")
    if (!list) return

    for (const message of chatMessages(this)) {
      list.append(this.#renderMessage(message))
    }

    this.#applyEditableState(canEditNow())
    if (focusMessage) this.#focusMessage(focusMessage)
  }

  /** @param {Element} message */
  #renderMessage(message) {
    const item = document.createElement("pad-list-item")
    item.setAttribute("role", "listitem")
    item.dataset.padChatItem = ""
    item.dataset.role = messageRole(message)
    item.toggleAttribute("data-pad-empty", messageIsEmpty(message))

    const controls = document.createElement("label")
    controls.dataset.padMessageControls = ""
    controls.textContent = "role"

    const select = document.createElement("select")
    select.setAttribute("aria-label", "Message role")
    this.#fillRoleSelect(select, messageRole(message))
    select.addEventListener("change", () => {
      message.setAttribute("role", select.value)
      item.dataset.role = select.value
      this.#dispatchSourceInput()
    })
    controls.append(select)

    const editor = document.createElement("div")
    editor.dataset.padMessageEditor = ""
    editor.setAttribute("role", "textbox")
    editor.setAttribute("aria-multiline", "true")
    editor.spellcheck = true
    editor.textContent = messageMarkdown(message)
    editor.addEventListener("focus", () => {
      this.#activeMessage = message
    })
    editor.addEventListener("input", () => {
      this.#activeMessage = message
      message.textContent = editor.innerText
      markListItemEmptyState(item)
      item.toggleAttribute("data-pad-empty", messageIsEmpty(message))
      const preview = item.querySelector("[data-pad-markdown-preview]")
      if (preview instanceof HTMLElement) {
        renderMarkdownPreview(preview, messageMarkdown(message))
      }
      const result = normalizePadChatSource(this, {
        activeMessage: this.#activeMessage,
        focusClearedMessage: message,
      })
      if (result.changed) {
        this.#render(result.previousNonEmptyItem ?? message)
      }
      if (result.previousNonEmptyItem) this.#focusMessage(result.previousNonEmptyItem)
      this.#dispatchSourceInput()
    })

    const preview = document.createElement("div")
    preview.dataset.padMarkdownPreview = ""
    renderMarkdownPreview(preview, messageMarkdown(message))

    this.#editors.set(message, editor)
    item.append(controls, editor, preview)
    return item
  }

  /**
   * @param {HTMLSelectElement} select
   * @param {string} currentRole
   */
  #fillRoleSelect(select, currentRole) {
    const roles = CHAT_ROLES.includes(currentRole)
      ? CHAT_ROLES
      : [...CHAT_ROLES, currentRole]
    for (const role of roles) {
      const option = document.createElement("option")
      option.value = role
      option.textContent = role
      option.selected = role === currentRole
      select.append(option)
    }
  }

  /** @param {boolean} editable */
  #applyEditableState(editable) {
    this.#root.querySelectorAll("[data-pad-message-editor]").forEach((editor) => {
      applyEditableElementState(editor, editable)
    })
    this.#root.querySelectorAll("select").forEach((select) => {
      if (select instanceof HTMLSelectElement) select.disabled = !editable
    })
  }

  /** @param {Element} message */
  #focusMessage(message) {
    const editor = this.#editors.get(message)
    if (editor) focusEditableEnd(editor)
  }

  #dispatchSourceInput() {
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
  }
}

export function normalizePadChats() {
  document.querySelectorAll("pad-chat").forEach((chat) => {
    const padChat = /** @type {PadChat | Element} */ (chat)
    if ("normalizePadChat" in padChat) {
      /** @type {PadChat} */ (padChat).normalizePadChat()
    } else {
      normalizePadChatSource(chat)
    }
  })
}

export function registerPadChatElements() {
  defineElement("pad-message", PadMessage)
  defineElement("pad-chat", PadChat)
}
