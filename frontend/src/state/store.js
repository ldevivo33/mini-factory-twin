import { create } from 'zustand'
import { getState, postReset, postStep } from '../api/client'

const clampAction = (a) => (a < 0 ? 0 : a > 2 ? 2 : a)

export const useFactoryStore = create((set, get) => ({
  sessionId: 'default',
  sim: null, // { obs, info }
  lastReward: 0,
  cumulativeThroughput: 0,
  selectedAction: 1, // 0=slow,1=nominal,2=fast
  polling: false,
  _pollTimer: null,

  setAction: (a) => set({ selectedAction: clampAction(a) }),

  fetchState: async () => {
    try {
      const data = await getState()
      set((s) => ({
        sim: data,
        lastReward: data?.info?.reward ?? s.lastReward
      }))
    } catch (e) {
      // swallow for now; can add toast/log later
    }
  },

  reset: async (seed = null) => {
    const data = await postReset(seed)
    set({
      sessionId: data.session_id,
      sim: { obs: data.obs, info: data.info },
      lastReward: data.info?.reward ?? 0,
      cumulativeThroughput: 0
    })
  },

  step: async (action = null) => {
    const a = action == null ? get().selectedAction : clampAction(action)
    const data = await postStep(a, get().sessionId)
    set((s) => ({
      sim: { obs: data.obs, info: data.info },
      lastReward: data.reward,
      cumulativeThroughput: s.cumulativeThroughput + (data.info?.throughput || 0)
    }))
  },

  startPolling: () => {
    const running = get().polling
    if (running) return
    set({ polling: true })
    const id = setInterval(() => {
      // Auto-step the simulation at 1 Hz using the selected action
      get().step(get().selectedAction)
    }, 1000)
    set({ _pollTimer: id })
  },

  stopPolling: () => {
    const id = get()._pollTimer
    if (id) clearInterval(id)
    set({ polling: false, _pollTimer: null })
  }
}))
