import React, { useCallback } from 'react'
import { useFactoryStore } from '../state/store.js'

export default function ControlsPanel() {
  const { selectedAction, setAction, reset, step, startPolling, stopPolling, polling } = useFactoryStore((s) => ({
    selectedAction: s.selectedAction,
    setAction: s.setAction,
    reset: s.reset,
    step: s.step,
    startPolling: s.startPolling,
    stopPolling: s.stopPolling,
    polling: s.polling
  }))

  const onReset = useCallback(() => { reset(null) }, [reset])
  const onStep = useCallback(() => { step(selectedAction) }, [step, selectedAction])
  const onSpeed = useCallback((e) => setAction(parseInt(e.target.value, 10)), [setAction])

  return (
    <div>
      <h2>Controls</h2>
      <div className="row">
        {!polling ? (
          <button onClick={startPolling}>Start Polling</button>
        ) : (
          <button onClick={stopPolling}>Stop Polling</button>
        )}
      </div>
      <div className="row">
        <button onClick={onReset}>Reset</button>
        <button onClick={onStep}>Step</button>
      </div>
      <div className="row">
        <label htmlFor="speed">Station Speed</label>
        <select id="speed" value={selectedAction} onChange={onSpeed}>
          <option value={0}>Slow (0.8x)</option>
          <option value={1}>Nominal (1.0x)</option>
          <option value={2}>Fast (1.2x)</option>
        </select>
      </div>
    </div>
  )
}
