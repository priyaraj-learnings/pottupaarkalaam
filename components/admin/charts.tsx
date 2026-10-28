'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { bucketLabel, compactMoney, money, type SeriesPoint } from '@/components/admin/types'
import { categoryLabel } from '@/lib/rules'

// Charts for the admin overview, drawn as plain SVG/HTML (no chart library).
// Two series in the validated categorical pair (blue, orange: CVD-safe on
// white), thin rounded columns, hairline grid, a legend, a tooltip on every
// column and a table view. Text always uses the ink colours, never the series
// colours.

const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', wash: '#f5f5f4' }
const SERIES = [
  { key: 'receivedInr', label: 'Money received', color: '#2a78d6' },
  { key: 'aiCostInr', label: 'AI cost', color: '#eb6834' },
] as const

export function StatTile({ label, value, hint, hero = false }: { label: string; value: ReactNode; hint?: ReactNode; hero?: boolean }) {
  return (
    <div className={`rounded-2xl bg-white p-4 ring-1 ring-stone-200/80 ${hero ? 'sm:col-span-2' : ''}`}>
      <p className="text-sm font-semibold text-stone-500">{label}</p>
      <p className={`${hero ? 'text-5xl' : 'text-2xl'} font-black tracking-tight text-stone-900`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  )
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

// 0 and 3-5 round steps up to at least `max`.
export function niceTicks(max: number, target = 4) {
  const raw = Math.max(max, 1) / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(candidate => candidate >= raw) ?? 10 * magnitude
  const ticks = [0]
  while (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(6)))
  if (ticks.length < 2) ticks.push(step)
  return ticks
}

// A column with a 4px rounded top, square at the baseline.
function columnPath(x: number, top: number, width: number, base: number) {
  const height = base - top
  if (height <= 0.5 || width <= 0) return ''
  const r = Math.min(4, width / 2, height)
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${base}Z`
}

export function MoneyChart({ series, unit }: { series: SeriesPoint[]; unit: 'day' | 'month' }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const [table, setTable] = useState(false)

  const height = 220
  const margin = { top: 12, right: 8, bottom: 26, left: 52 }
  const plotWidth = Math.max(0, width - margin.left - margin.right)
  const plotHeight = height - margin.top - margin.bottom
  const base = margin.top + plotHeight
  const ticks = niceTicks(Math.max(...series.flatMap(point => [point.receivedInr, point.aiCostInr]), 0))
  const top = ticks[ticks.length - 1]
  const y = (value: number) => base - (value / top) * plotHeight
  const band = series.length ? plotWidth / series.length : 0
  const gap = 2
  const barWidth = Math.max(2, Math.min(24, (band * 0.7 - gap) / 2))
  const every = Math.max(1, Math.ceil(series.length / Math.max(1, Math.floor(plotWidth / 52))))
  const empty = series.every(point => !point.receivedInr && !point.aiCostInr)
  const point = active === null ? null : series[active]

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-4 text-sm text-stone-600" aria-label="Legend">
          {SERIES.map(item => (
            <li key={item.key} className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setTable(value => !value)} className="text-sm font-semibold text-brand-700 underline">
          {table ? 'Show as chart' : 'Show as table'}
        </button>
      </div>

      {table ? (
        <div className="max-h-80 overflow-auto rounded-xl ring-1 ring-stone-200">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-stone-50 text-left text-stone-500">
              <tr><th className="p-2 font-semibold">{unit === 'day' ? 'Day' : 'Month'}</th><th className="p-2 text-right font-semibold">Received</th><th className="p-2 text-right font-semibold">AI cost</th><th className="p-2 text-right font-semibold">Pictures</th></tr>
            </thead>
            <tbody>
              {series.map(row => (
                <tr key={row.bucket} className="border-t border-stone-100">
                  <td className="p-2">{bucketLabel(row.bucket, unit)}</td>
                  <td className="p-2 text-right">{money(row.receivedInr)}</td>
                  <td className="p-2 text-right">{money(row.aiCostInr)}</td>
                  <td className="p-2 text-right">{row.pictures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label={`Money received and AI cost per ${unit}`} className="block">
              {ticks.map(tick => (
                <g key={tick}>
                  <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? INK.axis : INK.grid} strokeWidth={1} />
                  <text x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK.muted} className="tabular-nums">{compactMoney(tick)}</text>
                </g>
              ))}
              {series.map((row, index) => {
                const center = margin.left + band * index + band / 2
                const left = center - barWidth - gap / 2
                return (
                  <g key={row.bucket}>
                    {active === index && <rect x={margin.left + band * index} y={margin.top} width={band} height={plotHeight} fill={INK.wash} />}
                    <path d={columnPath(left, y(row.receivedInr), barWidth, base)} fill={SERIES[0].color} />
                    <path d={columnPath(center + gap / 2, y(row.aiCostInr), barWidth, base)} fill={SERIES[1].color} />
                    {index % every === 0 && (
                      <text x={center} y={base + 17} textAnchor="middle" fontSize={11} fill={INK.muted}>{bucketLabel(row.bucket, unit)}</text>
                    )}
                    <rect
                      x={margin.left + band * index} y={margin.top} width={band} height={plotHeight + margin.bottom}
                      fill="transparent" tabIndex={0}
                      aria-label={`${bucketLabel(row.bucket, unit, true)}: received ${money(row.receivedInr)}, AI cost ${money(row.aiCostInr)}, ${row.pictures} pictures`}
                      onPointerEnter={() => setActive(index)} onPointerMove={() => setActive(index)}
                      onFocus={() => setActive(index)} onBlur={() => setActive(null)}
                    />
                  </g>
                )
              })}
            </svg>
          )}
          {empty && width > 0 && (
            <p className="pointer-events-none absolute inset-x-0 top-16 text-center text-sm text-stone-500">No money or pictures in this period yet.</p>
          )}
          {point && active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-1 z-10 w-52 rounded-xl bg-white p-3 text-sm shadow-lg ring-1 ring-stone-200"
              style={{ left: Math.min(Math.max(0, margin.left + band * active + band / 2 - 104), Math.max(0, width - 208)) }}
            >
              <p className="mb-1 text-xs font-semibold text-stone-500">{bucketLabel(point.bucket, unit, true)}</p>
              {SERIES.map(item => (
                <p key={item.key} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-stone-500">
                    <span className="inline-block h-0.5 w-3" style={{ backgroundColor: item.color }} aria-hidden="true" />{item.label}
                  </span>
                  <b className="tabular-nums text-stone-900">{money(point[item.key])}</b>
                </p>
              ))}
              <p className="mt-1 flex justify-between text-stone-500"><span>Pictures</span><b className="text-stone-900">{point.pictures}</b></p>
              <p className="flex justify-between text-stone-500"><span>New customers</span><b className="text-stone-900">{point.newCustomers}</b></p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Pictures per category: one series, so one colour and no legend; the value
// sits at the end of each bar.
export function CategoryBars({ categories }: { categories: Array<{ category: string; pictures: number; fabric: number; stitched: number }> }) {
  if (!categories.length) return <p className="text-sm text-stone-500">No pictures in this period yet.</p>
  const max = Math.max(...categories.map(row => row.pictures))
  return (
    <ul className="space-y-2">
      {categories.map(row => (
        <li key={row.category} className="grid grid-cols-[7rem_1fr] items-center gap-3 text-sm" title={`${row.fabric} from fabric, ${row.stitched} from stitched dresses`}>
          <span className="truncate text-stone-700">{categoryLabel(row.category)}</span>
          <span className="flex items-center gap-2">
            <span className="h-4 rounded-r-[4px]" style={{ width: `${Math.max(2, (row.pictures / max) * 100)}%`, maxWidth: 'calc(100% - 4.5rem)', backgroundColor: SERIES[0].color }} aria-hidden="true" />
            <span className="shrink-0 tabular-nums text-stone-900"><b>{row.pictures}</b> <span className="text-xs text-stone-500">({row.fabric}F · {row.stitched}S)</span></span>
          </span>
        </li>
      ))}
    </ul>
  )
}
