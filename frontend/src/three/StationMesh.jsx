import React, { useMemo } from 'react'
import { MeshStandardMaterial } from 'three'

const colors = {
  running: '#22c55e',
  blocked: '#eab308',
  starved: '#f59e0b',
  idle: '#6b7280'
}

export default function StationMesh({ position = [0, 0.5, 0], station }) {
  const status = station?.status ?? 0
  const blocked = !!station?.blocked
  const starved = !!station?.starved

  const color = useMemo(() => {
    if (status === 1) return colors.running
    if (blocked) return colors.blocked
    if (starved) return colors.starved
    return colors.idle
  }, [status, blocked, starved])

  const material = useMemo(() => new MeshStandardMaterial({ color }), [color])

  return (
    <mesh position={position} material={material} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  )
}

