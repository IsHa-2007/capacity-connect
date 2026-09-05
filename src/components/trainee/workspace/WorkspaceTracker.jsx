import { Check, Lock } from 'lucide-react'

export default function WorkspaceTracker({ stages, current, locked, onSelect }) {
  const currentIdx = stages.findIndex((s) => s.key === current)

  return (
    <div className="overflow-x-auto scroll-thin rounded-2xl border border-border-soft bg-white p-4">
      <div className="flex min-w-max items-center gap-2">
        {stages.map((s, i) => {
          const isCurrent = s.key === current
          const isPast = i < currentIdx
          const isLocked = locked[i]
          return (
            <div key={s.key} className="flex items-center gap-2">
              <button
                onClick={() => onSelect && onSelect(s.key)}
                disabled={isLocked && !isCurrent}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isCurrent
                    ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-[0_2px_8px_rgba(31,95,147,0.3)]'
                    : isPast
                    ? 'bg-emerald-50 text-emerald-700'
                    : isLocked
                    ? 'bg-sky-soft text-slate-muted cursor-not-allowed'
                    : 'bg-sky-light text-primary hover:bg-blue-100'
                }`}
              >
                {isPast ? <Check size={14} /> : isLocked && !isCurrent ? <Lock size={14} /> : <span className="grid h-4 w-4 place-items-center rounded-full bg-white/20 text-[10px]">{i + 1}</span>}
                {s.label}
              </button>
              {i < stages.length - 1 && (
                <div className={`h-px w-4 ${isPast ? 'bg-emerald-400' : 'bg-border-soft'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
