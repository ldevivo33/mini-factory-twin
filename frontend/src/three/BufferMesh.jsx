import React, { useMemo } from 'react'
import { MeshStandardMaterial } from 'three'

export default function BufferMesh({ position = [0, 0.25, 0], fill = 0 }) {
  const clamped = Math.max(0, Math.min(1, fill))
  const height = 0.5 + clamped * 1.25 // bin height visual

  const material = useMemo(() => new MeshStandardMaterial({ color: '#60a5fa' }), [])

  return (
    <mesh position={[position[0], height / 2, position[2]]} material={material} castShadow receiveShadow>
      <boxGeometry args={[0.6, height, 0.6]} />
    </mesh>
  )
}

