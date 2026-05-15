#!/usr/bin/env bun

const [runnerUrl, expectedFileName, expectedText] = process.argv.slice(2)

if (!runnerUrl || !expectedFileName || !expectedText) {
  console.error("Usage: assert-pad-canvas-open <runner-url> <file-name> <node-text>")
  process.exit(64)
}

const websocketUrl = new URL(runnerUrl)
websocketUrl.protocol = websocketUrl.protocol === "https:" ? "wss:" : "ws:"
websocketUrl.pathname = "/ws"

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const timeout = setTimeout(() => {
  fail(`Timed out waiting for PAD canvas ready message from ${websocketUrl.href}`)
}, 5000)

const socket = new WebSocket(websocketUrl.href)

socket.addEventListener("message", (event) => {
  let message
  try {
    message = JSON.parse(String(event.data))
  } catch (error) {
    clearTimeout(timeout)
    socket.close()
    fail(`PAD sent non-JSON WebSocket data: ${error}`)
  }

  if (message.type !== "ready") return

  clearTimeout(timeout)
  socket.close()

  if (message.kind !== "canvas") {
    fail(`Expected ready kind canvas, got ${String(message.kind)}`)
  }

  if (message.fileName !== expectedFileName) {
    fail(`Expected fileName ${expectedFileName}, got ${String(message.fileName)}`)
  }

  const nodes = Array.isArray(message.document?.nodes) ? message.document.nodes : []
  const hasExpectedText = nodes.some((node) => node?.text === expectedText)
  if (!hasExpectedText) {
    fail(`Ready document did not include a node with text ${expectedText}`)
  }

  console.log(`Verified PAD WebSocket loaded ${expectedFileName}`)
  process.exit(0)
})

socket.addEventListener("error", () => {
  clearTimeout(timeout)
  fail(`Could not connect to PAD WebSocket at ${websocketUrl.href}`)
})
