import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, RepeatWrapping } from 'three'
import StationMesh from './StationMesh.jsx'
import BufferMesh from './BufferMesh.jsx'
import LabelText from './LabelText.jsx'
import { useFactoryStore } from '../state/store.js'

function FactoryContent() {
  const snapshot = useFactoryStore((s) => s.snapshot)
  const prevSnapshot = useFactoryStore((s) => s.prevSnapshot)
  const bufferCaps = useFactoryStore((s) => s.config.buffer_caps)
  const nStationsConfig = useFactoryStore((s) => s.config.n_stations)
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

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[stageWidth, stageDepth]} />
        <meshStandardMaterial color="#f3f4f6" />
      </mesh>

      {belts.map((belt, idx) => (
        <ConveyorBelt key={`belt-${idx}`} center={belt.center} length={belt.length} />
      ))}

      {stationPositions.map((pos, idx) => {
        const currentStation = stations[idx]
        const previousStation = prevSnapshot?.stations?.[idx]
        const stationData = prevSnapshot && alpha < 0.5 ? (previousStation || currentStation) : currentStation
        return (
          <group key={`station-${idx}`}>
            <StationMesh position={pos} station={stationData} />
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

export default function Scene() {
  return (
    <Canvas shadows camera={{ position: [0, 4.5, 12], fov: 55 }}>
      <FactoryContent />
    </Canvas>
  )
}
