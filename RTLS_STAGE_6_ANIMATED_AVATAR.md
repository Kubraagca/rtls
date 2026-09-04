# Stage 6 — Animated GLB RTLS avatar

The live RTLS people now use the user-supplied rigged GLB at:

`public/models/avatars/office-man-1/office-man-walking.glb`

Detected model data:

- 1 skinned mesh
- 1 skin / armature
- 65 joints
- 57 animation clips

Runtime mapping:

- RTLS state `walking` -> `Rig|walk`
- RTLS state `idle` -> `Rig|idle`
- RTLS state `working` -> `Rig|sitting_idle`

The walk animation is in-place. The animation mixer moves the bones, while the
RTLS state machine remains authoritative for world X/Z coordinates. This avoids
animation root motion drifting away from beacon coordinates.

The avatar loader uses `SkeletonUtils.clone()` so each tracked employee gets an
independent skeleton and AnimationMixer. The old OBJ remains a visual fallback
only if the GLB cannot be loaded.
