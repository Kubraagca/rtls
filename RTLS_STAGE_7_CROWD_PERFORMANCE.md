# RTLS Stage 7 — Crowd Performance

This stage changes the live RTLS renderer from "one animated GLB per person" to
a bounded hybrid crowd architecture.

## Runtime design

- Demo live mode now tracks **80 employees**.
- At most **6** people are rendered with the user's rigged/skinned GLB.
- The selected employee is always promoted to the full-GLB pool.
- Remaining visible people use four `THREE.InstancedMesh` pose batches:
  `idle`, `walk-a`, `walk-b`, `working`.
- Off-screen / very far people are not rendered in 3D, but remain in RTLS
  simulation and still appear in the device data model.
- Full GLB skeleton animation is capped at **30 Hz**.
- GPU proxy matrices are refreshed at **20 Hz**.
- RTLS UI snapshots are emitted at **2 Hz** instead of causing a React update on
  every animation frame.
- Only one full avatar casts a dynamic shadow: selected person, otherwise the
  nearest full avatar.
- Per-person CanvasTexture labels were removed. Only the bounded full-avatar
  pool owns labels.
- In 2D mode all 3D avatar rendering is disabled while the RTLS simulation keeps
  running for the 2D map.

## GLB runtime optimization

The uploaded avatar source had:

- 71,653 vertices
- 36,428 triangles
- 65 skin joints
- 57 animation clips
- 11,115 animation channels

The runtime GLB keeps only:

- `Rig|walk`
- `Rig|idle`
- `Rig|sitting_idle`

Unused animation accessors/bufferViews were removed. Runtime file size changed
from approximately **5.4 MB to 4.1 MB**. The skinned mesh itself is intentionally
left visually intact for selected/nearby people; scalability comes from not
cloning it for the whole crowd.

## Why this is safer than adding three-avatar everywhere

The project no longer scales CPU skeleton/mixer work with tracked-person count.
The GLB pool has a hard upper bound, while the large crowd path is GPU-instanced.
This also keeps the current Three.js 0.169 runtime and avoids adding another
avatar framework / Three.js version to the critical RTLS rendering path.

## Live benchmark HUD

RTLS CANLI now shows:

- RAF FPS
- active full GLB count
- active GPU proxy count
- current WebGL draw-call count

These counters are meant to be checked on the actual deployment hardware at
10 / 25 / 50 / 80+ tracked people before changing the quality limits.
