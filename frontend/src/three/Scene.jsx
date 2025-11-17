import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, RepeatWrapping } from 'three'
import StationMesh from './StationMesh.jsx'
import BufferMesh from './BufferMesh.jsx'
import LabelText from './LabelText.jsx'
import { useFactoryStore } from '../state/store.js'

const WALKWAY_Z = -1.4
const WORKER_SPEED = 2.4

function FactoryContent() {
  const snapshot = useFactoryStore((s) => s.snapshot)
  const prevSnapshot = useFactoryStore((s) => s.prevSnapshot)
  const bufferCaps = useFactoryStore((s) => s.config.buffer_caps)
  const nStationsConfig = useFactoryStore((s) => s.config.n_stations)
  const repairTime = useFactoryStore((s) => s.config.repair_time)
  const stations = snapshot?.stations || []
  const buffersDict = snapshot?.buffers || {}

  const [alpha, setAlpha] = useState(1)
  const targetRenderMsRef = useRef(500) // default duration if dt unknown
  const rafRef = useRef(null)

  useEffect(() => {
    // Compute render duration based on sim dt
    const lastEnd = prevSnapshot?.t_end ?? snapshot?.t_start ?? 0
    const simDt = Math.max(0, (snapshot?.t_end ?? 0) - (lastEnd || 0))
    const renderMs = Math.min(1500, Math.max(120, simDt * 150))
    targetRenderMsRef.current = renderMs
    setAlpha(0)

    let start = performance.now()
    cancelAnimationFrame(rafRef.current)
    const step = (t) => {
      const elapsed = t - start
      const a = Math.max(0, Math.min(1, elapsed / targetRenderMsRef.current))
      setAlpha(a)
      if (a < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [snapshot?.t_end])

  const effectiveStationCount = Math.max(1, stations.length || nStationsConfig || 3)
  const spacing = 3.0
  const stageWidth = Math.max(8, (effectiveStationCount - 1) * spacing + 3.5)
  const stageDepth = 5.5

  const stationPositions = useMemo(() => {
    const half = (effectiveStationCount - 1) / 2
    return Array.from({ length: effectiveStationCount }, (_, idx) => {
      const x = (idx - half) * spacing
      return [x, 0.45, 0]
    })
  }, [effectiveStationCount])

  const effectiveBufferCaps = bufferCaps.length ? bufferCaps : Array.from(
    { length: Math.max(0, effectiveStationCount - 1) },
    () => 0
  )

  const bufferPositions = useMemo(() => {
    return effectiveBufferCaps.map((_, idx) => {
      const left = stationPositions[idx] ?? [0, 0, 0]
      const right = stationPositions[idx + 1] ?? [0, 0, 0]
      return [ (left[0] + right[0]) / 2, 0.12, 0 ]
    })
  }, [effectiveBufferCaps, stationPositions])

  const blendedBuffers = effectiveBufferCaps.map((cap, idx) => {
    const key = `b${idx + 1}${idx + 2}`
    const currLevel = buffersDict[key] ?? 0
    const prevLevel = prevSnapshot?.buffers?.[key] ?? currLevel
    const blended = prevSnapshot ? prevLevel * (1 - alpha) + currLevel * alpha : currLevel
    return { key, level: blended, capacity: cap }
  })

  const belts = bufferPositions.map((pos, idx) => {
    const leftX = stationPositions[idx]?.[0] ?? pos[0]
    const rightX = stationPositions[idx + 1]?.[0] ?? pos[0]
    const length = Math.max(0.6, Math.abs(rightX - leftX) - 0.6)
    return { center: [pos[0], 0.04, pos[2]], length }
  })

  const hutPosition = useMemo(() => {
    const first = stationPositions[0]?.[0] ?? 0
    return [first - 2.8, 0.3, WALKWAY_Z]
  }, [stationPositions])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[stageWidth, stageDepth]} />
        <meshStandardMaterial color="#f3f4f6" />
      </mesh>
      <mesh position={[0, 0.01, WALKWAY_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[stageWidth * 0.9, 1.2]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <group position={hutPosition}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <boxGeometry args={[1.4, 0.5, 1.0]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
        <LabelText position={[0, 0.6, 0]} offsetY={0.25}>
          Workers
        </LabelText>
      </group>

      {belts.map((belt, idx) => (
        <ConveyorBelt key={`belt-${idx}`} center={belt.center} length={belt.length} />
      ))}

      {stationPositions.map((pos, idx) => {
        const currentStation = stations[idx]
        const previousStation = prevSnapshot?.stations?.[idx]
        const stationData = prevSnapshot && alpha < 0.5 ? (previousStation || currentStation) : currentStation
        return (
          <group key={`station-${idx}`}>
            <StationMesh position={pos} station={stationData} repairTime={repairTime} />
            <LabelText position={pos} offsetY={0.9}>{`S${idx + 1}`}</LabelText>
          </group>
        )
      })}

      {bufferPositions.map((pos, idx) => (
        <group key={`buffer-${idx}`}>
          <BufferMesh
            position={pos}
            level={blendedBuffers[idx]?.level ?? 0}
            capacity={blendedBuffers[idx]?.capacity ?? 0}
          />
          <LabelText position={[pos[0], 0.02, pos[2] + 0.55]} offsetY={0.25}>{`B${idx + 1}${idx + 2}`}</LabelText>
        </group>
      ))}

      <Workers stationPositions={stationPositions} hutPosition={hutPosition} walkwayZ={WALKWAY_Z} />

      <OrbitControls enablePan={false} />
    </>
  )
}

function ConveyorBelt({ center = [0, 0, 0], length = 2.0, width = 0.8 }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 32
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#4b5563'
    ctx.lineWidth = 4
    for (let x = 0; x < canvas.width; x += 16) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + 8, canvas.height)
      ctx.stroke()
    }
    const tex = new CanvasTexture(canvas)
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    tex.repeat.set(length * 0.5, 1)
    return tex
  }, [length])

  useEffect(() => {
    return () => texture?.dispose?.()
  }, [texture])

  useFrame((_, delta) => {
    if (texture) {
      texture.offset.x -= delta * 0.2
    }
  })

  return (
    <mesh position={center} receiveShadow>
      <boxGeometry args={[length, 0.06, width]} />
      <meshStandardMaterial color="#111827" metalness={0.3} roughness={0.7} map={texture} />
    </mesh>
  )
}

function Workers({ stationPositions, hutPosition, walkwayZ }) {
  const snapshot = useFactoryStore((s) => s.snapshot)
  const workersTotal = snapshot?.workers_total ?? 0
  const [workers, setWorkers] = useState([])
  const lastEventRef = useRef(null)

  useEffect(() => {
    setWorkers((prev) => syncWorkersToCount(prev, workersTotal, hutPosition))
  }, [workersTotal, hutPosition])

  useEffect(() => {
    setWorkers((prev) =>
      prev.map((worker) => {
        if (worker.state === 'idle') {
          return { ...worker, position: { x: hutPosition[0], z: hutPosition[2] } }
        }
        return worker
      })
    )
  }, [hutPosition])

  useEffect(() => {
    const evt = snapshot?.event
    if (!evt || typeof evt.station !== 'number') return
    const key = `${snapshot?.t_end ?? 0}-${evt.type}-${evt.station}`
    if (lastEventRef.current === key) return
    lastEventRef.current = key
    if (evt.type === 'machine_failure') {
      setWorkers((prev) => assignWorkerToStation(prev, evt.station, stationPositions))
    } else if (evt.type === 'repair_complete') {
      setWorkers((prev) => releaseWorkerFromStation(prev, evt.station))
    }
  }, [snapshot, stationPositions])

  useFrame((_, delta) => {
    setWorkers((prev) => {
      if (!prev.some((w) => w.state === 'moving')) {
        return prev
      }
      let changed = false
      const next = prev.map((worker) => {
        if (worker.state !== 'moving') {
          return worker
        }
        const target =
          worker.direction === 'to-station' &&
          worker.targetStation != null &&
          stationPositions[worker.targetStation]
            ? { x: stationPositions[worker.targetStation][0], z: walkwayZ }
            : { x: hutPosition[0], z: hutPosition[2] }
        const updated = moveWorkerTowards(worker, target, delta)
        if (updated !== worker) {
          changed = true
        }
        return updated
      })
      return changed ? next : prev
    })
  })

  return (
    <>
      {workers.map((worker) => (
        <WorkerMesh key={worker.id} worker={worker} />
      ))}
    </>
  )
}

function WorkerMesh({ worker }) {
  const color =
    worker.state === 'repairing' ? '#f97316' : worker.state === 'moving' ? '#3b82f6' : '#22c55e'
  return (
    <group position={[worker.position.x, 0.15, worker.position.z]}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.32, 14]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
    </group>
  )
}

const createWorkerState = (id, hutPosition) => ({
  id,
  state: 'idle',
  direction: 'idle',
  position: { x: hutPosition[0], z: hutPosition[2] },
  targetStation: null,
})

const syncWorkersToCount = (workers, total, hutPosition) => {
  if (total <= 0) {
    return []
  }
  const trimmed = workers.slice(0, total).map((worker, idx) => ({ ...worker, id: idx }))
  while (trimmed.length < total) {
    trimmed.push(createWorkerState(trimmed.length, hutPosition))
  }
  return trimmed
}

const assignWorkerToStation = (workers, stationIdx, stationPositions) => {
  if (stationIdx == null || stationIdx < 0 || stationIdx >= stationPositions.length) {
    return workers
  }
  const alreadyAssigned = workers.some(
    (w) => w.targetStation === stationIdx && (w.state === 'moving' || w.state === 'repairing')
  )
  if (alreadyAssigned) {
    return workers
  }
  const idleIdx = workers.findIndex((w) => w.state === 'idle')
  if (idleIdx === -1) {
    return workers
  }
  const updated = workers.slice()
  updated[idleIdx] = {
    ...updated[idleIdx],
    state: 'moving',
    direction: 'to-station',
    targetStation: stationIdx,
  }
  return updated
}

const releaseWorkerFromStation = (workers, stationIdx) => {
  const idx = workers.findIndex((w) => w.targetStation === stationIdx)
  if (idx === -1) {
    return workers
  }
  const updated = workers.slice()
  updated[idx] = {
    ...updated[idx],
    state: 'moving',
    direction: 'to-hut',
  }
  return updated
}

const moveWorkerTowards = (worker, target, delta) => {
  const dx = target.x - worker.position.x
  const dz = target.z - worker.position.z
  const dist = Math.hypot(dx, dz)
  const step = WORKER_SPEED * delta
  if (dist <= 1e-4 || dist <= step) {
    return finalizeWorkerArrival({ ...worker, position: { x: target.x, z: target.z } })
  }
  const ratio = step / dist
  return {
    ...worker,
    position: {
      x: worker.position.x + dx * ratio,
      z: worker.position.z + dz * ratio,
    },
  }
}

const finalizeWorkerArrival = (worker) => {
  if (worker.direction === 'to-station') {
    return { ...worker, state: 'repairing', direction: 'repairing' }
  }
  return { ...worker, state: 'idle', direction: 'idle', targetStation: null }
}

export default function Scene() {
  return (
    <Canvas shadows camera={{ position: [0, 4.5, 12], fov: 55 }}>
      <FactoryContent />
    </Canvas>
  )
}
