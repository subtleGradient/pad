// @ts-check

import { defineElement } from "./dom.js"

export const CODEMIRROR_MODULE_URL = "https://esm.sh/codemirror@6.0.2"
export const CODEMIRROR_MARKDOWN_MODULE_URL =
  "https://esm.sh/@codemirror/lang-markdown@6.3.4"
export const CODEMIRROR_STATE_MODULE_URL =
  "https://esm.sh/@codemirror/state@6.6.0"
export const CODEMIRROR_VIEW_MODULE_URL =
  "https://esm.sh/@codemirror/view@6.41.1"

/** @typedef {{ destroy: () => void, focusEnd: () => void, value: () => string, setValue: (value: string) => void, setEditable: (editable: boolean) => void }} PadCodeMirrorEditor */
/** @typedef {{ docChanged: boolean, state: { doc: { toString: () => string } } }} PadCodeMirrorUpdate */

/** @type {Promise<null | Record<string, any>> | undefined} */
let codeMirrorPromise

/**
 * @param {string} name
 * @param {string} fallback
 */
function configuredUrl(name, fallback) {
  const configured = /** @type {Record<string, unknown>} */ (globalThis)[name]
  return typeof configured === "string" && configured ? configured : fallback
}

async function loadCodeMirror() {
  try {
    const [codeMirrorModule, stateModule, viewModule] = await Promise.all([
      import(configuredUrl("PAD_CODEMIRROR_MODULE_URL", CODEMIRROR_MODULE_URL)),
      import(
        configuredUrl("PAD_CODEMIRROR_STATE_MODULE_URL", CODEMIRROR_STATE_MODULE_URL),
      ),
      import(
        configuredUrl("PAD_CODEMIRROR_VIEW_MODULE_URL", CODEMIRROR_VIEW_MODULE_URL),
      ),
    ])
    const markdownModule = await import(
      configuredUrl(
        "PAD_CODEMIRROR_MARKDOWN_MODULE_URL",
        CODEMIRROR_MARKDOWN_MODULE_URL,
      )
    ).catch(() => null)
    const codeMirror = /** @type {Record<string, any>} */ (codeMirrorModule)
    const state = /** @type {Record<string, any>} */ (stateModule)
    const view = /** @type {Record<string, any>} */ (viewModule)
    const markdown =
      markdownModule && typeof markdownModule === "object"
        ? /** @type {{ markdown?: () => any }} */ (markdownModule).markdown
        : undefined

    if (
      typeof state.EditorState !== "function" ||
      typeof state.Compartment !== "function" ||
      typeof view.EditorView !== "function" ||
      !codeMirror.basicSetup
    ) {
      return null
    }

    return {
      EditorState: state.EditorState,
      EditorView: view.EditorView,
      Compartment: state.Compartment,
      basicSetup: codeMirror.basicSetup,
      markdown: typeof markdown === "function" ? markdown : undefined,
    }
  } catch {
    return null
  }
}

export function preloadCodeMirror() {
  codeMirrorPromise ??= loadCodeMirror()
  return codeMirrorPromise
}

/**
 * @param {{
 *   parent: HTMLElement,
 *   root?: Document | ShadowRoot,
 *   value: string,
 *   editable: boolean,
 *   onChange: (value: string) => void,
 *   onBlur: () => void,
 * }} options
 * @returns {Promise<PadCodeMirrorEditor | null>}
 */
export async function createCodeMirrorEditor(options) {
  const codeMirror = await preloadCodeMirror()
  if (!codeMirror) return null

  const editable = new codeMirror.Compartment()
  let applyingExternalValue = false
  const extensions = [
    codeMirror.basicSetup,
    codeMirror.EditorView.lineWrapping,
    editable.of(codeMirror.EditorView.editable.of(options.editable)),
    codeMirror.EditorView.updateListener.of((/** @type {PadCodeMirrorUpdate} */ update) => {
      if (update.docChanged && !applyingExternalValue) {
        options.onChange(update.state.doc.toString())
      }
    }),
  ]
  if (codeMirror.markdown) extensions.splice(1, 0, codeMirror.markdown())

  const view = new codeMirror.EditorView({
    parent: options.parent,
    root: options.root,
    state: codeMirror.EditorState.create({
      doc: options.value,
      extensions,
    }),
  })

  view.dom.addEventListener("focusout", (/** @type {FocusEvent} */ event) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && view.dom.contains(nextTarget)) return
    options.onBlur()
  })

  return {
    destroy: () => view.destroy(),
    focusEnd: () => {
      view.dispatch({ selection: { anchor: view.state.doc.length } })
      view.focus()
    },
    value: () => view.state.doc.toString(),
    setValue: (nextValue) => {
      const value = String(nextValue ?? "")
      if (view.state.doc.toString() === value) return
      applyingExternalValue = true
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: value,
        },
      })
      applyingExternalValue = false
    },
    setEditable: (nextEditable) => {
      view.dispatch({
        effects: editable.reconfigure(
          codeMirror.EditorView.editable.of(nextEditable),
        ),
      })
    },
  }
}

const PAD_CODE_EDITOR_STYLE = `
:host {
  display: block;
  min-width: 0;
  min-height: 2.5rem;
  border-radius: 0.35rem;
  outline: 0 solid transparent;
  color: inherit;
  font: 0.95rem/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: normal;
}
[data-pad-code-editor-fallback] {
  min-height: 2.5rem;
  border-radius: 0.35rem;
  outline: 0 solid transparent;
  white-space: pre-wrap;
}
[data-pad-code-editor-fallback][contenteditable="true"]:focus {
  outline: 2px solid color-mix(in srgb, currentColor 26%, transparent);
  outline-offset: 0.28rem;
}
.cm-editor {
  min-height: 2.5rem;
  border-radius: 0.35rem;
  background: transparent;
  color: inherit;
  font: inherit;
}
.cm-focused {
  outline: 2px solid color-mix(in srgb, currentColor 26%, transparent);
  outline-offset: 0.28rem;
}
.cm-scroller,
.cm-content {
  font: inherit;
}
`

export class PadCodeEditor extends HTMLElement {
  static observedAttributes = ["editable", "language", "value"]

  /** @type {ShadowRoot} */
  #root
  /** @type {HTMLElement | null} */
  #fallback = null
  /** @type {PadCodeMirrorEditor | null} */
  #editor = null
  #value = ""
  #mountId = 0
  #loadingCodeMirror = false
  #focused = false
  #suppressBlur = false

  constructor() {
    super()
    this.#root = this.attachShadow({ mode: "open", delegatesFocus: true })
    this.#root.addEventListener("focusin", () => {
      if (this.#focused) return
      this.#focused = true
      this.dispatchEvent(new FocusEvent("focus"))
    })
    this.#root.addEventListener("focusout", (event) => {
      if (this.#suppressBlur) return
      const focusEvent = /** @type {FocusEvent} */ (event)
      const nextTarget = focusEvent.relatedTarget
      if (nextTarget instanceof Node && this.#root.contains(nextTarget)) return
      setTimeout(() => {
        if (this.#suppressBlur || this.matches(":focus-within")) return
        this.#focused = false
        this.dispatchEvent(new FocusEvent("blur"))
      }, 0)
    })
  }

  connectedCallback() {
    if (!this.#value) {
      this.#value = this.getAttribute("value") ?? this.textContent ?? ""
    }
    this.textContent = ""
    this.#render()
  }

  disconnectedCallback() {
    this.#editor?.destroy()
    this.#editor = null
  }

  /**
   * @param {string} name
   * @param {string | null} _oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, _oldValue, newValue) {
    if (name === "value" && newValue !== null && newValue !== this.#value) {
      this.value = newValue
      return
    }
    if (name === "editable") this.#applyEditableState()
  }

  get value() {
    return this.#editor?.value() ?? this.#fallback?.innerText ?? this.#value
  }

  set value(nextValue) {
    this.#setValue(String(nextValue ?? ""), false)
  }

  get editable() {
    return this.hasAttribute("editable")
  }

  set editable(nextEditable) {
    this.toggleAttribute("editable", Boolean(nextEditable))
  }

  get language() {
    return this.getAttribute("language") ?? ""
  }

  /**
   * @param {FocusOptions} [options]
   * @override
   */
  focus(options) {
    this.focusEnd(options)
  }

  /** @param {{ preventScroll?: boolean }} [options] */
  focusEnd(options) {
    if (!this.#editor) void this.#ensureCodeMirror(true)
    if (this.#editor) {
      this.#editor.focusEnd()
      return
    }
    const fallback = this.#fallback
    if (!fallback) return
    fallback.focus(options)
    const doc = fallback.ownerDocument
    const selection = doc.defaultView?.getSelection()
    if (!selection) return
    const range = doc.createRange()
    range.selectNodeContents(fallback)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  #render() {
    this.#mountId += 1
    this.#loadingCodeMirror = false
    this.#editor?.destroy()
    this.#editor = null
    this.#root.innerHTML = `<style>${PAD_CODE_EDITOR_STYLE}</style><div data-pad-code-editor-mount></div>`
    const mount = this.#root.querySelector("[data-pad-code-editor-mount]")
    if (!(mount instanceof HTMLElement)) return

    this.#mountFallback(mount)
  }

  /** @param {HTMLElement} mount */
  #mountFallback(mount) {
    const fallback = document.createElement("div")
    fallback.dataset.padCodeEditorFallback = ""
    fallback.setAttribute("role", "textbox")
    fallback.setAttribute("aria-multiline", "true")
    fallback.spellcheck = true
    fallback.textContent = this.#value
    fallback.addEventListener("input", () => {
      this.#setValue(fallback.innerText, true)
    })
    mount.replaceChildren(fallback)
    this.#fallback = fallback
    this.#applyEditableState()
  }

  /** @param {boolean} focusWhenReady */
  #ensureCodeMirror(focusWhenReady = false) {
    if (this.#editor || this.#loadingCodeMirror) return
    const mount = this.#root.querySelector("[data-pad-code-editor-mount]")
    if (!(mount instanceof HTMLElement)) return
    this.#loadingCodeMirror = true
    void this.#mountCodeMirror(mount, this.#mountId, focusWhenReady)
  }

  /**
   * @param {HTMLElement} mount
   * @param {number} mountId
   * @param {boolean} focusWhenReady
   */
  async #mountCodeMirror(mount, mountId, focusWhenReady) {
    const wasFocused = focusWhenReady || this.#root.activeElement === this.#fallback
    const editorMount = document.createElement("div")
    const editor = await createCodeMirrorEditor({
      parent: editorMount,
      root: this.#root,
      value: this.#value,
      editable: this.editable,
      onChange: (value) => this.#setValue(value, true),
      onBlur: () => {},
    })
    this.#loadingCodeMirror = false

    if (!editor || mountId !== this.#mountId || !this.isConnected) {
      editor?.destroy()
      return
    }

    this.#suppressBlur = true
    mount.replaceChildren(editorMount)
    this.#fallback = null
    this.#editor = editor
    this.#applyEditableState()
    if (wasFocused) this.focusEnd()
    setTimeout(() => {
      this.#suppressBlur = false
    }, 0)
  }

  #applyEditableState() {
    this.setAttribute("aria-disabled", this.editable ? "false" : "true")
    this.#editor?.setEditable(this.editable)
    if (this.#fallback) {
      this.#fallback.setAttribute(
        "contenteditable",
        this.editable ? "true" : "false",
      )
    }
  }

  /**
   * @param {string} value
   * @param {boolean} emitInput
   */
  #setValue(value, emitInput) {
    if (value === this.#value) return
    this.#value = value
    if (this.#fallback && this.#fallback.innerText !== value) {
      this.#fallback.textContent = value
    }
    if (!emitInput) this.#editor?.setValue(value)
    if (emitInput) {
      this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }))
    }
  }
}

export function registerPadCodeEditorElement() {
  defineElement("pad-code-editor", PadCodeEditor)
}
