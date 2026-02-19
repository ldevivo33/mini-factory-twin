import { useEffect } from 'react'
import Scene from '../three/Scene'
import ControlsPanel from '../components/ControlsPanel'
import KPIDisplay from '../components/KPIDisplay'
import ExperimentsPanel from '../components/ExperimentsPanel'
import { useFactoryStore } from '../state/store'

export default function App() {
  const reset = useFactoryStore((s) => s.reset)

  useEffect(() => {
    void reset()
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
