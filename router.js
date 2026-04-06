/**
 * router.js — Universal Plug-and-Play Router
 *
 * Central traffic controller for a modular AI-native OS.
 * Runs on Node.js, browsers, Android (WebView), iOS (WebView),
 * Linux, Windows, and macOS — zero external dependencies.
 *
 * Public API:
 *   const router = createRouter(options?)
 *   router.handle(input, context?)              → Promise<RouterResult>
 *   router.registerCommand(name, handler, opts?)
 *   router.unregisterCommand(name)              → boolean
 *   router.use(moduleName, moduleObject)         → hot-swap plug-in
 *   router.use(middleware)                       → register middleware function
 *   router.unuse(moduleName)                     → boolean
 *   router.on(event, listener)                   → event bus subscribe
 *   router.off(event, listener)                  → event bus unsubscribe
 *   router.emit(event, ...args)                  → event bus publish
 *   router.once(event, listener)                 → subscribe for single fire
 *   router.getCommands()                         → string[]
 *   router.getModules()                          → ModuleInfo[]
 *   router.getHistory()                          → HistoryEntry[]
 *   router.getMetrics()                          → { [cmd]: CommandMetrics }
 *   router.describe(commandName)                 → CommandDescription | null
 */

(function (root, factory) {
  /* UMD wrapper — works in CommonJS (Node), AMD, and plain browser globals */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.RouterModule = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────────────
   * CONSTANTS
   * ───────────────────────────────────────────────────────────────────────── */
  var ROUTER_VERSION = '1.1.0';

  /* Well-known module hook names.  Modules registered under these names
   * receive special lifecycle calls from the router, but nothing breaks if
   * they are absent — the router is fully self-contained without them. */
  var KNOWN_MODULES = ['cpu', 'terminal', 'os', 'filesystem', 'services', 'ai'];

  /* ─────────────────────────────────────────────────────────────────────────
   * UTILITIES
   * ───────────────────────────────────────────────────────────────────────── */

  function isFunction(v) { return typeof v === 'function'; }
  function isString(v)   { return typeof v === 'string'; }
  function isObject(v)   { return v !== null && typeof v === 'object'; }

  /**
   * Normalise raw text input into a { command, args, raw } object.
   * @param {string|object} input
   * @returns {{ command: string, args: string[], raw: string|object }}
   */
  function parseInput(input) {
    if (isObject(input) && isString(input.command)) {
      return {
        command: input.command.trim().toLowerCase(),
        args: Array.isArray(input.args) ? input.args : [],
        raw: input
      };
    }
    if (isString(input)) {
      var parts = input.trim().split(/\s+/);
      return {
        command: (parts[0] || '').toLowerCase(),
        args: parts.slice(1),
        raw: input
      };
    }
    return { command: '', args: [], raw: input };
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * EVENT BUS
   * ───────────────────────────────────────────────────────────────────────── */

  function createEventBus() {
    var listeners = {};

    function on(event, listener) {
      if (!isString(event)) throw new TypeError('event must be a string');
      if (!isFunction(listener)) throw new TypeError('listener must be a function');
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(listener);
    }

    function off(event, listener) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(function (l) { return l !== listener; });
    }

    function emit(event) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (!listeners[event]) return;
      listeners[event].forEach(function (l) {
        try { l.apply(null, args); } catch (_) { /* isolate listener errors */ }
      });
    }

    function once(event, listener) {
      function wrapper() {
        off(event, wrapper);
        listener.apply(null, arguments);
      }
      on(event, wrapper);
    }

    return { on: on, off: off, emit: emit, once: once };
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * BUILT-IN COMMAND HANDLERS
   * ───────────────────────────────────────────────────────────────────────── */

  function makeBuiltins(router) {
    return {
      help: function helpHandler(args, context) {
        var commands = router.getCommands();
        return {
          status: 'ok',
          command: 'help',
          result: 'Available commands: ' + commands.join(', ')
        };
      },

      echo: function echoHandler(args, context) {
        var text = args.join(' ');
        return { status: 'ok', command: 'echo', result: text };
      },

      version: function versionHandler(args, context) {
        return {
          status: 'ok',
          command: 'version',
          result: 'Router v' + ROUTER_VERSION
        };
      }
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * ROUTER FACTORY
   * ───────────────────────────────────────────────────────────────────────── */

  /**
   * Create an independent router instance.
   *
   * @param {object}        [options]
   * @param {object|null}   [options.logger]      - Custom logger ({log,warn,error}), or null to suppress.
   * @param {function}      [options.fallback]    - Custom handler for unknown commands.
   * @param {number}        [options.historySize] - Max history entries (default 100).
   * @returns {Router}
   */
  function createRouter(options) {
    options = isObject(options) ? options : {};

    /* ── internal state ─────────────────────────────────────────────────── */
    /* registry: command key → { handler, priority, source, handlerName, registeredAt } */
    var registry    = {};
    /* patterns: array of wildcard entries { pattern, regex, handler, priority, source, handlerName, registeredAt } */
    var patterns    = [];
    /* modules: module name → module object */
    var modules     = {};
    /* middlewares: array of (parsed, context, next) → Promise<result> */
    var middlewares = [];
    /* history: bounded ring buffer */
    var historySize = (typeof options.historySize === 'number' && options.historySize > 0)
                      ? options.historySize : 100;
    var history     = [];
    /* metrics: command name → { calls, errors, totalLatency } */
    var metrics     = {};
    var bus         = createEventBus();

    /* ── optional logger ────────────────────────────────────────────────── */
    var logger = (function resolveLogger() {
      if (options.logger === null) return null;           /* explicitly silenced */
      if (isObject(options.logger)) return options.logger;
      if (typeof console !== 'undefined') return console; /* default */
      return null;
    }());

    function log()  { if (logger && isFunction(logger.log))  logger.log.apply(logger, arguments);  }
    function warn() { if (logger && isFunction(logger.warn)) logger.warn.apply(logger, arguments); }

    /* ── fallback for unknown commands ──────────────────────────────────── */
    var defaultFallback = function (parsed, context) {
      return Promise.resolve({
        status: 'error',
        command: parsed.command,
        result: 'Unknown command: "' + parsed.command + '". Type "help" for a list of commands.'
      });
    };
    var fallbackHandler = isFunction(options.fallback) ? options.fallback : defaultFallback;

    /* ── build the public router object (forward-declared for builtins) ─── */
    var router = {};

    /* ── convert a wildcard pattern string into a RegExp ────────────────── */
    function patternToRegex(pattern) {
      var escaped = pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp('^' + escaped + '$');
    }

    /* ── internal: write a command entry directly into the registry ──────── */
    function registerCommandRaw(key, handler, source, priority) {
      registry[key] = {
        handler:       handler,
        priority:      priority != null ? priority : 0,
        source:        source || 'user',
        handlerName:   handler.name || '',
        registeredAt:  Date.now()
      };
    }

    /* ── internal: find the best-matching handler entry for a command ────── */
    function resolveHandler(command) {
      var exact = registry[command] || null;
      var bestPattern = null;
      for (var i = 0; i < patterns.length; i++) {
        var p = patterns[i];
        if (p.regex.test(command)) {
          if (!bestPattern || p.priority > bestPattern.priority) {
            bestPattern = p;
          }
        }
      }
      if (!exact && !bestPattern) return null;
      if (!exact) return bestPattern;
      if (!bestPattern) return exact;
      /* On tie, exact match wins */
      return exact.priority >= bestPattern.priority ? exact : bestPattern;
    }

    /* ── internal: validate module dependency requirements ───────────────── */
    function checkDependencies(entry, commandName) {
      if (!entry || !entry.source) return null;
      var match = entry.source.match(/^module:(.+)$/);
      if (!match) return null;
      var ownerName = match[1];
      var ownerMod  = modules[ownerName];
      if (!ownerMod || !Array.isArray(ownerMod.requires)) return null;
      for (var i = 0; i < ownerMod.requires.length; i++) {
        var dep = ownerMod.requires[i];
        if (!modules[dep]) {
          return {
            status:  'error',
            command: commandName,
            result:  'Module "' + ownerName + '" requires "' + dep + '" to be mounted first.'
          };
        }
      }
      return null;
    }

    /* Register built-in commands */
    var builtins = makeBuiltins(router);
    Object.keys(builtins).forEach(function (name) {
      registerCommandRaw(name, builtins[name], 'builtin', 0);
    });

    /* ────────────────────────────────────────────────────────────────────
     * registerCommand(name, handler, opts?)
     *
     * Registers a command handler.  The name may contain a `*` wildcard
     * (e.g. `'fs:*'`) to handle any unregistered sub-command in a namespace.
     *
     * @param {string}   name             - Command identifier (case-insensitive).
     * @param {function} handler          - (args: string[], context: object) => any | Promise<any>
     * @param {object}   [opts]
     * @param {number}   [opts.priority=0] - Dispatch priority; higher wins on conflicts.
     * @throws {TypeError} if name is not a non-empty string or handler is not a function.
     * ──────────────────────────────────────────────────────────────────── */
    function registerCommand(name, handler, opts) {
      if (!isString(name) || name.trim() === '') {
        throw new TypeError('Command name must be a non-empty string');
      }
      if (!isFunction(handler)) {
        throw new TypeError('Command handler must be a function');
      }
      var key      = name.trim().toLowerCase();
      var priority = (isObject(opts) && typeof opts.priority === 'number') ? opts.priority : 0;

      if (key.indexOf('*') !== -1) {
        /* Wildcard pattern registration */
        patterns.push({
          pattern:      key,
          regex:        patternToRegex(key),
          handler:      handler,
          priority:     priority,
          source:       'user',
          handlerName:  handler.name || '',
          registeredAt: Date.now()
        });
        log('[Router] registerCommand pattern:', key);
      } else {
        if (registry[key]) {
          warn('[Router] registerCommand: overwriting existing command:', key);
        }
        registerCommandRaw(key, handler, 'user', priority);
        log('[Router] registerCommand:', key);
      }
      bus.emit('command:registered', key);
    }

    /* ────────────────────────────────────────────────────────────────────
     * unregisterCommand(name)
     *
     * @param {string} name - Exact command name or wildcard pattern to remove.
     * @returns {boolean} true if the command was found and removed, false otherwise.
     * @throws {TypeError} if name is not a string.
     * ──────────────────────────────────────────────────────────────────── */
    function unregisterCommand(name) {
      if (!isString(name)) throw new TypeError('Command name must be a string');
      var key = name.trim().toLowerCase();

      if (key.indexOf('*') !== -1) {
        /* Remove wildcard pattern */
        for (var i = 0; i < patterns.length; i++) {
          if (patterns[i].pattern === key) {
            patterns.splice(i, 1);
            log('[Router] unregisterCommand pattern:', key);
            bus.emit('command:unregistered', key);
            return true;
          }
        }
        warn('[Router] unregisterCommand: pattern not found:', key);
        return false;
      }

      if (!registry[key]) {
        warn('[Router] unregisterCommand: command not found:', key);
        return false;
      }
      delete registry[key];
      log('[Router] unregisterCommand:', key);
      bus.emit('command:unregistered', key);
      return true;
    }

    /* ────────────────────────────────────────────────────────────────────
     * use(moduleName, moduleObject)  — hot-swap module
     * use(middleware)                — register global middleware
     *
     * When called with a function, registers a middleware that wraps every
     * handle() call.  Middleware signature:
     *   (parsed, context, next) => Promise<RouterResult>
     * Calling next() dispatches to the next middleware or the command handler.
     * The return value of next() is a Promise of the result, enabling post-
     * processing ("onion model").
     *
     * When called with (string, object), mounts a module.  Module commands
     * are auto-registered under the `moduleName:commandName` namespace,
     * preventing collisions between modules.
     *
     * @param {string|function} firstArg    - Module name or middleware function.
     * @param {object}          [moduleObject] - Module definition (when firstArg is string).
     * @throws {TypeError}
     * ──────────────────────────────────────────────────────────────────── */
    function use(firstArg, moduleObject) {
      /* ── middleware overload ──────────────────────────────────────────── */
      if (isFunction(firstArg)) {
        middlewares.push(firstArg);
        log('[Router] use: middleware registered');
        return;
      }

      var moduleName = firstArg;
      if (!isString(moduleName) || moduleName.trim() === '') {
        throw new TypeError('Module name must be a non-empty string');
      }
      if (!isObject(moduleObject)) {
        throw new TypeError('Module must be an object');
      }
      var key = moduleName.trim().toLowerCase();

      /* If re-mounting, unmount the previous instance first */
      if (modules[key]) {
        unuse(key);
      }

      modules[key] = moduleObject;
      log('[Router] use:', key);

      /* Auto-register commands under namespace key:commandName */
      if (isObject(moduleObject.commands)) {
        Object.keys(moduleObject.commands).forEach(function (cmd) {
          var cmdKey  = cmd.trim().toLowerCase();
          var handler = moduleObject.commands[cmd];
          if (!isFunction(handler)) {
            warn('[Router] use: skipping non-function command "' + cmdKey + '" in module "' + key + '"');
            return;
          }
          var namespacedKey = key + ':' + cmdKey;
          registerCommandRaw(namespacedKey, handler, 'module:' + key, 0);
          log('[Router] use: registered command', namespacedKey);
          bus.emit('command:registered', namespacedKey);
        });
      }

      /* Call the module's own mount hook */
      if (isFunction(moduleObject.onMount)) {
        try { moduleObject.onMount(router); } catch (e) { warn('[Router] onMount error in', key, e); }
      }

      bus.emit('module:mounted', key, moduleObject);
    }

    /* ────────────────────────────────────────────────────────────────────
     * unuse(moduleName)
     *   Unmounts a module and removes its auto-namespaced commands.
     *
     * @param {string} moduleName
     * @returns {boolean} true if the module was found and removed, false otherwise.
     * @throws {TypeError}
     * ──────────────────────────────────────────────────────────────────── */
    function unuse(moduleName) {
      if (!isString(moduleName)) throw new TypeError('Module name must be a string');
      var key = moduleName.trim().toLowerCase();
      var mod = modules[key];
      if (!mod) {
        warn('[Router] unuse: module not found:', key);
        return false;
      }

      /* Remove namespaced commands registered by this module */
      if (isObject(mod.commands)) {
        Object.keys(mod.commands).forEach(function (cmd) {
          var namespacedKey = key + ':' + cmd.trim().toLowerCase();
          if (registry[namespacedKey]) {
            delete registry[namespacedKey];
            log('[Router] unuse: removed command', namespacedKey);
            bus.emit('command:unregistered', namespacedKey);
          }
        });
      }

      /* Call the module's own unmount hook */
      if (isFunction(mod.onUnmount)) {
        try { mod.onUnmount(router); } catch (e) { warn('[Router] onUnmount error in', key, e); }
      }

      delete modules[key];
      log('[Router] unuse:', key);
      bus.emit('module:unmounted', key);
      return true;
    }

    /* ────────────────────────────────────────────────────────────────────
     * handle(input, context?)
     *   Main dispatcher.  Runs all registered middleware, then dispatches to
     *   the command handler.  Always resolves — never rejects.
     *
     * @param {string|object} input         - Command string or { command, args } object.
     * @param {object}        [context={}]  - Arbitrary per-request context passed to handlers.
     * @returns {Promise<RouterResult>}
     * ──────────────────────────────────────────────────────────────────── */
    function handle(input, context) {
      var parsed    = parseInput(input);
      context       = isObject(context) ? context : {};
      var startTime = Date.now();

      log('[Router] handle:', parsed.command, parsed.args);
      bus.emit('command:before', parsed, context);

      /* ── inner handler execution ──────────────────────────────────────── */
      function runHandler() {
        /* Notify onCommand hooks for all mounted modules */
        Object.keys(modules).forEach(function (modKey) {
          var mod = modules[modKey];
          if (isFunction(mod.onCommand)) {
            try { mod.onCommand(parsed, context); } catch (e) { warn('[Router] onCommand error in', modKey, e); }
          }
        });

        /* Empty command guard */
        if (parsed.command === '') {
          return Promise.resolve({ status: 'error', command: '', result: 'No command provided.' });
        }

        /* Resolve handler entry */
        var entry = resolveHandler(parsed.command);

        /* Dependency check */
        if (entry) {
          var depErr = checkDependencies(entry, parsed.command);
          if (depErr) return Promise.resolve(depErr);
        }

        if (!entry) {
          return Promise.resolve(fallbackHandler(parsed, context));
        }

        try {
          var raw = entry.handler(parsed.args, context);
          return (raw && isFunction(raw.then)) ? raw : Promise.resolve(raw);
        } catch (e) {
          return Promise.resolve({
            status:  'error',
            command: parsed.command,
            result:  'Handler threw an error: ' + e.message
          });
        }
      }

      /* ── middleware chain (onion model) ───────────────────────────────── */
      var chain = middlewares.slice();
      var idx   = 0;
      function next() {
        if (idx < chain.length) {
          var mw = chain[idx++];
          return Promise.resolve().then(function () { return mw(parsed, context, next); });
        }
        return runHandler();
      }

      return next().then(function (result) {
        var duration = Date.now() - startTime;
        bus.emit('command:after', parsed, result, context);
        /* Record history */
        history.push({
          command:   parsed.command,
          args:      parsed.args.slice(),
          status:    result && result.status,
          duration:  duration,
          timestamp: Date.now()
        });
        if (history.length > historySize) history.shift();
        /* Update metrics */
        if (!metrics[parsed.command]) metrics[parsed.command] = { calls: 0, errors: 0, totalLatency: 0 };
        metrics[parsed.command].calls++;
        metrics[parsed.command].totalLatency += duration;
        if (result && result.status === 'error') metrics[parsed.command].errors++;
        return result;
      }).catch(function (e) {
        var duration  = Date.now() - startTime;
        var errResult = {
          status:  'error',
          command: parsed.command,
          result:  'Async handler error: ' + (e && e.message ? e.message : String(e))
        };
        bus.emit('command:after', parsed, errResult, context);
        history.push({
          command:   parsed.command,
          args:      parsed.args.slice(),
          status:    'error',
          duration:  duration,
          timestamp: Date.now()
        });
        if (history.length > historySize) history.shift();
        if (!metrics[parsed.command]) metrics[parsed.command] = { calls: 0, errors: 0, totalLatency: 0 };
        metrics[parsed.command].calls++;
        metrics[parsed.command].totalLatency += duration;
        metrics[parsed.command].errors++;
        return errResult;
      });
    }

    /* ────────────────────────────────────────────────────────────────────
     * Introspection helpers
     * ──────────────────────────────────────────────────────────────────── */

    /**
     * Returns a sorted list of all registered exact command names plus wildcard patterns.
     * @returns {string[]}
     */
    function getCommands() {
      var cmds = Object.keys(registry);
      patterns.forEach(function (p) { cmds.push(p.pattern); });
      return cmds.sort();
    }

    /**
     * Returns information about all currently mounted modules.
     * @returns {Array<{ name: string, version: string|null }>}
     */
    function getModules() {
      return Object.keys(modules).sort().map(function (name) {
        return { name: name, version: modules[name].version || null };
      });
    }

    /**
     * Returns a copy of the command history ring buffer (oldest first).
     * Each entry contains: command, args, status, duration (ms), timestamp.
     * @returns {Array<{ command: string, args: string[], status: string, duration: number, timestamp: number }>}
     */
    function getHistory() {
      return history.slice();
    }

    /**
     * Returns per-command call metrics.
     * @returns {{ [command: string]: { calls: number, errors: number, avgLatency: number } }}
     */
    function getMetrics() {
      var result = {};
      Object.keys(metrics).forEach(function (cmd) {
        var m = metrics[cmd];
        result[cmd] = {
          calls:      m.calls,
          errors:     m.errors,
          avgLatency: m.calls > 0 ? m.totalLatency / m.calls : 0
        };
      });
      return result;
    }

    /**
     * Returns metadata about a registered command or wildcard pattern.
     * Returns null if the command is not registered.
     *
     * @param {string} commandName
     * @returns {{ name: string, source: string, handlerName: string, registeredAt: number, priority: number }|null}
     * @throws {TypeError} if commandName is not a string.
     */
    function describe(commandName) {
      if (!isString(commandName)) throw new TypeError('Command name must be a string');
      var key = commandName.trim().toLowerCase();
      var entry = registry[key] || null;
      if (!entry) {
        for (var i = 0; i < patterns.length; i++) {
          if (patterns[i].pattern === key) {
            entry = patterns[i];
            break;
          }
        }
      }
      if (!entry) return null;
      return {
        name:         key,
        source:       entry.source,
        handlerName:  entry.handlerName,
        registeredAt: entry.registeredAt,
        priority:     entry.priority
      };
    }

    /* ────────────────────────────────────────────────────────────────────
     * Assemble public interface
     * ──────────────────────────────────────────────────────────────────── */
    Object.assign(router, {
      handle:            handle,
      registerCommand:   registerCommand,
      unregisterCommand: unregisterCommand,
      use:               use,
      unuse:             unuse,
      on:                bus.on,
      off:               bus.off,
      emit:              bus.emit,
      once:              bus.once,
      getCommands:       getCommands,
      getModules:        getModules,
      getHistory:        getHistory,
      getMetrics:        getMetrics,
      describe:          describe,
      version:           ROUTER_VERSION,
      knownModules:      KNOWN_MODULES.slice()
    });

    log('[Router] created — version', ROUTER_VERSION);
    return router;
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * PUBLIC EXPORT
   * ───────────────────────────────────────────────────────────────────────── */
  return { createRouter: createRouter };
}));
