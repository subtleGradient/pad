// @ts-nocheck

import React, { useCallback, useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { Tldraw } from "tldraw"
import {
  DEFAULT_SIZE,
  edgeShapeId,
  edgesOf,
  jsonCanvasToTldraw,
  nodeShapeId,
  nodesOf,
  projectTldrawToJsonCanvas,
} from "./canvas.tldraw.adapter.js"

const SAVE_DELAY_MS = 260

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`
}

function createEmptyDocument() {
  return { nodes: [], edges: [] }
}

function defaultNodeSize(type) {
  return DEFAULT_SIZE[type] ?? DEFAULT_SIZE.text
}

function websocketUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${location.host}/ws${location.search}`
}

function createNode(type, documentModel) {
  const [width, height] = defaultNodeSize(type)
  const offset = nodesOf(documentModel).length * 36
  const node = {
    id: makeId("node"),
    type,
    x: 120 + offset,
    y: 120 + offset,
    width,
    height,
  }

  if (type === "text") node.text = "New text"
  if (type === "file") node.file = window.prompt("Vault-relative file path") ?? ""
  if (type === "link") node.url = window.prompt("URL") ?? "https://example.com"
  if (type === "group") node.label = window.prompt("Group label") ?? "Group"
  return node
}

function useCanvasSocket({
  documentRef,
  editorRef,
  hydrateEditor,
  saveTimerRef,
  setDocumentModel,
  setFileName,
  setStatus,
  socketRef,
}) {
  useEffect(() => {
    if (location.protocol !== "http:" && location.protocol !== "https:") {
      setStatus("Run with pad to enable saving.")
      return
    }

    setStatus("Connecting...")
    const socket = new WebSocket(websocketUrl())
    socketRef.current = socket

    socket.addEventListener("open", () => {
      setStatus("Connected.")
    })

    socket.addEventListener("message", (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }

      if (
        (message.type === "ready" || message.type === "canvas-updated") &&
        message.kind === "canvas"
      ) {
        const nextDocument = isRecord(message.document)
          ? message.document
          : createEmptyDocument()
        window.clearTimeout(saveTimerRef.current)
        documentRef.current = nextDocument
        setDocumentModel(nextDocument)
        setFileName(message.fileName ?? "canvas")
        const action = message.type === "canvas-updated" ? "Updated from disk" : "Editable"
        setStatus(message.parseError ? `${action}: ${message.parseError}` : `${action}. Changes autosave.`)
        if (editorRef.current) hydrateEditor(editorRef.current, nextDocument)
      }

      if (message.type === "saved") {
        setStatus(`Saved ${new Date(message.savedAt).toLocaleTimeString()}`)
      }

      if (message.type === "reload") {
        setStatus("Source changed. Reloading...")
        location.reload()
      }

      if (message.type === "error") setStatus(`Canvas error: ${message.message}`)
    })

    socket.addEventListener("close", () => setStatus("Disconnected."))
    socket.addEventListener("error", () => setStatus("Connection failed."))

    return () => {
      window.clearTimeout(saveTimerRef.current)
      socket.close()
      if (socketRef.current === socket) socketRef.current = undefined
    }
  }, [
    documentRef,
    editorRef,
    hydrateEditor,
    saveTimerRef,
    setDocumentModel,
    setFileName,
    setStatus,
    socketRef,
  ])
}

function JsonCanvasTldrawApp({ host }) {
  const [fileName, setFileName] = useState(host.getAttribute("file-name") ?? "canvas")
  const [status, setStatus] = useState("Loading...")
  const [documentModel, setDocumentModel] = useState(createEmptyDocument)
  const editorRef = useRef()
  const socketRef = useRef()
  const documentRef = useRef(documentModel)
  const hydratingRef = useRef(false)
  const saveTimerRef = useRef()

  const hydrateEditor = useCallback((editor, nextDocument, shouldFit = true) => {
    hydratingRef.current = true
    const projection = jsonCanvasToTldraw(nextDocument)
    const projectIntoEditor = () => {
      const currentShapes = editor.getCurrentPageShapes()
      if (currentShapes.length > 0) {
        editor.deleteShapes(currentShapes.map((shape) => shape.id))
      }
      for (const shape of projection.shapes) editor.createShape(shape)
      if (projection.bindings.length > 0) editor.createBindings(projection.bindings)
    }

    if (typeof editor.store?.mergeRemoteChanges === "function") {
      editor.store.mergeRemoteChanges(projectIntoEditor)
    } else {
      projectIntoEditor()
    }

    window.setTimeout(() => {
      hydratingRef.current = false
      if (shouldFit && projection.shapes.length > 0) {
        editor.zoomToFit({ animation: { duration: 220 } })
      }
    }, 0)
  }, [])

  const saveFromEditor = useCallback(() => {
    const editor = editorRef.current
    const socket = socketRef.current
    if (!editor || !socket || socket.readyState !== WebSocket.OPEN) return

    window.clearTimeout(saveTimerRef.current)
    const shapes = editor.getCurrentPageShapes()
    const bindings = []
    for (const shape of shapes) {
      if (shape.type === "arrow") bindings.push(...editor.getBindingsFromShape(shape.id, "arrow"))
    }

    const nextDocument = projectTldrawToJsonCanvas(
      documentRef.current ?? createEmptyDocument(),
      shapes,
      bindings,
    )
    documentRef.current = nextDocument
    setDocumentModel(nextDocument)
    socket.send(JSON.stringify({ type: "canvas", document: nextDocument }))
    setStatus("Saving...")
  }, [])

  const queueSave = useCallback(() => {
    if (hydratingRef.current) return
    window.clearTimeout(saveTimerRef.current)
    setStatus("Editing... autosave queued")
    saveTimerRef.current = window.setTimeout(saveFromEditor, SAVE_DELAY_MS)
  }, [saveFromEditor])

  useCanvasSocket({
    documentRef,
    editorRef,
    hydrateEditor,
    saveTimerRef,
    setDocumentModel,
    setFileName,
    setStatus,
    socketRef,
  })

  const handleMount = useCallback(
    (editor) => {
      editorRef.current = editor
      window.__jsonCanvasTldrawEditor = editor
      hydrateEditor(editor, documentRef.current, false)

      const unsubscribe = editor.store.listen(
        () => {
          if (!hydratingRef.current) queueSave()
        },
        { source: "user", scope: "document" },
      )
      editor.__jsonCanvasUnsubscribe = unsubscribe
    },
    [hydrateEditor, queueSave],
  )

  useEffect(() => {
    return () => {
      editorRef.current?.__jsonCanvasUnsubscribe?.()
    }
  }, [])

  const addNode = useCallback(
    (type) => {
      const editor = editorRef.current
      if (!editor) return

      const nextNode = createNode(type, documentRef.current ?? createEmptyDocument())
      const nextDocument = {
        ...(documentRef.current ?? createEmptyDocument()),
        nodes: [...nodesOf(documentRef.current), nextNode],
        edges: edgesOf(documentRef.current),
      }
      documentRef.current = nextDocument
      setDocumentModel(nextDocument)

      const projection = jsonCanvasToTldraw({ nodes: [nextNode], edges: [] })
      const shape = projection.shapes[0]
      if (shape) {
        editor.createShape(shape)
        editor.select(shape.id)
      }
      queueSave()
    },
    [queueSave],
  )

  const fit = useCallback(() => {
    editorRef.current?.zoomToFit({ animation: { duration: 220 } })
  }, [])

  const save = useCallback(() => {
    saveFromEditor()
  }, [saveFromEditor])

  return React.createElement(
    "div",
    { className: "json-canvas-tldraw-shell" },
    React.createElement(
      "div",
      { className: "json-canvas-tldraw-bar" },
      React.createElement("strong", { className: "json-canvas-tldraw-title" }, fileName),
      React.createElement("button", { type: "button", onClick: () => addNode("text") }, "Text"),
      React.createElement("button", { type: "button", onClick: () => addNode("file") }, "File"),
      React.createElement("button", { type: "button", onClick: () => addNode("link") }, "Link"),
      React.createElement("button", { type: "button", onClick: () => addNode("group") }, "Group"),
      React.createElement("span", { className: "json-canvas-tldraw-spacer" }),
      React.createElement("button", { type: "button", onClick: fit }, "Fit"),
      React.createElement("button", { type: "button", onClick: save }, "Save"),
    ),
    React.createElement(
      "main",
      { className: "json-canvas-tldraw-stage", "data-json-canvas-node-count": nodesOf(documentModel).length },
      React.createElement(Tldraw, { onMount: handleMount }),
    ),
    React.createElement("json-canvas-status", null, status),
  )
}

function start() {
  const host = document.querySelector("json-canvas-editor")
  if (!host) return
  const root = createRoot(host)
  root.render(React.createElement(JsonCanvasTldrawApp, { host }))
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true })
} else {
  start()
}

export {
  edgeShapeId,
  jsonCanvasToTldraw,
  nodeShapeId,
  projectTldrawToJsonCanvas,
}
