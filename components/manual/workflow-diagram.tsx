"use client"

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import type { FlowEdge, FlowKind, FlowNode } from "@/lib/manual-workflows"

/**
 * Renders a RoleManual's nodes/edges as an SVG flowchart. Nodes sit on a grid
 * (col 0 = main lane, col 1 = side lane; rows top-down); edges are orthogonal
 * arrows — straight down within a lane, elbowed across lanes, and looping up
 * the far side when they go back to an earlier row. Text is HTML inside
 * <foreignObject> so it wraps naturally.
 *
 * Box heights are MEASURED, not estimated: the same NodeContent is first
 * rendered into a hidden div of the node's inner width, its height is read
 * back, and the SVG is laid out from those numbers — so a long description
 * gets a taller box (and row) and nothing is ever clipped.
 */

const NODE_W = 264
const LANE_GAP = 96   // space between lanes — wide enough for a "problems" label on the connector
const COL_W = NODE_W + LANE_GAP
const ROW_GAP = 34    // vertical space between rows (room for arrows + labels)
const PAD_X = 16
const PAD_Y = 12
const LOOP_GUTTER = 64 // how far right of the last lane a back-edge travels (label sits on it)
const INNER_PAD = 10   // padding inside a box
const TEXT_W = NODE_W - INNER_PAD * 2
const LINE = 1.3

const STYLE: Record<FlowKind, { fill: string; stroke: string; text: string; dash?: string; radius: number }> = {
  start: { fill: "#1B4332", stroke: "#1B4332", text: "#ffffff", radius: 26 },
  end: { fill: "#1B4332", stroke: "#1B4332", text: "#ffffff", radius: 26 },
  step: { fill: "#F1F7F3", stroke: "#1B4332", text: "#1B4332", radius: 12 },
  decision: { fill: "#FBF0D0", stroke: "#D4AF37", text: "#5C4409", radius: 22 },
  wait: { fill: "#F5F5F4", stroke: "#9CA3AF", text: "#374151", dash: "6 4", radius: 12 },
}

/** The text inside a box — shared by the measuring pass and the SVG. */
function NodeContent({ n }: { n: FlowNode }) {
  const s = STYLE[n.kind]
  const pill = n.kind === "start" || n.kind === "end"
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: pill ? "center" : "flex-start",
        textAlign: pill ? "center" : "left",
        color: s.text,
        fontFamily: "inherit",
        lineHeight: LINE,
        width: TEXT_W,
        overflowWrap: "anywhere",
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 700, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: pill ? "center" : "flex-start" }}>
        <span>{n.title}</span>
        {n.enforced && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA", whiteSpace: "nowrap" }}>
            Enforced
          </span>
        )}
        {n.kind === "wait" && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#E5E7EB", color: "#374151", whiteSpace: "nowrap" }}>
            Another role
          </span>
        )}
      </div>
      {n.detail && <div style={{ fontSize: 10.5, marginTop: 4, opacity: 0.85 }}>{n.detail}</div>}
      {n.where && (
        <div style={{ fontSize: 9.5, marginTop: 5, fontWeight: 600, opacity: 0.8 }}>
          {n.href ? <Link href={n.href} style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>{n.where}</Link> : n.where}
        </div>
      )}
    </div>
  )
}

// Fallback heights for the very first paint, before measurement lands.
const FALLBACK_H: Record<FlowKind, number> = { start: 52, end: 52, step: 110, decision: 80, wait: 96 }

export function WorkflowDiagram({ nodes, edges, title }: { nodes: FlowNode[]; edges: FlowEdge[]; title: string }) {
  const measureRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<Record<string, number>>({})

  // Measure every node's text at its real width, then lay out from that.
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const next: Record<string, number> = {}
    el.querySelectorAll<HTMLElement>("[data-node]").forEach((d) => {
      next[d.dataset.node!] = Math.ceil(d.getBoundingClientRect().height)
    })
    setMeasured(next)
  }, [nodes])

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const maxCol = Math.max(...nodes.map((n) => n.col))
  const maxRow = Math.max(...nodes.map((n) => n.row))
  const width = PAD_X * 2 + maxCol * COL_W + NODE_W + LOOP_GUTTER + 24

  const heightOf = (n: FlowNode) => {
    const text = measured[n.id]
    return text ? text + INNER_PAD * 2 : FALLBACK_H[n.kind]
  }
  const heights = new Map(nodes.map((n) => [n.id, heightOf(n)]))
  const rowHeight: number[] = Array.from({ length: maxRow + 1 }, (_, r) =>
    Math.max(44, ...nodes.filter((n) => n.row === r).map((n) => heights.get(n.id)!))
  )
  const rowTop: number[] = []
  let cursor = PAD_Y
  for (let r = 0; r <= maxRow; r++) { rowTop[r] = cursor; cursor += rowHeight[r] + ROW_GAP }
  const height = cursor - ROW_GAP + PAD_Y

  const box = (n: FlowNode) => {
    const h = heights.get(n.id)!
    const x = PAD_X + n.col * COL_W
    // Side-lane nodes are centred on their row so they line up with the
    // main-lane step they belong to.
    const y = rowTop[n.row] + (rowHeight[n.row] - h) / 2
    return { x, y, w: NODE_W, h, cx: x + NODE_W / 2, cy: y + h / 2 }
  }

  const labelW = (t: string) => t.length * 5.9 + 10
  const gutterX = PAD_X + maxCol * COL_W + NODE_W + LOOP_GUTTER

  const paths = edges.map((e, i) => {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b) return null
    const A = box(a)
    const B = box(b)
    const lw = e.label ? labelW(e.label) : 0
    let d: string
    let lx = 0 // label pill left
    let ly = 0 // label pill centre line
    if (b.row > a.row && a.col === b.col) {
      // Straight down — label beside the line.
      d = `M ${A.cx} ${A.y + A.h} L ${B.cx} ${B.y}`
      lx = A.cx + 7
      ly = (A.y + A.h + B.y) / 2
    } else if (b.row > a.row) {
      // Down, across, down — label centred on the horizontal run.
      const midY = A.y + A.h + Math.max(14, (B.y - (A.y + A.h)) / 2)
      d = `M ${A.cx} ${A.y + A.h} L ${A.cx} ${midY} L ${B.cx} ${midY} L ${B.cx} ${B.y}`
      lx = (A.cx + B.cx) / 2 - lw / 2
      ly = midY
    } else if (b.row === a.row) {
      // Sideways between lanes — label centred on the connector, just above it.
      const fromRight = B.cx > A.cx
      const x1 = fromRight ? A.x + A.w : A.x
      const x2 = fromRight ? B.x : B.x + B.w
      d = `M ${x1} ${A.cy} L ${x2} ${B.cy}`
      lx = (x1 + x2) / 2 - lw / 2
      ly = A.cy - 11
    } else {
      // Back up to an earlier row: out the right edge, up the gutter, in at the target's right edge.
      d = `M ${A.x + A.w} ${A.cy} L ${gutterX} ${A.cy} L ${gutterX} ${B.cy} L ${B.x + B.w} ${B.cy}`
      lx = gutterX - lw / 2
      ly = (A.cy + B.cy) / 2
    }
    return { key: i, d, label: e.label, lx, ly, lw, loop: b.row <= a.row }
  })

  return (
    <div className="overflow-x-auto">
      {/* Hidden measuring pass — same content, same width, real font. */}
      <div ref={measureRef} aria-hidden="true" style={{ position: "absolute", left: -99999, top: 0, visibility: "hidden", pointerEvents: "none" }}>
        {nodes.map((n) => (
          <div key={n.id} data-node={n.id} style={{ width: TEXT_W }}>
            <NodeContent n={n} />
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ minWidth: Math.min(width, 600), maxWidth: width, height: "auto", display: "block" }}
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6B7280" />
          </marker>
        </defs>

        {/* Edges first so nodes sit on top. */}
        {paths.map((p) =>
          p ? (
            <g key={p.key}>
              <path d={p.d} fill="none" stroke="#6B7280" strokeWidth={1.6} markerEnd="url(#wf-arrow)" strokeDasharray={p.loop ? "4 3" : undefined} />
              {p.label && (
                <>
                  <rect x={p.lx} y={p.ly - 8} width={p.lw} height={16} rx={4} fill="#ffffff" stroke="#D1D5DB" />
                  <text x={p.lx + p.lw / 2} y={p.ly} fontSize={10} fill="#374151" fontWeight={600} textAnchor="middle" dominantBaseline="central">
                    {p.label}
                  </text>
                </>
              )}
            </g>
          ) : null
        )}

        {nodes.map((n) => {
          const b = box(n)
          const s = STYLE[n.kind]
          const pill = n.kind === "start" || n.kind === "end"
          return (
            <g key={n.id}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={s.radius} fill={s.fill} stroke={s.stroke} strokeWidth={n.kind === "decision" ? 2 : 1.5} strokeDasharray={s.dash} />
              {n.kind === "decision" && (
                <rect x={b.x + 6} y={b.y + 6} width={b.w - 12} height={b.h - 12} rx={s.radius - 6} fill="none" stroke={s.stroke} strokeWidth={1} strokeOpacity={0.5} />
              )}
              {/* React switches back to the HTML namespace inside <foreignObject>,
                  so an ordinary div (with wrapping text) renders here. */}
              <foreignObject x={b.x + INNER_PAD} y={b.y + INNER_PAD} width={TEXT_W} height={Math.max(1, b.h - INNER_PAD * 2)}>
                <div style={{ height: "100%", display: "flex", alignItems: pill ? "center" : "flex-start", justifyContent: "center" }}>
                  <NodeContent n={n} />
                </div>
              </foreignObject>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** The small key shown next to every diagram. */
export function DiagramLegend() {
  const items: { kind: FlowKind; label: string }[] = [
    { kind: "step", label: "Something you do" },
    { kind: "decision", label: "A decision or check" },
    { kind: "wait", label: "Done by another role — you wait" },
    { kind: "start", label: "Start / finish" },
  ]
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map((it) => {
        const s = STYLE[it.kind]
        return (
          <li key={it.kind} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-6 rounded" style={{ background: s.fill, border: `1.5px ${s.dash ? "dashed" : "solid"} ${s.stroke}` }} />
            {it.label}
          </li>
        )
      })}
      <li className="inline-flex items-center gap-1.5">
        <span className="rounded-full border border-red-200 bg-red-100 px-1.5 text-[9px] font-bold text-red-800">Enforced</span>
        the app blocks the alternative
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-block w-6 border-t border-dashed border-gray-500" />
        goes back to an earlier step
      </li>
    </ul>
  )
}
