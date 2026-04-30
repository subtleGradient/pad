#!/usr/bin/env bun
import { watch as watchFileSystem } from "node:fs"
import { chmod } from "node:fs/promises"
import nodePath from "node:path"
import * as nodeUrl from "node:url"
import {
  appendOpenCodeBundlesToChatSource,
  extractChatSessionId,
  renderChatDocument,
  type OpenCodeMessageBundle,
  type OpenCodeSessionLike,
} from "./oc-chat.ts"

export interface WebSocketData {
  client: ClientState
}

type PadSocket = Bun.ServerWebSocket<WebSocketData>
type PadServer = Bun.Server<WebSocketData>
type PadServeOptions = Bun.Serve.Options<WebSocketData, never>

export interface TextFileSystem {
  readText(path: string): Promise<string>
  writeText(path: string, text: string): Promise<void>
  makeExecutable?(path: string): Promise<void>
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

export interface OpenCodeBridge {
  session(id: string): Promise<OpenCodeSessionLike>
  messages(id: string): Promise<OpenCodeMessageBundle[]>
  prompt(id: string, text: string): Promise<OpenCodeMessageBundle[]>
  close?(): void | Promise<void>
}

export interface PadDependencies {
  files: TextFileSystem
  browser: BrowserLauncher
  logger: Logger
  ids: IdGenerator
  clock: Clock
  server: ServerFactory
  watcher: FileWatcher
  openCode: OpenCodeBridge
}

class BunTextFileSystem implements TextFileSystem {
  async readText(path: string) {
    return await Bun.file(path).text()
  }

  async writeText(path: string, text: string) {
    await Bun.write(path, text)
  }

  async makeExecutable(path: string) {
    await chmod(path, 0o755)
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

function sdkData<T>(result: { data?: T } | T) {
  if (result && typeof result === "object" && "data" in result) {
    return (result as { data: T }).data
  }
  return result as T
}

class SdkOpenCodeBridge implements OpenCodeBridge {
  private instance:
    | {
        client: unknown
        server?: { close?(): void; stop?(force?: boolean): void }
      }
    | undefined

  private async client() {
    if (!this.instance) {
      const sdk = (await import("@opencode-ai/sdk")) as {
        createOpencode(): Promise<{
          client: unknown
          server?: { close?(): void; stop?(force?: boolean): void }
        }>
      }
      this.instance = await sdk.createOpencode()
    }
    return this.instance.client as {
      session: {
        get(input: { path: { id: string } }): Promise<unknown>
        messages(input: { path: { id: string } }): Promise<unknown>
        prompt(input: {
          path: { id: string }
          body: { parts: { type: "text"; text: string }[] }
        }): Promise<unknown>
      }
    }
  }

  async session(id: string) {
    const client = await this.client()
    return sdkData<OpenCodeSessionLike>(
      (await client.session.get({ path: { id } })) as
        | { data?: OpenCodeSessionLike }
        | OpenCodeSessionLike,
    )
  }

  async messages(id: string) {
    const client = await this.client()
    return sdkData<OpenCodeMessageBundle[]>(
      (await client.session.messages({ path: { id } })) as
        | { data?: OpenCodeMessageBundle[] }
        | OpenCodeMessageBundle[],
    )
  }

  async prompt(id: string, text: string) {
    const client = await this.client()
    await client.session.prompt({
      path: { id },
      body: { parts: [{ type: "text", text }] },
    })
    return await this.messages(id)
  }

  close() {
    this.instance?.server?.close?.()
    this.instance?.server?.stop?.(true)
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

export type PadDocumentKind = "pad" | "chat"

export function documentKindForPath(path: string): PadDocumentKind | undefined {
  if (path.endsWith(".pad.htm")) return "pad"
  if (path.endsWith(".chat.html")) return "chat"
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
    openCode: new SdkOpenCodeBridge(),
  }
}

const HOST = "127.0.0.1"
const FIRST_CLIENT_TIMEOUT_MS = 60_000
const IDLE_SHUTDOWN_MS = 250
const HOT_RELOAD_DELAY_MS = 50

function die(message: string): never {
  console.error(message)
  process.exit(1)
}

function packageRoot() {
  return nodePath.dirname(nodeUrl.fileURLToPath(import.meta.url))
}

export function contentType(pathname: string) {
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8"
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8"
  if (pathname.endsWith(".htm") || pathname.endsWith(".html")) {
    return "text/html; charset=utf-8"
  }
  return "text/plain; charset=utf-8"
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

export class PadApplication {
  private constructor(
    readonly state: AppState,
    private readonly dependencies: PadDependencies,
  ) {}

  static async create(padPath: string, dependencies: PadDependencies) {
    const source = await dependencies.files.readText(padPath)
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

    this.watchReloadFiles()

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

    if (
      url.pathname === "/pad.browser.js" ||
      url.pathname === "/pad.css" ||
      url.pathname === "/oc-chat.browser.js" ||
      url.pathname === "/oc-chat.css"
    ) {
      const assetPath = nodePath.resolve(packageRoot(), url.pathname.slice(1))
      return new Response(Bun.file(assetPath), {
        headers: {
          "cache-control": "no-store",
          "content-type": contentType(assetPath),
        },
      })
    }

    if (!this.authorized(url)) return new Response("Forbidden", { status: 403 })

    await this.loadSourceFromDisk()

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
    if (this.state.kind === "chat") {
      client.send({
        type: "ready",
        fileName: this.state.fileName,
        kind: this.state.kind,
        sessionID: extractChatSessionId(this.state.source),
      })
      return
    }
    client.send({ type: "ready", fileName: this.state.fileName })
  }

  private async message(ws: PadSocket, raw: string | Buffer) {
    const { client } = ws.data
    let message: { type?: string; html?: unknown; text?: unknown }
    try {
      message = JSON.parse(String(raw))
    } catch {
      client.send({ type: "error", message: "Malformed JSON" })
      return
    }

    if (message.type === "oc.prompt") {
      try {
        await this.continueChatSession(client, message.text)
      } catch (error) {
        client.send({
          type: "oc.error",
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

  private async continueChatSession(client: ClientState, text: unknown) {
    if (this.state.kind !== "chat") {
      throw new Error("OpenCode continuation is only available for .chat.html files.")
    }

    const prompt = typeof text === "string" ? text.trim() : ""
    if (!prompt) throw new Error("Prompt text is required.")

    await this.loadSourceFromDisk()
    const sessionID = extractChatSessionId(this.state.source)
    if (!sessionID) throw new Error("OC chat file is missing data-session-id.")

    client.send({ type: "oc.status", message: "Sending prompt to OpenCode..." })
    const bundles = await this.dependencies.openCode.prompt(sessionID, prompt)
    await this.saveChatBundles(bundles)
  }

  private async saveChatBundles(bundles: OpenCodeMessageBundle[]) {
    await this.loadSourceFromDisk()
    const nextSource = appendOpenCodeBundlesToChatSource(this.state.source, bundles)
    if (nextSource === this.state.source) {
      this.state.broadcast({
        type: "oc.status",
        message: "OpenCode returned no new messages.",
      })
      return
    }

    this.state.source = nextSource
    await this.dependencies.files.writeText(this.state.padPath, this.state.source)
    this.state.saveCount += 1
    const savedAt = this.dependencies.clock.now().toISOString()
    this.dependencies.logger.info(
      `[chat save ${this.state.saveCount}] ${this.state.fileName}`,
    )
    this.state.broadcast({
      type: "oc.saved",
      savedAt,
      saveCount: this.state.saveCount,
    })
    this.state.broadcast({ type: "reload", paths: [this.state.fileName] })
  }

  private async loadSourceFromDisk() {
    this.state.source = await this.dependencies.files.readText(this.state.padPath)
  }

  private watchReloadFiles() {
    const assetNames =
      this.state.kind === "chat"
        ? ["oc-chat.browser.js", "oc-chat.css"]
        : ["pad.browser.js", "pad.css"]
    const paths = [
      this.state.padPath,
      ...assetNames.map((name) => nodePath.resolve(packageRoot(), name)),
    ]

    for (const path of paths) {
      try {
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

    let shouldReload = paths.some((path) => path !== this.state.padPath)

    if (paths.includes(this.state.padPath)) {
      const previousSource = this.state.source
      await this.loadSourceFromDisk()
      shouldReload ||= this.state.source !== previousSource
    }

    if (!shouldReload) return

    this.state.broadcast({
      type: "reload",
      paths: paths.map((path) => nodePath.basename(path)),
    })
  }
}

export async function exportOpenCodeChatSession(
  sessionID: string,
  outputPath: string,
  dependencies = createDefaultPadDependencies(),
) {
  const session = await dependencies.openCode.session(sessionID)
  const messages = await dependencies.openCode.messages(sessionID)
  const source = renderChatDocument({
    session,
    messages,
    exportedAt: dependencies.clock.now(),
  })

  await dependencies.files.writeText(outputPath, source)
  await dependencies.files.makeExecutable?.(outputPath)
  dependencies.logger.info(`${nodePath.basename(outputPath)}: exported ${sessionID}`)
}

export async function run(
  args = process.argv.slice(2),
  dependencies = createDefaultPadDependencies(),
) {
  if (args[0] === "--export-chat") {
    const sessionID = args[1]
    if (!sessionID) die("Usage: pad --export-chat <session-id> [file.chat.html]")
    const outputPath = nodePath.resolve(args[2] ?? `${sessionID}.chat.html`)
    if (!outputPath.endsWith(".chat.html")) {
      die("OpenCode chat files must end with .chat.html")
    }
    await exportOpenCodeChatSession(sessionID, outputPath, dependencies)
    return
  }

  const padArg = args.find((arg) => !arg.startsWith("-"))
  if (!padArg) die("Usage: pad ./file.pad.htm")

  const padPath = nodePath.resolve(padArg)
  if (!documentKindForPath(padPath)) {
    die("PAD files must end with .pad.htm or .chat.html")
  }

  const app = await PadApplication.create(padPath, dependencies)
  await app.start()
}

if (import.meta.main) await run()
