import { expect, test } from "bun:test"
import puppeteer from "puppeteer-core"

declare global {
  interface Window {
    __padSends: string[]
  }
}

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const hasChrome = await Bun.file(chromePath).exists()
const browserTest = hasChrome ? test : test.skip

const fakeCodeMirrorBasicModule = `
export const basicSetup = [{ type: "basicSetup" }]
`

const fakeCodeMirrorStateModule = `
function docFromText(text) {
  const value = String(text ?? "")
  return {
    length: value.length,
    toString() {
      return value
    },
  }
}

export class EditorState {
  constructor(doc, extensions = []) {
    this.doc = docFromText(doc)
    this.extensions = extensions
  }

  static create(options) {
    return new EditorState(options?.doc ?? "", options?.extensions ?? [])
  }
}

export class Compartment {
  of(extension) {
    return { type: "compartment", extension }
  }

  reconfigure(extension) {
    return { type: "reconfigure", extension }
  }
}
`

const fakeCodeMirrorViewModule = `
function flatten(extensions, result = []) {
  for (const extension of extensions ?? []) {
    if (Array.isArray(extension)) {
      flatten(extension, result)
    } else if (extension?.type === "compartment") {
      result.push(extension.extension)
    } else if (extension) {
      result.push(extension)
    }
  }
  return result
}

export class EditorView {
  static lineWrapping = { type: "lineWrapping" }
  static editable = {
    of(editable) {
      return { type: "editable", editable }
    },
  }
  static updateListener = {
    of(listener) {
      return { type: "updateListener", listener }
    },
  }

  constructor(options) {
    this.state = options.state
    if (
      options.root &&
      !options.root.querySelector("style[data-fake-codemirror-style]")
    ) {
      const style = document.createElement("style")
      style.dataset.fakeCodemirrorStyle = ""
      style.textContent = ".cm-editor { display: block; }"
      options.root.append(style)
    }
    this.dom = document.createElement("div")
    this.dom.className = "cm-editor"
    this.contentDOM = document.createElement("div")
    this.contentDOM.className = "cm-content"
    this.contentDOM.setAttribute("role", "textbox")
    this.contentDOM.textContent = this.state.doc.toString()
    this.dom.append(this.contentDOM)
    options.parent.append(this.dom)
    this.syncExtensions()
    this.contentDOM.addEventListener("focus", () => {
      this.dom.classList.add("cm-focused")
    })
    this.contentDOM.addEventListener("blur", () => {
      this.dom.classList.remove("cm-focused")
    })
    this.contentDOM.addEventListener("input", () => {
      this.state = this.state.constructor.create({
        doc: this.contentDOM.innerText,
        extensions: this.state.extensions,
      })
      for (const listener of this.updateListeners) {
        listener({ docChanged: true, state: this.state })
      }
    })
  }

  syncExtensions() {
    const extensions = flatten(this.state.extensions)
    const editable = extensions.find((extension) => extension.type === "editable")
    this.contentDOM.contentEditable = editable?.editable === false ? "false" : "true"
    this.updateListeners = extensions
      .filter((extension) => extension.type === "updateListener")
      .map((extension) => extension.listener)
  }

  dispatch(spec) {
    if (spec?.changes) {
      this.contentDOM.textContent = spec.changes.insert
      this.state = this.state.constructor.create({
        doc: spec.changes.insert,
        extensions: this.state.extensions,
      })
    }
    if (spec?.effects?.type === "reconfigure") {
      this.state.extensions = this.state.extensions.map((extension) =>
        extension?.type === "compartment"
          ? { ...extension, extension: spec.effects.extension }
          : extension,
      )
      this.syncExtensions()
    }
  }

  focus() {
    this.contentDOM.focus()
  }

  destroy() {
    this.dom.remove()
  }
}
`

const fakeCodeMirrorMarkdownModule = `
export function markdown() {
  return { type: "markdown" }
}
`

browserTest("pad-chat uses shadow list UI and saves semantic markdown source", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/") {
        return new Response(
          `<!doctype html>
<meta charset="utf-8" />
<script>
window.PAD_MARKDOWN_MARKED_URL = "/missing-marked.js"
window.PAD_MARKDOWN_DOMPURIFY_URL = "/missing-dompurify.js"
window.PAD_CODEMIRROR_MODULE_URL = "/fake-codemirror-basic.js"
window.PAD_CODEMIRROR_STATE_MODULE_URL = "/fake-codemirror-state.js"
window.PAD_CODEMIRROR_VIEW_MODULE_URL = "/fake-codemirror-view.js"
window.PAD_CODEMIRROR_MARKDOWN_MODULE_URL = "/fake-codemirror-markdown.js"
window.__padSends = []
class FakeWebSocket {
  static OPEN = 1
  readyState = 0
  listeners = new Map()
  constructor(url) {
    this.url = url
    setTimeout(() => {
      this.readyState = FakeWebSocket.OPEN
      this.emit("open", new Event("open"))
    }, 0)
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }
  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
  send(data) {
    window.__padSends.push(String(data))
    queueMicrotask(() => {
      this.emit("message", {
        data: JSON.stringify({ type: "saved", savedAt: "2026-05-01T00:00:00.000Z" }),
      })
    })
  }
  close() {
    this.readyState = 3
    this.emit("close", new Event("close"))
  }
}
window.WebSocket = FakeWebSocket
</script>
<link rel="stylesheet" href="/pad.css" />
<script type="module" src="/pad.browser.js"></script>
<pad-document>
  <pad-chat>
    <pad-message role="user">**Hello**</pad-message>
  </pad-chat>
</pad-document>`,
          { headers: { "content-type": "text/html; charset=utf-8" } },
        )
      }
      if (url.pathname === "/pad.css") {
        return new Response(Bun.file("pad.css"), {
          headers: { "content-type": "text/css; charset=utf-8" },
        })
      }
      if (url.pathname === "/pad.browser.js") {
        return new Response(Bun.file("pad.browser.js"), {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        })
      }
      if (/^\/browser\/[A-Za-z0-9._-]+\.js$/.test(url.pathname)) {
        return new Response(Bun.file(`.${url.pathname}`), {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        })
      }
      if (url.pathname === "/fake-codemirror-basic.js") {
        return new Response(fakeCodeMirrorBasicModule, {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        })
      }
      if (url.pathname === "/fake-codemirror-state.js") {
        return new Response(fakeCodeMirrorStateModule, {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        })
      }
      if (url.pathname === "/fake-codemirror-view.js") {
        return new Response(fakeCodeMirrorViewModule, {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        })
      }
      if (url.pathname === "/fake-codemirror-markdown.js") {
        return new Response(fakeCodeMirrorMarkdownModule, {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        })
      }
      return new Response("not found", { status: 404 })
    },
  })

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  })

  try {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.port}/`)
    await page.waitForFunction(() => customElements.get("pad-chat"))
    await page.waitForFunction(() => document.body.hasAttribute("data-pad-editable"))

    const result = await page.evaluate(async () => {
      const chat = document.querySelector("pad-chat")
      if (!chat?.shadowRoot) throw new Error("pad-chat shadow root missing")
      const root = chat.shadowRoot
      const firstSelect = root.querySelector("select")
      if (!(firstSelect instanceof HTMLSelectElement)) {
        throw new Error("role select missing")
      }
      firstSelect.value = "assistant"
      firstSelect.dispatchEvent(new Event("change", { bubbles: true }))

      const initialPreview = root.querySelector("[data-pad-markdown-preview]")
      const initialEditor = root.querySelector("[data-pad-message-editor]")
      if (
        !(initialPreview instanceof HTMLElement) ||
        !(initialEditor instanceof HTMLElement)
      ) {
        throw new Error("initial chat surfaces missing")
      }
      const initialPreviewDisplay = getComputedStyle(initialPreview).display
      const initialEditorDisplay = getComputedStyle(initialEditor).display

      const editors = root.querySelectorAll("[data-pad-message-editor]")
      const previews = root.querySelectorAll("[data-pad-markdown-preview]")
      const blankPreview = previews[1]
      const blankEditor = editors[1]
      if (
        !(blankPreview instanceof HTMLElement) ||
        !(blankEditor instanceof HTMLElement)
      ) {
        throw new Error("blank message editor missing")
      }
      async function waitForCodeMirrorContent(editor: Element) {
        for (let attempts = 0; attempts < 25; attempts += 1) {
          const element = editor.shadowRoot?.querySelector(".cm-content")
          if (element instanceof HTMLElement) return element
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
        throw new Error("CodeMirror content did not appear.")
      }

      blankPreview.click()
      const codeMirrorContent = await waitForCodeMirrorContent(blankEditor)
      codeMirrorContent.focus()
      codeMirrorContent.textContent = "New *message*"
      codeMirrorContent.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          data: "New *message*",
          inputType: "insertText",
        }),
      )

      await new Promise((resolve) => setTimeout(resolve, 260))
      const focusedEditor = root.activeElement
      const focusedItem = focusedEditor?.closest("pad-list-item")
      const focusedMessageEditor = focusedItem?.querySelector(
        "[data-pad-message-editor]",
      )
      const messageEditors = Array.from(
        root.querySelectorAll("[data-pad-message-editor]"),
      )
      const codeMirrorEditor = messageEditors.find((editor) =>
        editor.shadowRoot?.querySelector(".cm-editor"),
      )
      const focusedPreview = (
        codeMirrorEditor ?? focusedMessageEditor
      )?.closest("pad-list-item")?.querySelector("[data-pad-markdown-preview]")

      const bodySends = window.__padSends
        .map((text: string) => JSON.parse(text) as { type?: string; html?: string })
        .filter((message: { type?: string }) => message.type === "body")
      const messages = Array.from(document.querySelectorAll("pad-message")).map(
        (message) => ({
          role: message.getAttribute("role"),
          text: message.textContent?.trim(),
        }),
      )
      return {
        messages,
        itemCount: root.querySelectorAll("pad-list-item").length,
        codeMirrorCount: messageEditors.filter((editor) =>
          editor.shadowRoot?.querySelector(".cm-editor"),
        ).length,
        codeMirrorStyleInShadow:
          blankEditor.shadowRoot?.querySelector(
            "style[data-fake-codemirror-style]",
          ) !== null,
        focusedEditorUsesCodeMirror: codeMirrorEditor === blankEditor,
        codeMirrorItemEditing: codeMirrorEditor
          ?.closest("pad-list-item")
          ?.hasAttribute("data-pad-editing"),
        activeElementName: root.activeElement?.localName ?? null,
        initialPreviewDisplay,
        initialEditorDisplay,
        focusedPreviewDisplay:
          focusedPreview instanceof HTMLElement
            ? getComputedStyle(focusedPreview).display
            : null,
        focusedText:
          codeMirrorEditor instanceof HTMLElement && "value" in codeMirrorEditor
            ? String(codeMirrorEditor.value)
            : null,
        previewHtml:
          root.querySelector("[data-pad-markdown-preview]")?.innerHTML ?? "",
        bodyHtml: bodySends.at(-1)?.html ?? "",
      }
    })

    expect(result.messages).toEqual([
      { role: "assistant", text: "**Hello**" },
      { role: "user", text: "New *message*" },
      { role: "user", text: "" },
    ])
    expect(result.itemCount).toBe(3)
    expect(result.codeMirrorCount).toBe(1)
    expect(result.codeMirrorStyleInShadow).toBe(true)
    expect(result.focusedEditorUsesCodeMirror).toBe(true)
    expect(result.initialPreviewDisplay).not.toBe("none")
    expect(result.initialEditorDisplay).toBe("none")
    expect(result.focusedText).toBe("New *message*")
    expect(result.previewHtml).toContain("<strong>Hello</strong>")
    expect(result.bodyHtml).toContain("<pad-chat")
    expect(result.bodyHtml).toContain('role="assistant"')
    expect(result.bodyHtml).toContain("**Hello**")
    expect(result.bodyHtml).toContain("New *message*")
    expect(result.bodyHtml).not.toContain("data-pad-markdown-preview")
    expect(result.bodyHtml).not.toContain("pad-list-item")
  } finally {
    await browser.close()
    server.stop(true)
  }
})
