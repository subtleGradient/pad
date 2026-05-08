// @ts-check

import { defineElement } from "./dom.js"
import { markListItemEmptyState, normalizePadList } from "./list.js"

class PadDocument extends HTMLElement {}
class PadStack extends HTMLElement {}
class PadGrid extends HTMLElement {}
class PadPanel extends HTMLElement {}
class PadScope extends HTMLElement {}
class PadRef extends HTMLElement {}
class PadNote extends HTMLElement {}
class PadExpect extends HTMLElement {}
class PadSnapshot extends HTMLElement {}
class PadWork extends HTMLElement {}
class PadImport extends HTMLElement {}
class PadMetric extends HTMLElement {}

class PadText extends HTMLElement {
  connectedCallback() {
    if (!this.hasAttribute("spellcheck")) this.spellcheck = true
    if (!this.hasAttribute("role")) this.setAttribute("role", "textbox")
    if (!this.hasAttribute("aria-multiline")) {
      this.setAttribute("aria-multiline", "true")
    }
  }
}

class PadList extends HTMLElement {
  connectedCallback() {
    if (!this.hasAttribute("role")) this.setAttribute("role", "list")
    if (!this.hasAttribute("data-pad-managed")) {
      queueMicrotask(() => normalizePadList(this))
    }
  }
}

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

export class PadStatus extends HTMLElement {
  /** @param {string} value */
  set message(value) {
    this.textContent = value
  }
}

export function registerPadElements() {
  defineElement("pad-document", PadDocument)
  defineElement("pad-stack", PadStack)
  defineElement("pad-grid", PadGrid)
  defineElement("pad-panel", PadPanel)
  defineElement("pad-scope", PadScope)
  defineElement("pad-ref", PadRef)
  defineElement("pad-note", PadNote)
  defineElement("pad-expect", PadExpect)
  defineElement("pad-snapshot", PadSnapshot)
  defineElement("pad-work", PadWork)
  defineElement("pad-import", PadImport)
  defineElement("pad-metric", PadMetric)
  defineElement("pad-text", PadText)
  defineElement("pad-list", PadList)
  defineElement("pad-list-item", PadListItem)
  defineElement("pad-status", PadStatus)
}
