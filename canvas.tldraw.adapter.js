// @ts-nocheck

export const TL_NODE_SHAPE_PREFIX = "shape:json-canvas-node:"
export const TL_EDGE_SHAPE_PREFIX = "shape:json-canvas-edge:"

const SUPPORTED_NODE_TYPES = new Set(["text", "file", "link", "group"])
const SIDES = new Set(["top", "right", "bottom", "left"])
export const DEFAULT_SIZE = {
  text: [250, 120],
  file: [400, 260],
  link: [420, 240],
  group: [520, 320],
}
const MIN_NODE_SIZE = 50
const CANVAS_COLOR_TO_TLDRAW = {
  1: "red",
  2: "orange",
  3: "yellow",
  4: "green",
  5: "light-blue",
  6: "violet",
  "#0000ff": "blue",
}

export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function nodesOf(documentModel) {
  return Array.isArray(documentModel?.nodes) ? documentModel.nodes : []
}

export function edgesOf(documentModel) {
  return Array.isArray(documentModel?.edges) ? documentModel.edges : []
}

export function isSupportedNode(node) {
  return (
    isRecord(node) &&
    typeof node.id === "string" &&
    typeof node.type === "string" &&
    SUPPORTED_NODE_TYPES.has(node.type)
  )
}

export function isSupportedEdge(edge) {
  return (
    isRecord(edge) &&
    typeof edge.id === "string" &&
    typeof edge.fromNode === "string" &&
    typeof edge.toNode === "string"
  )
}

function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function defaultSizeForType(type) {
  return DEFAULT_SIZE[type] ?? DEFAULT_SIZE.text
}

export function nodeRect(node) {
  const [defaultWidth, defaultHeight] = defaultSizeForType(node.type)
  return {
    x: Math.round(numberOr(node.x, 0)),
    y: Math.round(numberOr(node.y, 0)),
    width: Math.max(MIN_NODE_SIZE, Math.round(numberOr(node.width, defaultWidth))),
    height: Math.max(MIN_NODE_SIZE, Math.round(numberOr(node.height, defaultHeight))),
  }
}

function encodeId(value) {
  const bytes = new TextEncoder().encode(String(value))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "")
}

export function nodeShapeId(nodeId) {
  return `${TL_NODE_SHAPE_PREFIX}${encodeId(nodeId)}`
}

export function edgeShapeId(edgeId) {
  return `${TL_EDGE_SHAPE_PREFIX}${encodeId(edgeId)}`
}

function uniqueId(preferred, used) {
  let candidate = preferred
  let index = 2
  while (used.has(candidate)) {
    candidate = `${preferred}-${index++}`
  }
  used.add(candidate)
  return candidate
}

function idFromUnknownShape(shape, usedNodeIds) {
  return uniqueId(`tl-${encodeId(shape.id).slice(0, 36)}`, usedNodeIds)
}

function idFromUnknownArrow(shape, usedEdgeIds) {
  return uniqueId(`edge-${encodeId(shape.id).slice(0, 36)}`, usedEdgeIds)
}

export function richTextFromText(value) {
  const text = typeof value === "string" ? value : ""
  return {
    type: "doc",
    content: text.split("\n").map((line) =>
      line
        ? { type: "paragraph", content: [{ type: "text", text: line }] }
        : { type: "paragraph" },
    ),
  }
}

export function textFromRichText(value) {
  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content)) {
    return ""
  }

  const paragraphs = []
  for (const block of value.content) {
    if (!isRecord(block)) continue
    if (!Array.isArray(block.content)) {
      paragraphs.push("")
      continue
    }

    let text = ""
    for (const item of block.content) {
      if (isRecord(item) && typeof item.text === "string") text += item.text
    }
    paragraphs.push(text)
  }
  return paragraphs.join("\n")
}

function labelForNode(node) {
  if (node.type === "text") return typeof node.text === "string" ? node.text : ""
  if (node.type === "file") {
    return [node.file, node.subpath].filter((value) => typeof value === "string").join("")
  }
  if (node.type === "link") return typeof node.url === "string" ? node.url : ""
  if (node.type === "group") return typeof node.label === "string" ? node.label : ""
  return ""
}

function tldrawColorForCanvasColor(value) {
  return typeof value === "string" ? (CANVAS_COLOR_TO_TLDRAW[value] ?? "black") : "black"
}

function metaJsonCanvas(record) {
  const meta = isRecord(record?.meta) ? record.meta.jsonCanvas : undefined
  return isRecord(meta) ? meta : {}
}

function nodeShapeForNode(node) {
  const rect = nodeRect(node)
  return {
    id: nodeShapeId(node.id),
    type: "geo",
    x: rect.x,
    y: rect.y,
    rotation: 0,
    opacity: 1,
    isLocked: false,
    meta: {
      jsonCanvas: {
        kind: "node",
        nodeId: node.id,
        nodeType: node.type,
      },
    },
    props: {
      w: rect.width,
      h: rect.height,
      geo: "rectangle",
      dash: node.type === "group" ? "dashed" : "solid",
      growY: 0,
      url: "",
      scale: 1,
      color: tldrawColorForCanvasColor(node.color),
      labelColor: "black",
      fill: node.type === "group" ? "semi" : "none",
      size: "m",
      font: node.type === "text" ? "sans" : "draw",
      align: node.type === "text" ? "start" : "middle",
      verticalAlign: node.type === "text" ? "start" : "middle",
      richText: richTextFromText(labelForNode(node)),
    },
  }
}

function getArrowBindingProps(terminal) {
  return {
    terminal,
    normalizedAnchor: { x: 0.5, y: 0.5 },
    isExact: false,
    isPrecise: false,
    snap: "none",
  }
}

function edgeShapeForEdge(edge) {
  return {
    id: edgeShapeId(edge.id),
    type: "arrow",
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    isLocked: false,
    meta: {
      jsonCanvas: {
        kind: "edge",
        edgeId: edge.id,
      },
    },
    props: {
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      color: tldrawColorForCanvasColor(edge.color),
      richText: richTextFromText(typeof edge.label === "string" ? edge.label : ""),
    },
  }
}

export function jsonCanvasToTldraw(documentModel) {
  const nodeShapes = []
  const edgeShapes = []
  const bindings = []
  const renderedNodeIds = new Set()
  const renderedEdgeIds = new Set()
  const nodeShapeIdByNodeId = new Map()

  for (const node of nodesOf(documentModel)) {
    if (!isSupportedNode(node)) continue
    const shape = nodeShapeForNode(node)
    renderedNodeIds.add(node.id)
    nodeShapeIdByNodeId.set(node.id, shape.id)
    nodeShapes.push(shape)
  }

  for (const edge of edgesOf(documentModel)) {
    if (!isSupportedEdge(edge)) continue
    const fromShapeId = nodeShapeIdByNodeId.get(edge.fromNode)
    const toShapeId = nodeShapeIdByNodeId.get(edge.toNode)
    if (!fromShapeId || !toShapeId) continue

    const shape = edgeShapeForEdge(edge)
    renderedEdgeIds.add(edge.id)
    edgeShapes.push(shape)
    bindings.push(
      {
        fromId: shape.id,
        toId: fromShapeId,
        type: "arrow",
        props: getArrowBindingProps("start"),
      },
      {
        fromId: shape.id,
        toId: toShapeId,
        type: "arrow",
        props: getArrowBindingProps("end"),
      },
    )
  }

  return {
    shapes: [...nodeShapes, ...edgeShapes],
    bindings,
    renderedNodeIds,
    renderedEdgeIds,
  }
}

function shapeWidth(shape, nodeType) {
  const [defaultWidth] = defaultSizeForType(nodeType)
  return Math.max(MIN_NODE_SIZE, Math.round(numberOr(shape.props?.w, defaultWidth)))
}

function shapeHeight(shape, nodeType) {
  const [, defaultHeight] = defaultSizeForType(nodeType)
  return Math.max(MIN_NODE_SIZE, Math.round(numberOr(shape.props?.h, defaultHeight)))
}

function shapeText(shape) {
  return textFromRichText(shape.props?.richText)
}

function nodeTypeForShape(shape) {
  const meta = metaJsonCanvas(shape)
  return typeof meta.nodeType === "string" && SUPPORTED_NODE_TYPES.has(meta.nodeType)
    ? meta.nodeType
    : "text"
}

function nodeIdForShape(shape, usedNodeIds) {
  const meta = metaJsonCanvas(shape)
  if (typeof meta.nodeId === "string" && !usedNodeIds.has(meta.nodeId)) {
    usedNodeIds.add(meta.nodeId)
    return meta.nodeId
  }
  return idFromUnknownShape(shape, usedNodeIds)
}

function edgeIdForShape(shape, usedEdgeIds) {
  const meta = metaJsonCanvas(shape)
  if (typeof meta.edgeId === "string" && !usedEdgeIds.has(meta.edgeId)) {
    usedEdgeIds.add(meta.edgeId)
    return meta.edgeId
  }
  return idFromUnknownArrow(shape, usedEdgeIds)
}

function makeNodeFromShape(shape, baseNode, usedNodeIds) {
  const nodeType = nodeTypeForShape(shape)
  const id = nodeIdForShape(shape, usedNodeIds)
  const text = shapeText(shape)
  const nextNode = {
    ...(isRecord(baseNode) ? baseNode : {}),
    id,
    type: nodeType,
    x: Math.round(numberOr(shape.x, 0)),
    y: Math.round(numberOr(shape.y, 0)),
    width: shapeWidth(shape, nodeType),
    height: shapeHeight(shape, nodeType),
  }

  if (nodeType === "text") nextNode.text = text
  if (nodeType === "file" && !isRecord(baseNode)) nextNode.file = text || ""
  if (nodeType === "link" && !isRecord(baseNode)) nextNode.url = text || ""
  if (nodeType === "group") nextNode.label = text

  return nextNode
}

function getShapeNodeId(shape) {
  const meta = metaJsonCanvas(shape)
  return typeof meta.nodeId === "string" ? meta.nodeId : undefined
}

function bindingTerminalsByArrowId(bindings) {
  const byArrowId = new Map()
  for (const binding of bindings) {
    if (!isRecord(binding) || typeof binding.fromId !== "string") continue
    const terminal = binding.props?.terminal
    if (terminal !== "start" && terminal !== "end") continue
    const current = byArrowId.get(binding.fromId) ?? {}
    current[terminal] = binding
    byArrowId.set(binding.fromId, current)
  }
  return byArrowId
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

function normalizedSide(value, fallback) {
  return typeof value === "string" && SIDES.has(value) ? value : fallback
}

function makeEdgeFromArrow(shape, baseEdge, terminals, nodeIdByShapeId, nodeById, usedEdgeIds) {
  const fromNode = nodeIdByShapeId.get(terminals.start?.toId)
  const toNode = nodeIdByShapeId.get(terminals.end?.toId)
  if (!fromNode || !toNode || fromNode === toNode) return undefined

  const fromNodeRecord = nodeById.get(fromNode)
  const toNodeRecord = nodeById.get(toNode)
  if (!fromNodeRecord || !toNodeRecord) return undefined

  const inferred = inferSides(fromNodeRecord, toNodeRecord)
  const id = edgeIdForShape(shape, usedEdgeIds)
  return {
    ...(isRecord(baseEdge) ? baseEdge : {}),
    id,
    fromNode,
    fromSide: normalizedSide(baseEdge?.fromSide, inferred.fromSide),
    fromEnd: baseEdge?.fromEnd === "arrow" ? "arrow" : "none",
    toNode,
    toSide: normalizedSide(baseEdge?.toSide, inferred.toSide),
    toEnd: baseEdge?.toEnd === "none" ? "none" : "arrow",
    label: shapeText(shape),
  }
}

export function projectTldrawToJsonCanvas(baseDocument, shapes, bindings) {
  const baseNodes = nodesOf(baseDocument)
  const baseEdges = edgesOf(baseDocument)
  const baseNodeById = new Map(baseNodes.filter(isRecord).map((node) => [node.id, node]))
  const baseEdgeById = new Map(baseEdges.filter(isRecord).map((edge) => [edge.id, edge]))
  const baseProjection = jsonCanvasToTldraw(baseDocument)
  const usedNodeIds = new Set()
  const usedEdgeIds = new Set()
  const nodeByOriginalId = new Map()
  const newNodes = []
  const nodeIdByShapeId = new Map()

  for (const shape of shapes) {
    if (!isRecord(shape) || shape.type === "arrow") continue
    const originalNodeId = getShapeNodeId(shape)
    const baseNode = originalNodeId ? baseNodeById.get(originalNodeId) : undefined
    const node = makeNodeFromShape(shape, baseNode, usedNodeIds)
    nodeIdByShapeId.set(shape.id, node.id)
    if (originalNodeId && baseNodeById.has(originalNodeId)) {
      nodeByOriginalId.set(originalNodeId, node)
    }
    else newNodes.push(node)
  }

  const nodes = []
  for (const node of baseNodes) {
    if (isSupportedNode(node)) {
      const projected = nodeByOriginalId.get(node.id)
      if (projected) nodes.push(projected)
    } else {
      nodes.push(node)
    }
  }
  nodes.push(...newNodes)

  const nodeById = new Map(nodes.filter(isRecord).map((node) => [node.id, node]))
  const terminalsByArrowId = bindingTerminalsByArrowId(bindings)
  const edgeByOriginalId = new Map()
  const newEdges = []

  for (const shape of shapes) {
    if (!isRecord(shape) || shape.type !== "arrow") continue
    const terminals = terminalsByArrowId.get(shape.id)
    if (!terminals?.start || !terminals?.end) continue
    const originalEdgeId = metaJsonCanvas(shape).edgeId
    const baseEdge = typeof originalEdgeId === "string" ? baseEdgeById.get(originalEdgeId) : undefined
    const edge = makeEdgeFromArrow(
      shape,
      baseEdge,
      terminals,
      nodeIdByShapeId,
      nodeById,
      usedEdgeIds,
    )
    if (!edge) continue
    if (typeof originalEdgeId === "string") edgeByOriginalId.set(originalEdgeId, edge)
    else newEdges.push(edge)
  }

  const edges = []
  for (const edge of baseEdges) {
    if (!isSupportedEdge(edge)) {
      edges.push(edge)
      continue
    }

    const projected = edgeByOriginalId.get(edge.id)
    if (projected) {
      edges.push(projected)
      continue
    }

    if (!baseProjection.renderedEdgeIds.has(edge.id)) edges.push(edge)
  }
  edges.push(...newEdges)

  return {
    ...(isRecord(baseDocument) ? baseDocument : {}),
    nodes,
    edges,
  }
}
