import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { broadcasts as seedBroadcasts } from '../data/mockData'
import { useAuth } from './AuthContext'
import { DEMO_MODE } from '../utils/demoDataMode'
import * as broadcastApi from '../services/broadcastApi'

const BroadcastContext = createContext(null)

// Normalises the seeded demo broadcasts (mock path) into the same render shape
// the backend API mapper produces, so components read one shape either way.
function normalizeSeed(b) {
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
}

export function BroadcastProvider({ children }) {
  const { currentUser } = useAuth()
  const backendActive = Boolean(currentUser && currentUser.authSource === 'supabase')

  const [broadcasts, setBroadcasts] = useState(() => seedBroadcasts.map(normalizeSeed))

  // Real (supabase) sessions read the authoritative, audience-filtered list the
  // backend returns for this caller; the in-memory demo path stays unchanged.
  // DEV demo mode keeps the seeded list on display (read-only surface) even for
  // real admins, but publishing always goes to the backend.
  useEffect(() => {
    if (!currentUser || !backendActive || DEMO_MODE) return
    let active = true
    broadcastApi
      .listBroadcasts()
      .then((list) => {
        if (active) setBroadcasts(list)
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[BroadcastContext] Failed to load broadcasts from backend:', err.message)
        if (active) setBroadcasts([])
      })
    return () => {
      active = false
    }
  }, [currentUser, backendActive])

  const publishBroadcast = useCallback(
    async (data) => {
      if (backendActive) {
        // Backend resolves the audience, persists the row and fans out the
        // notifications; the returned broadcast is already in render shape.
        const result = await broadcastApi.createBroadcast(data)
        if (result.broadcast) setBroadcasts((prev) => [result.broadcast, ...prev])
        return { ...(result.broadcast || {}), deliveredCount: result.deliveredCount }
      }
      const roles =
        data.audienceKey === 'all-trainers'
          ? ['trainer']
          : data.audienceKey === 'all'
            ? ['trainee', 'trainer']
            : ['trainee']
      const b = {
        id: `b${Date.now()}`,
        title: data.title,
        body: data.body,
        type: data.type || 'Training announcement',
        audience: roles,
        audienceKey: data.audienceKey || 'all-trainees',
        audienceLabel: data.audienceLabel || 'All Trainees',
        region: data.region,
        station: data.station,
        date: new Date().toISOString().slice(0, 10),
        published: true,
      }
      setBroadcasts((prev) => [b, ...prev])
      return b
    },
    [backendActive],
  )

  const value = useMemo(
    () => ({ broadcasts, publishBroadcast }),
    [broadcasts, publishBroadcast],
  )

  return <BroadcastContext.Provider value={value}>{children}</BroadcastContext.Provider>
}

export const useBroadcasts = () => useContext(BroadcastContext)
