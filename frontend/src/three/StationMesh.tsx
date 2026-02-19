import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { MeshStandardMaterial } from 'three'
import type { StationSnapshot } from '../types'

const colors = {
  running: '#22c55e',
  blocked: '#eab308',
  starved: '#f59e0b',
  idle: '#6b7280',
  down: '#dc2626',
  repairing: '#fb923c',
}

interface StationMeshProps {
  position?: [number, number, number]
  station?: Partial<StationSnapshot>
  repairTime?: number
}

export default function StationMesh({
  position = [0, 0.5, 0],
  station,
  repairTime = 60,
}: StationMeshProps) {
  // Support both legacy and new snapshot shapes.
  const stateStr = station?.state
  const status = station?.status ?? (stateStr === 'busy' ? 1 : stateStr === 'blocked' ? 2 : 0)
  const blocked = station?.blocked ?? stateStr === 'blocked'
  const starved = station?.starved ?? stateStr === 'starved'
  const isDown = Boolean(station?.down)
  const isRepairing = Boolean(station?.repairing)
  const repairRemaining = Number(station?.repair_remaining ?? 0)

  const color = useMemo(() => {
    if (isRepairing) return colors.repairing
    if (isDown) return colors.down
    if (status === 1 || stateStr === 'busy') return colors.running
    if (blocked) return colors.blocked
    if (starved) return colors.starved
    return colors.idle
  }, [status, blocked, starved, stateStr, isDown, isRepairing])

  const emissiveColor = isDown || isRepairing ? '#ff8b8b' : '#0b0d12'
  const emissiveIntensity = isRepairing ? 0.6 : isDown ? 0.5 : 0.12

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color,
        metalness: 0.35,
        roughness: 0.45,
        emissive: emissiveColor,
        emissiveIntensity,
      }),
    [color, emissiveColor, emissiveIntensity]
  )

  const progress = useMemo(() => {
    if (!isRepairing) return 0
    const total = repairTime > 0 ? repairTime : 1
    return 1 - Math.min(Math.max(repairRemaining / total, 0), 1)
  }, [isRepairing, repairRemaining, repairTime])

  const icon = isRepairing ? 'R' : isDown ? '!' : null

  return (
    <mesh position={position} material={material} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      {icon && (
        <Html position={[0, 0.8, 0]} center transform sprite>
          <div className={`station-icon ${isRepairing ? 'station-icon--repair' : 'station-icon--alert'}`}>
            {icon}
          </div>
          {isRepairing && (
            <div className="repair-bar">
              <div className="repair-bar__fill" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
            </div>
          )}
        </Html>
      )}
    </mesh>
  )
}

