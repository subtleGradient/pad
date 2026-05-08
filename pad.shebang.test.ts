import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ClientState,
  PadApplication,
  bodySplitIndex,
  canvasHtml,
  contentType,
  documentKindForPath,
  normalizeJsonCanvasDocument,
  parseJsonCanvasSource,
  replaceBody,
  serializeJsonCanvasDocument,
  stripShebang,
  webNativeAssetRelativePath,
  webNativeCdnUrl,
  webNativeImportMapHtml,
  type PadDependencies,
  type WebSocketData,
} from "./pad.shebang.tsx"

const BRANCH = "v0-dev"

const publicShebang = `#!/usr/bin/env -S bunx --bun -p https://github.com/subtleGradient/pad/archive/refs/heads/${BRANCH}.tar.gz pad`
const cdn = `https://cdn.jsdelivr.net/gh/subtleGradient/pad@refs/heads/${BRANCH}`
const publicCss = `${cdn}/pad.css`
const publicJs = `${cdn}/pad.browser.js`
const replacementBody = `<pad-document>
  <pad-text>Changed body</pad-text>
</pad-document>`
const unitPadPath = "/tmp/unit.pad.htm"
const unitCanvasPath = "/tmp/unit.canvas"
const unitPadSource = `#!/usr/bin/env -S bun ./pad.shebang.tsx
<!doctype html>
<meta charset="utf-8">
<script type="module" src="./pad.browser.js"></script>

<pad-document>
  <pad-text>Before</pad-text>
</pad-document>
`
const unitCanvasSource = `{
	"app": "kept",
	"nodes": [
		{
			"id": "n1",
			"type": "text",
			"x": 1.2,
			"y": 2.8,
			"width": 250,
			"height": 60,
			"text": "Before",
			"unknown": true
		}
	],
	"edges": []
}
`

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
  path = unitPadPath,
  readError,
  upgradeResult = true,
}: {
  ids?: string[]
  dates?: Date[]
  source?: string
  path?: string
  readError?: unknown
  upgradeResult?: boolean
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
        if (readError) throw readError
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
  }

  const app = await PadApplication.create(path, dependencies)
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

async function waitForCanvasSaved(url: string, document: unknown) {
  const ws = new WebSocket(
    url.replace("http://", "ws://").replace("/?", "/ws?"),
  )
  try {
    await new Promise<true>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Timed out waiting for Canvas save confirmation."))
      }, 5_000)

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ type: "canvas", document }))
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
        reject(new Error("Canvas WebSocket error."))
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
  test("SPEC pins the GitHub runner and jsDelivr assets to v0-dev", async () => {
    const source = await Bun.file("SPEC.pad.htm").text()

    expect(source.startsWith(`${publicShebang}\n`)).toBe(true)
    expect(source).toContain('"web-native/": "/web-native/"')
    expect(source).toContain(publicCss)
    expect(source).toContain(publicJs)
    expect(source).not.toContain("@main")
    expect(source).not.toContain("github:subtleGradient/pad#v0-dev")
  })

  test("DEV uses only local runner and browser assets", async () => {
    const source = await Bun.file("DEV.pad.htm").text()

    expect(source.startsWith("#!/usr/bin/env -S bun ./pad.shebang.tsx\n")).toBe(
      true,
    )
    expect(source).toContain('"web-native/": "/web-native/"')
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

describe("web-native imports", () => {
  test("generates an import map for browser-native generic components", () => {
    expect(webNativeImportMapHtml()).toContain('"web-native/": "/web-native/"')
  })

  test("resolves safe web-native asset paths and rejects traversal", () => {
    expect(webNativeAssetRelativePath("/web-native/shadcn/define.js")).toBe(
      "shadcn/define.js",
    )
    expect(
      webNativeAssetRelativePath("/web-native/%2e%2e/pad.shebang.tsx"),
    ).toBeUndefined()
  })

  test("builds jsDelivr fallback URLs for web-native assets", () => {
    expect(webNativeCdnUrl("shadcn/define.js")).toBe(
      "https://cdn.jsdelivr.net/gh/subtleGradient/web-native@web-native-shadcn-components/src/shadcn/define.js",
    )
  })
})

describe("JSON Canvas document support", () => {
  test("recognizes PAD and JSON Canvas document kinds", () => {
    expect(documentKindForPath("note.pad.htm")).toBe("pad")
    expect(documentKindForPath("map.canvas")).toBe("canvas")
    expect(documentKindForPath("map.html")).toBeUndefined()
  })

  test("normalizes missing arrays while preserving root fields", () => {
    expect(normalizeJsonCanvasDocument({ app: "x", nodes: "bad" })).toEqual({
      app: "x",
      nodes: [],
      edges: [],
    })
  })

  test("parses invalid canvas source into an empty document plus error", () => {
    const parsed = parseJsonCanvasSource("{ nope")

    expect(parsed.document).toEqual({ nodes: [], edges: [] })
    expect(parsed.error).toBeTruthy()
  })

  test("serializes canvas JSON with tabs, rounded geometry, nulls, and unknown fields", () => {
    const serialized = serializeJsonCanvasDocument({
      app: "kept",
      omitted: undefined,
      nodes: [
        {
          id: "n1",
          type: "text",
          x: 1.4,
          y: 2.6,
          width: 249.5,
          height: 60.1,
          text: null,
          extra: "kept",
          omitted: undefined,
        },
        { id: "future", type: "future-node", future: true },
      ],
      edges: [{ id: "e1", fromNode: "missing", toNode: "n1", extra: null }],
    })

    expect(serialized).toContain('\n\t"app": "kept"')
    expect(serialized).toContain('\n\t\t\t"x": 1')
    expect(serialized).toContain('\n\t\t\t"y": 3')
    expect(serialized).toContain('\n\t\t\t"width": 250')
    expect(serialized).toContain('\n\t\t\t"height": 60')
    expect(serialized).toContain('\n\t\t\t"text": null')
    expect(serialized).toContain('"future-node"')
    expect(serialized).not.toContain("omitted")
    expect(serialized.endsWith("\n")).toBe(true)
  })

  test("round-trips rich JSON Canvas fixtures without flattening known or future records", () => {
    const fixture = {
      app: "jsoncanvas",
      pluginState: { keep: true },
      nodes: [
        {
          id: "text-1",
          type: "text",
          x: 0.2,
          y: 1.8,
          width: 249.6,
          height: 60.2,
          color: "1",
          text: "Hello [[Note]]",
          nodeExtra: { survives: true },
        },
        {
          id: "file-1",
          type: "file",
          x: 320,
          y: 0,
          width: 400,
          height: 400,
          file: "Folder/Note.md",
          subpath: "#Heading",
        },
        {
          id: "link-1",
          type: "link",
          x: 0,
          y: 480,
          width: 640,
          height: 360,
          url: "https://example.com",
        },
        {
          id: "group-1",
          type: "group",
          x: -40,
          y: -40,
          width: 900,
          height: 600,
          label: "Scope",
          background: "Images/background.png",
          backgroundStyle: "cover",
        },
        {
          id: "future-1",
          type: "future",
          x: 12.6,
          y: 18.4,
          future: ["kept"],
        },
      ],
      edges: [
        {
          id: "edge-1",
          fromNode: "text-1",
          fromSide: "right",
          fromEnd: "none",
          toNode: "file-1",
          toSide: "left",
          toEnd: "arrow",
          color: "2",
          label: "Explains",
          edgeExtra: null,
        },
        {
          id: "future-edge",
          fromNode: "missing",
          toNode: "text-1",
          customFutureField: true,
        },
      ],
    }

    const parsed = parseJsonCanvasSource(JSON.stringify(fixture))
    const serialized = serializeJsonCanvasDocument(parsed.document)

    expect(JSON.parse(serialized)).toEqual({
      app: "jsoncanvas",
      pluginState: { keep: true },
      nodes: [
        {
          ...fixture.nodes[0],
          x: 0,
          y: 2,
          width: 250,
          height: 60,
        },
        fixture.nodes[1],
        fixture.nodes[2],
        fixture.nodes[3],
        {
          ...fixture.nodes[4],
          x: 13,
          y: 18,
        },
      ],
      edges: fixture.edges,
    })
    expect(serialized).toContain('\n\t\t\t"label": "Explains"')
    expect(serialized.endsWith("\n")).toBe(true)
  })

  test("generates a canvas browser shell without embedding source JSON", () => {
    const html = canvasHtml("diagram.canvas")

    expect(html).toContain("<json-canvas-editor")
    expect(html).toContain('"web-native/": "/web-native/"')
    expect(html).toContain('href="/web-native/shadcn/themes/neutral.css"')
    expect(html).toContain('import "web-native/shadcn/define.js"')
    expect(html).toContain('href="/canvas.css"')
    expect(html).toContain('src="/canvas.browser.js"')
    expect(html).not.toContain("#!")
    expect(html).not.toContain('"nodes"')
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
  test("root browser asset delegates to modular PAD browser runtime", async () => {
    const source = await Bun.file("pad.browser.js").text()

    expect(source).toContain('import "./browser/pad-main.js"')
  })

  test("list normalization keeps one trailing blank item", async () => {
    const { normalizeTrailingEmptyItems } = await import("./browser/list.js")
    const items = ["Alpha", "", ""]
    const removed: string[] = []

    const result = normalizeTrailingEmptyItems({
      items,
      isEmpty: (item: string) => item === "",
      appendBlank: () => {
        items.push("")
        return ""
      },
      removeItem: (item: string) => {
        removed.push(item)
      },
    })

    expect(result.changed).toBe(true)
    expect(result.appendedItem).toBeNull()
    expect(result.removedItems).toEqual([""])
    expect(removed).toEqual([""])
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

    const forbiddenPad = await harness.fetch(makeRequest("/"), harness.fakeServer)
    const allowedPad = await harness.fetch(
      makeRequest("/?t=apptoken"),
      harness.fakeServer,
    )
    const forbiddenWs = await harness.fetch(makeRequest("/ws"), harness.fakeServer)
    const favicon = await harness.fetch(
      makeRequest("/favicon.ico"),
      harness.fakeServer,
    )
    const css = await harness.fetch(makeRequest("/pad.css"), harness.fakeServer)
    const js = await harness.fetch(
      makeRequest("/pad.browser.js"),
      harness.fakeServer,
    )
    const browserModule = await harness.fetch(
      makeRequest("/browser/pad-main.js"),
      harness.fakeServer,
    )
    const webNativeModule = await harness.fetch(
      makeRequest("/web-native/shadcn/define.js"),
      harness.fakeServer,
    )
    const forbiddenTraversal = await harness.fetch(
      makeRequest("/web-native/%2e%2e/pad.shebang.tsx"),
      harness.fakeServer,
    )
    const canvasCss = await harness.fetch(
      makeRequest("/canvas.css"),
      harness.fakeServer,
    )
    const canvasJs = await harness.fetch(
      makeRequest("/canvas.browser.js"),
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
    expect(browserModule?.status).toBe(200)
    expect(browserModule?.headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8",
    )
    if (!webNativeModule) throw new Error("Expected web-native asset response.")
    expect([200, 302]).toContain(webNativeModule.status)
    if (webNativeModule.status === 200) {
      expect(webNativeModule.headers.get("content-type")).toBe(
        "text/javascript; charset=utf-8",
      )
    } else {
      expect(webNativeModule.headers.get("location")).toBe(
        webNativeCdnUrl("shadcn/define.js"),
      )
    }
    expect(forbiddenTraversal?.status).toBe(403)
    expect(canvasCss?.status).toBe(200)
    expect(canvasCss?.headers.get("content-type")).toBe("text/css; charset=utf-8")
    expect(canvasJs?.status).toBe(200)
    expect(canvasJs?.headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8",
    )
  })

  test("serves a canvas shell and sends parsed JSON Canvas over WebSocket", async () => {
    const harness = await createPadHarness({
      path: unitCanvasPath,
      source: unitCanvasSource,
    })
    const response = await harness.fetch(
      makeRequest("/?t=apptoken"),
      harness.fakeServer,
    )
    const client = new ClientState("client-1", new Date("2026-04-30T12:00:00Z"))
    const { socket, sent } = makeSocket(client)

    harness.websocket.open(socket)

    expect(response?.status).toBe(200)
    expect(await response?.text()).toContain("<json-canvas-editor")
    expect(JSON.parse(sent[0] ?? "{}")).toEqual({
      type: "ready",
      kind: "canvas",
      fileName: "unit.canvas",
      document: {
        app: "kept",
        nodes: [
          {
            id: "n1",
            type: "text",
            x: 1,
            y: 3,
            width: 250,
            height: 60,
            text: "Before",
            unknown: true,
          },
        ],
        edges: [],
      },
    })
  })

  test("saves canvas document messages as canonical JSON without requiring a shebang", async () => {
    const savedAt = new Date("2026-04-30T12:45:00.000Z")
    const harness = await createPadHarness({
      path: unitCanvasPath,
      source: unitCanvasSource,
      dates: [savedAt],
    })
    const client = new ClientState("client-1", new Date("2026-04-30T12:00:00Z"))
    const { socket, sent } = makeSocket(client)

    harness.websocket.open(socket)
    await harness.websocket.message(
      socket,
      JSON.stringify({
        type: "canvas",
        document: {
          app: "kept",
          nodes: [
            {
              id: "n1",
              type: "text",
              x: 9.8,
              y: 10.2,
              width: 255,
              height: 80,
              text: "After",
              unknown: true,
            },
          ],
          edges: [],
        },
      }),
    )

    expect(harness.writes).toEqual([
      {
        path: unitCanvasPath,
        text: `{
\t"app": "kept",
\t"nodes": [
\t\t{
\t\t\t"id": "n1",
\t\t\t"type": "text",
\t\t\t"x": 10,
\t\t\t"y": 10,
\t\t\t"width": 255,
\t\t\t"height": 80,
\t\t\t"text": "After",
\t\t\t"unknown": true
\t\t}
\t],
\t"edges": []
}
`,
      },
    ])
    expect(JSON.parse(sent.at(-1) ?? "{}")).toEqual({
      type: "saved",
      savedAt: savedAt.toISOString(),
      saveCount: 1,
    })
    expect(harness.writes[0]?.text.startsWith("#!")).toBe(false)
  })

  test("creates a missing Canvas file with an empty JSON Canvas document", async () => {
    const harness = await createPadHarness({
      path: unitCanvasPath,
      readError: new Error("ENOENT"),
    })

    expect(harness.writes).toEqual([
      {
        path: unitCanvasPath,
        text: `{
\t"nodes": [],
\t"edges": []
}
`,
      },
    ])
    expect(harness.app.state.source).toBe(harness.writes[0]?.text)
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

    expect(harness.openedUrls).toEqual([
      "http://127.0.0.1:4321/?t=apptoken",
    ])
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
        expect.stringContaining("browser/runtime.js"),
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

    expect(sent.map((text) => JSON.parse(text).type)).toEqual(["ready", "saved"])
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

  test("serves a Canvas file, saves WebSocket document edits, and stops after disconnect", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "pad-canvas-test-"))
    const canvasPath = join(tempRoot, "sample.canvas")
    await Bun.write(canvasPath, unitCanvasSource)

    const proc = Bun.spawn(["bun", "./pad.shebang.tsx", canvasPath], {
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
      expect(served).toContain("<json-canvas-editor")
      expect(served).not.toContain(unitCanvasSource)

      await waitForCanvasSaved(url, {
        app: "kept",
        nodes: [
          {
            id: "n1",
            type: "text",
            x: 12.7,
            y: 1.2,
            width: 250,
            height: 60,
            text: "Saved through real server",
            unknown: true,
          },
        ],
        edges: [],
      })

      const saved = await Bun.file(canvasPath).text()
      expect(saved.startsWith("#!")).toBe(false)
      expect(saved).toContain('\n\t"app": "kept"')
      expect(saved).toContain('"x": 13')
      expect(saved).toContain("Saved through real server")

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
