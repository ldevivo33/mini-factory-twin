import React, { useCallback, useState } from 'react'
import { useFactoryStore } from '../state/store.js'

export default function ControlsPanel() {
  const { reset, begin, stop, running, config, setConfig } = useFactoryStore((s) => ({
    reset: s.reset,
    begin: s.begin,
    stop: s.stop,
    running: s.running,
    config: s.config,
    setConfig: s.setConfig,
  }))

  const [jobs, setJobs] = useState(config.n_jobs)
  const [cap1, setCap1] = useState(config.buffer_caps[0])
  const [cap2, setCap2] = useState(config.buffer_caps[1] ?? 5)

  const onReset = useCallback(() => {
    setConfig({ n_jobs: Number(jobs) || 100, buffer_caps: [Number(cap1)||5, Number(cap2)||5] })
    reset()
  }, [reset, setConfig, jobs, cap1, cap2])

  return (
    <div>
      <h2>Controls</h2>
      <div className="row">
        <button onClick={onReset}>Reset</button>
        {!running ? (
          <button onClick={begin}>Begin Simulation</button>
        ) : (
          <button onClick={stop}>Stop</button>
        )}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <label>Jobs</label>
        <input type="number" min="1" value={jobs} onChange={(e)=>setJobs(e.target.value)} style={{ width: 80 }} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <label>B12 Cap</label>
        <input type="number" min="0" value={cap1} onChange={(e)=>setCap1(e.target.value)} style={{ width: 80, marginLeft: 8 }} />
        <label style={{ marginLeft: 8 }}>B23 Cap</label>
        <input type="number" min="0" value={cap2} onChange={(e)=>setCap2(e.target.value)} style={{ width: 80 }} />
      </div>
    </div>
  )
}
