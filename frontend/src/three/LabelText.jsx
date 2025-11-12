import React from 'react'
import { Text, Billboard } from '@react-three/drei'

// Renders a camera-facing label anchored to a world position.
// The label will remain above the target as the camera moves.
export default function LabelText({ children, position = [0, 0, 0], offsetY = 1.0 }) {
  return (
    <Billboard position={position} follow lockX={false} lockY={false} lockZ={false}>
      <Text
        position={[0, offsetY, 0]}
        color="#e5e7eb"
        fontSize={0.4}
        anchorX="center"
        anchorY="middle"
        depthOffset={-1}
        outlineColor="#0b0d12"
        outlineWidth={0.005}
      >
        {children}
      </Text>
    </Billboard>
  )
}
