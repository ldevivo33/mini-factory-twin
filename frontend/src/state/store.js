import { create } from 'zustand'
import { simReset, simStep, simState, simSummary } from '../api/client'

const appendFailureEvent = (history, snapshot) => {
  const evt = snapshot?.event
  if (!evt || evt.type !== 'machine_failure') return history
  const entry = {
    time: snapshot?.t_end ?? 0,
    station: typeof evt.station === 'number' ? evt.station : null,
  }
  const next = [...history, entry]
  const MAX_LOG = 8
  if (next.length > MAX_LOG) {
    next.splice(0, next.length - MAX_LOG)
  }
  return next
}

export const useFactoryStore = create((set, get) => ({
  // Config we send with /sim/reset (store to normalize buffers etc.)
  config: {
    seed: null,
    n_jobs: 100,
    n_stations: 3,
    buffer_caps: [5, 5],
    proc_means: [4.0, 5.0, 4.5],
    proc_dists: 'uniform',
    util_alpha: 0.1,
    fail_rate: 0.01,
    repair_time: 60,
    workers: 3,
  },

  // Control
  running: false,

  // Snapshots and summaries
  snapshot: null, // last snapshot
  prevSnapshot: null,
  summary: null,
  failureLog: [],

  setConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),

  reset: async () => {
    const data = await simReset(get().config)
    set({ prevSnapshot: null, snapshot: data, summary: null, failureLog: [] })
  },

  fetchState: async () => {
    const data = await simState()
    set((s) => ({
      prevSnapshot: s.snapshot,
      snapshot: data,
      failureLog: appendFailureEvent(s.failureLog, data),
    }))
  },

  begin: async () => {
    if (get().running) return
    // Ensure sim is initialized
    if (!get().snapshot) {
      await get().reset()
    }
    set({ running: true, summary: null })
    let lastSummaryAt = 0
    const SUMMARY_EVERY_MS = 500
    // Step loop until jobs complete
    while (get().running) {
      try {
        const snap = await simStep(1.0)
        set((s) => ({
          prevSnapshot: s.snapshot,
          snapshot: snap,
          failureLog: appendFailureEvent(s.failureLog, snap),
        }))
        const now = Date.now()
        if (now - lastSummaryAt >= SUMMARY_EVERY_MS) {
          const sum = await simSummary()
          set({ summary: sum })
          lastSummaryAt = now
          if (sum && typeof sum.total_jobs === 'number' && sum.total_jobs > 0 && sum.jobs_completed >= sum.total_jobs) {
            set({ running: false })
            break
          }
        }
        await new Promise((r) => setTimeout(r, 150))
      } catch (e) {
        set({ running: false })
        break
      }
    }
  },

  stop: () => set({ running: false }),
}))
