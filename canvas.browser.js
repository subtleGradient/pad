// @ts-nocheck

const SAVE_DELAY_MS = 220
const MIN_ZOOM = -4
const MAX_ZOOM = 1
const DEFAULT_SIZE = {
  text: [250, 120],
  file: [400, 260],
  link: [420, 240],
  group: [520, 320],
}
const SIDES = new Set(["top", "right", "bottom", "left"])

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function scaleForZoom(zoom) {
  return 2 ** zoom
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nodesOf(documentModel) {
  if (!Array.isArray(documentModel.nodes)) documentModel.nodes = []
  return documentModel.nodes
}

function edgesOf(documentModel) {
  if (!Array.isArray(documentModel.edges)) documentModel.edges = []
  return documentModel.edges
}

function supportedNode(node) {
  return (
    isRecord(node) &&
    typeof node.id === "string" &&
    typeof node.type === "string" &&
    ["text", "file", "link", "group"].includes(node.type)
  )
}

function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function nodeRect(node) {
  const [defaultWidth, defaultHeight] = DEFAULT_SIZE[node.type] ?? DEFAULT_SIZE.text
  return {
    x: Math.round(numberOr(node.x, 0)),
    y: Math.round(numberOr(node.y, 0)),
    width: Math.max(50, Math.round(numberOr(node.width, defaultWidth))),
    height: Math.max(50, Math.round(numberOr(node.height, defaultHeight))),
  }
}

function applyNodeRect(node) {
  const rect = nodeRect(node)
  Object.assign(node, rect)
  return rect
}

function colorClass(value) {
  return typeof value === "string" && /^[1-6]$/.test(value)
    ? `canvas-color-${value}`
    : ""
}

function customColorValue(value) {
  if (typeof value !== "string" || value === "" || /^[1-6]$/.test(value)) return ""
  if (/[\n\r;]/.test(value)) return ""
  return value
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`
}

function endpoint(node, side) {
  const rect = nodeRect(node)
  switch (SIDES.has(side) ? side : "right") {
    case "top":
      return { x: rect.x + rect.width / 2, y: rect.y }
    case "bottom":
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case "left":
      return { x: rect.x, y: rect.y + rect.height / 2 }
    default:
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
  }
}

function inferSides(fromNode, toNode) {
  const from = nodeRect(fromNode)
  const to = nodeRect(toNode)
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
  const dx = toCenter.x - fromCenter.x
  const dy = toCenter.y - fromCenter.y

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" }
  }

  return dy >= 0
    ? { fromSide: "bottom", toSide: "top" }
    : { fromSide: "top", toSide: "bottom" }
}

function bezierPath(fromNode, toNode, edge) {
  const inferred = inferSides(fromNode, toNode)
  const fromSide = SIDES.has(edge.fromSide) ? edge.fromSide : inferred.fromSide
  const toSide = SIDES.has(edge.toSide) ? edge.toSide : inferred.toSide
  const start = endpoint(fromNode, fromSide)
  const end = endpoint(toNode, toSide)
  const distance = Math.max(80, Math.hypot(end.x - start.x, end.y - start.y) / 2)
  const handle = (point, side) => {
    switch (side) {
      case "top":
        return { x: point.x, y: point.y - distance }
      case "bottom":
        return { x: point.x, y: point.y + distance }
      case "left":
        return { x: point.x - distance, y: point.y }
      default:
        return { x: point.x + distance, y: point.y }
    }
  }
  const c1 = handle(start, fromSide)
  const c2 = handle(end, toSide)
  return {
    d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
  }
}

function screenToCanvas(clientX, clientY, surface, viewport) {
  const bounds = surface.getBoundingClientRect()
  const scale = scaleForZoom(viewport.zoom)
  return {
    x: (clientX - bounds.left) / scale + viewport.x,
    y: (clientY - bounds.top) / scale + viewport.y,
  }
}

class JsonCanvasEditor extends HTMLElement {
  connectedCallback() {
    this.documentModel = { nodes: [], edges: [] }
    this.nodeById = new Map()
    this.viewport = { x: 0, y: 0, zoom: 0 }
    this.selectedId = undefined
    this.drag = undefined
    this.socket = undefined
    this.saveTimer = undefined
    this.saveCount = 0
    this.fileName = this.getAttribute("file-name") ?? "canvas"

    this.innerHTML = `
      <div class="json-canvas-shell">
        <div class="json-canvas-topbar" data-canvas-runtime>
          <strong class="json-canvas-title"></strong>
          <button type="button" data-action="text">Text</button>
          <button type="button" data-action="file">File</button>
          <button type="button" data-action="link">Link</button>
          <button type="button" data-action="group">Group</button>
          <span class="json-canvas-spacer"></span>
          <button type="button" data-action="zoom-out" title="Zoom out">-</button>
          <button type="button" data-action="zoom-reset" title="Reset zoom">100%</button>
          <button type="button" data-action="zoom-fit" title="Zoom to fit">Fit</button>
          <button type="button" data-action="zoom-in" title="Zoom in">+</button>
          <button type="button" data-action="save">Save</button>
        </div>
        <div class="json-canvas-surface" tabindex="0">
          <div class="json-canvas-world">
            <svg class="json-canvas-edges" aria-hidden="true"></svg>
            <div class="json-canvas-nodes"></div>
          </div>
          <div class="json-canvas-empty">Double-click to create a text card.</div>
        </div>
        <json-canvas-status data-canvas-runtime></json-canvas-status>
      </div>
    `

    this.titleElement = this.querySelector(".json-canvas-title")
    this.surface = this.querySelector(".json-canvas-surface")
    this.world = this.querySelector(".json-canvas-world")
    this.edgeLayer = this.querySelector(".json-canvas-edges")
    this.nodeLayer = this.querySelector(".json-canvas-nodes")
    this.emptyElement = this.querySelector(".json-canvas-empty")
    this.statusElement = this.querySelector("json-canvas-status")
    this.titleElement.textContent = this.fileName

    this.addEventListener("click", (event) => this.handleToolbarClick(event))
    this.surface.addEventListener("pointerdown", (event) => this.handlePointerDown(event))
    this.surface.addEventListener("dblclick", (event) => this.handleDoubleClick(event))
    this.surface.addEventListener("wheel", (event) => this.handleWheel(event), { passive: false })
    this.surface.addEventListener("keydown", (event) => this.handleKeyDown(event))
    this.connect()
    this.render()
  }

  setStatus(text) {
    this.statusElement.textContent = text
  }

  connect() {
    if (location.protocol !== "http:" && location.protocol !== "https:") {
      this.setStatus("Run with pad to enable saving.")
      return
    }

    this.setStatus("Connecting...")
    const protocol = location.protocol === "https:" ? "wss:" : "ws:"
    this.socket = new WebSocket(`${protocol}//${location.host}/ws${location.search}`)

    this.socket.addEventListener("open", () => {
      this.setStatus("Connected.")
    })

    this.socket.addEventListener("message", (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }

      if (message.type === "ready" && message.kind === "canvas") {
        this.fileName = message.fileName ?? this.fileName
        this.titleElement.textContent = this.fileName
        this.documentModel = isRecord(message.document) ? message.document : { nodes: [], edges: [] }
        this.setStatus(message.parseError ? `Loaded fallback: ${message.parseError}` : "Editable. Changes autosave.")
        this.fitToContent(false)
        this.render()
      }

      if (message.type === "saved") {
        this.saveCount = message.saveCount ?? this.saveCount
        this.setStatus(`Saved ${new Date(message.savedAt).toLocaleTimeString()}`)
      }

      if (message.type === "reload") {
        this.setStatus("Source changed. Reloading...")
        location.reload()
      }

      if (message.type === "error") this.setStatus(`Canvas error: ${message.message}`)
    })

    this.socket.addEventListener("close", () => this.setStatus("Disconnected."))
    this.socket.addEventListener("error", () => this.setStatus("Connection failed."))
  }

  render() {
    this.nodeById = new Map()
    const nodes = nodesOf(this.documentModel).filter(supportedNode)
    for (const node of nodes) {
      applyNodeRect(node)
      this.nodeById.set(node.id, node)
    }

    this.renderViewport()
    this.renderEdges()
    this.renderNodes(nodes)
    this.emptyElement.hidden = nodes.length !== 0
  }

  renderViewport() {
    const scale = scaleForZoom(this.viewport.zoom)
    this.world.style.transform = `translate(${-this.viewport.x * scale}px, ${-this.viewport.y * scale}px) scale(${scale})`
    const grid = this.gridSpacing() * scale
    this.surface.style.setProperty("--canvas-grid-size", `${grid}px`)
    this.surface.style.setProperty("--canvas-grid-x", `${-this.viewport.x * scale}px`)
    this.surface.style.setProperty("--canvas-grid-y", `${-this.viewport.y * scale}px`)
  }

  gridSpacing() {
    if (this.viewport.zoom < -2.5) return 160
    if (this.viewport.zoom < -1.4) return 80
    if (this.viewport.zoom < -0.4) return 40
    return 20
  }

  renderNodes(nodes) {
    this.nodeLayer.replaceChildren()
    const ordered = [...nodes].sort((a, b) => {
      if (a.type === "group" && b.type === "group") {
        const ar = nodeRect(a)
        const br = nodeRect(b)
        return br.width * br.height - ar.width * ar.height
      }
      if (a.type === "group") return -1
      if (b.type === "group") return 1
      return 0
    })

    for (const node of ordered) this.nodeLayer.append(this.createNodeElement(node))
  }

  createNodeElement(node) {
    const rect = nodeRect(node)
    const element = document.createElement("json-canvas-node")
    element.dataset.nodeId = node.id
    element.dataset.nodeType = node.type
    element.className = [
      "json-canvas-node",
      `json-canvas-node-${node.type}`,
      colorClass(node.color),
      this.selectedId === node.id ? "is-selected" : "",
    ].filter(Boolean).join(" ")
    element.style.cssText = [
      `left:${rect.x}px`,
      `top:${rect.y}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
    ].filter(Boolean).join(";")
    const customColor = customColorValue(node.color)
    if (customColor) element.style.setProperty("--canvas-node-color", customColor)

    if (node.type === "text") {
      const textarea = document.createElement("textarea")
      textarea.value = typeof node.text === "string" ? node.text : ""
      textarea.placeholder = "Text"
      textarea.addEventListener("input", () => {
        node.text = textarea.value
        this.queueSave()
      })
      element.append(textarea)
    } else if (node.type === "file") {
      element.append(this.cardLabel("File", node.file, node.subpath))
    } else if (node.type === "link") {
      const link = document.createElement("a")
      link.href = typeof node.url === "string" ? node.url : "#"
      link.target = "_blank"
      link.rel = "noreferrer"
      link.textContent = typeof node.url === "string" ? node.url : "Set URL"
      element.append(this.cardLabel("Link"), link)
    } else if (node.type === "group") {
      const label = document.createElement("input")
      label.value = typeof node.label === "string" ? node.label : ""
      label.placeholder = "Group"
      label.addEventListener("input", () => {
        node.label = label.value
        this.queueSave()
      })
      element.append(label)
    }

    const handle = document.createElement("button")
    handle.type = "button"
    handle.className = "json-canvas-resize"
    handle.dataset.resizeHandle = "se"
    handle.title = "Resize"
    handle.textContent = ""
    element.append(handle)
    return element
  }

  cardLabel(kind, value, suffix) {
    const label = document.createElement("div")
    label.className = "json-canvas-card-label"
    const title = document.createElement("strong")
    title.textContent = kind
    const body = document.createElement("span")
    body.textContent = [value, suffix].filter(Boolean).join("")
    label.append(title, body)
    return label
  }

  renderEdges() {
    this.edgeLayer.replaceChildren()
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs")
    defs.innerHTML = `
      <marker id="json-canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z"></path>
      </marker>
    `
    this.edgeLayer.append(defs)

    for (const edge of edgesOf(this.documentModel)) {
      if (!isRecord(edge)) continue
      const fromNode = this.nodeById.get(edge.fromNode)
      const toNode = this.nodeById.get(edge.toNode)
      if (!fromNode || !toNode) continue
      const pathInfo = bezierPath(fromNode, toNode, edge)
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
      path.setAttribute("d", pathInfo.d)
      path.setAttribute("class", "json-canvas-edge")
      if (edge.toEnd !== "none") path.setAttribute("marker-end", "url(#json-canvas-arrow)")
      if (edge.fromEnd === "arrow") path.setAttribute("marker-start", "url(#json-canvas-arrow)")
      this.edgeLayer.append(path)

      if (typeof edge.label === "string" && edge.label.trim()) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text")
        text.setAttribute("x", String(pathInfo.label.x))
        text.setAttribute("y", String(pathInfo.label.y))
        text.setAttribute("class", "json-canvas-edge-label")
        text.textContent = edge.label
        this.edgeLayer.append(text)
      }
    }
  }

  handleToolbarClick(event) {
    const button = event.target.closest("button[data-action]")
    if (!button) return
    const action = button.dataset.action
    if (["text", "file", "link", "group"].includes(action)) this.addNode(action)
    if (action === "zoom-in") this.setZoom(this.viewport.zoom + 0.25)
    if (action === "zoom-out") this.setZoom(this.viewport.zoom - 0.25)
    if (action === "zoom-reset") this.setViewport({ ...this.viewport, zoom: 0 })
    if (action === "zoom-fit") this.fitToContent(true)
    if (action === "save") this.save()
  }

  handleDoubleClick(event) {
    if (event.target.closest("json-canvas-node")) return
    const point = screenToCanvas(event.clientX, event.clientY, this.surface, this.viewport)
    this.addNode("text", point)
  }

  handlePointerDown(event) {
    const resizeHandle = event.target.closest("[data-resize-handle]")
    const nodeElement = event.target.closest("json-canvas-node")

    if (resizeHandle && nodeElement) {
      this.startResize(event, nodeElement.dataset.nodeId)
      return
    }

    if (nodeElement && !event.target.matches("textarea,input,a")) {
      this.startMove(event, nodeElement.dataset.nodeId)
      return
    }

    if (!nodeElement) this.startPan(event)
  }

  startMove(event, nodeId) {
    const node = this.nodeById.get(nodeId)
    if (!node) return
    this.selectedId = nodeId
    this.surface.focus({ preventScroll: true })
    const start = screenToCanvas(event.clientX, event.clientY, this.surface, this.viewport)
    const rect = nodeRect(node)
    this.drag = { type: "move", nodeId, start, rect }
    this.bindDrag(event)
    this.render()
  }

  startResize(event, nodeId) {
    const node = this.nodeById.get(nodeId)
    if (!node) return
    this.selectedId = nodeId
    const start = screenToCanvas(event.clientX, event.clientY, this.surface, this.viewport)
    const rect = nodeRect(node)
    this.drag = { type: "resize", nodeId, start, rect }
    this.bindDrag(event)
    this.render()
  }

  startPan(event) {
    this.selectedId = undefined
    const start = { x: event.clientX, y: event.clientY }
    this.drag = { type: "pan", start, viewport: { ...this.viewport } }
    this.bindDrag(event)
    this.render()
  }

  bindDrag(event) {
    event.preventDefault()
    this.surface.setPointerCapture(event.pointerId)
    const move = (moveEvent) => this.handlePointerMove(moveEvent)
    const up = (upEvent) => {
      this.surface.releasePointerCapture(upEvent.pointerId)
      this.surface.removeEventListener("pointermove", move)
      this.surface.removeEventListener("pointerup", up)
      const shouldSave = this.drag?.type === "move" || this.drag?.type === "resize"
      this.drag = undefined
      if (shouldSave) this.queueSave()
    }
    this.surface.addEventListener("pointermove", move)
    this.surface.addEventListener("pointerup", up)
  }

  handlePointerMove(event) {
    if (!this.drag) return

    if (this.drag.type === "pan") {
      const scale = scaleForZoom(this.viewport.zoom)
      this.setViewport({
        ...this.drag.viewport,
        x: this.drag.viewport.x - (event.clientX - this.drag.start.x) / scale,
        y: this.drag.viewport.y - (event.clientY - this.drag.start.y) / scale,
      })
      return
    }

    const node = this.nodeById.get(this.drag.nodeId)
    if (!node) return

    const point = screenToCanvas(event.clientX, event.clientY, this.surface, this.viewport)
    const dx = Math.round(point.x - this.drag.start.x)
    const dy = Math.round(point.y - this.drag.start.y)

    if (this.drag.type === "move") {
      node.x = this.drag.rect.x + dx
      node.y = this.drag.rect.y + dy
    } else {
      node.width = Math.max(50, this.drag.rect.width + dx)
      node.height = Math.max(50, this.drag.rect.height + dy)
    }

    this.render()
  }

  handleWheel(event) {
    event.preventDefault()
    if (event.metaKey || event.ctrlKey) {
      const before = screenToCanvas(event.clientX, event.clientY, this.surface, this.viewport)
      const nextZoom = clamp(this.viewport.zoom - event.deltaY / 500, MIN_ZOOM, MAX_ZOOM)
      const nextScale = scaleForZoom(nextZoom)
      const bounds = this.surface.getBoundingClientRect()
      this.setViewport({
        x: before.x - (event.clientX - bounds.left) / nextScale,
        y: before.y - (event.clientY - bounds.top) / nextScale,
        zoom: nextZoom,
      })
      return
    }

    const scale = scaleForZoom(this.viewport.zoom)
    this.setViewport({
      ...this.viewport,
      x: this.viewport.x + event.deltaX / scale,
      y: this.viewport.y + event.deltaY / scale,
    })
  }

  handleKeyDown(event) {
    if (event.target.matches("textarea,input")) return
    if ((event.key === "Backspace" || event.key === "Delete") && this.selectedId) {
      this.removeSelected()
      event.preventDefault()
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      this.save()
      event.preventDefault()
    }
    if (event.key === "Escape") {
      this.selectedId = undefined
      this.render()
    }
  }

  setZoom(zoom) {
    this.setViewport({ ...this.viewport, zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) })
  }

  setViewport(viewport) {
    this.viewport = viewport
    this.renderViewport()
  }

  addNode(type, point) {
    const [width, height] = DEFAULT_SIZE[type]
    const center = point ?? {
      x: this.viewport.x + this.surface.clientWidth / scaleForZoom(this.viewport.zoom) / 2,
      y: this.viewport.y + this.surface.clientHeight / scaleForZoom(this.viewport.zoom) / 2,
    }
    const node = {
      id: makeId("node"),
      type,
      x: Math.round(center.x - width / 2),
      y: Math.round(center.y - height / 2),
      width,
      height,
    }
    if (type === "text") node.text = ""
    if (type === "file") node.file = prompt("Vault-relative file path") ?? ""
    if (type === "link") node.url = prompt("URL") ?? "https://example.com"
    if (type === "group") node.label = "Group"
    nodesOf(this.documentModel).push(node)
    this.selectedId = node.id
    this.render()
    this.queueSave()
  }

  removeSelected() {
    const nodeId = this.selectedId
    if (!nodeId) return
    this.documentModel.nodes = nodesOf(this.documentModel).filter(
      (node) => !(isRecord(node) && node.id === nodeId),
    )
    this.documentModel.edges = edgesOf(this.documentModel).filter(
      (edge) => !(isRecord(edge) && (edge.fromNode === nodeId || edge.toNode === nodeId)),
    )
    this.selectedId = undefined
    this.render()
    this.queueSave()
  }

  fitToContent(animateStatus) {
    const nodes = nodesOf(this.documentModel).filter(supportedNode)
    if (nodes.length === 0 || !this.surface) return
    const rects = nodes.map(nodeRect)
    const left = Math.min(...rects.map((rect) => rect.x))
    const top = Math.min(...rects.map((rect) => rect.y))
    const right = Math.max(...rects.map((rect) => rect.x + rect.width))
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
    const width = Math.max(1, right - left)
    const height = Math.max(1, bottom - top)
    const fitScale = Math.min(
      this.surface.clientWidth / (width + 160),
      this.surface.clientHeight / (height + 160),
    )
    const zoom = clamp(Math.log2(fitScale), MIN_ZOOM, MAX_ZOOM)
    const scale = scaleForZoom(zoom)
    this.viewport = {
      x: left + width / 2 - this.surface.clientWidth / scale / 2,
      y: top + height / 2 - this.surface.clientHeight / scale / 2,
      zoom,
    }
    this.renderViewport()
    if (animateStatus) this.setStatus("Zoomed to fit.")
  }

  queueSave() {
    window.clearTimeout(this.saveTimer)
    this.setStatus("Editing... autosave queued")
    this.saveTimer = window.setTimeout(() => this.save(), SAVE_DELAY_MS)
  }

  save() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    window.clearTimeout(this.saveTimer)
    this.socket.send(JSON.stringify({ type: "canvas", document: this.documentModel }))
    this.setStatus("Saving...")
  }
}

class JsonCanvasStatus extends HTMLElement {}
class JsonCanvasNode extends HTMLElement {}

if (!customElements.get("json-canvas-editor")) {
  customElements.define("json-canvas-editor", JsonCanvasEditor)
}
if (!customElements.get("json-canvas-status")) {
  customElements.define("json-canvas-status", JsonCanvasStatus)
}
if (!customElements.get("json-canvas-node")) {
  customElements.define("json-canvas-node", JsonCanvasNode)
}
