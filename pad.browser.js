// @ts-check

const SAVE_DELAY_MS = 180

/** @typedef {{ type?: string, message?: string, savedAt?: string, paths?: string[] }} PadServerMessage */

const GENERATED_ID_PREFIXES = new Map([
  ["pad-scope", "scope"],
  ["pad-ref", "ref"],
  ["pad-note", "note"],
  ["pad-expect", "expect"],
  ["pad-snapshot", "snap"],
  ["pad-work", "work"],
  ["pad-metric", "metric"],
  ["pad-story", "story"],
  ["spec-wish", "wish"],
  ["spec-judgement", "judge"],
  ["spec-razor", "razor"],
  ["spec-thread", "thread"],
  ["spec-golf", "golf"],
  ["real-pointer", "pointer"],
  ["real-observation", "obs"],
  ["real-judgement", "judge"],
  ["gap-item", "gap"],
  ["work-item", "work"],
  ["work-judgement", "judge"],
  ["proof-check", "check"],
])

const DIFF_PAD_ELEMENTS = [
  "pad-diff",
  "pad-scope",
  "pad-ref",
  "pad-note",
  "pad-expect",
  "pad-snapshot",
  "pad-work",
  "pad-import",
  "pad-metric",
  "pad-story",
  "story-spec",
  "story-real",
  "story-gaps",
  "story-next",
  "spec-wish",
  "spec-judgement",
  "spec-razor",
  "spec-thread",
  "spec-golf",
  "thread-heads",
  "thread-tails",
  "thread-band",
  "golf-axis",
  "file-ref",
  "real-pointer",
  "real-file",
  "real-observation",
  "real-judgement",
  "gap-item",
  "gap-vector",
  "gap-axis",
  "work-item",
  "work-judgement",
  "proof-check",
  "proof-link",
]

const GENERATED_ID_SELECTOR = [...GENERATED_ID_PREFIXES.keys()].join(",")
const RUNTIME_CRUD_SELECTOR = "[data-pad-runtime][data-pad-crud]"
const GENERIC_PAD_ELEMENTS = new Set([
  "pad-scope",
  "pad-ref",
  "pad-note",
  "pad-expect",
  "pad-snapshot",
  "pad-work",
  "pad-import",
  "pad-metric",
])
const EDITABLE_TEXT_ELEMENTS = new Set([
  "pad-text",
  "pad-note",
  "pad-expect",
  "pad-snapshot",
  "pad-work",
])
const EDITABLE_TEXT_SELECTOR = [...EDITABLE_TEXT_ELEMENTS].join(",")
/** @type {Array<[string, string, string]>} */
const EDITING_ATTRIBUTE_MARKERS = [
  ["contenteditable", "true", "data-pad-runtime-contenteditable"],
  ["spellcheck", "true", "data-pad-runtime-spellcheck"],
  ["role", "textbox", "data-pad-runtime-role"],
  ["aria-multiline", "true", "data-pad-runtime-aria-multiline"],
]
const TEXT_NODE_TYPE = 3
const SCOPE_EXPANDED_ATTRIBUTE = "data-pad-scope-expanded"
const SCOPE_DISCLOSURE_ATTRIBUTE = "data-pad-scope-disclosure"
const SCOPE_RUNTIME_EXPANDED_MARKER = "data-pad-runtime-scope-expanded"
const SCOPE_RUNTIME_DISCLOSURE_MARKER = "data-pad-runtime-scope-disclosure"
const MUTABLE_DIFF_ITEM_SELECTOR = [
  "spec-wish",
  "spec-judgement",
  "spec-razor",
  "spec-thread",
  "spec-golf",
  "real-pointer",
  "real-observation",
  "real-judgement",
  "gap-item",
  "work-item",
  "work-judgement",
].join(",")

/** @type {Map<string, Array<[string, () => string]>>} */
const FACET_ITEM_TEMPLATES = new Map([
  [
    "story-spec",
    [
      ["Wish", specWishHtml],
      ["Razor", specRazorHtml],
      ["Thread", specThreadHtml],
      ["Golf", specGolfHtml],
      ["Judgement", specJudgementHtml],
    ],
  ],
  [
    "story-real",
    [
      ["Observation", realObservationHtml],
      ["Judgement", realJudgementHtml],
      ["Pointer", realPointerHtml],
    ],
  ],
  ["story-gaps", [["Gap", gapItemHtml]]],
  [
    "story-next",
    [
      ["Work", workItemHtml],
      ["Judgement", workJudgementHtml],
    ],
  ],
])

/**
 * @param {string} name
 * @param {CustomElementConstructor} constructor
 */
function defineElement(name, constructor) {
  if (!customElements.get(name)) customElements.define(name, constructor)
}

/** @param {string} prefix */
function generatedId(prefix) {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "")
  return `${prefix}_${random ?? Math.random().toString(36).slice(2)}`
}

/** @param {Element & { localName: string }} element */
function ensureGeneratedId(element) {
  const prefix = GENERATED_ID_PREFIXES.get(element.localName)
  if (!prefix || element.hasAttribute("id")) return false
  element.setAttribute("id", generatedId(prefix))
  return true
}

/**
 * @param {HTMLElement} host
 * @param {string} name
 * @param {string} value
 * @param {string} marker
 */
function setRuntimeEditingAttribute(host, name, value, marker) {
  if (host.hasAttribute(name)) return
  host.setAttribute(name, value)
  host.setAttribute(marker, "")
}

/** @param {HTMLElement & { localName: string }} host */
function enableEditableTextHost(host) {
  if (!EDITABLE_TEXT_ELEMENTS.has(host.localName)) return

  for (const [name, value, marker] of EDITING_ATTRIBUTE_MARKERS) {
    setRuntimeEditingAttribute(host, name, value, marker)
  }
}

/**
 * @param {Node | null | undefined} node
 * @returns {node is Text}
 */
function isTextNode(node) {
  return node?.nodeType === TEXT_NODE_TYPE
}

/** @param {HTMLElement} host */
function directEditableText(host) {
  const directText = Array.from(host.childNodes ?? [])
    .filter(isTextNode)
    .map((node) => node.data)
    .join("")
  return directText || (host.textContent ?? "")
}

/**
 * @param {Selection} selection
 * @param {HTMLElement} host
 */
function selectionIsInsideHost(selection, host) {
  const anchor = selection.anchorNode
  const focus = selection.focusNode
  return (
    (!anchor || anchor === host || host.contains(anchor)) &&
    (!focus || focus === host || host.contains(focus))
  )
}

/** @param {HTMLElement} host */
function selectionCoversEditableHostText(host) {
  const hostText = directEditableText(host)
  if (!hostText.length) return true

  const selection = document.getSelection?.()
  if (!selection || selection.isCollapsed) return false
  if (!selectionIsInsideHost(selection, host)) return false

  const selectedText = selection.toString()
  return selectedText === hostText || selectedText.trim() === hostText.trim()
}

/**
 * @param {Text} node
 * @param {number} offset
 * @param {boolean} backward
 * @param {Selection} selection
 */
function deleteCharacterFromTextNode(node, offset, backward, selection) {
  const text = node.data
  if (backward) {
    if (offset <= 0) return false
    node.data = `${text.slice(0, offset - 1)}${text.slice(offset)}`
    selection.collapse(node, offset - 1)
    return true
  }

  if (offset >= text.length) return false
  node.data = `${text.slice(0, offset)}${text.slice(offset + 1)}`
  selection.collapse(node, offset)
  return true
}

/**
 * @param {HTMLElement} host
 * @param {Selection} selection
 * @param {boolean} backward
 */
function deleteCollapsedEditableCharacter(host, selection, backward) {
  const anchor = selection.anchorNode
  const offset = selection.anchorOffset

  if (isTextNode(anchor) && host.contains(anchor)) {
    return deleteCharacterFromTextNode(anchor, offset, backward, selection)
  }

  if (anchor !== host) return false

  const children = host.childNodes ?? []
  const child = children[offset - (backward ? 1 : 0)]
  if (!isTextNode(child)) return false
  return deleteCharacterFromTextNode(
    child,
    backward ? child.data.length : 0,
    backward,
    selection,
  )
}

/** @param {HTMLElement} host */
function dispatchManualEdit(host) {
  host.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
}

/** @param {Event} event */
function keepEditableHostOnDelete(event) {
  if (!(event instanceof InputEvent)) return
  if (
    event.inputType !== "deleteContentBackward" &&
    event.inputType !== "deleteContentForward" &&
    event.inputType !== "deleteByCut"
  ) {
    return
  }

  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (!EDITABLE_TEXT_ELEMENTS.has(target.localName)) return
  const selection = document.getSelection?.()
  if (!selection || !selectionIsInsideHost(selection, target)) return

  if (selectionCoversEditableHostText(target)) {
    event.preventDefault()
    return
  }

  if (!selection.isCollapsed) return

  event.preventDefault()
  const changed = deleteCollapsedEditableCharacter(
    target,
    selection,
    event.inputType === "deleteContentBackward",
  )
  if (changed) dispatchManualEdit(target)
}

/** @param {HTMLElement} scope */
function isRootScope(scope) {
  return scope.parentElement === document.body
}

/** @param {HTMLElement} scope */
function updateScopeDisclosure(scope) {
  const title = scope.shadowRoot?.querySelector("[data-pad-scope-title]")
  if (title instanceof HTMLElement) {
    title.textContent = `${scope.getAttribute("kind") ?? "scope"} / ${scope.getAttribute("name") ?? "untitled"}`
  }
  const button = scope.shadowRoot?.querySelector("[data-pad-scope-toggle]")
  if (!(button instanceof HTMLButtonElement)) return
  const expanded = scope.getAttribute(SCOPE_EXPANDED_ATTRIBUTE) === "true"
  button.setAttribute("aria-expanded", String(expanded))
  button.textContent = expanded ? "Collapse" : "Expand"
}

/**
 * @param {HTMLElement} scope
 * @param {boolean} expanded
 */
function setScopeExpanded(scope, expanded) {
  scope.setAttribute(SCOPE_DISCLOSURE_ATTRIBUTE, "")
  scope.setAttribute(SCOPE_RUNTIME_DISCLOSURE_MARKER, "")
  scope.setAttribute(SCOPE_EXPANDED_ATTRIBUTE, String(expanded))
  scope.setAttribute(SCOPE_RUNTIME_EXPANDED_MARKER, "")
  updateScopeDisclosure(scope)
}

/** @param {HTMLElement} scope */
function collapseSiblingScopes(scope) {
  const parent = scope.parentElement
  if (!parent) return
  for (const sibling of Array.from(parent.children)) {
    if (sibling === scope || sibling.localName !== "pad-scope") continue
    setScopeExpanded(/** @type {HTMLElement} */ (sibling), false)
  }
}

/** @param {HTMLElement} scope */
function ensureScopeDisclosure(scope) {
  scope.setAttribute(SCOPE_DISCLOSURE_ATTRIBUTE, "")
  scope.setAttribute(SCOPE_RUNTIME_DISCLOSURE_MARKER, "")
  if (!scope.hasAttribute(SCOPE_EXPANDED_ATTRIBUTE)) {
    setScopeExpanded(scope, isRootScope(scope))
  } else {
    scope.setAttribute(SCOPE_RUNTIME_EXPANDED_MARKER, "")
    updateScopeDisclosure(scope)
  }
}

/** @param {HTMLElement} scope */
function toggleScopeDisclosure(scope) {
  const expanded = scope.getAttribute(SCOPE_EXPANDED_ATTRIBUTE) === "true"
  if (expanded && !isRootScope(scope)) {
    setScopeExpanded(scope, false)
    return
  }
  collapseSiblingScopes(scope)
  setScopeExpanded(scope, true)
}

/** @param {string} name */
function makeDiffPadElement(name) {
  const assignsId = GENERATED_ID_PREFIXES.has(name)
  if (GENERIC_PAD_ELEMENTS.has(name)) return makeGenericPadElement(name, assignsId)

  return class extends HTMLElement {
    connectedCallback() {
      if (assignsId) ensureGeneratedId(this)
    }
  }
}

function padScopeHtml() {
  return `<pad-scope kind="scope" name="New scope">
  <pad-note kind="thought">Think out loud here...</pad-note>
</pad-scope>`
}

function padRefHtml() {
  return `<pad-ref kind="file" path="path/to/file" role="target"></pad-ref>`
}

function padNoteHtml() {
  return `<pad-note kind="thought">Think out loud here...</pad-note>`
}

function padExpectHtml() {
  return `<pad-expect kind="wish" matcher="core.todo" weight="medium">
  Describe the expectation...
  <pad-snapshot kind="observation" rev="WORKTREE">
  {
    summary: 'No observation captured yet.',
  }
  </pad-snapshot>
  <pad-snapshot kind="gap" rev="WORKTREE" distance="1">
  {
    distance: 1,
  }
  </pad-snapshot>
</pad-expect>`
}

function padSnapshotHtml() {
  return `<pad-snapshot kind="observation" rev="WORKTREE">
  {
    summary: 'Observation snapshot...',
  }
</pad-snapshot>`
}

function padWorkHtml() {
  return `<pad-work state="proposed">Proposed work...</pad-work>`
}

/**
 * @param {HTMLElement} host
 * @param {string} name
 */
function setHostAttribute(host, name) {
  /** @param {Event} event */
  return (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
      return
    }
    const value = target.value.trim()
    if (value) host.setAttribute(name, value)
    else host.removeAttribute(name)
    updateScopeDisclosure(host)
    host.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
  }
}

/**
 * @param {HTMLElement | ShadowRoot} root
 * @param {HTMLElement} host
 * @param {string} label
 * @param {string} name
 * @param {string[]} [options]
 */
function appendAttributeControl(root, host, label, name, options) {
  const wrapper = document.createElement("label")
  const currentValue = host.getAttribute(name) ?? ""
  wrapper.textContent = label
  /** @type {HTMLInputElement | HTMLSelectElement} */
  let control
  if (options) {
    const select = document.createElement("select")
    for (const optionValue of options) {
      const option = document.createElement("option")
      option.value = optionValue
      option.textContent = optionValue || "none"
      select.append(option)
    }
    if (
      currentValue &&
      !Array.from(select.options).some((option) => option.value === currentValue)
    ) {
      const option = document.createElement("option")
      option.value = currentValue
      option.textContent = currentValue
      select.append(option)
    }
    control = select
  } else {
    const input = document.createElement("input")
    input.type = "text"
    control = input
  }
  control.name = name
  control.setAttribute("aria-label", label)
  control.value = currentValue
  control.addEventListener("input", setHostAttribute(host, name))
  control.addEventListener("change", setHostAttribute(host, name))
  wrapper.append(control)
  root.append(wrapper)
}

/**
 * @param {HTMLElement | ShadowRoot} root
 * @param {HTMLElement} host
 * @param {string} label
 * @param {() => HTMLElement} makeElement
 */
function appendShadowAction(root, host, label, makeElement) {
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = label
  button.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    const element = makeElement()
    host.append(element)
    assignMissingGeneratedIds()
    host.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
  })
  root.append(button)
}

/**
 * @param {string} name
 * @param {boolean} assignsId
 */
function makeGenericPadElement(name, assignsId) {
  return class extends HTMLElement {
    connectedCallback() {
      if (assignsId) ensureGeneratedId(this)
      enableEditableTextHost(this)
      if (!this.shadowRoot) this.attachShadow({ mode: "open" })
      this.renderShadowControls()
      if (name === "pad-scope") ensureScopeDisclosure(this)
    }

    renderShadowControls() {
      if (!this.shadowRoot) return
      this.shadowRoot.textContent = ""
      const style = document.createElement("style")
      style.textContent = `
        :host {
          display: block;
          position: relative;
        }

        .scope-disclosure {
          display: grid;
          gap: .75rem;
        }

        .scope-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: .75rem;
          min-width: 0;
        }

        .scope-title {
          min-width: 0;
          color: color-mix(in srgb, currentColor 68%, transparent);
          font: 800 .72rem/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          letter-spacing: .08em;
          overflow: hidden;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .scope-toggle {
          flex: 0 0 auto;
          min-height: 2.75rem;
          border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
          border-radius: 999px;
          padding: .45rem .75rem;
          background: color-mix(in srgb, Canvas 90%, currentColor 10%);
          color: inherit;
          font: 800 1rem/1 ui-sans-serif, system-ui, sans-serif;
          cursor: pointer;
        }

        .scope-body {
          display: grid;
          gap: .9rem;
        }

        .scope-tools {
          display: flex;
          flex-wrap: wrap;
          align-items: end;
          gap: .4rem;
          border-block-start: 1px solid color-mix(in srgb, currentColor 10%, transparent);
          padding-block-start: .75rem;
        }

        .scope-adds {
          display: flex;
          flex-wrap: wrap;
          gap: .4rem;
          border-block-start: 1px dashed color-mix(in srgb, currentColor 14%, transparent);
          padding-block-start: .75rem;
        }

        :host(:not([data-pad-scope-expanded="true"])) .scope-body {
          display: none;
        }

        .chrome {
          position: absolute;
          inset-block-start: .55rem;
          inset-inline-end: .55rem;
          z-index: 2;
          color: color-mix(in srgb, currentColor 70%, transparent);
          font: 700 .75rem/1 ui-sans-serif, system-ui, sans-serif;
          opacity: 0;
          pointer-events: none;
        }

        :host(:hover) .chrome,
        :host(:focus-within) .chrome,
        .chrome[open] {
          opacity: 1;
          pointer-events: auto;
        }

        summary {
          min-height: 2.75rem;
          border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
          border-radius: 999px;
          padding: .45rem .75rem;
          background: color-mix(in srgb, Canvas 86%, currentColor 14%);
          box-shadow: 0 .5rem 1.4rem rgba(0, 0, 0, .12);
          cursor: pointer;
          list-style: none;
          user-select: none;
        }

        summary::-webkit-details-marker {
          display: none;
        }

        .chrome-panel {
          display: flex;
          flex-wrap: wrap;
          align-items: end;
          gap: .4rem;
          width: min(34rem, calc(100vw - 3rem));
          max-height: min(70vh, 36rem);
          margin-block-start: .35rem;
          overflow: auto;
          border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
          border-radius: .5rem;
          padding: .55rem;
          background: color-mix(in srgb, Canvas 92%, currentColor 8%);
          box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, .18);
        }

        label {
          display: inline-grid;
          gap: .18rem;
          color: color-mix(in srgb, currentColor 76%, transparent);
          font: 700 .68rem/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        input,
        select {
          min-height: 2.75rem;
          max-width: 12rem;
          border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
          border-radius: .45rem;
          padding: .45rem .65rem;
          background: color-mix(in srgb, Canvas 88%, currentColor 12%);
          color: inherit;
          font: 600 1rem/1.2 ui-sans-serif, system-ui, sans-serif;
        }

        button {
          min-height: 2.75rem;
          border: 0;
          border-radius: .45rem;
          padding: .45rem .7rem;
          background: rgba(47, 109, 179, .16);
          color: inherit;
          font: 800 1rem/1 ui-sans-serif, system-ui, sans-serif;
          cursor: pointer;
        }

        button:focus-visible,
        input:focus-visible,
        select:focus-visible,
        summary:focus-visible,
        .scope-toggle:focus-visible {
          outline: 2px solid rgba(47, 109, 179, .75);
          outline-offset: 2px;
        }

        @media (pointer: fine) {
          summary,
          .scope-toggle,
          input,
          select,
          button {
            min-height: 2rem;
            padding: .32rem .55rem;
            font-size: .78rem;
          }
        }

        @media (max-width: 42rem) {
          .chrome {
            position: static;
            margin-block-end: .55rem;
            opacity: .72;
            pointer-events: auto;
          }

          .chrome-panel {
            width: 100%;
            max-height: none;
          }

          .scope-header {
            align-items: start;
          }

          .scope-title {
            white-space: normal;
          }

          .scope-tools {
            align-items: stretch;
          }
        }
      `
      this.shadowRoot.append(style)
      let scopeBody = null
      let panel = null
      let scopeAddPanel = null
      if (name === "pad-scope") {
        const disclosure = document.createElement("div")
        disclosure.className = "scope-disclosure"
        const header = document.createElement("div")
        header.className = "scope-header"
        const title = document.createElement("span")
        title.className = "scope-title"
        title.dataset.padScopeTitle = ""
        title.textContent = `${this.getAttribute("kind") ?? "scope"} / ${this.getAttribute("name") ?? "untitled"}`
        const toggle = document.createElement("button")
        toggle.type = "button"
        toggle.className = "scope-toggle"
        toggle.dataset.padScopeToggle = ""
        toggle.addEventListener("click", (event) => {
          event.preventDefault()
          event.stopPropagation()
          toggleScopeDisclosure(this)
        })
        header.append(title, toggle)
        scopeBody = document.createElement("div")
        scopeBody.className = "scope-body"
        panel = document.createElement("div")
        panel.className = "scope-tools"
        scopeBody.append(panel)
        scopeAddPanel = document.createElement("div")
        scopeAddPanel.className = "scope-adds"
        disclosure.append(header, scopeBody)
        this.shadowRoot.append(disclosure)
      }
      if (!panel) {
        const chrome = document.createElement("details")
        chrome.className = "chrome"
        const summary = document.createElement("summary")
        summary.textContent = "Edit"
        summary.setAttribute("aria-label", `Edit ${name.replace("pad-", "")}`)
        panel = document.createElement("div")
        panel.className = "chrome-panel"
        chrome.append(summary, panel)
        this.shadowRoot.append(chrome)
      }

      if (name === "pad-scope") {
        appendAttributeControl(panel, this, "kind", "kind", [
          "spec",
          "story",
          "slice",
          "requirement",
          "scope",
          "experiment",
        ])
        appendAttributeControl(panel, this, "name", "name")
        appendAttributeControl(panel, this, "refs", "refs")
        const addPanel = scopeAddPanel ?? panel
        appendShadowAction(addPanel, this, "+scope", () => htmlToElement(padScopeHtml()))
        appendShadowAction(addPanel, this, "+note", () => htmlToElement(padNoteHtml()))
        appendShadowAction(addPanel, this, "+ref", () => htmlToElement(padRefHtml()))
        appendShadowAction(addPanel, this, "+expect", () => htmlToElement(padExpectHtml()))
        appendShadowAction(addPanel, this, "+work", () => htmlToElement(padWorkHtml()))
      }

      if (name === "pad-ref") {
        appendAttributeControl(panel, this, "kind", "kind", [
          "file",
          "url",
          "symbol",
          "asset",
          "command",
          "commit",
        ])
        appendAttributeControl(panel, this, "path", "path")
        appendAttributeControl(panel, this, "href", "href")
        appendAttributeControl(panel, this, "command", "command")
        appendAttributeControl(panel, this, "role", "role")
      }

      if (name === "pad-note") {
        appendAttributeControl(panel, this, "kind", "kind", [
          "thought",
          "summary",
          "why",
          "rule",
          "plan",
          "question",
          "decision",
          "title",
        ])
      }

      if (name === "pad-expect") {
        appendAttributeControl(panel, this, "kind", "kind", [
          "wish",
          "nightmare",
          "judgement",
          "razor",
        ])
        appendAttributeControl(panel, this, "matcher", "matcher")
        appendAttributeControl(panel, this, "weight", "weight")
        appendAttributeControl(panel, this, "edge", "edge", ["", "heads", "tails"])
        appendAttributeControl(panel, this, "refs", "refs")
        appendShadowAction(panel, this, "+snapshot", () => htmlToElement(padSnapshotHtml()))
        appendShadowAction(panel, this, "+work", () => htmlToElement(padWorkHtml()))
      }

      if (name === "pad-snapshot") {
        appendAttributeControl(panel, this, "kind", "kind", [
          "observation",
          "gap",
          "result",
        ])
        appendAttributeControl(panel, this, "rev", "rev")
        appendAttributeControl(panel, this, "distance", "distance")
      }

      if (name === "pad-work") {
        appendAttributeControl(panel, this, "state", "state", [
          "proposed",
          "approved",
          "active",
          "blocked",
          "done",
          "dropped",
        ])
      }

      if (name === "pad-import") {
        appendAttributeControl(panel, this, "kind", "kind", ["expect-pack"])
        appendAttributeControl(panel, this, "src", "src")
        appendAttributeControl(panel, this, "as", "as")
      }

      if (name === "pad-metric") {
        appendAttributeControl(panel, this, "name", "name")
        appendAttributeControl(panel, this, "value", "value")
        appendAttributeControl(panel, this, "target", "target")
      }

      const slot = document.createElement("slot")
      if (scopeBody) {
        scopeBody.append(slot)
        if (scopeAddPanel) scopeBody.append(scopeAddPanel)
      } else this.shadowRoot.append(slot)
      updateScopeDisclosure(this)
    }
  }
}

function assignMissingGeneratedIds() {
  if (typeof document.querySelectorAll !== "function") return false

  let changed = false
  for (const element of Array.from(
    document.querySelectorAll(GENERATED_ID_SELECTOR),
  )) {
    changed = ensureGeneratedId(
      /** @type {Element & { localName: string }} */ (element),
    ) || changed
  }
  return changed
}

function specWishHtml() {
  return `<spec-wish>
  <pad-text>Wish for this story...</pad-text>
</spec-wish>`
}

function specJudgementHtml() {
  return `<spec-judgement>
  <pad-text>Judgement about this story...</pad-text>
</spec-judgement>`
}

function specRazorHtml() {
  return `<spec-razor weight="medium">
  <pad-text>A binary expectation that should be true...</pad-text>
</spec-razor>`
}

function specThreadHtml() {
  return `<spec-thread>
  <thread-heads name="too-little">
    <pad-text>The undershoot failure mode...</pad-text>
  </thread-heads>
  <thread-tails name="too-much">
    <pad-text>The overshoot failure mode...</pad-text>
  </thread-tails>
  <thread-band min="-1" max="1">
    <pad-text>The acceptable threaded shape...</pad-text>
  </thread-band>
</spec-thread>`
}

function specGolfHtml() {
  return `<spec-golf model="thing-golf" target-max="4">
  <golf-axis name="safety" target-max="1"></golf-axis>
  <golf-axis name="burden" target-max="2"></golf-axis>
  <golf-axis name="chaos" target-max="1"></golf-axis>
  <golf-axis name="betrayal" target="0"></golf-axis>
  <golf-axis name="control" target-max="1"></golf-axis>
</spec-golf>`
}

function realObservationHtml() {
  return `<real-observation>
  <pad-text>Observation about current reality...</pad-text>
</real-observation>`
}

function realJudgementHtml() {
  return `<real-judgement>
  <pad-text>Judgement about current reality...</pad-text>
</real-judgement>`
}

function realPointerHtml() {
  return `<real-pointer rev="SELF">
  <file-ref path="path/to/file" role="evidence"></file-ref>
</real-pointer>`
}

function gapItemHtml() {
  return `<gap-item kind="growth" state="open">
  <gap-vector>
    <gap-axis name="distance" value="1" target="0"></gap-axis>
    <gap-axis name="confidence" value="0.5" target="1"></gap-axis>
  </gap-vector>
  <pad-text>Gap between the spec and reality...</pad-text>
</gap-item>`
}

function workItemHtml() {
  return `<work-item state="proposed">
  <pad-text>Work to close or intentionally reshape the gap...</pad-text>
</work-item>`
}

function workJudgementHtml() {
  return `<work-judgement>
  <pad-text>Judgement about the proposed work...</pad-text>
</work-judgement>`
}

function storyHtml() {
  return `<pad-story>
  <pad-text kind="heading">New story</pad-text>

  <story-spec>
    ${specWishHtml()}
  </story-spec>

  <story-real>
    ${realObservationHtml()}
  </story-real>

  <story-gaps>
    ${gapItemHtml()}
  </story-gaps>

  <story-next>
    ${workItemHtml()}
  </story-next>
</pad-story>`
}

/** @param {string} html */
function htmlToElement(html) {
  const template = document.createElement("template")
  template.innerHTML = html.trim()
  const element = template.content.firstElementChild
  if (!(element instanceof HTMLElement)) {
    throw new Error("Expected an HTML element template.")
  }
  return element
}

/** @param {Element} root */
function removeRuntimeControls(root) {
  root.querySelectorAll?.(RUNTIME_CRUD_SELECTOR).forEach((node) => node.remove())
}

/** @param {Element} root */
function clearGeneratedIds(root) {
  if (GENERATED_ID_PREFIXES.has(root.localName)) root.removeAttribute("id")
  root.querySelectorAll?.(GENERATED_ID_SELECTOR).forEach((node) => {
    node.removeAttribute("id")
  })
}

/** @param {Element} element */
function cloneEditableElement(element) {
  const clone = /** @type {Element} */ (element.cloneNode(true))
  removeRuntimeControls(clone)
  clearGeneratedIds(clone)
  return clone
}

/**
 * @param {unknown} value
 * @param {string} localName
 * @returns {value is HTMLElement}
 */
function isLocalElement(value, localName) {
  return value instanceof HTMLElement && value.localName === localName
}

/** @param {ParentNode} parent */
function childElements(parent) {
  return Array.from(parent.children ?? []).filter(
    (child) => child instanceof HTMLElement,
  )
}

/**
 * @param {HTMLElement} element
 * @param {string} selector
 * @param {-1 | 1} direction
 */
function moveAmongSiblings(element, selector, direction) {
  const parent = element.parentElement
  if (!parent) return false

  const siblings = childElements(parent).filter((child) => child.matches(selector))
  const index = siblings.indexOf(element)
  const swapWith = siblings[index + direction]
  if (!swapWith) return false

  if (direction < 0) {
    parent.insertBefore(element, swapWith)
  } else {
    swapWith.insertAdjacentElement("afterend", element)
  }
  return true
}

/** @param {Element} root */
function focusFirstPadText(root) {
  const text = root.querySelector("pad-text")
  if (text instanceof HTMLElement) text.focus()
}

/**
 * @param {HTMLElement} target
 * @param {HTMLElement} controls
 */
function placeStoryControls(target, controls) {
  const heading = childElements(target).find(
    (child) =>
      child.localName === "pad-text" && child.getAttribute("kind") === "heading",
  )
  if (heading) {
    heading.insertAdjacentElement("afterend", controls)
  } else {
    target.prepend(controls)
  }
}

/**
 * @param {HTMLElement} target
 * @param {HTMLElement} controls
 */
function placeDiffPadToolbar(target, controls) {
  const title = childElements(target).find(
    (child) =>
      child.localName === "pad-text" && child.getAttribute("kind") === "title",
  )
  if (title) {
    title.insertAdjacentElement("afterend", controls)
  } else {
    target.prepend(controls)
  }
}

/**
 * @param {string} label
 * @param {() => void} action
 * @param {{ primary?: boolean, danger?: boolean, disabled?: boolean }} [options]
 */
function crudButton(label, action, options = {}) {
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = label
  button.dataset.padCrudButton = ""
  if (options.primary) button.dataset.padCrudPrimary = ""
  if (options.danger) button.dataset.padCrudDanger = ""
  button.disabled = options.disabled ?? false
  button.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!button.disabled) action()
  })
  return button
}

/** @param {string} kind */
function crudControls(kind) {
  const controls = document.createElement("div")
  controls.dataset.padRuntime = ""
  controls.dataset.padCrud = ""
  controls.dataset.padCrudKind = kind
  return controls
}

/** @param {string} label */
function confirmDelete(label) {
  return (
    typeof globalThis.confirm !== "function" ||
    globalThis.confirm(`Delete ${label}? This will autosave.`)
  )
}

/** @param {() => void} onChange */
function installDiffPadCrudControls(onChange) {
  document.querySelectorAll?.(RUNTIME_CRUD_SELECTOR).forEach((node) => {
    if (typeof node.remove === "function") node.remove()
  })

  const diffPad = document.querySelector?.("pad-diff")
  if (!isLocalElement(diffPad, "pad-diff")) return

  /** @param {Element} [focusTarget] */
  const commit = (focusTarget) => {
    assignMissingGeneratedIds()
    installDiffPadCrudControls(onChange)
    if (focusTarget instanceof Element) focusFirstPadText(focusTarget)
    onChange()
  }

  const storySelector = "pad-story"
  const stories = childElements(diffPad).filter((child) =>
    child.matches(storySelector),
  )
  const toolbar = crudControls("toolbar")
  toolbar.append(
    crudButton(
      "Add story",
      () => {
        const story = htmlToElement(storyHtml())
        diffPad.append(story)
        commit(story)
      },
      { primary: true },
    ),
  )
  placeDiffPadToolbar(diffPad, toolbar)

  for (const story of stories) {
    const storyControls = crudControls("story")
    storyControls.append(
      crudButton("Add after", () => {
        const nextStory = htmlToElement(storyHtml())
        story.insertAdjacentElement("afterend", nextStory)
        commit(nextStory)
      }),
      crudButton("Copy", () => {
        const clone = cloneEditableElement(story)
        story.insertAdjacentElement("afterend", clone)
        commit(clone)
      }),
      crudButton("Up", () => {
        if (moveAmongSiblings(story, storySelector, -1)) commit(story)
      }),
      crudButton("Down", () => {
        if (moveAmongSiblings(story, storySelector, 1)) commit(story)
      }),
      crudButton(
        "Delete",
        () => {
          if (!confirmDelete("story")) return
          story.remove()
          commit(diffPad)
        },
        { danger: true, disabled: stories.length <= 1 },
      ),
    )
    placeStoryControls(story, storyControls)

    for (const facet of childElements(story).filter((child) =>
      FACET_ITEM_TEMPLATES.has(child.localName),
    )) {
      const adders = FACET_ITEM_TEMPLATES.get(facet.localName) ?? []
      const facetControls = crudControls("facet")
      for (const [label, itemHtml] of adders) {
        facetControls.append(
          crudButton(`Add ${label}`, () => {
            const item = htmlToElement(itemHtml())
            facet.append(item)
            commit(item)
          }),
        )
      }
      facet.prepend(facetControls)
    }

    for (const item of Array.from(story.querySelectorAll(MUTABLE_DIFF_ITEM_SELECTOR))) {
      if (!(item instanceof HTMLElement)) continue
      const itemControls = crudControls("item")
      itemControls.append(
        crudButton("Copy", () => {
          const clone = cloneEditableElement(item)
          item.insertAdjacentElement("afterend", clone)
          commit(clone)
        }),
        crudButton("Up", () => {
          if (moveAmongSiblings(item, item.localName, -1)) commit(item)
        }),
        crudButton("Down", () => {
          if (moveAmongSiblings(item, item.localName, 1)) commit(item)
        }),
        crudButton(
          "Delete",
          () => {
            if (!confirmDelete(item.localName)) return
            const focusTarget = item.parentElement ?? story
            item.remove()
            commit(focusTarget)
          },
          { danger: true },
        ),
      )
      item.append(itemControls)
    }
  }
}

class PadDocument extends HTMLElement {}
defineElement("pad-document", PadDocument)

for (const name of DIFF_PAD_ELEMENTS) defineElement(name, makeDiffPadElement(name))

class PadText extends HTMLElement {
  connectedCallback() {
    enableEditableTextHost(this)
  }
}
defineElement("pad-text", PadText)

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

/** @returns {string} */
function cleanBodyHtml() {
  const clone = /** @type {HTMLElement} */ (document.body.cloneNode(true))
  clone.querySelectorAll("[data-pad-runtime]").forEach((node) => node.remove())
  clone.querySelectorAll(EDITABLE_TEXT_SELECTOR).forEach((node) => {
    for (const [name, value, marker] of EDITING_ATTRIBUTE_MARKERS) {
      if (!node.hasAttribute(marker)) continue
      node.removeAttribute(marker)
      if (node.getAttribute(name) === value) node.removeAttribute(name)
    }
  })
  clone.querySelectorAll("pad-scope").forEach((node) => {
    if (node.hasAttribute(SCOPE_RUNTIME_DISCLOSURE_MARKER)) {
      node.removeAttribute(SCOPE_RUNTIME_DISCLOSURE_MARKER)
      node.removeAttribute(SCOPE_DISCLOSURE_ATTRIBUTE)
    }
    if (node.hasAttribute(SCOPE_RUNTIME_EXPANDED_MARKER)) {
      node.removeAttribute(SCOPE_RUNTIME_EXPANDED_MARKER)
      node.removeAttribute(SCOPE_EXPANDED_ATTRIBUTE)
    }
  })
  return clone.innerHTML.trim()
}

function connect() {
  const shouldSaveGeneratedIds = assignMissingGeneratedIds()

  if (location.protocol !== "http:" && location.protocol !== "https:") {
    setStatus("Run this PAD as a program to enable autosave.")
    return
  }

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
    dirty = false
    socket.send(JSON.stringify({ type: "body", html: cleanBodyHtml() }))
    setStatus("Saving...")
  }

  /** @param {Event} event */
  function scheduleSave(event) {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest("[data-pad-runtime]")) return
    dirty = true
    setStatus("Editing... autosave queued")
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(sendBody, SAVE_DELAY_MS)
  }

  function scheduleRuntimeSave() {
    dirty = true
    setStatus("Editing... autosave queued")
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(sendBody, SAVE_DELAY_MS)
  }

  socket.addEventListener("open", () => {
    setStatus("Editable. Changes autosave to the source file.")
    if (shouldSaveGeneratedIds) {
      dirty = true
      sendBody()
    }
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

  socket.addEventListener("close", () => {
    setStatus("PAD server disconnected.")
  })

  document.body.addEventListener("input", scheduleSave)
  document.body.addEventListener("beforeinput", keepEditableHostOnDelete)
  installDiffPadCrudControls(scheduleRuntimeSave)

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
