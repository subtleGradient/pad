// @ts-check

let editable = false

export function canEditNow() {
  return editable
}

function editableElements() {
  return document.querySelectorAll("pad-text, pad-list-item")
}

/**
 * @param {Element} element
 * @param {boolean} nextEditable
 */
export function applyEditableElementState(element, nextEditable) {
  if (element.hasAttribute("static")) return
  element.setAttribute("contenteditable", nextEditable ? "true" : "false")
  element.setAttribute("aria-disabled", nextEditable ? "false" : "true")
}

/**
 * @param {boolean} nextEditable
 * @param {string} reason
 */
export function setEditableState(nextEditable, reason) {
  editable = nextEditable
  document.body.toggleAttribute("data-pad-editable", nextEditable)
  document.body.toggleAttribute("data-pad-readonly", !nextEditable)
  if (nextEditable) {
    delete document.body.dataset.padReadonlyReason
  } else {
    document.body.dataset.padReadonlyReason = reason
  }

  editableElements().forEach((element) => {
    applyEditableElementState(element, nextEditable)
  })

  document.dispatchEvent(
    new CustomEvent("pad-editable-change", {
      detail: { editable: nextEditable, reason },
    }),
  )
}

/** @returns {string} */
export function cleanBodyHtml() {
  const clone = /** @type {HTMLElement} */ (document.body.cloneNode(true))
  clone.querySelectorAll("[data-pad-runtime]").forEach((node) => node.remove())
  clone.querySelectorAll("pad-list-item").forEach((node) => {
    node.removeAttribute("data-pad-empty")
  })
  clone.querySelectorAll("pad-text, pad-list-item").forEach((node) => {
    if (node.hasAttribute("contenteditable")) {
      node.removeAttribute("contenteditable")
    }
    if (node.getAttribute("spellcheck") === "true") {
      node.removeAttribute("spellcheck")
    }
    if (node.getAttribute("role") === "textbox") node.removeAttribute("role")
    if (node.getAttribute("aria-multiline") === "true") {
      node.removeAttribute("aria-multiline")
    }
    if (node.hasAttribute("aria-disabled")) node.removeAttribute("aria-disabled")
  })
  return clone.innerHTML.trim()
}
