# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] — 2026-04-06

### Added

#### Phase 1 — Quality & Developer Experience
- **TypeScript type definitions** (`router.d.ts`) — exports all public interfaces
  (`Router`, `RouterResult`, `ModuleObject`, `CommandHandler`, `ParsedInput`,
  `MiddlewareFunction`, `ModuleInfo`, `CommandDescription`, `HistoryEntry`,
  `CommandMetrics`, `RegisterCommandOptions`, `RouterOptions`) for full
  IntelliSense and type-safety without touching runtime code.
- **JSDoc annotations** — every public method in `router.js` now carries
  `@param`, `@returns`, and `@throws` doc-comments compatible with JSDoc and
  TypeDoc generators.
- **Input validation hardening** — `registerCommand()` warns (via logger) when
  overwriting an existing command. `use()` logs a warning and skips any
  `commands` entries whose values are not functions, preventing silent failures.

#### Phase 2 — Middleware Pipeline
- **`use(fn)` overload** — calling `router.use(middlewareFn)` (with a function
  as the first argument) registers a global pre/post middleware.
- **Pre-command middleware** — middleware functions run before the command
  handler.  Signature: `(parsed, context, next) => Promise<result>`.  Calling
  `next()` advances the chain.
- **Post-command middleware** — because `next()` returns a `Promise<result>`,
  middleware can `.then()` on it to inspect or transform the result after the
  handler completes ("onion model").  Middleware that does not call `next()`
  short-circuits the entire chain.

#### Phase 3 — Command Routing Enhancements
- **Command namespacing** — when a module is mounted with `use(name, mod)`,
  each command in `mod.commands` is automatically registered as
  `moduleName:commandName` (e.g. `filesystem` module's `read` → `filesystem:read`).
  This prevents collisions between modules with overlapping command names.
- **Wildcard pattern handlers** — `registerCommand('ns:*', handler)` matches
  any command in the `ns:` namespace that has no exact-match registration.
  Wildcards are also returned by `getCommands()` and are supported by
  `unregisterCommand()` and `describe()`.
- **Command priority** — `registerCommand(name, handler, { priority: N })`
  allows explicit ordering.  When multiple handlers could match (e.g. an exact
  key and a wildcard pattern), the one with the highest `priority` value wins.
  On a tie, an exact-match always beats a pattern.  Overwriting an existing
  key always replaces the stored handler regardless of priority.

#### Phase 4 — Module System Improvements
- **`onCommand(parsed, context)` hook** — modules may expose this method to
  intercept every command dispatched by the router while the module is mounted,
  enabling cross-cutting concerns like audit logging from within a module.
- **Module dependency declaration** — a module may declare
  `requires: ['dep-a', 'dep-b']`.  Before a module command runs, the router
  validates that every listed module is mounted; if any is missing, `handle()`
  resolves with an `{ status: 'error' }` result instead of calling the handler.
- **Module versioning** — modules may include a `version` string field.
  `getModules()` now returns `Array<{ name: string, version: string|null }>`
  instead of a plain string array, enabling runtime compatibility checks.

#### Phase 5 — Observability & Introspection
- **`getHistory()`** — returns a copy of a bounded ring buffer containing the
  most recent command dispatches.  Each entry: `{ command, args, status,
  duration, timestamp }`.  Buffer size is configurable via
  `createRouter({ historySize: N })` (default 100).
- **`getMetrics()`** — returns per-command call statistics:
  `{ calls, errors, avgLatency }`.  Updated automatically after every `handle()`.
- **`describe(commandName)`** — returns metadata about a registered command or
  wildcard pattern: `{ name, source, handlerName, registeredAt, priority }`.
  `source` is `'builtin'`, `'user'`, or `'module:<moduleName>'`.

#### Phase 6 — Well-Known Module Implementations
- **`modules/cpu.js`** — `cpu:info` (CPU count, model, arch, platform) and
  `cpu:exec` (task-submission stub).  Uses Node.js `os.cpus()` where available,
  falls back to `navigator.hardwareConcurrency` in browsers.
- **`modules/terminal.js`** — `terminal:write` (stdout / `console.log`) and
  `terminal:read` (readline on Node.js TTY, empty string otherwise).
- **`modules/os.js`** — `os:info` (platform, arch, hostname, uptime),
  `os:shutdown` (emits `'os:shutdown'` event), `os:reboot` (emits `'os:reboot'`
  event).  Uses Node.js `os` module where available.
- **`modules/filesystem.js`** — `filesystem:read`, `filesystem:write`,
  `filesystem:list`, `filesystem:delete`.  Backed by Node.js `fs/promises`
  (with `fs.promises` fallback for Node 10–13); returns graceful error results
  in browser / WebView environments.

#### Phase 7 — Packaging & Publishing
- **`package.json` updates** — added `"exports"` conditional exports map for
  CJS (`require`) and ESM (`import`), `"module"` field pointing to
  `router.mjs`, `"types"` pointing to `router.d.ts`, `"files"` whitelist, and
  `"repository"` metadata.
- **`router.mjs`** — ES Module wrapper that re-exports `createRouter` as both
  a named and default export, enabling `import { createRouter } from '@cbetts1/router'`.
- **`.github/workflows/ci.yml`** — GitHub Actions workflow that runs `npm test`
  on Node 18, 20, and 22 for every push and pull request, and publishes to NPM
  when a `v*` tag is pushed (requires `NPM_TOKEN` secret).
- **`CHANGELOG.md`** — this file.

### Changed
- `router.js` version string bumped from `1.0.0` to `1.1.0`.
- `getModules()` return type changed from `string[]` to
  `Array<{ name: string, version: string|null }>`.
- Module commands are now registered under `moduleName:commandName` namespace
  instead of the bare command key.  Existing callers that pass pre-namespaced
  keys (e.g. `'fs-read'`) in `commands` will still work — their namespaced
  form becomes `filesystem:fs-read`.

### Removed
- Nothing removed; all v1.0.0 public API methods remain present and functional.

---

## [1.0.0] — 2026-01-01

### Added
- Initial release: `createRouter()`, `handle()`, `registerCommand()`,
  `unregisterCommand()`, `use()`, `unuse()`, event bus (`on`, `off`, `emit`,
  `once`), `getCommands()`, `getModules()`.
- Built-in commands: `help`, `echo`, `version`.
- UMD wrapper supporting CommonJS, AMD, and plain browser globals.
- Zero external dependencies.
