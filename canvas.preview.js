// @ts-nocheck

import {
  edgesOf,
  isSupportedEdge,
  isSupportedNode,
  nodeRect,
  nodesOf,
} from "./canvas.tldraw.adapter.js"

const PREVIEW_PADDING = 96
const EMPTY_VIEWBOX = "-360 -240 720 480"
const LINE_HEIGHT = 18

const CANVAS_COLORS = {
  1: { stroke: "#ef4444", fill: "#fef2f2" },
  2: { stroke: "#f97316", fill: "#fff7ed" },
  3: { stroke: "#22c55e", fill: "#f0fdf4" },
  4: { stroke: "#3b82f6", fill: "#eff6ff" },
  5: { stroke: "#8b5cf6", fill: "#f5f3ff" },
  6: { stroke: "#dc2626", fill: "#fef2f2" },
}

const html = String.raw
const css = String.raw
const js = String.raw

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function colorStyle(value) {
  return CANVAS_COLORS[value] ?? { stroke: "#64748b", fill: "#ffffff" }
}

function nodeLabel(node) {
  if (node.type === "text")
    return typeof node.text === "string" ? node.text : ""
  if (node.type === "file") {
    return [node.file, node.subpath]
      .filter((value) => typeof value === "string")
      .join("")
  }
  if (node.type === "link") return typeof node.url === "string" ? node.url : ""
  if (node.type === "group")
    return typeof node.label === "string" ? node.label : ""
  return ""
}

function edgeLabel(edge) {
  return typeof edge.label === "string" ? edge.label : ""
}

function sidePoint(rect, side) {
  if (side === "top") return [rect.x + rect.width / 2, rect.y]
  if (side === "right") return [rect.x + rect.width, rect.y + rect.height / 2]
  if (side === "bottom") return [rect.x + rect.width / 2, rect.y + rect.height]
  if (side === "left") return [rect.x, rect.y + rect.height / 2]
  return [rect.x + rect.width / 2, rect.y + rect.height / 2]
}

function collectViewBox(rects) {
  if (rects.length === 0) return EMPTY_VIEWBOX

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }

  minX -= PREVIEW_PADDING
  minY -= PREVIEW_PADDING
  maxX += PREVIEW_PADDING
  maxY += PREVIEW_PADDING

  return [
    Math.round(minX),
    Math.round(minY),
    Math.max(1, Math.round(maxX - minX)),
    Math.max(1, Math.round(maxY - minY)),
  ].join(" ")
}

function wrapText(text, maxChars, maxLines) {
  const lines = []
  const hardLines = String(text || "").split(/\r?\n/)

  for (const hardLine of hardLines) {
    const words = hardLine.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push("")
    } else {
      let line = ""
      for (const word of words) {
        if (!line) {
          line = word
          continue
        }
        if (`${line} ${word}`.length <= maxChars) {
          line = `${line} ${word}`
          continue
        }
        lines.push(line)
        line = word
      }
      if (line) lines.push(line)
    }
    if (lines.length >= maxLines) break
  }

  if (lines.length > maxLines) lines.length = maxLines
  if (
    lines.length === maxLines &&
    hardLines.join("\n").length > lines.join("\n").length
  ) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\.+$/g, "")}...`
  }
  return lines
}

function renderText(lines, x, y) {
  return lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : LINE_HEIGHT
      return `<tspan x="${x}" dy="${dy}">${escapeHtml(line)}</tspan>`
    })
    .join("")
}

function renderNode(node, rect, index) {
  const colors = colorStyle(node.color)
  const title = nodeLabel(node) || node.type
  const maxChars = Math.max(12, Math.floor((rect.width - 32) / 8))
  const maxLines = Math.max(1, Math.floor((rect.height - 44) / LINE_HEIGHT))
  const lines = wrapText(title, maxChars, maxLines)
  const clipId = `node-clip-${index}`
  const dash = node.type === "group" ? ' stroke-dasharray="8 8"' : ""
  const label = escapeHtml(node.type)

  return html`<g class="canvas-node canvas-node-${escapeHtml(node.type)}">
    <clipPath id="${clipId}"
      ><rect
        x="${rect.x + 14}"
        y="${rect.y + 14}"
        width="${Math.max(1, rect.width - 28)}"
        height="${Math.max(1, rect.height - 28)}"
        rx="6"
      ></rect
    ></clipPath>
    <rect
      x="${rect.x}"
      y="${rect.y}"
      width="${rect.width}"
      height="${rect.height}"
      rx="8"
      fill="${colors.fill}"
      stroke="${colors.stroke}"
      ${dash}
    ></rect>
    <text class="node-type" x="${rect.x + 16}" y="${rect.y + 22}"
      >${label}</text
    >
    <text
      class="node-label"
      x="${rect.x + 16}"
      y="${rect.y + 48}"
      clip-path="url(#${clipId})"
      >${renderText(lines, rect.x + 16, rect.y + 48)}</text
    >
  </g>`
}

function renderEdge(edge, rectByNodeId) {
  const fromRect = rectByNodeId.get(edge.fromNode)
  const toRect = rectByNodeId.get(edge.toNode)
  if (!fromRect || !toRect) return ""

  const [x1, y1] = sidePoint(fromRect, edge.fromSide)
  const [x2, y2] = sidePoint(toRect, edge.toSide)
  const colors = colorStyle(edge.color)
  const label = edgeLabel(edge)
  const midpointX = (x1 + x2) / 2
  const midpointY = (y1 + y2) / 2
  const markerStart =
    edge.fromEnd && edge.fromEnd !== "none"
      ? ' marker-start="url(#marker-arrow-start)"'
      : ""
  const markerEnd =
    edge.toEnd === "none" ? "" : ' marker-end="url(#marker-arrow-end)"'
  const renderedLabel = label
    ? html`<text class="edge-label" x="${midpointX}" y="${midpointY - 8}"
        >${escapeHtml(label)}</text
      >`
    : ""

  return html`<g class="canvas-edge">
    <line
      x1="${x1}"
      y1="${y1}"
      x2="${x2}"
      y2="${y2}"
      stroke="${colors.stroke}"
      ${markerStart}${markerEnd}
    ></line>
    ${renderedLabel}
  </g>`
}

function previewStyles() {
  return html`<style>
    :root {
      color-scheme: light dark;
    }
    html,
    body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    body {
      background: #f7f5ef;
      color: #171717;
      font:
        13px -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }
    .preview-shell {
      width: 100vw;
      height: 100vh;
      position: relative;
    }
    .preview-bar {
      position: absolute;
      z-index: 2;
      left: 14px;
      top: 14px;
      display: flex;
      gap: 10px;
      align-items: center;
      max-width: calc(100vw - 28px);
      padding: 8px 10px;
      border: 1px solid rgba(23, 23, 23, 0.14);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.88);
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
      box-sizing: border-box;
    }
    .preview-name {
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .preview-meta {
      color: rgba(23, 23, 23, 0.64);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .preview-error {
      color: #b91c1c;
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .canvas-edge line {
      stroke-width: 3;
      stroke-linecap: round;
      opacity: 0.82;
    }
    .edge-label {
      paint-order: stroke;
      stroke: #f7f5ef;
      stroke-width: 7;
      stroke-linejoin: round;
      fill: #171717;
      text-anchor: middle;
      font-size: 13px;
      font-weight: 650;
    }
    .canvas-node rect {
      stroke-width: 2;
      filter: drop-shadow(0 8px 16px rgba(15, 23, 42, 0.12));
    }
    .node-type {
      fill: rgba(23, 23, 23, 0.54);
      font-size: 11px;
      font-weight: 750;
      text-transform: uppercase;
    }
    .node-label {
      fill: #171717;
      font-size: 15px;
      font-weight: 620;
    }
    .empty-state {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: rgba(23, 23, 23, 0.58);
      font-size: 18px;
      font-weight: 650;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background: #121314;
        color: #f2f1ed;
      }
      .preview-bar {
        border-color: rgba(242, 241, 237, 0.16);
        background: rgba(29, 31, 33, 0.9);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
      }
      .preview-meta {
        color: rgba(242, 241, 237, 0.64);
      }
      .edge-label {
        stroke: #121314;
        fill: #f2f1ed;
      }
      .node-type {
        fill: rgba(23, 23, 23, 0.58);
      }
      .empty-state {
        color: rgba(242, 241, 237, 0.62);
      }
    }
  </style>`
}

export function canvasPreviewHtml(fileName, documentModel, options = {}) {
  const supportedNodes = nodesOf(documentModel).filter(isSupportedNode)
  const rectByNodeId = new Map()
  const rects = []

  for (const node of supportedNodes) {
    const rect = nodeRect(node)
    rectByNodeId.set(node.id, rect)
    rects.push(rect)
  }

  const renderedEdges = edgesOf(documentModel)
    .filter(isSupportedEdge)
    .map((edge) => renderEdge(edge, rectByNodeId))
    .filter(Boolean)
    .join("\n")
  const renderedNodes = supportedNodes
    .map((node, index) => renderNode(node, rectByNodeId.get(node.id), index))
    .join("\n")

  const viewBox = collectViewBox(rects)
  const nodeCount = nodesOf(documentModel).length
  const edgeCount = edgesOf(documentModel).length
  const meta = options.parseError
    ? html`<span class="preview-meta preview-error"
        >Parse error: ${escapeHtml(options.parseError)}</span
      >`
    : html`<span class="preview-meta"
        >${nodeCount} nodes / ${edgeCount} edges</span
      >`
  const empty =
    supportedNodes.length === 0
      ? `<div class="empty-state">Empty JSON Canvas</div>`
      : ""

  return html`<!doctype html>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(fileName)}</title>
    ${previewStyles()}
    <main class="preview-shell">
      <div class="preview-bar">
        <span class="preview-name">${escapeHtml(fileName)}</span>
        ${meta}
      </div>
      ${empty}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="${viewBox}"
        role="img"
        aria-label="${escapeHtml(fileName)} preview"
      >
        <defs>
          <marker
            id="marker-arrow-end"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="#64748b"></path>
          </marker>
          <marker
            id="marker-arrow-start"
            markerWidth="10"
            markerHeight="10"
            refX="1"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M9,0 L9,6 L0,3 z" fill="#64748b"></path>
          </marker>
        </defs>
        ${renderedEdges} ${renderedNodes}
      </svg>
    </main> `
}
