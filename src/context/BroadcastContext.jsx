import { createContext, useContext, useMemo, useState } from 'react'
import { broadcasts as seedBroadcasts } from '../data/mockData'

const BroadcastContext = createContext(null)

const AUDIENCE_ROLES = {
  'all-trainees': ['trainee'],
  'all-trainers': ['trainer'],
  'all': ['trainee', 'trainer'],
}

export function BroadcastProvider({ children }) {
  const [broadcasts, setBroadcasts] = useState(() =>
    seedBroadcasts.map((b) => {
      const audienceArr = Array.isArray(b.audience) ? b.audience : []
      let audienceKey = 'all-trainees'
      const hasTrainee = audienceArr.includes('trainee')
      const hasTrainer = audienceArr.includes('trainer')
      if (hasTrainee && hasTrainer) audienceKey = 'all'
      else if (hasTrainer) audienceKey = 'all-trainers'
      else if (hasTrainee) audienceKey = 'all-trainees'
      return {
        ...b,
        published: true,
        audienceKey,
        audienceLabel: audienceArr.join(' · '),
      }
    }),
  )

  const publishBroadcast = (data) => {
    const b = {
      id: `b${Date.now()}`,
      title: data.title,
      body: data.body,
      type: data.type || 'Training announcement',
      audience: data.audienceLabel || 'All Trainees',
      audienceKey: data.audience || 'all-trainees',
      region: data.region,
      station: data.station,
      date: new Date().toISOString().slice(0, 10),
      published: true,
    }
    setBroadcasts((prev) => [b, ...prev])
    return b
  }

  const value = useMemo(() => ({ broadcasts, publishBroadcast }), [broadcasts])

  return <BroadcastContext.Provider value={value}>{children}</BroadcastContext.Provider>
}

export const useBroadcasts = () => useContext(BroadcastContext)
