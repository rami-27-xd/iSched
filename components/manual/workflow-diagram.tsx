"use client"

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import type { FlowEdge, FlowKind, FlowNode } from "@/lib/manual-workflows"

/**
 * Renders a RoleManual's nodes/edges as a flowchart.
 *
 * The boxes are ordinary HTML in a CSS grid (col 0 = main lane, col 1 = side
 * lane; one grid row per diagram row, side boxes vertically centred on their
 * row), so each box is exactly as tall as its text — nothing is estimated, so
 * nothing can clip or float. The arrows are an SVG overlay drawn from the
 * boxes' real rendered positions, re-read whenever the container resizes
 * (fonts loading, window resize, browser zoom).
 */

const NODE_W = 264
const LANE_GAP = 96    // between the lanes — room for a "problems" label on the connector
const ROW_GAP = 34     // between rows — room for arrows + labels
const LOOP_GUTTER = 64 // how far right of the last lane a back-edge travels
const PAD = 12

const STYLE: Record<FlowKind, { fill: string; stroke: string; text: string; dash?: boolean; radius: number }> = {
  start: { fill: "#1B4332", stroke: "#1B4332", text: "#ffffff", radius: 26 },
  end: { fill: "#1B4332", stroke: "#1B4332", text: "#ffffff", radius: 26 },
  step: { fill: "#F1F7F3", stroke: "#1B4332", text: "#1B4332", radius: 12 },
  decision: { fill: "#FBF0D0", stroke: "#D4AF37", text: "#5C4409", radius: 22 },
  wait: { fill: "#F5F5F4", stroke: "#9CA3AF", text: "#374151", dash: true, radius: 12 },
}

interface Box { x: number; y: number; w: number; h: number; cx: number; cy: number }
interface EdgePath { key: number; d: string; label?: string; lx: number; ly: number; lw: number; loop: boolean }

function NodeBox({ n }: { n: FlowNode }) {
  const s = STYLE[n.kind]
  const pill = n.kind === "start" || n.kind === "end"
  return (
    <div
      data-node={n.id}
      style={{
        gridColumn: n.col + 1,
        gridRow: n.row + 1,
        width: NODE_W,
        boxSizing: "border-box",
        padding: pill ? "12px 16px" : "10px 12px",
        borderRadius: s.radius,
        background: s.fill,
        color: s.text,
        border: `${n.kind === "decision" ? 2 : 1.5}px ${s.dash ? "dashed" : "solid"} ${s.stroke}`,
        boxShadow: n.kind === "decision" ? `inset 0 0 0 4px ${s.fill}, inset 0 0 0 5px ${s.stroke}80` : undefined,
        lineHeight: 1.3,
        textAlign: pill ? "center" : "left",
        alignSelf: "center",
        position: "relative",
        zIndex: 1,
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

export function WorkflowDiagram({ nodes, edges, title }: { nodes: FlowNode[]; edges: FlowEdge[]; title: string }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [paths, setPaths] = useState<EdgePath[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  const maxCol = Math.max(...nodes.map((n) => n.col))
  const maxRow = Math.max(...nodes.map((n) => n.row))
  // Extra width on the right so loop-back arrows (and their labels) have a lane of their own.
  const rightGutter = LOOP_GUTTER + 40

  // Draw (and redraw) the arrows from the boxes' real positions.
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return

    const measure = () => {
      const boxes = new Map<string, Box>()
      grid.querySelectorAll<HTMLElement>("[data-node]").forEach((el) => {
        const x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight
        boxes.set(el.dataset.node!, { x, y, w, h, cx: x + w / 2, cy: y + h / 2 })
      })
      const byId = new Map(nodes.map((n) => [n.id, n]))
      const gutterX = grid.offsetWidth - rightGutter + LOOP_GUTTER
      // Label pills are measured too (font-dependent), from hidden spans in the overlay.
      const labelW = (t: string) => {
        const span = grid.querySelector<HTMLElement>(`[data-label="${CSS.escape(t)}"]`)
        return (span?.offsetWidth ?? t.length * 6) + 12
      }
      const out: EdgePath[] = []
      edges.forEach((e, i) => {
        const a = byId.get(e.from), b = byId.get(e.to)
        const A = a && boxes.get(a.id), B = b && boxes.get(b.id)
        if (!a || !b || !A || !B) return
        const lw = e.label ? labelW(e.label) : 0
        let d = "", lx = 0, ly = 0
        if (b.row > a.row && a.col === b.col) {
          // Straight down — label beside the line.
          d = `M ${A.cx} ${A.y + A.h} L ${B.cx} ${B.y}`
          lx = A.cx + 7
          ly = (A.y + A.h + B.y) / 2
        } else if (b.row > a.row) {
          // Down from the source, then sideways INTO the target's near edge
          // (upper third) — never onto its top, where the main-lane arrow lands.
          const entryY = B.y + B.h * 0.3
          const xEnd = B.cx > A.cx ? B.x : B.x + B.w
          d = `M ${A.cx} ${A.y + A.h} L ${A.cx} ${entryY} L ${xEnd} ${entryY}`
          lx = (A.cx + xEnd) / 2 - lw / 2
          ly = entryY - 11
        } else if (b.row === a.row) {
          // Sideways between lanes — label centred on the connector, just above it.
          const toRight = B.cx > A.cx
          const x1 = toRight ? A.x + A.w : A.x
          const x2 = toRight ? B.x : B.x + B.w
          d = `M ${x1} ${A.cy} L ${x2} ${B.cy}`
          lx = (x1 + x2) / 2 - lw / 2
          ly = A.cy - 11
        } else {
          // Back up to an earlier row: out the right edge, up the gutter, in at
          // the target's right edge (lower third, clear of any forward edge).
          const entryY = B.y + B.h * 0.7
          d = `M ${A.x + A.w} ${A.cy} L ${gutterX} ${A.cy} L ${gutterX} ${entryY} L ${B.x + B.w} ${entryY}`
          lx = gutterX - lw / 2
          ly = (A.cy + entryY) / 2
        }
        out.push({ key: i, d, label: e.label, lx, ly, lw, loop: b.row < a.row })
      })
      setPaths(out)
      setSize({ w: grid.offsetWidth, h: grid.offsetHeight })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(grid)
    grid.querySelectorAll<HTMLElement>("[data-node]").forEach((el) => ro.observe(el))
    // Web fonts arriving after first paint change every box height.
    if (typeof document !== "undefined" && (document as any).fonts?.ready) {
      ;(document as any).fonts.ready.then(measure).catch(() => {})
    }
    return () => ro.disconnect()
  }, [nodes, edges, rightGutter])

  const labels = [...new Set(edges.map((e) => e.label).filter((l): l is string => !!l))]

  return (
    <div className="overflow-x-auto">
      <div
        ref={gridRef}
        role="img"
        aria-label={title}
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: `repeat(${maxCol + 1}, ${NODE_W}px)`,
          gridTemplateRows: `repeat(${maxRow + 1}, auto)`,
          columnGap: LANE_GAP,
          rowGap: ROW_GAP,
          alignItems: "center",
          padding: `${PAD}px ${rightGutter}px ${PAD}px ${PAD}px`,
          width: "max-content",
          fontFamily: "inherit",
        }}
      >
        {nodes.map((n) => <NodeBox key={n.id} n={n} />)}

        {/* Hidden label spans — measured so each pill fits its text in the real font. */}
        <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, visibility: "hidden", pointerEvents: "none", whiteSpace: "nowrap" }}>
          {labels.map((l) => (
            <span key={l} data-label={l} style={{ fontSize: 10, fontWeight: 600, display: "inline-block" }}>{l}</span>
          ))}
        </div>

        {/* Arrow overlay */}
        <svg
          aria-hidden="true"
          width={size.w || 1}
          height={size.h || 1}
          viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}
        >
          <defs>
            <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6B7280" />
            </marker>
          </defs>
          {paths.map((p) => (
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
          ))}
        </svg>
      </div>
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
