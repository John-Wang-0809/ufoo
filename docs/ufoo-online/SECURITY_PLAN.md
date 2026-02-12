# ufoo-online Security Remediation Plan (Phase 1)

Date: 2026-02-10
Owner: codex
Scope: `src/online/*`, `docs/ufoo-online/PROTOCOL.md`, `src/cli.js`

## Goals
- Make ufoo-online safe for use beyond localhost by closing critical gaps.
- Keep Phase 1 behavior intact where possible; prefer additive hardening.

## Non-Goals
- Full multi-tenant hardening or advanced auth (Phase 2+).
- End-to-end encryption between clients.

## Plan

**P0 — Blockers (must fix before any non-local exposure)**
- Sanitize decision filenames on receive to prevent path traversal and arbitrary write.
  Affects `src/online/bridge.js` (`applyDecisionFromRemote`).
- Require token validation by default, or refuse to start without `--token-file`.
  Affects `src/online/server.js`, `src/cli.js`.
- Enforce TLS usage in non-dev mode; refuse `ws://` or warn loudly in CLI/docs.
  Affects `src/online/client.js`, `src/online/bridge.js`, `src/cli.js`, `docs/ufoo-online/PROTOCOL.md`.
- Add payload size limits and basic per-connection rate limiting on the relay.
  Affects `src/online/server.js` (WebSocket `maxPayload`, message throttling).

**P1 — High Priority**
- Protect HTTP room/channel endpoints or disable in production.
  Affects `src/online/server.js`, `src/cli.js` (add auth token or admin key).
- Store tokens with restrictive permissions and document token hygiene.
  Affects `src/online/tokens.js`, docs.
- Add room membership allowlist / explicit trust gate for bus sync in private rooms.
  Affects `src/online/bridge.js`.

**P2 — Medium Priority**
- Replace room password hash with a slow hash (e.g., scrypt) and add auth throttling.
  Affects `src/online/server.js`.
- Add audit logging for auth failures and admin actions.
  Affects `src/online/server.js`.

## Validation
- Add unit tests for filename sanitization and rejection of unsafe paths.
  Tests: `test/unit/online/*`.
- Add integration tests for auth-required startup and token rejection.
  Tests: `test/unit/online/server.test.js`.
- Add tests for max payload and rate-limit behavior.
  Tests: `test/unit/online/server.test.js`.

## Rollout
- Phase 1: land P0 changes with feature flags off by default only if they preserve dev workflows.
- Phase 2: flip defaults to secure mode (auth required, TLS enforced) after 1 release.

## Open Questions
- Should private rooms require an explicit allowlist (subscriber_id or nickname)?
- Should bus sync require a per-project shared secret in addition to room password?
