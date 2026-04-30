import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ClientState,
  PadApplication,
  bodySplitIndex,
  contentType,
  documentKindForPath,
  exportOpenCodeChatSession,
  replaceBody,
  stripShebang,
  type PadDependencies,
  type WebSocketData,
} from "./pad.shebang.tsx"
import {
  appendOpenCodeBundlesToChatSource,
  extractChatSessionId,
  renderChatDocument,
  type OpenCodeMessageBundle,
  type OpenCodeSessionLike,
} from "./oc-chat.ts"

const BRANCH = "pad-oc"

const publicShebang = `#!/usr/bin/env -S bunx --bun -p https://github.com/subtleGradient/pad/archive/refs/heads/${BRANCH}.tar.gz pad`
const cdn = `https://cdn.jsdelivr.net/gh/subtleGradient/pad@refs/heads/${BRANCH}`
const publicCss = `${cdn}/pad.css`
const publicJs = `${cdn}/pad.browser.js`
const replacementBody = `<pad-document>
  <pad-text>Changed body</pad-text>
</pad-document>`
const unitPadPath = "/tmp/unit.pad.htm"
const unitChatPath = "/tmp/unit.chat.html"
const unitPadSource = `#!/usr/bin/env -S bun ./pad.shebang.tsx
<!doctype html>
<meta charset="utf-8">
<script type="module" src="./pad.browser.js"></script>

<pad-document>
  <pad-text>Before</pad-text>
</pad-document>
`
const unitChatSession: OpenCodeSessionLike = {
  id: "ses_unit",
  title: "Unit Chat",
  projectID: "proj_unit",
  directory: "/tmp/project",
  version: "1.0.0",
  time: {
    created: Date.parse("2026-04-30T12:00:00.000Z"),
    updated: Date.parse("2026-04-30T12:01:00.000Z"),
  },
}
const existingChatMessage: OpenCodeMessageBundle = {
  info: {
    id: "msg_existing",
    sessionID: "ses_unit",
    role: "user",
    time: { created: Date.parse("2026-04-30T12:00:00.000Z") },
    system: "You are OpenCode.",
    agent: "build",
    model: { providerID: "openai", modelID: "gpt-5.5" },
  },
  parts: [
    {
      id: "part_existing_text",
      sessionID: "ses_unit",
      messageID: "msg_existing",
      type: "text",
      text: "Existing prompt",
    },
  ],
}
const newChatUserMessage: OpenCodeMessageBundle = {
  info: {
    id: "msg_new_user",
    sessionID: "ses_unit",
    role: "user",
    time: { created: Date.parse("2026-04-30T12:02:00.000Z") },
  },
  parts: [
    {
      id: "part_new_user_text",
      sessionID: "ses_unit",
      messageID: "msg_new_user",
      type: "text",
      text: "Continue please",
    },
  ],
}
const newChatAssistantMessage: OpenCodeMessageBundle = {
  info: {
    id: "msg_new_assistant",
    sessionID: "ses_unit",
    role: "assistant",
    time: {
      created: Date.parse("2026-04-30T12:02:01.000Z"),
      completed: Date.parse("2026-04-30T12:02:03.000Z"),
    },
    providerID: "openai",
    modelID: "gpt-5.5",
    mode: "build",
    cost: 0.01,
  },
  parts: [
    {
      id: "part_tool",
      sessionID: "ses_unit",
      messageID: "msg_new_assistant",
      type: "tool",
      callID: "call_1",
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "bun test" },
        output: "pass",
        title: "Runs tests",
        metadata: {},
        time: { start: 1, end: 2 },
      },
    },
    {
      id: "part_new_assistant_text",
      sessionID: "ses_unit",
      messageID: "msg_new_assistant",
      type: "text",
      text: "Done.",
    },
  ],
}
const unitChatSource = renderChatDocument({
  session: unitChatSession,
  messages: [existingChatMessage],
  exportedAt: new Date("2026-04-30T12:01:00.000Z"),
})

type ServeOptions = Parameters<PadDependencies["server"]["serve"]>[0]
type FetchHandler = (
  request: Request,
  server: Bun.Server<WebSocketData>,
) => Response | Promise<Response | undefined> | undefined
type WebSocketHandlers = {
  open(ws: Bun.ServerWebSocket<WebSocketData>): void
  message(
    ws: Bun.ServerWebSocket<WebSocketData>,
    raw: string | Buffer,
  ): void | Promise<void>
  close(ws: Bun.ServerWebSocket<WebSocketData>): void
}

function getFetch(options: ServeOptions): FetchHandler {
  const fetch = (options as { fetch?: unknown }).fetch
  if (typeof fetch !== "function") throw new Error("Expected fetch handler.")
  return fetch as FetchHandler
}

function getWebSocketHandlers(options: ServeOptions): WebSocketHandlers {
  const websocket = (options as { websocket?: unknown }).websocket
  if (!websocket) throw new Error("Expected WebSocket handlers.")
  return websocket as WebSocketHandlers
}

function makeRequest(path: string) {
  return new Request(`http://127.0.0.1:1234${path}`)
}

function makeSocket(client: ClientState) {
  const sent: string[] = []
  const socket = {
    data: { client },
    send(data: string | BufferSource) {
      sent.push(String(data))
      return 1
    },
  } as unknown as Bun.ServerWebSocket<WebSocketData>

  return { socket, sent }
}

async function createPadHarness({
  ids = [],
  dates = [],
  source = unitPadSource,
  padPath = unitPadPath,
  upgradeResult = true,
  openCode,
}: {
  ids?: string[]
  dates?: Date[]
  source?: string
  padPath?: string
  upgradeResult?: boolean
  openCode?: PadDependencies["openCode"]
} = {}) {
  let currentSource = source
  const writes: { path: string; text: string }[] = []
  const logs: string[] = []
  const errors: string[] = []
  const openedUrls: string[] = []
  const stopCalls: (boolean | undefined)[] = []
  const upgradeCalls: WebSocketData[] = []
  const watches: { path: string; onChange: () => void; closed: boolean }[] = []
  const idQueue = ["app-token", ...ids]
  const dateQueue = [...dates]
  let serveOptions: ServeOptions | undefined

  const fakeServer = {
    port: 4321,
    stop(force?: boolean) {
      stopCalls.push(force)
    },
    upgrade(_request: Request, options: { data: WebSocketData }) {
      upgradeCalls.push(options.data)
      return upgradeResult
    },
  } as unknown as Bun.Server<WebSocketData>

  const dependencies: PadDependencies = {
    files: {
      async readText() {
        return currentSource
      },
      async writeText(path, text) {
        writes.push({ path, text })
        currentSource = text
      },
    },
    browser: {
      open(url) {
        openedUrls.push(url)
      },
    },
    logger: {
      info(message) {
        logs.push(message)
      },
      error(message) {
        errors.push(message)
      },
    },
    ids: {
      nextId() {
        const id = idQueue.shift()
        if (!id) throw new Error("No fake ID available.")
        return id
      },
    },
    clock: {
      now() {
        return dateQueue.shift() ?? new Date("2026-04-30T12:00:00.000Z")
      },
    },
    server: {
      serve(options) {
        serveOptions = options
        return fakeServer
      },
    },
    watcher: {
      watch(path, onChange) {
        const watch = { path, onChange, closed: false }
        watches.push(watch)
        return {
          close() {
            watch.closed = true
          },
        }
      },
    },
    openCode:
      openCode ??
      ({
        async session() {
          throw new Error("Unexpected OpenCode session call.")
        },
        async messages() {
          throw new Error("Unexpected OpenCode messages call.")
        },
        async prompt() {
          throw new Error("Unexpected OpenCode prompt call.")
        },
      } satisfies PadDependencies["openCode"]),
  }

  const app = await PadApplication.create(padPath, dependencies)
  await app.start()

  if (app.state.firstClientTimer) {
    clearTimeout(app.state.firstClientTimer)
    app.state.firstClientTimer = undefined
  }

  if (!serveOptions) throw new Error("Server was not started.")

  return {
    app,
    dependencies,
    fakeServer,
    fetch: getFetch(serveOptions),
    websocket: getWebSocketHandlers(serveOptions),
    writes,
    logs,
    errors,
    openedUrls,
    stopCalls,
    upgradeCalls,
    watches,
    setSource(nextSource: string) {
      currentSource = nextSource
    },
    triggerWatch(fileName: string) {
      const watch = watches.find((watch) => watch.path.endsWith(fileName))
      if (!watch) throw new Error(`No watch registered for ${fileName}.`)
      watch.onChange()
    },
  }
}

async function waitForServerUrl(
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">,
  output: {
    stdout: string
    stderr: string
  },
): Promise<string> {
  const decoder = new TextDecoder()
  let resolved = false

  void (async () => {
    const reader = proc.stderr.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      output.stderr += decoder.decode(value)
    }
  })()

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for PAD server URL. stdout=${output.stdout} stderr=${output.stderr}`,
        ),
      )
    }, 5_000)

    void (async () => {
      const reader = proc.stdout.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        output.stdout += decoder.decode(value)
        const match = /http:\/\/127\.0\.0\.1:\d+\/\?t=[a-f0-9]+/.exec(
          output.stdout,
        )
        if (match && !resolved) {
          resolved = true
          clearTimeout(timer)
          resolve(match[0])
        }
      }
      if (!resolved) {
        clearTimeout(timer)
        reject(
          new Error(
            `PAD server exited before printing a URL. stdout=${output.stdout} stderr=${output.stderr}`,
          ),
        )
      }
    })().catch((error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function waitForSaved(url: string, bodyHtml: string) {
  const ws = new WebSocket(
    url.replace("http://", "ws://").replace("/?", "/ws?"),
  )
  try {
    await new Promise<true>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Timed out waiting for PAD save confirmation."))
      }, 5_000)

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ type: "body", html: bodyHtml }))
      })

      ws.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data))
        if (message.type === "saved") {
          clearTimeout(timer)
          resolve(true)
        }
        if (message.type === "error") {
          clearTimeout(timer)
          reject(new Error(message.message))
        }
      })

      ws.addEventListener("error", () => {
        clearTimeout(timer)
        reject(new Error("PAD WebSocket error."))
      })
    })
  } finally {
    ws.close()
  }
}

describe("stripShebang", () => {
  test("removes only the executable first line", () => {
    const source = `${publicShebang}\n<!doctype html>\n<pad-document></pad-document>\n`

    expect(stripShebang(source)).toBe(
      "<!doctype html>\n<pad-document></pad-document>\n",
    )
  })

  test("leaves non-executable documents unchanged", () => {
    const source = "<!doctype html>\n<pad-document></pad-document>\n"

    expect(stripShebang(source)).toBe(source)
  })
})

describe("replaceBody", () => {
  test("replaces the body after a local browser script", async () => {
    const source = await Bun.file("DEV.pad.htm").text()
    const replaced = replaceBody(source, replacementBody)

    expect(bodySplitIndex(source)).toBeGreaterThan(0)
    expect(replaced).toContain('href="./pad.css"')
    expect(replaced).toContain(
      '<script type="module" src="./pad.browser.js"></script>',
    )
    expect(replaced).toContain(replacementBody)
    expect(replaced).not.toContain(
      "local shebang runner and local browser assets",
    )
    expect(replaced.endsWith("\n")).toBe(true)
  })

  test("replaces the body after a jsDelivr browser script", async () => {
    const source = await Bun.file("SPEC.pad.htm").text()
    const replaced = replaceBody(source, replacementBody)

    expect(bodySplitIndex(source)).toBeGreaterThan(0)
    expect(replaced).toContain(publicCss)
    expect(replaced).toContain(publicJs)
    expect(replaced).toContain(replacementBody)
    expect(replaced).not.toContain("first simple PAD demo")
    expect(replaced.endsWith("\n")).toBe(true)
  })

  test("matches browser script URLs with query strings", () => {
    const source = `<!doctype html>
<script type="module" src="/pad.browser.js?cache=1"></script>

<pad-document><pad-text>Old</pad-text></pad-document>
`

    expect(replaceBody(source, replacementBody)).toBe(`<!doctype html>
<script type="module" src="/pad.browser.js?cache=1"></script>

${replacementBody}
`)
  })

  test("throws when the source has no PAD browser script", () => {
    expect(() =>
      replaceBody("<!doctype html>\n<main></main>\n", replacementBody),
    ).toThrow(
      "PAD source must include a pad.browser.js script before the body content.",
    )
  })
})

describe("PAD entry documents", () => {
  test("SPEC pins the GitHub runner and jsDelivr assets to pad-oc", async () => {
    const source = await Bun.file("SPEC.pad.htm").text()

    expect(source.startsWith(`${publicShebang}\n`)).toBe(true)
    expect(source).toContain(publicCss)
    expect(source).toContain(publicJs)
    expect(source).not.toContain("@main")
    expect(source).not.toContain("github:subtleGradient/pad#pad-oc")
  })

  test("DEV uses only local runner and browser assets", async () => {
    const source = await Bun.file("DEV.pad.htm").text()

    expect(source.startsWith("#!/usr/bin/env -S bun ./pad.shebang.tsx\n")).toBe(
      true,
    )
    expect(source).toContain('href="./pad.css"')
    expect(source).toContain(
      '<script type="module" src="./pad.browser.js"></script>',
    )
    expect(source).not.toContain("cdn.jsdelivr.net")
  })
})

describe("contentType", () => {
  test("serves known browser asset and HTML types", () => {
    expect(contentType("pad.css")).toBe("text/css; charset=utf-8")
    expect(contentType("pad.browser.js")).toBe("text/javascript; charset=utf-8")
    expect(contentType("SPEC.pad.htm")).toBe("text/html; charset=utf-8")
    expect(contentType("note.txt")).toBe("text/plain; charset=utf-8")
  })
})

describe("documentKindForPath", () => {
  test("recognizes PAD and OpenCode chat documents", () => {
    expect(documentKindForPath("demo.pad.htm")).toBe("pad")
    expect(documentKindForPath("demo.chat.html")).toBe("chat")
    expect(documentKindForPath("demo.html")).toBeUndefined()
  })
})

describe("OC chat serializer", () => {
  test("renders semantic custom elements with raw SDK JSON", () => {
    const source = renderChatDocument({
      session: unitChatSession,
      messages: [existingChatMessage, newChatAssistantMessage],
      exportedAt: new Date("2026-04-30T12:03:00.000Z"),
    })

    expect(source).toContain('<meta name="oc-chat-format"')
    expect(source).toContain("<oc-chat")
    expect(source).toContain("<oc-system-prompt")
    expect(source).toContain("<oc-user-message")
    expect(source).toContain("<oc-assistant-message")
    expect(source).toContain("<oc-tool-call")
    expect(source).toContain('type="application/json" data-oc-message')
    expect(source).toContain('type="application/json" data-oc-part')
    expect(extractChatSessionId(source)).toBe("ses_unit")
  })

  test("appends only messages that are not already archived", () => {
    const appended = appendOpenCodeBundlesToChatSource(unitChatSource, [
      existingChatMessage,
      newChatUserMessage,
      newChatAssistantMessage,
    ])

    expect(appended.match(/data-message-id="msg_existing"/g)).toHaveLength(2)
    expect(appended).toContain('data-message-id="msg_new_user"')
    expect(appended).toContain('data-message-id="msg_new_assistant"')
    expect(appended.indexOf('data-message-id="msg_new_user"')).toBeLessThan(
      appended.indexOf("</oc-transcript>"),
    )
  })

  test("exports a chat document from an OpenCode session", async () => {
    const writes: { path: string; text: string }[] = []
    const logs: string[] = []
    const dependencies: PadDependencies = {
      files: {
        async readText() {
          throw new Error("Unexpected read.")
        },
        async writeText(path, text) {
          writes.push({ path, text })
        },
      },
      browser: { open() {} },
      logger: {
        info(message) {
          logs.push(message)
        },
        error() {},
      },
      ids: { nextId: () => "app-token" },
      clock: { now: () => new Date("2026-04-30T12:04:00.000Z") },
      server: {
        serve() {
          throw new Error("Unexpected serve.")
        },
      },
      watcher: {
        watch() {
          throw new Error("Unexpected watch.")
        },
      },
      openCode: {
        async session(id) {
          expect(id).toBe("ses_unit")
          return unitChatSession
        },
        async messages(id) {
          expect(id).toBe("ses_unit")
          return [existingChatMessage]
        },
        async prompt() {
          throw new Error("Unexpected prompt.")
        },
      },
    }

    await exportOpenCodeChatSession("ses_unit", unitChatPath, dependencies)

    expect(writes).toHaveLength(1)
    expect(writes[0]?.path).toBe(unitChatPath)
    expect(writes[0]?.text).toContain("<oc-chat")
    expect(logs).toEqual(["unit.chat.html: exported ses_unit"])
  })
})

describe("ClientState", () => {
  test("sends through its attached socket and becomes inert after detach", () => {
    const client = new ClientState("client-1", new Date("2026-04-30T12:00:00Z"))
    const { socket, sent } = makeSocket(client)

    client.attach(socket)
    client.send({ type: "ready" })
    client.sendText("raw")
    client.detach()
    client.send({ type: "ignored" })

    expect(sent).toEqual(['{"type":"ready"}', "raw"])
  })
})

describe("browser runtime", () => {
  test("reloads the page when the server broadcasts a reload message", async () => {
    const source = await Bun.file("pad.browser.js").text()
    const sockets: {
      listeners: Record<string, (event: { data: string }) => void>
    }[] = []
    const status = {
      dataset: {} as Record<string, string>,
      textContent: "",
      set message(value: string) {
        this.textContent = value
      },
    }
    let reloads = 0

    class FakeHTMLElement {}
    class FakeWebSocket {
      static OPEN = 1
      readyState = FakeWebSocket.OPEN
      listeners: Record<string, (event: { data: string }) => void> = {}

      constructor() {
        sockets.push(this)
      }

      addEventListener(
        type: string,
        listener: (event: { data: string }) => void,
      ) {
        this.listeners[type] = listener
      }

      send() {}
    }

    const runBrowserRuntime = new Function(
      "customElements",
      "HTMLElement",
      "document",
      "WebSocket",
      "location",
      "window",
      source,
    )
    runBrowserRuntime(
      { get: () => undefined, define: () => {} },
      FakeHTMLElement,
      {
        readyState: "complete",
        querySelector: () => status,
        createElement: () => status,
        body: {
          append() {},
          addEventListener() {},
        },
      },
      FakeWebSocket,
      {
        protocol: "http:",
        host: "127.0.0.1:4321",
        search: "?t=apptoken",
        reload() {
          reloads += 1
        },
      },
      {
        clearTimeout,
        setTimeout,
        addEventListener() {},
      },
    )

    sockets[0]?.listeners.message?.({
      data: JSON.stringify({ type: "reload", paths: ["pad.css"] }),
    })

    expect(reloads).toBe(1)
  })
})

describe("PadApplication unit runtime", () => {
  test("stores a fresh ClientState in WebSocketData during upgrade", async () => {
    const connectedAt = new Date("2026-04-30T12:34:00.000Z")
    const harness = await createPadHarness({
      ids: ["client-1"],
      dates: [connectedAt],
    })

    const response = await harness.fetch(
      makeRequest("/ws?t=apptoken"),
      harness.fakeServer,
    )

    expect(response).toBeUndefined()
    expect(harness.upgradeCalls).toHaveLength(1)
    const client = harness.upgradeCalls[0]?.client
    expect(client).toBeInstanceOf(ClientState)
    expect(client?.id).toBe("client-1")
    expect(client?.createdAt).toEqual(connectedAt)
    expect(harness.app.state.clients.size).toBe(0)
  })

  test("opens and closes clients through AppState without retaining sockets", async () => {
    const harness = await createPadHarness()
    const client = new ClientState("client-1", new Date("2026-04-30T12:00:00Z"))
    const { socket, sent } = makeSocket(client)

    harness.websocket.open(socket)

    expect(harness.app.state.hasHadClient).toBe(true)
    expect(harness.app.state.clients.has(client)).toBe(true)
    expect(JSON.parse(sent[0] ?? "{}")).toEqual({
      type: "ready",
      fileName: "unit.pad.htm",
    })

    harness.websocket.close(socket)
    if (harness.app.state.idleTimer) clearTimeout(harness.app.state.idleTimer)
    client.send({ type: "after-close" })

    expect(harness.app.state.clients.has(client)).toBe(false)
    expect(sent).toHaveLength(1)
  })

  test("saves body messages through injected files and broadcasts once", async () => {
    const harness = await createPadHarness({
      dates: [new Date("2026-04-30T12:45:00.000Z")],
    })
    const sender = new ClientState("sender", new Date("2026-04-30T12:00:00Z"))
    const observer = new ClientState(
      "observer",
      new Date("2026-04-30T12:01:00Z"),
    )
    const senderSocket = makeSocket(sender)
    const observerSocket = makeSocket(observer)
    const changedBody = `<pad-document>
  <pad-text>Saved from unit test</pad-text>
</pad-document>`

    harness.websocket.open(senderSocket.socket)
    harness.websocket.open(observerSocket.socket)
    await harness.websocket.message(
      senderSocket.socket,
      JSON.stringify({ type: "body", html: changedBody }),
    )

    expect(harness.writes).toEqual([
      {
        path: unitPadPath,
        text: replaceBody(unitPadSource, changedBody),
      },
    ])
    expect(harness.app.state.saveCount).toBe(1)
    expect(harness.logs).toContain("[save 1] unit.pad.htm")
    expect(JSON.parse(senderSocket.sent.at(-1) ?? "{}")).toEqual({
      type: "saved",
      savedAt: "2026-04-30T12:45:00.000Z",
      saveCount: 1,
    })
    expect(JSON.parse(observerSocket.sent.at(-1) ?? "{}")).toEqual({
      type: "saved",
      savedAt: "2026-04-30T12:45:00.000Z",
      saveCount: 1,
    })
  })

  test("reports bad WebSocket messages only to the sender without writing", async () => {
    const harness = await createPadHarness()
    const sender = new ClientState("sender", new Date("2026-04-30T12:00:00Z"))
    const observer = new ClientState(
      "observer",
      new Date("2026-04-30T12:01:00Z"),
    )
    const senderSocket = makeSocket(sender)
    const observerSocket = makeSocket(observer)

    harness.websocket.open(senderSocket.socket)
    harness.websocket.open(observerSocket.socket)
    await harness.websocket.message(senderSocket.socket, "not json")
    await harness.websocket.message(
      senderSocket.socket,
      JSON.stringify({ type: "unknown" }),
    )

    expect(harness.writes).toEqual([])
    expect(senderSocket.sent.slice(1).map((text) => JSON.parse(text))).toEqual([
      { type: "error", message: "Malformed JSON" },
      { type: "error", message: "Unknown message type: unknown" },
    ])
    expect(observerSocket.sent).toHaveLength(1)
  })

  test("enforces route authorization while allowing public assets", async () => {
    const harness = await createPadHarness()

    const forbiddenPad = await harness.fetch(
      makeRequest("/"),
      harness.fakeServer,
    )
    const allowedPad = await harness.fetch(
      makeRequest("/?t=apptoken"),
      harness.fakeServer,
    )
    const forbiddenWs = await harness.fetch(
      makeRequest("/ws"),
      harness.fakeServer,
    )
    const favicon = await harness.fetch(
      makeRequest("/favicon.ico"),
      harness.fakeServer,
    )
    const css = await harness.fetch(makeRequest("/pad.css"), harness.fakeServer)
    const js = await harness.fetch(
      makeRequest("/pad.browser.js"),
      harness.fakeServer,
    )

    expect(forbiddenPad?.status).toBe(403)
    expect(forbiddenWs?.status).toBe(403)
    expect(harness.upgradeCalls).toEqual([])
    expect(allowedPad?.status).toBe(200)
    expect(await allowedPad?.text()).toBe(stripShebang(unitPadSource))
    expect(favicon?.status).toBe(204)
    expect(css?.status).toBe(200)
    expect(css?.headers.get("content-type")).toBe("text/css; charset=utf-8")
    expect(js?.status).toBe(200)
    expect(js?.headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8",
    )
  })

  test("serves OC chat documents and runtime assets", async () => {
    const harness = await createPadHarness({
      source: unitChatSource,
      padPath: unitChatPath,
    })

    const allowedChat = await harness.fetch(
      makeRequest("/?t=apptoken"),
      harness.fakeServer,
    )
    const css = await harness.fetch(
      makeRequest("/oc-chat.css"),
      harness.fakeServer,
    )
    const js = await harness.fetch(
      makeRequest("/oc-chat.browser.js"),
      harness.fakeServer,
    )

    expect(allowedChat?.status).toBe(200)
    expect(await allowedChat?.text()).toBe(stripShebang(unitChatSource))
    expect(css?.status).toBe(200)
    expect(css?.headers.get("content-type")).toBe("text/css; charset=utf-8")
    expect(js?.status).toBe(200)
    expect(js?.headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8",
    )
  })

  test("continues OC chat sessions and appends new SDK messages", async () => {
    const promptCalls: { id: string; text: string }[] = []
    const harness = await createPadHarness({
      source: unitChatSource,
      padPath: unitChatPath,
      dates: [new Date("2026-04-30T12:05:00.000Z")],
      openCode: {
        async session() {
          throw new Error("Unexpected session call.")
        },
        async messages() {
          throw new Error("Unexpected messages call.")
        },
        async prompt(id, text) {
          promptCalls.push({ id, text })
          return [existingChatMessage, newChatUserMessage, newChatAssistantMessage]
        },
      },
    })
    const client = new ClientState("client-1", new Date("2026-04-30T12:00:00Z"))
    const { socket, sent } = makeSocket(client)

    harness.websocket.open(socket)
    await harness.websocket.message(
      socket,
      JSON.stringify({ type: "oc.prompt", text: " Continue please " }),
    )

    expect(promptCalls).toEqual([{ id: "ses_unit", text: "Continue please" }])
    expect(harness.writes).toHaveLength(1)
    expect(harness.writes[0]?.path).toBe(unitChatPath)
    expect(harness.writes[0]?.text).toContain('data-message-id="msg_new_user"')
    expect(harness.writes[0]?.text).toContain(
      'data-message-id="msg_new_assistant"',
    )
    expect(harness.logs).toContain("[chat save 1] unit.chat.html")
    expect(sent.map((text) => JSON.parse(text).type)).toEqual([
      "ready",
      "oc.status",
      "oc.saved",
      "reload",
    ])
    expect(JSON.parse(sent[0] ?? "{}")).toEqual({
      type: "ready",
      fileName: "unit.chat.html",
      kind: "chat",
      sessionID: "ses_unit",
    })
  })

  test("serves the latest PAD source from disk on browser refresh", async () => {
    const harness = await createPadHarness()
    const externallyEditedSource = unitPadSource.replace("Before", "From IDE")

    harness.setSource(externallyEditedSource)

    const response = await harness.fetch(
      makeRequest("/?t=apptoken"),
      harness.fakeServer,
    )

    expect(response?.status).toBe(200)
    expect(await response?.text()).toBe(stripShebang(externallyEditedSource))
    expect(harness.app.state.source).toBe(externallyEditedSource)
  })

  test("returns 400 when the WebSocket upgrade fails", async () => {
    const harness = await createPadHarness({
      ids: ["client-1"],
      upgradeResult: false,
    })

    const response = await harness.fetch(
      makeRequest("/ws?t=apptoken"),
      harness.fakeServer,
    )

    expect(response?.status).toBe(400)
    expect(await response?.text()).toBe("WebSocket upgrade failed")
    expect(harness.upgradeCalls).toHaveLength(1)
    expect(harness.app.state.clients.size).toBe(0)
  })

  test("starts through injected dependencies and publishes the local URL", async () => {
    const harness = await createPadHarness()

    expect(harness.openedUrls).toEqual(["http://127.0.0.1:4321/?t=apptoken"])
    expect(harness.logs[0]).toBe(
      "unit.pad.htm: http://127.0.0.1:4321/?t=apptoken",
    )
    expect(harness.stopCalls).toEqual([])
  })

  test("watches PAD, browser JS, and CSS files for hot reload", async () => {
    const harness = await createPadHarness()

    expect(harness.watches.map((watch) => watch.path).sort()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("unit.pad.htm"),
        expect.stringContaining("pad.browser.js"),
        expect.stringContaining("pad.css"),
      ]),
    )
  })

  test("broadcasts reload when the watched PAD source changes on disk", async () => {
    const harness = await createPadHarness()
    const client = new ClientState("client-1", new Date("2026-04-30T12:00:00Z"))
    const { socket, sent } = makeSocket(client)
    const externallyEditedSource = unitPadSource.replace("Before", "Hot HTML")

    harness.websocket.open(socket)
    harness.setSource(externallyEditedSource)
    harness.triggerWatch("unit.pad.htm")
    await Bun.sleep(75)

    expect(JSON.parse(sent.at(-1) ?? "{}")).toEqual({
      type: "reload",
      paths: ["unit.pad.htm"],
    })
    expect(harness.app.state.source).toBe(externallyEditedSource)
  })

  test("does not broadcast reload for its own PAD writes", async () => {
    const harness = await createPadHarness({
      dates: [new Date("2026-04-30T12:45:00.000Z")],
    })
    const client = new ClientState("client-1", new Date("2026-04-30T12:00:00Z"))
    const { socket, sent } = makeSocket(client)

    harness.websocket.open(socket)
    await harness.websocket.message(
      socket,
      JSON.stringify({ type: "body", html: replacementBody }),
    )
    harness.triggerWatch("unit.pad.htm")
    await Bun.sleep(75)

    expect(sent.map((text) => JSON.parse(text).type)).toEqual([
      "ready",
      "saved",
    ])
  })

  test("broadcasts reload when watched browser assets change", async () => {
    const harness = await createPadHarness()
    const client = new ClientState("client-1", new Date("2026-04-30T12:00:00Z"))
    const { socket, sent } = makeSocket(client)

    harness.websocket.open(socket)
    harness.triggerWatch("pad.css")
    await Bun.sleep(75)
    harness.triggerWatch("pad.browser.js")
    await Bun.sleep(75)

    expect(sent.slice(1).map((text) => JSON.parse(text))).toEqual([
      { type: "reload", paths: ["pad.css"] },
      { type: "reload", paths: ["pad.browser.js"] },
    ])
  })
})

describe("trusted local server", () => {
  test("serves a PAD, saves WebSocket body edits, and stops after disconnect", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "pad-test-"))
    const padPath = join(tempRoot, "sample.pad.htm")
    const initialBody = `<pad-document>
  <pad-text>Before save</pad-text>
</pad-document>`
    const changedBody = `<pad-document>
  <pad-text>After save</pad-text>
</pad-document>`
    await Bun.write(
      padPath,
      `#!/usr/bin/env -S bun ./pad.shebang.tsx
<!-- PAD: test fixture. -->
<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="./pad.css">
<script type="module" src="./pad.browser.js"></script>

${initialBody}
`,
    )

    const proc = Bun.spawn(["bun", "./pad.shebang.tsx", padPath], {
      env: { ...process.env, PAD_NO_OPEN: "1" },
      stderr: "pipe",
      stdout: "pipe",
    })
    const output = { stdout: "", stderr: "" }

    try {
      const url = await waitForServerUrl(proc, output)
      const response = await fetch(url)
      const served = await response.text()

      expect(response.ok).toBe(true)
      expect(served.startsWith("#!")).toBe(false)
      expect(served).toContain(initialBody)

      await waitForSaved(url, changedBody)

      const saved = await Bun.file(padPath).text()
      expect(saved).toContain(changedBody)
      expect(saved).not.toContain("Before save")

      const exitCode = await Promise.race([
        proc.exited,
        Bun.sleep(5_000).then(() => undefined),
      ])
      expect(exitCode).toBe(0)
    } finally {
      proc.kill()
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
