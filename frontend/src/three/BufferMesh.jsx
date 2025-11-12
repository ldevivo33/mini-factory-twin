import React, { useMemo } from 'react'
import { MeshStandardMaterial } from 'three'

const SLOT_HEIGHT = 0.18
const SLOT_GAP = 0.02
const BASE_THICKNESS = 0.08

export default function BufferMesh({ position = [0, 0, 0], level = 0, capacity = 1 }) {
  const safeCapacity = Math.max(0, capacity)
  const safeLevel = Math.max(0, Math.min(safeCapacity, Math.round(level)))
  const stackHeight = safeCapacity > 0 ? safeCapacity * SLOT_HEIGHT + Math.max(0, safeCapacity - 1) * SLOT_GAP : 0
  const containerHeight = stackHeight + 0.12

  const slots = useMemo(() => {
    return Array.from({ length: safeCapacity }, (_, idx) => ({
      filled: idx < safeLevel,
      y: BASE_THICKNESS + idx * (SLOT_HEIGHT + SLOT_GAP) + SLOT_HEIGHT / 2,
    }))
  }, [safeCapacity, safeLevel])

  const baseMaterial = useMemo(() => new MeshStandardMaterial({ color: '#1f2937', metalness: 0.2, roughness: 0.7 }), [])
  const frameMaterial = useMemo(() => new MeshStandardMaterial({ color: '#cbd5f5', transparent: true, opacity: 0.35, roughness: 0.9 }), [])
  const filledMaterial = useMemo(() => new MeshStandardMaterial({ color: '#3b82f6', metalness: 0.1 }), [])
  const emptyMaterial = useMemo(() => new MeshStandardMaterial({ color: '#d1d5db', metalness: 0.05, roughness: 0.9 }), [])

  return (
    <group position={position}>
      <mesh position={[0, BASE_THICKNESS / 2, 0]} material={baseMaterial} receiveShadow>
        <boxGeometry args={[0.9, BASE_THICKNESS, 0.6]} />
      </mesh>
      {safeCapacity > 0 && (
        <mesh position={[0, BASE_THICKNESS + containerHeight / 2, 0]} material={frameMaterial} receiveShadow>
          <boxGeometry args={[0.7, containerHeight, 0.5]} />
        </mesh>
      )}
      {slots.map((slot, idx) => (
        <mesh key={idx} position={[0, slot.y, 0]} material={slot.filled ? filledMaterial : emptyMaterial} castShadow>
          <boxGeometry args={[0.55, SLOT_HEIGHT, 0.4]} />
        </mesh>
      ))}
    </group>
  )
}
