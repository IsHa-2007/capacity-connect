import { Database } from 'lucide-react'

// M18.2 FOUNDATION ONLY. This component is the seam M18.3 will use to label
// genuinely cached/stale data. It renders NOTHING unless the caller passes real
// cached metadata (`cachedAt` or `source`), so it can never claim that data was
// cached when it was not. No timestamps are invented here.
export function CachedDataIndicator({ cachedAt = null, source = null, className = '' }) {
  const hasMeta = cachedAt != null || (source != null && source !== '')
  if (!hasMeta) return null

  const stamp = formatCachedAt(cachedAt)

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ${className}`}
    >
      <Database size={13} className="shrink-0" />
      <span>Showing saved data{stamp ? ` · ${stamp}` : ''}</span>
      {source && <span className="text-amber-600/80">({source})</span>}
    </span>
  )
}

function formatCachedAt(value) {
  if (value == null) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
