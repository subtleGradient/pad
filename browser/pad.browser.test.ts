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

      const editors = root.querySelectorAll("[data-pad-message-editor]")
      const blankEditor = editors[1]
      if (!(blankEditor instanceof HTMLElement)) {
        throw new Error("blank message editor missing")
      }
      blankEditor.textContent = "New *message*"
      blankEditor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          data: "New *message*",
          inputType: "insertText",
        }),
      )

      await new Promise((resolve) => setTimeout(resolve, 260))

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
