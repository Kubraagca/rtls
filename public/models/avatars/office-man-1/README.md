# Office Man avatar

Primary live RTLS avatar supplied by the user.

- `office-man-walking.glb` — runtime-optimized GLB used by the RTLS crowd manager.
  - Keeps only `Rig|walk`, `Rig|idle`, `Rig|sitting_idle`.
  - Unused animation accessors/bufferViews were removed from the runtime file.
  - Original source model remains outside the runtime bundle/library workflow.
- `Office man 1.obj` / `Office man 1.mtl` — legacy static fallback only.

The live renderer never creates one SkinnedMesh per tracked person. A bounded
full-quality pool uses this GLB while the rest of the crowd is GPU-instanced.
