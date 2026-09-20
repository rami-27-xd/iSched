"use client"

import Link from "next/link"
import type { FlowEdge, FlowKind, FlowNode } from "@/lib/manual-workflows"

/**
 * Renders a RoleManual's nodes/edges as an SVG flowchart. Nodes sit on a grid
 * (col 0 = main lane, col 1 = side lane; rows top-down); edges are orthogonal
 * arrows — straight down within a lane, elbowed across lanes, and looping up
 * the far side when they go back to an earlier row. Text is HTML inside
 * <foreignObject> so it wraps naturally.
 */

const COL_W = 300     // lane pitch
const NODE_W = 264
const ROW_GAP = 30    // vertical space between rows (room for arrows + labels)
const PAD_X = 16
const PAD_Y = 12
const LOOP_GUTTER = 22 // how far right of the last lane a back-edge travels
const TEXT_W = NODE_W - 24 // inner width available to text

// Text metrics used to size a node from its content so nothing is ever
// clipped or floated off-centre: average glyph width ≈ 0.52 × font size.
const TITLE_PX = 12.5
const DETAIL_PX = 10.5
const WHERE_PX = 9.5
const LINE = 1.25
function lines(text: string | undefined, px: number, extraChars = 0): number {
  if (!text) return 0
  const perLine = Math.max(8, Math.floor(TEXT_W / (px * 0.52)))
  return Math.max(1, Math.ceil((text.length + extraChars) / perLine))
}
function nodeHeight(n: FlowNode): number {
  const pill = n.kind === "start" || n.kind === "end"
  const badge = n.enforced ? 10 : n.kind === "wait" ? 13 : 0
  const h =
    16 + // padding
    lines(n.title, TITLE_PX, badge) * TITLE_PX * LINE +
    (n.detail ? 3 + lines(n.detail, DETAIL_PX) * DETAIL_PX * LINE : 0) +
    (n.where ? 4 + lines(n.where, WHERE_PX) * WHERE_PX * LINE : 0)
  return Math.max(pill ? 48 : 60, Math.ceil(h))
}

const STYLE: Record<FlowKind, { fill: string; stroke: string; text: string; dash?: string; radius: number }> = {
  start: { fill: "#1B4332", stroke: "#1B4332", text: "#ffffff", radius: 28 },
  end: { fill: "#1B4332", stroke: "#1B4332", text: "#ffffff", radius: 28 },
  step: { fill: "#F1F7F3", stroke: "#1B4332", text: "#1B4332", radius: 12 },
  decision: { fill: "#FBF0D0", stroke: "#D4AF37", text: "#5C4409", radius: 22 },
  wait: { fill: "#F5F5F4", stroke: "#9CA3AF", text: "#374151", dash: "6 4", radius: 12 },
}

export function WorkflowDiagram({ nodes, edges, title }: { nodes: FlowNode[]; edges: FlowEdge[]; title: string }) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const maxCol = Math.max(...nodes.map((n) => n.col))
  const maxRow = Math.max(...nodes.map((n) => n.row))
  const width = PAD_X * 2 + maxCol * COL_W + NODE_W + LOOP_GUTTER + 8

  // Each row is as tall as its tallest node; rows stack with a fixed gap, so a
  // node with a long description simply gets a taller box (and its row) instead
  // of overflowing a fixed-height one.
  const heights = new Map(nodes.map((n) => [n.id, nodeHeight(n)]))
  const rowHeight: number[] = Array.from({ length: maxRow + 1 }, (_, r) =>
    Math.max(48, ...nodes.filter((n) => n.row === r).map((n) => heights.get(n.id)!))
  )
  const rowTop: number[] = []
  let cursor = PAD_Y
  for (let r = 0; r <= maxRow; r++) { rowTop[r] = cursor; cursor += rowHeight[r] + ROW_GAP }
  const height = cursor - ROW_GAP + PAD_Y

  const box = (n: FlowNode) => {
    const h = heights.get(n.id)!
    const x = PAD_X + n.col * COL_W
    // Centre every node vertically within its row so side-lane nodes line up
    // with the main-lane step they belong to.
    const y = rowTop[n.row] + (rowHeight[n.row] - h) / 2
    return { x, y, w: NODE_W, h, cx: x + NODE_W / 2, cy: y + h / 2 }
  }

  const paths = edges.map((e, i) => {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b) return null
    const A = box(a)
    const B = box(b)
    let d: string
    let lx: number
    let ly: number
    if (b.row > a.row && a.col === b.col) {
      // Straight down.
      d = `M ${A.cx} ${A.y + A.h} L ${B.cx} ${B.y}`
      lx = A.cx + 8
      ly = (A.y + A.h + B.y) / 2
    } else if (b.row > a.row) {
      // Down, across, down (elbow between lanes).
      const midY = A.y + A.h + Math.max(14, (B.y - (A.y + A.h)) / 2)
      d = `M ${A.cx} ${A.y + A.h} L ${A.cx} ${midY} L ${B.cx} ${midY} L ${B.cx} ${B.y}`
      lx = (A.cx + B.cx) / 2
      ly = midY - 6
    } else if (b.row === a.row) {
      // Sideways between lanes on the same row.
      const fromRight = B.cx > A.cx
      const x1 = fromRight ? A.x + A.w : A.x
      const x2 = fromRight ? B.x : B.x + B.w
      d = `M ${x1} ${A.cy} L ${x2} ${B.cy}`
      lx = (x1 + x2) / 2
      ly = A.cy - 8
    } else {
      // Back up to an earlier row: out the right edge, up the gutter, in at the target's right edge.
      const gutterX = PAD_X + maxCol * COL_W + NODE_W + LOOP_GUTTER
      d = `M ${A.x + A.w} ${A.cy} L ${gutterX} ${A.cy} L ${gutterX} ${B.cy} L ${B.x + B.w} ${B.cy}`
      lx = gutterX + 4
      ly = (A.cy + B.cy) / 2
    }
    return { key: i, d, label: e.label, lx, ly, loop: b.row <= a.row && a.col === b.col }
  })

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ minWidth: Math.min(width, 560), maxWidth: width, height: "auto", display: "block" }}
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
                  <rect x={p.lx - 3} y={p.ly - 8} width={p.label.length * 5.8 + 8} height={14} rx={3} fill="#ffffff" stroke="#E5E7EB" />
                  <text x={p.lx + 1} y={p.ly + 2.5} fontSize={10} fill="#4B5563" fontWeight={600} dominantBaseline="middle" alignmentBaseline="middle">
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
              <foreignObject x={b.x + 12} y={b.y + 8} width={b.w - 24} height={b.h - 16}>
                {/* React switches back to the HTML namespace inside <foreignObject>,
                    so an ordinary div (with wrapping text) renders here. */}
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: pill ? "center" : "flex-start",
                    alignItems: pill ? "center" : "flex-start",
                    textAlign: pill ? "center" : "left",
                    color: s.text,
                    fontFamily: "inherit",
                    lineHeight: LINE,
                    wordBreak: "normal",
                    overflowWrap: "anywhere",
                  }}
                >
                  <div style={{ fontSize: TITLE_PX, fontWeight: 700, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
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
                  {n.detail && <div style={{ fontSize: DETAIL_PX, marginTop: 3, opacity: 0.85 }}>{n.detail}</div>}
                  {n.where && (
                    <div style={{ fontSize: WHERE_PX, marginTop: 4, fontWeight: 600, opacity: 0.75 }}>
                      {n.href ? <Link href={n.href} style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>{n.where}</Link> : n.where}
                    </div>
                  )}
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
