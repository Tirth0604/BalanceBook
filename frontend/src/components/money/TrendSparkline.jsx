import { useId } from 'react'
import { cn } from '@/lib/utils'

/** Tiny inline SVG sparkline. values: numbers (orientation agnostic). */
export function TrendSparkline({ values = [], width = 96, height = 28, className, tone }) {
  const gradientId = useId()
  const nums = values.map(Number).filter((n) => Number.isFinite(n))
  if (nums.length < 2) return null
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const stepX = width / (nums.length - 1)
  const points = nums.map((v, i) => [i * stepX, height - 3 - ((v - min) / span) * (height - 6)])
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${path} L${width},${height} L0,${height} Z`
  const up = nums[nums.length - 1] >= nums[0]
  const stroke = tone === 'up' ? 'var(--success)' : tone === 'down' ? 'var(--danger)' : 'var(--primary)'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      role="img"
      aria-label={`Trend ${up ? 'up' : 'down'} over ${nums.length} points`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2" fill={stroke} />
    </svg>
  )
}

export default TrendSparkline
