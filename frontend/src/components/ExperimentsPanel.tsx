import { useEffect, useState } from 'react'
import { deleteExperiment, deleteStaleExperiments, getExperiments } from '../api/client'
import type { ExperimentListItem } from '../types'

export default function ExperimentsPanel() {
  const [experiments, setExperiments] = useState<ExperimentListItem[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchExperiments = async (): Promise<void> => {
    setLoading(true)
    try {
      const data = await getExperiments()
      setExperiments(data)
    } catch (e) {
      console.error('Failed to fetch experiments:', e)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (expanded) {
      void fetchExperiments()
    }
  }, [expanded])

  const handleDelete = async (id: number): Promise<void> => {
    try {
      await deleteExperiment(id)
      setExperiments((prev) => prev.filter((e) => e.id !== id))
    } catch (e) {
      console.error('Failed to delete experiment:', e)
    }
  }

  const handleClearStale = async (): Promise<void> => {
    try {
      await deleteStaleExperiments()
      void fetchExperiments()
    } catch (e) {
      console.error('Failed to clear stale experiments:', e)
    }
  }

  const completedCount = experiments.filter((e) => e.status === 'completed').length
  const staleCount = experiments.filter((e) => e.status === 'running').length

  return (
    <div style={{ marginTop: '1rem' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '0.8rem' }}>{expanded ? 'v' : '>'}</span>
        <h2 style={{ margin: 0 }}>Past Experiments</h2>
        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
          ({completedCount} completed{staleCount > 0 ? `, ${staleCount} stale` : ''})
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button onClick={() => void fetchExperiments()} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            {staleCount > 0 && (
              <button onClick={() => void handleClearStale()} style={{ background: '#dc2626' }}>
                Clear {staleCount} Stale
              </button>
            )}
          </div>

          {experiments.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No experiments yet</div>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #374151' }}>
                    <th style={{ textAlign: 'left', padding: '0.25rem' }}>ID</th>
                    <th style={{ textAlign: 'left', padding: '0.25rem' }}>Jobs</th>
                    <th style={{ textAlign: 'left', padding: '0.25rem' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '0.25rem' }}>Makespan</th>
                    <th style={{ textAlign: 'left', padding: '0.25rem' }}>Thru Rate</th>
                    <th style={{ padding: '0.25rem' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {experiments.map((exp) => (
                    <tr key={exp.id} style={{ borderBottom: '1px solid #1f2937' }}>
                      <td style={{ padding: '0.25rem' }}>{exp.id}</td>
                      <td style={{ padding: '0.25rem' }}>{exp.n_jobs}</td>
                      <td style={{ padding: '0.25rem' }}>
                        <span
                          style={{
                            color: exp.status === 'completed' ? '#22c55e' : '#eab308',
                            fontSize: '0.75rem',
                          }}
                        >
                          {exp.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.25rem' }}>
                        {typeof exp.makespan === 'number' ? `${exp.makespan.toFixed(1)}s` : '-'}
                      </td>
                      <td style={{ padding: '0.25rem' }}>
                        {typeof exp.throughput_rate === 'number'
                          ? `${exp.throughput_rate.toFixed(3)}/s`
                          : '-'}
                      </td>
                      <td style={{ padding: '0.25rem' }}>
                        <button
                          onClick={() => void handleDelete(exp.id)}
                          style={{
                            padding: '0.1rem 0.4rem',
                            fontSize: '0.7rem',
                            background: '#4b5563',
                          }}
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

