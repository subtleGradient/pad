// @ts-check

import { normalizeTrailingEmptyItems } from "./list.js"

export const CHAT_ROLES = ["system", "user", "assistant"]

/** @param {Element} chat */
export function chatMessages(chat) {
  return Array.from(chat.children).filter(
    (child) => child.localName === "pad-message",
  )
}

/** @param {Element} message */
export function messageMarkdown(message) {
  return message.textContent ?? ""
}

/** @param {Element} message */
export function messageIsEmpty(message) {
  return messageMarkdown(message).trim() === ""
}

/** @param {Element} message */
export function messageRole(message) {
  return message.getAttribute("role")?.trim() || "user"
}

/** @param {string} [role] */
export function createMessage(role = "user") {
  const message = document.createElement("pad-message")
  message.setAttribute("role", role)
  return message
}

/**
 * @param {Element} chat
 * @param {{
 *   activeMessage?: Element | null,
 *   focusClearedMessage?: Element | null,
 * }} [options]
 */
export function normalizePadChatSource(chat, options = {}) {
  return normalizeTrailingEmptyItems({
    items: chatMessages(chat),
    isEmpty: messageIsEmpty,
    appendBlank: () => {
      const message = createMessage("user")
      chat.append(message)
      return message
    },
    removeItem: (message) => message.remove(),
    activeItem: options.activeMessage ?? null,
    focusClearedItem: options.focusClearedMessage ?? null,
  })
}
