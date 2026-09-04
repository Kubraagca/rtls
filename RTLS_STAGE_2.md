# RTLS Office — Stage 2

This stage turns the realistic office scene into an RTLS-oriented monitoring demo without changing the project's existing layout/editor architecture.

## Added

- **RTLS CANLI** mode in the bottom control panel.
- Three generic tracked employee avatars (`EMP-001` …) visible automatically in Live mode.
- More human-like articulated avatar rigs with torso/head/hair, arms, legs, shoes, lanyard and a visible beacon badge.
- Smooth walk animation and status-aware poses.
- Workstation-derived destinations: avatars can walk to a desk, face it, remain there and use a seated/working pose before moving again.
- Live status labels (`Yürüyor`, `Masada çalışıyor`, `Bekliyor`) and an animated RTLS position ring.
- RTLS Live mode stays in overview/orbit camera instead of forcing first-person walkthrough.
- Existing bundled PBR/GLB assets are used more heavily in reception/waiting areas (sofa, guest chairs, lamp and plant) while the office builder remains editable.
- Meeting-room rug and additional visual staging.

## Integration boundary

The current movement is a **demo telemetry source**. The scene side is intentionally isolated in `components/room-organizer/hooks/use-npcs.ts` so a later stage can replace demo targets with real RTLS `{ beaconId, x, z, floor, timestamp }` updates without rebuilding the office renderer.

## Security

No authentication/token persistence was introduced. Generic employee identifiers are used in the demo. See `SECURITY.md` for the RTLS security guardrails that future API/WebSocket work must follow.


## V3 – Gerçekçi Ofis Donatımı
- Resepsiyon bekleme sehpası ve vazo
- Giriş askılığı
- Personel dolapları, arşiv rafı ve evrak dolabı
- Çöp kovaları
- Toplantı odası ekranı ve akustik paneller
- Pantry/küçük mutfak köşesi: tezgâh, kahve makinesi, mini buzdolabı, su sebili
- Eski starter kaydı yüklüyse yeni ofis başlangıcını göstermek için storage key v3'e alındı


## V4 – Office avatar + grouped office catalog
- User-supplied `Office man 1.obj` is now the RTLS live avatar; procedural avatar remains only as a load-failure fallback.
- OBJ is served locally from `/public/models/avatars/office-man-1/`; no external asset host is used.
- Uploaded MTL referenced texture PNGs that were not provided. Local material-name-based PBR fallback colors are applied instead of making external requests.
- Bottom design tools are grouped as **OFİS / ALTYAPI / MİMARİ** and now expose the missing **Ofis**, **RTLS / Ağ**, **Kameralar**, and **Personel** groups.
- `Tümü` catalog view is rendered in category sections instead of a flat mixed list.
