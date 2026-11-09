// The level of the ground where it was tapped in 3D, in a small dark tooltip with a pin.
// Fingers can't hover, so this is the phone's way to read a level; a tap off the block
// takes it away.

import { Html } from '@react-three/drei'
import { pinLabel, type Pin } from './pin'

export function GroundPin({ pin }: { pin: Pin }) {
  return (
    <Html position={pin.at} zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
      <div className="ground-pin" role="status">
        <div className="ground-pin-tip">
          <b>RL {pin.rl.toFixed(2)}</b>
          <span>{pinLabel(pin.dz)}</span>
        </div>
        <i className="ground-pin-dot" aria-hidden="true" />
      </div>
    </Html>
  )
}
