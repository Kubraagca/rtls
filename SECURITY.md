# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public issue.** Instead:

1. Go to the [Security Advisories](https://github.com/ch-bas/threejs-sims-house-builder/security/advisories) page and click **"Report a vulnerability"**
2. Include steps to reproduce, affected components, and potential impact
3. If possible, suggest a fix or mitigation

## What to Expect

- You will receive an acknowledgment within **48 hours**
- We will investigate and provide an update within **7 days**
- If the vulnerability is confirmed, we will release a fix and credit you (unless you prefer to remain anonymous)

## Scope

This policy covers:

- The application code in this repository
- Dependencies listed in `package.json` / `package-lock.json`
- The GitHub Pages deployment at `ch-bas.github.io/threejs-sims-house-builder`

This application runs entirely client-side with no backend, authentication, or user data storage. The primary security concerns are:

- **Dependency vulnerabilities** — outdated npm packages with known CVEs
- **XSS via share URLs** — malicious layout data encoded in the URL hash
- **XSS via JSON import** — crafted layout files loaded through the import feature

## Dependency Updates

We monitor dependencies with `npm audit` and address critical/high vulnerabilities promptly. If you notice an unpatched advisory, please report it.

## RTLS Security Guardrails

The office/RTLS fork treats location telemetry and device-management actions as security-sensitive data.
These rules are architectural requirements for all future backend and realtime integrations:

- **Never persist authentication/session tokens in cookies, `localStorage`, `sessionStorage`, IndexedDB, URLs, or layout JSON.**
- Browser access credentials must be short-lived and **memory-only**. A page reload intentionally requires a fresh authenticated bootstrap/reauthentication flow rather than recovering a bearer token from persistent browser storage.
- Never embed API keys, gateway credentials, camera passwords, signing keys, or RTLS service secrets in the client bundle (`NEXT_PUBLIC_*`, static JSON, GLB metadata, source maps, etc.).
- Production HTTP and realtime traffic must use TLS. Do not send bearer credentials in query strings because URLs are commonly logged.
- Validate and authorize every device, floor, employee/beacon and telemetry operation server-side; client-side visibility is not an authorization boundary.
- Treat imported layouts, device names, labels and realtime payloads as untrusted input. Keep rendering text-only unless explicit sanitization is added for HTML.
- Enforce schema/range validation and rate limits on location updates before broadcasting them to viewers.
- Prefer opaque internal identifiers in the 3D scene. Personally identifying employee data should only be joined after authorization and should not be embedded in exported floor-plan files.
- Security-sensitive audit events must be generated server-side and must not include raw secrets or bearer tokens.

The current demo has no authentication backend and the animated RTLS avatars use generic `EMP-###` identifiers only.

## V8 custom GLB import guardrails

- UI imports accept only validated binary glTF 2.0 (`.glb`) and cap each file at 32 MB.
- Imported GLBs must be self-contained. Any external buffer/image URI is rejected before GLTFLoader runs, preventing user-supplied models from triggering arbitrary outbound asset fetches.
- Draco and KTX2/Basis assets are rejected until local-only decoder/transcoder assets are deliberately bundled; no decoder CDN fallback is used.
- Custom model binaries are stored in IndexedDB strictly as user content. Authentication/session tokens remain forbidden in IndexedDB, cookies, localStorage, sessionStorage, URLs, and layout JSON.
