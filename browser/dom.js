// @ts-check

/**
 * @param {string} name
 * @param {CustomElementConstructor} constructor
 */
export function defineElement(name, constructor) {
  if (!customElements.get(name)) customElements.define(name, constructor)
}

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** @param {Element} element */
export function focusEditableEnd(element) {
  const focus = /** @type {{ focus?: (options?: { preventScroll?: boolean }) => void }} */ (
    element
  ).focus
  if (typeof focus === "function") {
    focus.call(element, { preventScroll: true })
  }

  const doc = element.ownerDocument ?? globalThis.document
  const win = doc?.defaultView ?? globalThis.window
  if (
    typeof doc?.createRange !== "function" ||
    typeof win?.getSelection !== "function"
  ) {
    return
  }

  const range = doc.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  const selection = win.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
