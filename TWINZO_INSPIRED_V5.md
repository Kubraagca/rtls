# RTLS Office Digital Twin — V5

This release adapts the project toward a live industrial/office digital-twin workflow inspired by publicly documented Twinzo interaction patterns, without copying Twinzo code, assets, or branding.

## Live mode

- Separate **RTLS CANLI** observer mode with the editor UI hidden.
- Device list, search, selected-device status card, focus action and demo playback pause/resume.
- 2D / 3D switching while the same tracked-device state remains alive.
- Bottom layer dock grouped into **Görünüm / RTLS / Analiz**.

## Spatial layers

- **Areas**: reception, open office, meeting room and pantry.
- **Paths**: main circulation, pantry route and workstation route.
- **Heatmap**: demo occupancy/activity hotspots.
- **Signals**: Wi-Fi, cameras and RTLS gateway/beacon ranges.
- **Cameras**: existing camera field-of-view overlays.
- **Labels** and tracked devices can be switched independently.

## RTLS infrastructure

- Six ceiling RTLS anchors/beacons added to the starter office in addition to the gateway.
- RTLS signal range visualization works in 3D and 2D.
- Existing `Office man 1.obj` is kept as the tracked employee visual.
- Demo tracked-device snapshots expose id, position, movement state and battery for the live UI.

## Security boundary

This change introduces no authentication/token persistence and no new remote asset loading. The live demo stays local. When real RTLS transport is connected, authentication/session credentials must remain in memory and server-controlled flows; never persist bearer/session tokens in cookies, `localStorage`, `sessionStorage` or IndexedDB.
