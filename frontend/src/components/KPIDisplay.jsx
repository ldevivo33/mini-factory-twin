import React from 'react'
import { useFactoryStore } from '../state/store.js'

export default function KPIDisplay() {
  const sim = useFactoryStore((s) => s.sim)
  const cum = useFactoryStore((s) => s.cumulativeThroughput)
  const t = sim?.info?.t ?? 0
  const throughput = sim?.info?.throughput ?? 0
  const reward = sim?.info?.reward ?? 0
  const u = sim?.obs ? sim.obs.slice(2, 5) : [0, 0, 0]

  return (
    <div>
      <h2>KPIs</h2>
      <div className="kpis-row">
        <div className="kpi">
          <div className="label">Tick</div>
          <div className="value">{t}</div>
        </div>
        <div className="kpi">
          <div className="label">Reward</div>
          <div className="value">{reward.toFixed(3)}</div>
        </div>
      </div>

      <div className="section-title">Throughput</div>
      <div className="kpis-row">
        <div className="kpi">
          <div className="label">Last</div>
          <div className="value">{throughput}</div>
        </div>
        <div className="kpi">
          <div className="label">Cumulative</div>
          <div className="value">{cum}</div>
        </div>
      </div>

      <div className="section-title">Station Utilization</div>
      <div className="kpis-row">
        <div className="kpi">
          <div className="label">S1</div>
          <div className="value">{(u[0] * 100).toFixed(0)}%</div>
        </div>
        <div className="kpi">
          <div className="label">S2</div>
          <div className="value">{(u[1] * 100).toFixed(0)}%</div>
        </div>
        <div className="kpi">
          <div className="label">S3</div>
          <div className="value">{(u[2] * 100).toFixed(0)}%</div>
        </div>
      </div>
    </div>
  )
}
