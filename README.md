# Router — Universal Plug-and-Play Router

A **zero-dependency**, **environment-agnostic** central traffic controller for a
modular AI-native OS.  Works on Node.js, browsers, Android (WebView),
iOS (WebView), Linux, Windows, and macOS without modification.

---

## Quick Start

```js
// Node.js
const { createRouter } = require('./router.js');

// Browser (UMD — drop the script tag and use window.RouterModule)
// <script src="router.js"></script>
// const { createRouter } = window.RouterModule;

const router = createRouter();

router.handle('help').then(res => console.log(res.result));
// "Available commands: echo, help, version"

router.handle('echo hello world').then(res => console.log(res.result));
// "hello world"

router.handle('version').then(res => console.log(res.result));
// "Router v1.0.0"
```

---

## How It Works

```
Input (string or object)
        │
        ▼
  ┌────────────┐
  │ parseInput │  normalises { command, args, raw }
  └─────┬──────┘
        │
        ▼
  ┌─────────────────┐   emit command:before
  │  command:before │──────────────────────▶ event bus subscribers
  └─────┬───────────┘
        │
        ▼
  ┌──────────────────────┐
  │ Registry lookup      │
  │  registry[command]   │──▶ handler found?  ──▶  call handler (sync or async)
  └──────────────────────┘
        │                 ──▶ not found?      ──▶  fallbackHandler()
        ▼
  ┌─────────────────┐   emit command:after
  │  command:after  │──────────────────────▶ event bus subscribers
  └─────┬───────────┘
        │
        ▼
  resolved Promise({ status, command, result })
```

The router **never rejects**.  Every `handle()` call resolves with a result
object so callers can always pattern-match on `res.status`.

---

## API Reference

### `createRouter(options?)`

Creates and returns a new, independent router instance.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `logger` | object \| `null` | `console` | Object with `.log`/`.warn`/`.error`.  Pass `null` to silence all output. |
| `fallback` | function | built-in | `(parsed, context) => Promise<result>` called for unknown commands. |

---

### `router.handle(input, context?)`

Main dispatcher.  Always returns a `Promise` that resolves with:

```js
{ status: 'ok' | 'error', command: string, result: any }
```

`input` can be:

```js
// plain string — split on whitespace into command + args
router.handle('echo hello world')

// structured object
router.handle({ command: 'echo', args: ['hello', 'world'] })
```

`context` is an optional plain object forwarded to every handler — useful for
passing session data, user identity, etc.

---

### `router.registerCommand(name, handler)`

Adds a command to the routing table at runtime.

```js
router.registerCommand('cpu-info', async (args, context) => {
  return { status: 'ok', command: 'cpu-info', result: 'arch: x64' };
});
```

- `name` is normalised to **lowercase**.
- `handler` may be synchronous or return a `Promise`.
- Throws `TypeError` on invalid arguments.

---

### `router.unregisterCommand(name)`

Removes a command.  Returns `true` if removed, `false` if not found.

---

### `router.use(moduleName, moduleObject)`

**Hot-swaps** a plug-in module into the router.  Re-mounting a module with the
same name automatically unmounts the previous version first.

```js
const filesystemModule = {
  // commands this module contributes
  commands: {
    'fs-read':  (args, ctx) => ({ status: 'ok', command: 'fs-read',  result: '...' }),
    'fs-write': (args, ctx) => ({ status: 'ok', command: 'fs-write', result: 'ok'  }),
  },
  // lifecycle hooks (optional)
  onMount:   (router) => { /* initialise */  },
  onUnmount: (router) => { /* clean up */    },
};

router.use('filesystem', filesystemModule);
```

---

### `router.unuse(moduleName)`

Unmounts a module, calls its `onUnmount` hook, and removes all commands it
registered.  Returns `true` if removed, `false` if not found.

---

### Event Bus

```js
router.on('command:before', (parsed, context) => { /* … */ });
router.on('command:after',  (parsed, result, context) => { /* … */ });
router.on('command:registered',   (name) => { /* … */ });
router.on('command:unregistered', (name) => { /* … */ });
router.on('module:mounted',   (name, module) => { /* … */ });
router.on('module:unmounted', (name) => { /* … */ });

// custom events
router.emit('os:shutdown');
router.on('os:shutdown', () => { /* … */ });
router.once('os:ready', () => { /* fires only once */ });
router.off('os:shutdown', myListener);
```

---

### Introspection

```js
router.getCommands();   // ['echo', 'fs-read', 'help', 'version', …]
router.getModules();    // ['ai', 'cpu', 'filesystem', …]
router.version;         // '1.0.0'
router.knownModules;    // ['cpu', 'terminal', 'os', 'filesystem', 'services', 'ai']
```

---

## Extension Points

The router defines six **well-known module slots** that future plug-ins should
use.  The router works perfectly without any of them.

| Slot | `use()` name | Suggested `commands` |
|------|-------------|----------------------|
| CPU | `'cpu'` | `cpu-info`, `cpu-exec` |
| Terminal | `'terminal'` | `term-write`, `term-read` |
| OS Layer | `'os'` | `os-info`, `os-shutdown`, `os-reboot` |
| Filesystem | `'filesystem'` | `fs-read`, `fs-write`, `fs-list`, `fs-delete` |
| Services | `'services'` | `svc-start`, `svc-stop`, `svc-status` |
| AI Core | `'ai'` | `ai-run`, `ai-train`, `ai-query` |

Any module not in this list is still fully supported — the names above are
**conventions**, not restrictions.

### Adding a module (zero changes to router.js)

```js
const aiModule = {
  commands: {
    'ai-query': async ([prompt], ctx) => {
      // call your AI engine here
      const answer = await myAI.ask(prompt);
      return { status: 'ok', command: 'ai-query', result: answer };
    }
  },
  onMount: (router) => {
    router.emit('module:ai-ready');
  }
};

router.use('ai', aiModule);

const res = await router.handle('ai-query What is 2+2?');
console.log(res.result); // "4"
```

---

## Running the Tests

```bash
node router.test.js
```

No test framework needed — runs with plain Node.js.

---

## Design Principles

- **Zero external dependencies** — only built-in JS / Node.js APIs.
- **Never rejects** — `handle()` always resolves; errors are surfaced in `result.status`.
- **Deterministic** — every public method has clearly defined behaviour and validates its inputs.
- **Environment-agnostic** — UMD wrapper works in CommonJS, AMD, and plain browser globals.
- **Isolated instances** — multiple `createRouter()` calls never share state.
- **Hot-swap safe** — modules can be added, replaced, or removed at any time without restarting.
