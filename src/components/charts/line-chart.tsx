'use client'

import { useMemo, useRef, useState } from 'react'

type Point = { date: string; value: number }

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * One series over time: 2px line, faint gridlines, a crosshair and tooltip on hover, the last value
 * labelled at the line's end. `target` draws a dashed reference line (e.g. zero open Criticals).
 */
export function LineChart({ points, label, unit, target, height = 180 }: {
  points: Point[]
  label: string
  unit: string
  target?: { value: number; label: string }
  height?: number
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = height, L = 36, R = 56, T = 12, B = 26
  const max = useMemo(() => {
    const m = Math.max(1, target?.value ?? 0, ...points.map((p) => p.value))
    const step = m <= 10 ? 2 : m <= 50 ? 10 : m <= 200 ? 50 : m <= 1000 ? 200 : 500
    return Math.ceil(m / step) * step
  }, [points, target])
  const x = (i: number) => L + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - L - R))
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  const ticks = [0, max / 2, max]
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const last = points.at(-1)
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))

  function onMove(e: React.MouseEvent) {
    const r = ref.current?.getBoundingClientRect()
    if (!r || points.length === 0) return
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((px - L) / (W - L - R)) * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }

  const hp = hover !== null ? points[hover] : null
  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
        aria-label={`${label}: ${last ? `${last.value} ${unit} on ${fmt(last.date)}` : 'no data'}`}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e4e9f1" strokeWidth="1" />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill="#8894ae" fontFamily="var(--font-mono)">{Math.round(t)}</text>
          </g>
        ))}
        {target && (
          <g>
            <line x1={L} x2={W - R} y1={y(target.value)} y2={y(target.value)} stroke="#5b6478" strokeWidth="1" strokeDasharray="4 4" />
            <text x={W - R + 4} y={y(target.value) + 3.5} fontSize="10.5" fill="#5b6478">{target.label}</text>
          </g>
        )}
        {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (
          <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#8894ae">{fmt(p.date)}</text>
        ))}
        <path d={path} fill="none" stroke="#2b57c4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {last && (
          <g>
            <circle cx={x(points.length - 1)} cy={y(last.value)} r="4" fill="#2b57c4" stroke="#fff" strokeWidth="2" />
            <text x={x(points.length - 1) + 8} y={y(last.value) + 4} fontSize="12" fontWeight="600" fill="#1b1f26">{last.value}</text>
          </g>
        )}
        {hp && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#8894ae" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(hp.value)} r="4.5" fill="#2b57c4" stroke="#fff" strokeWidth="2" />
          </g>
        )}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" />
      </svg>
      {hp && hover !== null && (
        <div className="pointer-events-none absolute top-0 border border-[var(--line)] bg-white px-2 py-1 text-[11.5px] shadow-[0_6px_18px_rgba(15,27,51,.12)]"
          style={{ left: `calc(${(x(hover) / W) * 100}% + 8px)`, transform: x(hover) > W * 0.7 ? 'translateX(calc(-100% - 16px))' : undefined }}>
          <div className="text-[var(--muted)]">{fmt(hp.date)}</div>
          <div className="font-semibold text-[var(--ink)]">{hp.value} {unit}</div>
        </div>
      )}
    </div>
  )
}
