// @ts-check

import { defineElement, focusEditableEnd } from "./dom.js"
import { applyEditableElementState, canEditNow } from "./editing.js"
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
  --pad-message-accent: currentColor;
  --pad-message-border: color-mix(in srgb, currentColor 14%, transparent);
  --pad-message-surface: color-mix(in srgb, Canvas 74%, transparent);
  --pad-message-label-bg: color-mix(in srgb, currentColor 8%, Canvas);
  --pad-message-label-ink: color-mix(in srgb, currentColor 72%, CanvasText);
  position: relative;
  display: grid;
  gap: 0.65rem;
  min-width: 0;
  min-height: 2.75rem;
  border: 1px solid var(--pad-message-border);
  border-left-width: 0.34rem;
  border-radius: 0.8rem;
  padding: 0.7rem 0.8rem 0.8rem;
  background: var(--pad-message-surface);
  box-shadow: 0 0.45rem 1.2rem color-mix(in srgb, CanvasText 5%, transparent);
  overflow-wrap: anywhere;
}
pad-list-item[data-role="system"] {
  --pad-message-accent: #a66a00;
  --pad-message-border: color-mix(in srgb, #a66a00 42%, transparent);
  --pad-message-surface: color-mix(in srgb, #a66a00 8%, Canvas);
  --pad-message-label-bg: color-mix(in srgb, #a66a00 16%, Canvas);
  --pad-message-label-ink: color-mix(in srgb, #704400 82%, CanvasText);
  margin-inline: min(3rem, 7vw);
}
pad-list-item[data-role="user"] {
  --pad-message-accent: #3157d5;
  --pad-message-border: color-mix(in srgb, #3157d5 38%, transparent);
  --pad-message-surface: color-mix(in srgb, #3157d5 7%, Canvas);
  --pad-message-label-bg: color-mix(in srgb, #3157d5 14%, Canvas);
  --pad-message-label-ink: color-mix(in srgb, #1f3f9f 84%, CanvasText);
  margin-left: clamp(1rem, 9vw, 6rem);
}
pad-list-item[data-role="assistant"] {
  --pad-message-accent: #16815f;
  --pad-message-border: color-mix(in srgb, #16815f 40%, transparent);
  --pad-message-surface: color-mix(in srgb, #16815f 7%, Canvas);
  --pad-message-label-bg: color-mix(in srgb, #16815f 14%, Canvas);
  --pad-message-label-ink: color-mix(in srgb, #0f5f46 84%, CanvasText);
  margin-right: clamp(1rem, 9vw, 6rem);
}
[data-pad-message-controls]::before {
  content: attr(data-pad-role-label);
  border: 1px solid color-mix(in srgb, var(--pad-message-accent) 28%, transparent);
  border-radius: 999px;
  padding: 0.18rem 0.48rem;
  background: var(--pad-message-label-bg);
  color: var(--pad-message-label-ink);
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}
pad-list-item[data-pad-empty] [data-pad-markdown-preview]::before {
  content: "New message...";
  color: color-mix(in srgb, currentColor 42%, transparent);
  font-style: italic;
}
[data-pad-message-controls] {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: color-mix(in srgb, var(--pad-message-accent) 70%, CanvasText);
  font: 0.78rem/1.2 ui-sans-serif, system-ui, sans-serif;
}
[data-pad-message-controls] select {
  border: 1px solid color-mix(in srgb, var(--pad-message-accent) 24%, transparent);
  border-radius: 999px;
  padding: 0.24rem 0.45rem;
  background: color-mix(in srgb, Canvas 88%, var(--pad-message-accent));
  color: inherit;
  font: inherit;
}
pad-code-editor[data-pad-message-editor] {
  display: none;
  min-height: 2.5rem;
  border-radius: 0.35rem;
}
pad-list-item[data-pad-editing] pad-code-editor[data-pad-message-editor] {
  display: block;
}
[data-pad-markdown-preview] {
  min-height: 2.5rem;
  border-radius: 0.35rem;
  color: color-mix(in srgb, CanvasText 88%, var(--pad-message-accent));
  cursor: text;
}
[data-pad-markdown-preview]:focus {
  outline: 2px solid color-mix(in srgb, currentColor 18%, transparent);
  outline-offset: 0.28rem;
}
pad-list-item[data-pad-editing] [data-pad-markdown-preview] {
  display: none;
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
  #items = new WeakMap()
  /** @type {WeakMap<Element, HTMLElement>} */
  #editors = new WeakMap()
  /** @type {Element | null} */
  #activeMessage = null
  /** @type {Element | null} */
  #editingMessage = null

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
    const focusMessage = options.focusMessage ?? result.previousNonEmptyItem
    const needsInitialRender =
      this.#root.querySelector("pad-list[data-pad-managed]") === null

    if (result.changed || needsInitialRender) {
      this.#render(focusMessage)
      return
    }

    if (focusMessage) this.#focusMessage(focusMessage)
  }

  /** @param {Element | null} focusMessage */
  #render(focusMessage = null) {
    this.#items = new WeakMap()
    this.#editors = new WeakMap()
    this.#editingMessage = null
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
    controls.dataset.padRoleLabel = messageRole(message)

    const select = document.createElement("select")
    select.setAttribute("aria-label", "Message role")
    this.#fillRoleSelect(select, messageRole(message))
    select.addEventListener("change", () => {
      message.setAttribute("role", select.value)
      item.dataset.role = select.value
      controls.dataset.padRoleLabel = select.value
      this.#dispatchSourceInput()
    })
    controls.append(select)

    const preview = document.createElement("div")
    preview.dataset.padMarkdownPreview = ""
    preview.tabIndex = canEditNow() ? 0 : -1
    preview.setAttribute("aria-label", "Edit message")
    preview.addEventListener("click", () => {
      this.#startEditing(message)
    })
    preview.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
      this.#startEditing(message)
    })
    renderMarkdownPreview(preview, messageMarkdown(message))

    const editor = /** @type {HTMLElement & { value: string, editable?: boolean, focusEnd?: () => void }} */ (
      document.createElement("pad-code-editor")
    )
    editor.dataset.padMessageEditor = ""
    editor.setAttribute("language", "markdown")
    editor.setAttribute("role", "textbox")
    editor.setAttribute("aria-multiline", "true")
    editor.value = messageMarkdown(message)
    editor.addEventListener("focus", () => {
      this.#activeMessage = message
      this.#showEditingMessage(message)
    })
    editor.addEventListener("input", () => {
      this.#commitMessageInput(message, item, editor.value)
    })
    editor.addEventListener("blur", () => {
      this.#stopEditing(message)
    })

    this.#items.set(message, item)
    this.#editors.set(message, editor)
    item.append(controls, preview, editor)
    return item
  }

  /**
   * @param {Element} message
   * @param {HTMLElement} item
   * @param {string} markdown
   */
  #commitMessageInput(message, item, markdown) {
    this.#activeMessage = message
    message.textContent = markdown
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
      const normalized = this.#syncNormalizedMessages(result)
      if (!normalized) this.#render(result.previousNonEmptyItem ?? message)
    } else if (result.previousNonEmptyItem) {
      this.#focusMessage(result.previousNonEmptyItem)
    }
    this.#dispatchSourceInput()
  }

  /**
   * @param {{ appendedItem: Element | null, removedItems: Element[] }} result
   */
  #syncNormalizedMessages(result) {
    const list = this.#root.querySelector("pad-list[data-pad-managed]")
    if (!list) return false

    for (const message of result.removedItems) {
      if (message === this.#editingMessage) return false
      this.#items.get(message)?.remove()
    }

    if (result.appendedItem) {
      list.append(this.#renderMessage(result.appendedItem))
    }

    this.#applyEditableState(canEditNow())
    return true
  }

  /** @param {Element} message */
  #startEditing(message) {
    if (!canEditNow()) return

    const item = this.#items.get(message)
    const editor = this.#editors.get(message)
    if (!item || !editor) return

    this.#activeMessage = message
    this.#showEditingMessage(message)
    const focusableEditor = /** @type {HTMLElement & { focusEnd?: () => void }} */ (
      editor
    )
    if (typeof focusableEditor.focusEnd === "function") focusableEditor.focusEnd()
    else focusEditableEnd(editor)
  }

  /** @param {Element} message */
  #showEditingMessage(message) {
    this.#editingMessage = message
    for (const item of Array.from(
      this.#root.querySelectorAll("[data-pad-chat-item]"),
    )) {
      item.toggleAttribute("data-pad-editing", item === this.#items.get(message))
    }
  }

  /** @param {Element} message */
  #stopEditing(message) {
    if (this.#editingMessage !== message) return

    this.#editingMessage = null
    if (this.#activeMessage === message) this.#activeMessage = null
    this.#items.get(message)?.removeAttribute("data-pad-editing")

    const editor = this.#editors.get(message)
    if (editor) {
      const codeEditor = /** @type {HTMLElement & { value?: string }} */ (editor)
      codeEditor.value = messageMarkdown(message)
    }
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
      if ("editable" in editor) {
        const codeEditor = /** @type {HTMLElement & { editable: boolean }} */ (editor)
        codeEditor.editable = editable
        editor.setAttribute("aria-disabled", editable ? "false" : "true")
      } else {
        applyEditableElementState(editor, editable)
      }
    })
    this.#root.querySelectorAll("[data-pad-markdown-preview]").forEach((preview) => {
      if (!(preview instanceof HTMLElement)) return
      preview.tabIndex = editable ? 0 : -1
      preview.setAttribute("aria-disabled", editable ? "false" : "true")
    })
    this.#root.querySelectorAll("select").forEach((select) => {
      if (select instanceof HTMLSelectElement) select.disabled = !editable
    })
  }

  /** @param {Element} message */
  #focusMessage(message) {
    this.#startEditing(message)
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
