import { useMemo } from 'react'
import { useFactoryStore } from '../state/store'

export default function KPIDisplay() {
  const snapshot = useFactoryStore((s) => s.snapshot)
  const prev = useFactoryStore((s) => s.prevSnapshot)
  const summary = useFactoryStore((s) => s.summary)
  const failureLog = useFactoryStore((s) => s.failureLog)
  const tEnd = snapshot?.t_end ?? 0
  const throughput = snapshot?.throughput ?? 0
  const wip = snapshot?.wip ?? 0
  const blocked = snapshot?.blocked ?? 0
  const starved = snapshot?.starved ?? 0
  const workersAvailable = snapshot?.workers_available ?? 0
  const workersTotal = snapshot?.workers_total ?? 0
  const avgProcTime = snapshot?.avg_processing_time ?? 0
  const avgProcSpeed = snapshot?.avg_processing_speed ?? 0
  const dt = Math.max(0.0001, (snapshot?.t_end ?? 0) - (prev?.t_end ?? snapshot?.t_start ?? 0))
  const thrPerHour = useMemo<number>(() => throughput / (dt / 3600), [throughput, dt])
  const downStations = useMemo<string[]>(() => {
    if (!snapshot?.stations) return []
    return snapshot.stations
      .map((st, idx) => (st?.down ? `S${idx + 1}` : null))
      .filter((station): station is string => station !== null)
  }, [snapshot?.stations])

  return (
    <div>
      <h2>KPIs</h2>
      <div className="kpis-row">
        <div className="kpi">
          <div className="label">Sim Time</div>
          <div className="value">{tEnd.toFixed(2)} s</div>
        </div>
        <div className="kpi">
          <div className="label">WIP</div>
          <div className="value">{wip}</div>
        </div>
      </div>

      <div className="section-title">Throughput</div>
      <div className="kpis-row">
        <div className="kpi">
          <div className="label">Last (count)</div>
          <div className="value">{throughput}</div>
        </div>
        <div className="kpi">
          <div className="label">Rate (per hr)</div>
          <div className="value">{isFinite(thrPerHour) ? thrPerHour.toFixed(1) : 'N/A'}</div>
        </div>
      </div>

      <div className="section-title">Line Status</div>
      <div className="kpis-row">
        <div className="kpi">
          <div className="label">Blocked</div>
          <div className="value">{blocked}</div>
        </div>
        <div className="kpi">
          <div className="label">Starved</div>
          <div className="value">{starved}</div>
        </div>
      </div>

      <div className="section-title">Maintenance</div>
      <div className="kpis-row">
        <div className="kpi">
          <div className="label">Workers</div>
          <div className="value">
            {workersAvailable}/{workersTotal}
          </div>
        </div>
        <div className="kpi" style={{ flex: 1 }}>
          <div className="label">Down Stations</div>
          <div className="value" style={{ fontSize: '1rem' }}>
            {downStations.length ? downStations.join(', ') : 'None'}
          </div>
        </div>
      </div>

      {failureLog.length > 0 && (
        <>
          <div className="section-title">Failure Timeline</div>
          <ul className="timeline">
            {[...failureLog].reverse().map((evt, idx) => {
              const stationLabel = evt.station != null ? `S${evt.station + 1}` : 'Station ?'
              const timeVal = typeof evt.time === 'number' ? evt.time : 0
              return (
                <li key={`${evt.time ?? 't'}-${idx}`}>
                  <span className="timeline-dot" />
                  <div>
                    <div className="timeline-title">{stationLabel}</div>
                    <div className="timeline-meta">{timeVal.toFixed(1)} s</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="section-title">Processing Speed</div>
      <div className="kpis-row">
        <div className="kpi">
          <div className="label">Avg Time</div>
          <div className="value">{avgProcTime.toFixed(2)} s</div>
        </div>
        <div className="kpi">
          <div className="label">Avg Speed</div>
          <div className="value">{avgProcSpeed > 0 ? `${avgProcSpeed.toFixed(3)}/s` : '0/s'}</div>
        </div>
      </div>

      {summary && (
        <>
          <div className="section-title">Summary</div>
          <div className="kpis-row">
            <div className="kpi">
              <div className="label">Jobs</div>
              <div className="value">
                {summary.jobs_completed}/{summary.total_jobs}
              </div>
            </div>
            <div className="kpi">
              <div className="label">Makespan</div>
              <div className="value">{summary.makespan.toFixed(2)} s</div>
            </div>
            <div className="kpi">
              <div className="label">Avg WIP</div>
              <div className="value">{summary.avg_wip.toFixed(2)}</div>
            </div>
            <div className="kpi">
              <div className="label">Avg Util</div>
              <div className="value">{(summary.avg_util * 100).toFixed(0)}%</div>
            </div>
            <div className="kpi">
              <div className="label">Thru Rate</div>
              <div className="value">{summary.throughput_rate.toFixed(3)}/s</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
