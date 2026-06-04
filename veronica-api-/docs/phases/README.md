# Backend Phase Docs

Execution playbooks for the `veronica-api` repo. Each phase is a self-contained set of tasks an intern can complete with Claude Code.

## How development works across the two repos

The backend and frontend develop **in parallel, independently**. The frontend intern uses MSW (Mock Service Worker) to fake the API based on the published `@veronica/contracts` schemas, so they don't have to wait for the backend to be done.

At the end of each phase, the two repos converge at an **integration milestone**: contracts versions align, FE flips from mocks to the real staging backend, both interns run the integration checklist together (~30-60 min sync), tests pass. Then both tracks proceed.

Integration milestones are defined in [../integration-milestones.md](../integration-milestones.md). Don't move to the next phase until the milestone after the current phase passes.

## How to use these docs

1. **Open the phase doc** you're working on (start with Phase 0).
2. **Read "Prerequisites"** at the top. Don't start if anything there is missing.
3. **Work through tasks in order.** Each has context, files to touch, suggested Claude Code prompt, verification commands, acceptance checklist.
4. **Don't skip ahead.** Later tasks assume earlier ones passed.
5. **Verify before checking the box.** Run the verification commands. Acceptance is the bar — not "Claude said it looks done."
6. **At end of phase**: check the integration milestone passes before moving on.
7. **If stuck for >30 min on one task, escalate to Ketan** before continuing.

## How to work with Claude Code

- Open the phase doc next to Claude Code.
- Copy the entire "Suggested Claude Code prompt" verbatim.
- After Claude finishes, **run the verification commands yourself.** Don't trust "looks good".
- If Claude proposes destructive actions (delete files, force-push, drop tables, run migrations against production), **stop and ask Ketan first.**
- "Intern action — manual" means you do it without Claude (cloud accounts, copying API keys).
- **Commit after each task**, format: `feat(phase-N): task description`.

## Phases

| Phase | Doc | Status | Estimated effort |
|---|---|---|---|
| 0 | [Foundations](./phase-0-foundations.md) | ✅ done | 1 session (~3 hrs) |
| 1 | [Admin API](./phase-1-admin.md) | ✅ done | 3 sessions (~9 hrs) |
| 2 | [Read paths](./phase-2-read-paths.md) | ✅ done | 1-2 sessions |
| 3 | [Customer auth + cart + Sentry](./phase-3-auth-and-cart.md) | ✅ done (Sentry deferred to Phase 5) | 2 sessions |
| **4** | [Razorpay checkout](./phase-4-razorpay.md) | ✅ done — stub/dummy Razorpay creds; real keys + publish/tag pending | 2-3 sessions |
| **5** | [Caching + remaining obs](./phase-5-caching-and-obs.md) | ✅ done — code complete; Sentry/Axiom/BetterStack/Slack accounts pending | 1-2 sessions |
| **6** | [Search + polish](./phase-6-search-and-polish.md) | ✅ done — Postgres FTS kept (Meili deferred); migration 0004 unapplied; contracts 1.0.0 unpublished | 1-2 sessions |

**Backend v1 is code-complete (phases 0–6).** Remaining before launch: apply migration 0004, publish `@veronica/contracts@1.0.0`, wire real third-party creds (Razorpay/Sentry/Axiom/Slack/BetterStack), and run the FE integration milestones.

A "session" is ~3 hours of focused intern + Claude Code work.

## Coordinating with the FE intern

Every phase has a **"Coordinate with FE"** callout listing things you need to discuss with the other intern. Don't surprise them. Sync at the start and end of each phase.

The biggest coordination boundary: the contracts package. Every schema change is a version bump that the FE intern needs to install. Communicate via:
- A `#veronica-dev` Slack channel (or DM)
- PR comments on `@veronica/contracts` changes
- Mandatory "I'm publishing 0.X.0 because of Y" message before publishing

## When you finish a phase

- [ ] All acceptance criteria boxes checked
- [ ] CI green on `main`
- [ ] Integration milestone passes (see [integration-milestones.md](../integration-milestones.md))
- [ ] You've demoed the change to Ketan
- [ ] Update the phase status table above
- [ ] Move to next phase

## Reference docs in this repo

- [../admin-design.md](../admin-design.md) — admin UX principles + schema (used in Phase 1)
- [../integration-milestones.md](../integration-milestones.md) — M0–M6 gate criteria between phases
- [../v1.5-plan.md](../v1.5-plan.md) — post-launch backlog (returns, discounts, wishlists, abandoned cart)

The implementation reference (Postgres schema, REST endpoint specs, local-dev,
deployment) is the source code itself plus:

- Schema → [../../apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts) and [../../apps/api/migrations/](../../apps/api/migrations/)
- API surface → the route files under [../../apps/api/src/routes/](../../apps/api/src/routes/) and the typed [`@veronica/contracts`](../../packages/contracts/) schemas
- Local dev → repo root [README.md](../../README.md) and [`apps/api/.env.example`](../../apps/api/.env.example)
- Deployment → [../../Dockerfile](../../Dockerfile) and [../../fly.toml](../../fly.toml)

> The earlier cross-cutting design notes (`01-data-model.md`, `02-api-design.md`,
> `03-local-dev.md`, `04-deployment.md`) live in the frontend planning repo at
> `veronica-web/docs/planning/`, not here.
