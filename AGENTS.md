# Torob Cloud working boundaries

- Communicate progress and important decisions in Persian.
- Keep application development local. The existing SSH alias `xdo-new` is authorized for Torob Cloud database, monitoring and necessary support services only. No public app deployment.
- Inspect before shared infrastructure changes; back up, validate and change only scoped Torob resources. Preserve unrelated services, databases, dashboards and configuration.
- Secrets stay server-side or in ignored local `.env`; never print credentials or put them in Git/browser bundles.
- Use the user-provided IRANYekanX fonts from `D:\Projects\ForoushYar\IRANYekanX(Pro)` via `scripts/setup-fonts.ps1`.
- **Do not run E2E tests or browser journey tests unless the user explicitly reauthorizes them.** `npm run verify` is an E2E command and is paused. Static checks and bounded unit checks are distinct from E2E.
- No arbitrary shell/model-generated execution in the app. Show a concrete plan before any deployment/remediation action and restrict demonstrations to `torob-cloud-sandbox`. Never inject faults into shared infrastructure.
- Keep unavailable commercial, AI, deployment and quality metrics explicitly unavailable. Verification events remain separate from user activity.
