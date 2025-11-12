import { create } from 'zustand'
import { simReset, simStep, simState, simSummary } from '../api/client'

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
  },

  // Control
  running: false,

  // Snapshots and summaries
  snapshot: null, // last snapshot
  prevSnapshot: null,
  summary: null,

  setConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),

  reset: async () => {
    const data = await simReset(get().config)
    set({ prevSnapshot: null, snapshot: data, summary: null })
  },

  fetchState: async () => {
    const data = await simState()
    set((s) => ({ prevSnapshot: s.snapshot, snapshot: data }))
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
        set((s) => ({ prevSnapshot: s.snapshot, snapshot: snap }))
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
