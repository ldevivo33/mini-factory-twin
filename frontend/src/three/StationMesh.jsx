import React, { useMemo } from 'react'
import { MeshStandardMaterial } from 'three'

const colors = {
  running: '#22c55e',
  blocked: '#eab308',
  starved: '#f59e0b',
  idle: '#6b7280'
}

export default function StationMesh({ position = [0, 0.5, 0], station }) {
  // Support both legacy and new snapshot shapes
  const stateStr = station?.state
  const status = station?.status ?? (stateStr === 'busy' ? 1 : stateStr === 'blocked' ? 2 : 0)
  const blocked = station?.blocked ?? (stateStr === 'blocked')
  const starved = station?.starved ?? (stateStr === 'starved')

  const color = useMemo(() => {
    if (status === 1 || stateStr === 'busy') return colors.running
    if (blocked) return colors.blocked
    if (starved) return colors.starved
    return colors.idle
  }, [status, blocked, starved, stateStr])

  const material = useMemo(() => new MeshStandardMaterial({ color }), [color])

  return (
    <mesh position={position} material={material} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  )
}
