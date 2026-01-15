import React, { useEffect } from 'react'
import Scene from '../three/Scene.jsx'
import ControlsPanel from '../components/ControlsPanel.jsx'
import KPIDisplay from '../components/KPIDisplay.jsx'
import ExperimentsPanel from '../components/ExperimentsPanel.jsx'
import { useFactoryStore } from '../state/store.js'

export default function App() {
  const reset = useFactoryStore((s) => s.reset)

  useEffect(() => {
    reset(null)
  }, [reset])

  return (
    <div className="layout">
      <div className="scene">
        <Scene />
      </div>
      <div className="panel">
        <ControlsPanel />
        <KPIDisplay />
        <ExperimentsPanel />
        <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '1rem' }}>
          API: {import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}
        </div>
      </div>
    </div>
  )
}
