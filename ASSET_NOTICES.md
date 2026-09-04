# 3D Asset Notices

This RTLS office demo includes binary glTF assets from the Khronos Group glTF Sample Assets collection.
Each upstream model keeps its own license/credit terms; review the model directory README/license before redistribution.

Current bundled sample assets include:
- Chair Damask Purplegold — Wayfair / Eric Chadwick, CC BY 4.0.
- Glam Velvet Sofa — Khronos glTF Sample Assets; see upstream model README for exact terms.
- Diffuse Transmission Plant — Khronos glTF Sample Assets; see upstream model README for exact terms.
- Glass Vase Flowers — Khronos glTF Sample Assets; see upstream model README for exact terms.
- Anisotropy Barn Lamp — Khronos glTF Sample Assets; see upstream model README for exact terms.
- Commercial Refrigerator — Khronos glTF Sample Assets; see upstream model README for exact terms.

Source collection: https://github.com/KhronosGroup/glTF-Sample-Assets

The procedural RTLS employee avatars and office-specific scene logic in this project are project code and do not embed personal identity data.


## Office man 1 OBJ
- Path: `public/models/avatars/office-man-1/`
- Source: user-supplied MakeHuman OBJ/MTL for this RTLS project.
- The referenced MakeHuman texture PNG files were not included in the upload, so the runtime assigns local PBR-style fallback colors by material name. No remote texture URL is fetched.
- Project owner should retain/verify the source asset's applicable license for deployment.

## User-supplied RTLS office avatar

The `public/models/avatars/office-man-1/office-man-walking.glb` runtime file is
an optimized derivative of the avatar supplied by the user in this project.
Only the three RTLS runtime animation clips (walk / idle / sitting idle) are
retained. No external CDN or runtime asset host is required.
