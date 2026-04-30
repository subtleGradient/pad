#!/usr/bin/env bun
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type PadSocket = import("bun").ServerWebSocket<unknown>

const HOST = "127.0.0.1"
const FIRST_CLIENT_TIMEOUT_MS = 60_000
const IDLE_SHUTDOWN_MS = 250

function die(message: string): never {
  console.error(message)
  process.exit(1)
}

function packageRoot() {
  return dirname(fileURLToPath(import.meta.url))
}

function contentType(pathname: string) {
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8"
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8"
  if (pathname.endsWith(".htm") || pathname.endsWith(".html")) {
    return "text/html; charset=utf-8"
  }
  return "text/plain; charset=utf-8"
}

function stripShebang(source: string) {
  return source.startsWith("#!") ? source.replace(/^#!.*\n/, "") : source
}

function bodySplitIndex(source: string) {
  const pattern = /<script\b(?=[^>]*\bsrc\s*=\s*(["'])[^"']*\bpad\.browser\.js(?:\?[^"']*)?\1)[^>]*>\s*<\/script>\s*/i
  const match = pattern.exec(source)
  if (!match) return -1
  return match.index + match[0].length
}

function replaceBody(source: string, bodyHtml: string) {
  const splitAt = bodySplitIndex(source)
  if (splitAt < 0) {
    throw new Error("PAD source must include a pad.browser.js script before the body content.")
  }

  return `${source.slice(0, splitAt).trimEnd()}\n\n${bodyHtml.trim()}\n`
}

async function openInBrowser(url: string) {
  if (process.env.PAD_NO_OPEN === "1") return

  if (process.platform === "darwin") {
    Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" })
    return
  }

  if (process.platform === "win32") {
    Bun.spawn(["cmd", "/c", "start", "", url], {
      stdout: "ignore",
      stderr: "ignore",
    })
    return
  }

  Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" })
}

async function run() {
  const padArg = process.argv.slice(2).find((arg) => !arg.startsWith("-"))
  if (!padArg) die("Usage: pad ./file.pad.htm")

  const padPath = resolve(padArg)
  if (!padPath.endsWith(".pad.htm")) die("PAD files must end with .pad.htm")

  let source = await Bun.file(padPath).text()
  const fileName = basename(padPath)
  const clients = new Set<PadSocket>()
  const token = crypto.randomUUID().replaceAll("-", "")
  let server: ReturnType<typeof Bun.serve>
  let hasHadClient = false
  let stopping = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let firstClientTimer: ReturnType<typeof setTimeout> | undefined
  let saveCount = 0

  const send = (ws: PadSocket, message: unknown) => ws.send(JSON.stringify(message))

  const broadcast = (message: unknown) => {
    const text = JSON.stringify(message)
    for (const client of clients) client.send(text)
  }

  const stop = (reason: string) => {
    if (stopping) return
    stopping = true
    if (idleTimer) clearTimeout(idleTimer)
    if (firstClientTimer) clearTimeout(firstClientTimer)
    console.log(reason)
    server.stop(true)
  }

  const stopWhenIdle = () => {
    if (!hasHadClient || clients.size > 0 || stopping) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (clients.size === 0) stop("Browser closed; PAD server stopped.")
    }, IDLE_SHUTDOWN_MS)
  }

  const saveBody = async (bodyHtml: string) => {
    source = replaceBody(source, bodyHtml)
    await Bun.write(padPath, source)
    saveCount += 1
    const savedAt = new Date().toISOString()
    console.log(`[save ${saveCount}] ${fileName}`)
    broadcast({ type: "saved", savedAt, saveCount })
  }

  const authorized = (url: URL) => url.searchParams.get("t") === token

  server = Bun.serve({
    hostname: HOST,
    port: 0,
    async fetch(request, server) {
      const url = new URL(request.url)

      if (url.pathname === "/ws") {
        if (!authorized(url)) return new Response("Forbidden", { status: 403 })
        if (server.upgrade(request, { data: {} })) return
        return new Response("WebSocket upgrade failed", { status: 400 })
      }

      if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 })

      if (url.pathname === "/pad.browser.js" || url.pathname === "/pad.css") {
        const assetPath = resolve(packageRoot(), url.pathname.slice(1))
        return new Response(Bun.file(assetPath), {
          headers: {
            "cache-control": "no-store",
            "content-type": contentType(assetPath),
          },
        })
      }

      if (!authorized(url)) return new Response("Forbidden", { status: 403 })

      return new Response(stripShebang(source), {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html; charset=utf-8",
        },
      })
    },
    websocket: {
      open(ws) {
        hasHadClient = true
        if (firstClientTimer) clearTimeout(firstClientTimer)
        if (idleTimer) clearTimeout(idleTimer)
        clients.add(ws)
        send(ws, { type: "ready", fileName })
      },
      async message(ws, raw) {
        let message: { type?: string; html?: unknown }
        try {
          message = JSON.parse(String(raw))
        } catch {
          send(ws, { type: "error", message: "Malformed JSON" })
          return
        }

        if (message.type !== "body") {
          send(ws, { type: "error", message: `Unknown message type: ${message.type}` })
          return
        }

        try {
          await saveBody(String(message.html ?? ""))
        } catch (error) {
          send(ws, {
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          })
        }
      },
      close(ws) {
        clients.delete(ws)
        stopWhenIdle()
      },
    },
  })

  const localUrl = `http://${HOST}:${server.port}/?t=${token}`

  firstClientTimer = setTimeout(() => {
    if (!hasHadClient) stop("No browser connected; PAD server stopped.")
  }, FIRST_CLIENT_TIMEOUT_MS)

  process.on("SIGINT", () => stop("Stopping PAD server."))
  process.on("SIGTERM", () => stop("Stopping PAD server."))

  console.log(`${fileName}: ${localUrl}`)
  await openInBrowser(localUrl)
}

await run()
