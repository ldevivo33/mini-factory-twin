import React, { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import StationMesh from './StationMesh.jsx'
import BufferMesh from './BufferMesh.jsx'
import LabelText from './LabelText.jsx'
import { useFactoryStore } from '../state/store.js'

function FactoryContent() {
  const sim = useFactoryStore((s) => s.sim)
  const stations = sim?.info?.stations || []
  const obs = sim?.obs || []

  // obs: [b12_norm, b23_norm, u1_ema, u2_ema, u3_ema]
  const b12 = obs[0] || 0
  const b23 = obs[1] || 0

  const positions = useMemo(() => {
    const spacing = 3.5
    return {
      s1: [-2 * spacing, 0.5, 0],
      b12: [-1 * spacing, 0.25, 0],
      s2: [0, 0.5, 0],
      b23: [1 * spacing, 0.25, 0],
      s3: [2 * spacing, 0.5, 0]
    }
  }, [])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 10]} />
        <meshStandardMaterial color="#0b0d12" />
      </mesh>

      <StationMesh position={positions.s1} station={stations[0]} />
      <LabelText position={positions.s1} offsetY={1.0}>S1</LabelText>

      <BufferMesh position={positions.b12} fill={b12} />
      <LabelText position={positions.b12} offsetY={0.8}>B12</LabelText>

      <StationMesh position={positions.s2} station={stations[1]} />
      <LabelText position={positions.s2} offsetY={1.0}>S2</LabelText>

      <BufferMesh position={positions.b23} fill={b23} />
      <LabelText position={positions.b23} offsetY={0.8}>B23</LabelText>

      <StationMesh position={positions.s3} station={stations[2]} />
      <LabelText position={positions.s3} offsetY={1.0}>S3</LabelText>

      <OrbitControls enablePan={false} />
    </>
  )
}

export default function Scene() {
  return (
    <Canvas shadows camera={{ position: [0, 5, 16], fov: 60 }}>
      <FactoryContent />
    </Canvas>
  )
}
