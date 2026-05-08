#!/usr/bin/env bun
import { watch as watchFileSystem } from "node:fs"
import nodePath from "node:path"
import * as nodeUrl from "node:url"

export interface WebSocketData {
  client: ClientState
}

type PadSocket = Bun.ServerWebSocket<WebSocketData>
type PadServer = Bun.Server<WebSocketData>
type PadServeOptions = Bun.Serve.Options<WebSocketData, never>

export interface TextFileSystem {
  readText(path: string): Promise<string>
  writeText(path: string, text: string): Promise<void>
}

export interface BrowserLauncher {
  open(url: string): Promise<void> | void
}

export interface Logger {
  info(message: string): void
  error(message: string): void
}

export interface IdGenerator {
  nextId(): string
}

export interface Clock {
  now(): Date
}

export interface ServerFactory {
  serve(options: PadServeOptions): PadServer
}

export interface FileWatchHandle {
  close(): void
}

export interface FileWatcher {
  watch(path: string, onChange: () => void): FileWatchHandle
}

export interface PadDependencies {
  files: TextFileSystem
  browser: BrowserLauncher
  logger: Logger
  ids: IdGenerator
  clock: Clock
  server: ServerFactory
  watcher: FileWatcher
}

class BunTextFileSystem implements TextFileSystem {
  async readText(path: string) {
    return await Bun.file(path).text()
  }

  async writeText(path: string, text: string) {
    await Bun.write(path, text)
  }
}

class SystemBrowserLauncher implements BrowserLauncher {
  constructor(
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly platform = process.platform,
  ) {}

  open(url: string) {
    if (this.env.PAD_NO_OPEN === "1") return

    if (this.platform === "darwin") {
      Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" })
      return
    }

    if (this.platform === "win32") {
      Bun.spawn(["cmd", "/c", "start", "", url], {
        stdout: "ignore",
        stderr: "ignore",
      })
      return
    }

    Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" })
  }
}

class ConsoleLogger implements Logger {
  info(message: string) {
    console.log(message)
  }

  error(message: string) {
    console.error(message)
  }
}

class CryptoIdGenerator implements IdGenerator {
  nextId() {
    return crypto.randomUUID()
  }
}

class SystemClock implements Clock {
  now() {
    return new Date()
  }
}

class BunServerFactory implements ServerFactory {
  serve(options: PadServeOptions) {
    return Bun.serve<WebSocketData>(options)
  }
}

class NodeFileWatcher implements FileWatcher {
  watch(path: string, onChange: () => void) {
    const watcher = watchFileSystem(path, { persistent: false }, onChange)
    return { close: () => watcher.close() }
  }
}

export class ClientState {
  private socket: PadSocket | undefined

  constructor(
    readonly id: string,
    readonly createdAt: Date,
  ) {}

  attach(socket: PadSocket) {
    this.socket = socket
  }

  detach() {
    this.socket = undefined
  }

  send(message: unknown) {
    this.sendText(JSON.stringify(message))
  }

  sendText(text: string) {
    this.socket?.send(text)
  }
}

export type PadDocumentKind = "pad" | "canvas"

export type JsonObject = Record<string, unknown>

export function documentKindForPath(path: string): PadDocumentKind | undefined {
  if (path.endsWith(".pad.htm")) return "pad"
  if (path.endsWith(".canvas")) return "canvas"
  return undefined
}

export class AppState {
  readonly fileName: string
  readonly kind: PadDocumentKind
  readonly clients = new Set<ClientState>()
  server: PadServer | undefined
  hasHadClient = false
  stopping = false
  idleTimer: ReturnType<typeof setTimeout> | undefined
  firstClientTimer: ReturnType<typeof setTimeout> | undefined
  reloadTimer: ReturnType<typeof setTimeout> | undefined
  readonly reloadPaths = new Set<string>()
  readonly watchHandles: FileWatchHandle[] = []
  saveCount = 0
  source: string

  constructor(
    readonly padPath: string,
    source: string,
    readonly token: string,
  ) {
    this.fileName = nodePath.basename(padPath)
    this.kind = documentKindForPath(padPath) ?? "pad"
    this.source = source
  }

  addClient(client: ClientState) {
    this.hasHadClient = true
    this.clients.add(client)
  }

  removeClient(client: ClientState) {
    this.clients.delete(client)
  }

  broadcast(message: unknown) {
    const text = JSON.stringify(message)
    for (const client of this.clients) client.sendText(text)
  }
}

export function createDefaultPadDependencies(): PadDependencies {
  return {
    files: new BunTextFileSystem(),
    browser: new SystemBrowserLauncher(),
    logger: new ConsoleLogger(),
    ids: new CryptoIdGenerator(),
    clock: new SystemClock(),
    server: new BunServerFactory(),
    watcher: new NodeFileWatcher(),
  }
}

const HOST = "127.0.0.1"
const FIRST_CLIENT_TIMEOUT_MS = 60_000
const IDLE_SHUTDOWN_MS = 250
const HOT_RELOAD_DELAY_MS = 50
const ROOT_BROWSER_ASSETS = new Set([
  "canvas.browser.js",
  "canvas.css",
  "canvas.tldraw.adapter.js",
  "pad.browser.js",
  "pad.css",
])
const WEB_NATIVE_BROWSER_PREFIX = "/web-native/"
const WEB_NATIVE_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/subtleGradient/web-native@web-native-shadcn-components/src/"
const WEB_NATIVE_WATCH_ASSETS = [
  "shadcn/define.js",
  "shadcn/styles/base-nova.css",
  "shadcn/themes/neutral.css",
]
const REACT_VERSION = "19.2.1"
const TLDRAW_VERSION = "4.5.4"
const PAD_BROWSER_MODULES = [
  "browser/dom.js",
  "browser/editing.js",
  "browser/elements.js",
  "browser/list.js",
  "browser/pad-main.js",
  "browser/runtime.js",
]

function die(message: string): never {
  console.error(message)
  process.exit(1)
}

function packageRoot() {
  return nodePath.dirname(nodeUrl.fileURLToPath(import.meta.url))
}

function webNativeSourceRoot() {
  return nodePath.resolve(
    process.env.PAD_WEB_NATIVE_ROOT ??
      nodePath.resolve(packageRoot(), "../web-native/src"),
  )
}

export function contentType(pathname: string) {
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8"
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8"
  if (pathname.endsWith(".htm") || pathname.endsWith(".html")) {
    return "text/html; charset=utf-8"
  }
  return "text/plain; charset=utf-8"
}

function packageAssetPath(pathname: string) {
  const name = pathname.replace(/^\/+/, "")
  if (!ROOT_BROWSER_ASSETS.has(name)) return undefined
  return nodePath.resolve(packageRoot(), name)
}

function packageBrowserModulePath(pathname: string) {
  const name = pathname.replace(/^\/+/, "")
  if (!PAD_BROWSER_MODULES.includes(name)) return undefined
  return nodePath.resolve(packageRoot(), name)
}

export function webNativeImportMapHtml() {
  return `<script type="importmap">
{
  "imports": {
    "web-native/": "${WEB_NATIVE_BROWSER_PREFIX}"
  }
}
</script>`
}

export function canvasTldrawRuntimeHtml() {
  return `<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@${REACT_VERSION}",
    "react/jsx-runtime": "https://esm.sh/react@${REACT_VERSION}/jsx-runtime",
    "react-dom": "https://esm.sh/react-dom@${REACT_VERSION}",
    "react-dom/client": "https://esm.sh/react-dom@${REACT_VERSION}/client",
    "tldraw": "https://esm.sh/tldraw@${TLDRAW_VERSION}?external=react,react-dom"
  }
}
</script>
<link rel="stylesheet" href="https://esm.sh/tldraw@${TLDRAW_VERSION}/tldraw.css">`
}

export function webNativeStylesheetLinksHtml() {
  return `<link rel="stylesheet" href="${WEB_NATIVE_BROWSER_PREFIX}shadcn/themes/neutral.css">
<link rel="stylesheet" href="${WEB_NATIVE_BROWSER_PREFIX}shadcn/styles/base-nova.css">`
}

export function webNativeAssetRelativePath(pathname: string) {
  if (!pathname.startsWith(WEB_NATIVE_BROWSER_PREFIX)) return undefined

  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return undefined
  }

  if (!decoded.startsWith(WEB_NATIVE_BROWSER_PREFIX)) return undefined
  const relativePath = nodePath.posix.normalize(
    decoded.slice(WEB_NATIVE_BROWSER_PREFIX.length),
  )

  if (
    !relativePath ||
    relativePath === "." ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    nodePath.posix.isAbsolute(relativePath) ||
    relativePath.includes("\0")
  ) {
    return undefined
  }

  return relativePath
}

function encodePathSegments(path: string) {
  return path.split("/").map(encodeURIComponent).join("/")
}

export function webNativeCdnUrl(relativePath: string) {
  return `${WEB_NATIVE_CDN_BASE}${encodePathSegments(relativePath)}`
}

function webNativeLocalAssetPath(relativePath: string) {
  const root = webNativeSourceRoot()
  const assetPath = nodePath.resolve(root, relativePath)
  const insideRoot =
    assetPath === root || assetPath.startsWith(`${root}${nodePath.sep}`)
  return insideRoot ? assetPath : undefined
}

async function webNativeAssetResponse(pathname: string) {
  const relativePath = webNativeAssetRelativePath(pathname)
  if (!relativePath) return undefined

  const localPath = webNativeLocalAssetPath(relativePath)
  if (localPath) {
    const file = Bun.file(localPath)
    if (await file.exists()) {
      return new Response(file, {
        headers: {
          "cache-control": "no-store",
          "content-type": contentType(localPath),
        },
      })
    }
  }

  return Response.redirect(webNativeCdnUrl(relativePath), 302)
}

export function stripShebang(source: string) {
  return source.startsWith("#!") ? source.replace(/^#!.*\n/, "") : source
}

export function bodySplitIndex(source: string) {
  const pattern =
    /<script\b(?=[^>]*\bsrc\s*=\s*(["'])[^"']*\bpad\.browser\.js(?:\?[^"']*)?\1)[^>]*>\s*<\/script>\s*/i
  const match = pattern.exec(source)
  if (!match) return -1
  return match.index + match[0].length
}

export function replaceBody(source: string, bodyHtml: string) {
  const splitAt = bodySplitIndex(source)
  if (splitAt < 0) {
    throw new Error(
      "PAD source must include a pad.browser.js script before the body content.",
    )
  }

  return `${source.slice(0, splitAt).trimEnd()}\n\n${bodyHtml.trim()}\n`
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => withoutUndefined(item))
  }

  if (!isJsonObject(value)) return value

  const result: JsonObject = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) result[key] = withoutUndefined(item)
  }
  return result
}

function roundedNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : value
}

function normalizeCanvasRecordGeometry(record: unknown) {
  if (!isJsonObject(record)) return record
  return {
    ...record,
    x: roundedNumber(record.x),
    y: roundedNumber(record.y),
    width: roundedNumber(record.width),
    height: roundedNumber(record.height),
  }
}

export function normalizeJsonCanvasDocument(value: unknown): JsonObject {
  const root = isJsonObject(value) ? { ...value } : {}
  root.nodes = Array.isArray(root.nodes)
    ? root.nodes.map((node) => normalizeCanvasRecordGeometry(node))
    : []
  root.edges = Array.isArray(root.edges) ? [...root.edges] : []
  return root
}

export function parseJsonCanvasSource(source: string): {
  document: JsonObject
  error?: string
} {
  try {
    return { document: normalizeJsonCanvasDocument(JSON.parse(source)) }
  } catch (error) {
    return {
      document: { nodes: [], edges: [] },
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function serializeJsonCanvasDocument(value: unknown) {
  return `${JSON.stringify(
    withoutUndefined(normalizeJsonCanvasDocument(value)),
    null,
    "\t",
  )}\n`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export function canvasHtml(fileName: string) {
  const escapedFileName = escapeHtml(fileName)
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapedFileName}</title>
${webNativeImportMapHtml()}
${canvasTldrawRuntimeHtml()}
${webNativeStylesheetLinksHtml()}
<link rel="stylesheet" href="/canvas.css">
<script type="module">
  import "web-native/shadcn/define.js"
</script>
<script type="module" src="/canvas.browser.js"></script>

<json-canvas-editor file-name="${escapedFileName}"></json-canvas-editor>
`
}

export class PadApplication {
  private constructor(
    readonly state: AppState,
    private readonly dependencies: PadDependencies,
  ) {}

  static async create(padPath: string, dependencies: PadDependencies) {
    let source: string
    try {
      source = await dependencies.files.readText(padPath)
    } catch (error) {
      if (documentKindForPath(padPath) !== "canvas") throw error
      source = serializeJsonCanvasDocument({ nodes: [], edges: [] })
      await dependencies.files.writeText(padPath, source)
    }
    const token = dependencies.ids.nextId().replaceAll("-", "")
    return new PadApplication(new AppState(padPath, source, token), dependencies)
  }

  async start() {
    this.state.server = this.dependencies.server.serve({
      hostname: HOST,
      port: 0,
      fetch: (request, server) => this.handleFetch(request, server),
      websocket: {
        data: {} as WebSocketData,
        open: (ws) => this.open(ws),
        message: (ws, raw) => this.message(ws, raw),
        close: (ws) => this.close(ws),
      },
    })

    const localUrl = this.localUrl()

    this.state.firstClientTimer = setTimeout(() => {
      if (!this.state.hasHadClient) {
        this.stop("No browser connected; PAD server stopped.")
      }
    }, FIRST_CLIENT_TIMEOUT_MS)

    process.on("SIGINT", () => this.stop("Stopping PAD server."))
    process.on("SIGTERM", () => this.stop("Stopping PAD server."))

    await this.watchReloadFiles()

    this.dependencies.logger.info(`${this.state.fileName}: ${localUrl}`)
    await this.dependencies.browser.open(localUrl)
  }

  private localUrl() {
    if (!this.state.server) throw new Error("PAD server has not started.")
    return `http://${HOST}:${this.state.server.port}/?t=${this.state.token}`
  }

  private async handleFetch(request: Request, server: PadServer) {
    const url = new URL(request.url)

    if (url.pathname === "/ws") {
      if (!this.authorized(url)) return new Response("Forbidden", { status: 403 })

      const client = new ClientState(
        this.dependencies.ids.nextId(),
        this.dependencies.clock.now(),
      )
      if (server.upgrade(request, { data: { client } })) return
      return new Response("WebSocket upgrade failed", { status: 400 })
    }

    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 })
    }

    const webNativeAsset = await webNativeAssetResponse(url.pathname)
    if (webNativeAsset) return webNativeAsset

    const assetPath =
      packageAssetPath(url.pathname) ?? packageBrowserModulePath(url.pathname)
    if (assetPath) {
      return new Response(Bun.file(assetPath), {
        headers: {
          "cache-control": "no-store",
          "content-type": contentType(assetPath),
        },
      })
    }

    if (!this.authorized(url)) return new Response("Forbidden", { status: 403 })

    await this.loadSourceFromDisk()

    if (this.state.kind === "canvas") {
      return new Response(canvasHtml(this.state.fileName), {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html; charset=utf-8",
        },
      })
    }

    return new Response(stripShebang(this.state.source), {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      },
    })
  }

  private open(ws: PadSocket) {
    const { client } = ws.data
    client.attach(ws)
    this.state.addClient(client)
    if (this.state.firstClientTimer) clearTimeout(this.state.firstClientTimer)
    if (this.state.idleTimer) clearTimeout(this.state.idleTimer)
    if (this.state.kind === "canvas") {
      const parsed = parseJsonCanvasSource(this.state.source)
      client.send({
        type: "ready",
        kind: "canvas",
        fileName: this.state.fileName,
        document: parsed.document,
        parseError: parsed.error,
      })
      return
    }
    client.send({ type: "ready", fileName: this.state.fileName })
  }

  private async message(ws: PadSocket, raw: string | Buffer) {
    const { client } = ws.data
    let message: { type?: string; html?: unknown; document?: unknown }
    try {
      message = JSON.parse(String(raw))
    } catch {
      client.send({ type: "error", message: "Malformed JSON" })
      return
    }

    if (this.state.kind === "canvas") {
      if (message.type !== "canvas") {
        client.send({
          type: "error",
          message: `Unknown message type for canvas: ${message.type}`,
        })
        return
      }

      try {
        await this.saveCanvasDocument(message.document)
      } catch (error) {
        client.send({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }

    if (message.type !== "body") {
      client.send({
        type: "error",
        message: `Unknown message type: ${message.type}`,
      })
      return
    }

    try {
      await this.saveBody(String(message.html ?? ""))
    } catch (error) {
      client.send({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private close(ws: PadSocket) {
    const { client } = ws.data
    this.state.removeClient(client)
    client.detach()
    this.stopWhenIdle()
  }

  private authorized(url: URL) {
    return url.searchParams.get("t") === this.state.token
  }

  private stop(reason: string) {
    if (this.state.stopping) return
    this.state.stopping = true
    if (this.state.idleTimer) clearTimeout(this.state.idleTimer)
    if (this.state.firstClientTimer) clearTimeout(this.state.firstClientTimer)
    if (this.state.reloadTimer) clearTimeout(this.state.reloadTimer)
    for (const handle of this.state.watchHandles.splice(0)) handle.close()
    this.dependencies.logger.info(reason)
    this.state.server?.stop(true)
  }

  private stopWhenIdle() {
    if (
      !this.state.hasHadClient ||
      this.state.clients.size > 0 ||
      this.state.stopping
    ) {
      return
    }
    if (this.state.idleTimer) clearTimeout(this.state.idleTimer)
    this.state.idleTimer = setTimeout(() => {
      if (this.state.clients.size === 0) {
        this.stop("Browser closed; PAD server stopped.")
      }
    }, IDLE_SHUTDOWN_MS)
  }

  private async saveBody(bodyHtml: string) {
    await this.loadSourceFromDisk()
    this.state.source = replaceBody(this.state.source, bodyHtml)
    await this.dependencies.files.writeText(this.state.padPath, this.state.source)
    this.state.saveCount += 1
    const savedAt = this.dependencies.clock.now().toISOString()
    this.dependencies.logger.info(
      `[save ${this.state.saveCount}] ${this.state.fileName}`,
    )
    this.state.broadcast({
      type: "saved",
      savedAt,
      saveCount: this.state.saveCount,
    })
  }

  private async saveCanvasDocument(document: unknown) {
    this.state.source = serializeJsonCanvasDocument(document)
    await this.dependencies.files.writeText(this.state.padPath, this.state.source)
    this.state.saveCount += 1
    const savedAt = this.dependencies.clock.now().toISOString()
    this.dependencies.logger.info(
      `[save ${this.state.saveCount}] ${this.state.fileName}`,
    )
    this.state.broadcast({
      type: "saved",
      savedAt,
      saveCount: this.state.saveCount,
    })
  }

  private async loadSourceFromDisk() {
    this.state.source = await this.dependencies.files.readText(this.state.padPath)
  }

  private async watchReloadFiles() {
    const browserAssets =
      this.state.kind === "canvas"
        ? ["canvas.browser.js", "canvas.css", "canvas.tldraw.adapter.js"]
        : ["pad.browser.js", "pad.css", ...PAD_BROWSER_MODULES]
    const paths: { path: string; optional: boolean }[] = [
      { path: this.state.padPath, optional: false },
      ...browserAssets.map((asset) => ({
        path: nodePath.resolve(packageRoot(), asset),
        optional: false,
      })),
      ...WEB_NATIVE_WATCH_ASSETS.map(webNativeLocalAssetPath)
        .filter((path): path is string => Boolean(path))
        .map((path) => ({ path, optional: true })),
    ]

    for (const { path, optional } of paths) {
      try {
        if (optional && !(await Bun.file(path).exists())) continue
        const handle = this.dependencies.watcher.watch(path, () => {
          this.queueReload(path)
        })
        this.state.watchHandles.push(handle)
      } catch (error) {
        this.dependencies.logger.error(
          `Could not watch ${path}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  private queueReload(path: string) {
    if (this.state.stopping) return
    this.state.reloadPaths.add(path)
    if (this.state.reloadTimer) clearTimeout(this.state.reloadTimer)
    this.state.reloadTimer = setTimeout(() => {
      this.state.reloadTimer = undefined
      void this.reloadChangedFiles()
    }, HOT_RELOAD_DELAY_MS)
  }

  private async reloadChangedFiles() {
    const paths = [...this.state.reloadPaths]
    this.state.reloadPaths.clear()
    if (this.state.stopping || paths.length === 0) return

    const nonSourceChanged = paths.some((path) => path !== this.state.padPath)
    let sourceChanged = false

    if (paths.includes(this.state.padPath)) {
      const previousSource = this.state.source
      await this.loadSourceFromDisk()
      sourceChanged = this.state.source !== previousSource
    }

    if (!sourceChanged && !nonSourceChanged) return

    if (this.state.kind === "canvas" && sourceChanged && !nonSourceChanged) {
      const parsed = parseJsonCanvasSource(this.state.source)
      this.state.broadcast({
        type: "canvas-updated",
        kind: "canvas",
        fileName: this.state.fileName,
        document: parsed.document,
        parseError: parsed.error,
        paths: paths.map((path) => nodePath.basename(path)),
      })
      return
    }

    this.state.broadcast({
      type: "reload",
      paths: paths.map((path) => nodePath.basename(path)),
    })
  }
}

export async function run(
  args = process.argv.slice(2),
  dependencies = createDefaultPadDependencies(),
) {
  const padArg = args.find((arg) => !arg.startsWith("-"))
  if (!padArg) die("Usage: pad ./file.pad.htm | ./file.canvas")

  const padPath = nodePath.resolve(padArg)
  if (!documentKindForPath(padPath)) {
    die("PAD files must end with .pad.htm or .canvas")
  }

  const app = await PadApplication.create(padPath, dependencies)
  await app.start()
}

if (import.meta.main) await run()
