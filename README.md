# Pomodoro

Live: https://pomodoro.hn.yaaha.net

A dependency-free static Pomodoro app with focus/short/long modes, start/pause/reset, customizable 1–180 minute durations, localStorage persistence, wall-clock deadlines, long breaks every fourth completed focus, keyboard controls, and opt-in chime. Next sessions never auto-start. Sound is off on each fresh page load; browsers may suspend background audio. All timer state stays in the browser, not in Kubernetes or a backend. Nginx does generate ordinary HTTP access logs.

## Files

- `src/`: index.html, styles.css, app.js, timer-core.js.
- `dist/`: the four generated runtime assets.
- `test/`: Node test suite (19 passing).
- `scripts/build.mjs`: stdlib-only static build.
- `k8s/`, `kustomization.yaml`, `rendered.yaml`: deployment resources.
- `qa/`: browser checks, JSON results, desktop/mobile screenshots.
- `DEPLOYMENT.md`: deployment and workspace access details.

```bash
npm test
npm run build
```

No app dependencies, registry push, custom container build, or GitHub publication are needed. Nginx's published image serves ConfigMap-mounted files. The content-hashed ConfigMap name automatically triggers a rollout when runtime assets change.

Verified: 19 tests; server-side validation; successful rollout; HTTP and trusted HTTPS 200; 10 deployed-browser checks, including refresh recovery and mobile width; no browser JavaScript/CSP errors. Browser tests exercise sound scheduling, not human-perceived audibility. The existing example app is unchanged.
