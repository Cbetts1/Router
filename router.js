/**
 * router.js — Universal Plug-and-Play Router
 *
 * Central traffic controller for a modular AI-native OS.
 * Runs on Node.js, browsers, Android (WebView), iOS (WebView),
 * Linux, Windows, and macOS — zero external dependencies.
 *
 * Public API:
 *   const router = createRouter(options?)
 *   router.handle(input)                      → Promise<result>
 *   router.registerCommand(name, handler)
 *   router.unregisterCommand(name)
 *   router.use(moduleName, moduleObject)       → hot-swap plug-in
 *   router.unuse(moduleName)
 *   router.on(event, listener)                 → event bus subscribe
 *   router.off(event, listener)                → event bus unsubscribe
 *   router.emit(event, ...args)                → event bus publish
 *   router.getCommands()                       → string[]
 *   router.getModules()                        → string[]
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
  var ROUTER_VERSION = '1.0.0';

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

  /** Normalise raw text input into a { command, args, raw } object */
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
   * createRouter(options?) → router instance
   *
   * options:
   *   logger   — object with .log / .warn / .error, or null to suppress output
   *   fallback — function(parsed, context) → Promise<result>  (custom unknown-command handler)
   */
  function createRouter(options) {
    options = isObject(options) ? options : {};

    /* ── internal state ─────────────────────────────────────────────────── */
    var registry  = {};   /* command name → async handler */
    var modules   = {};   /* module name  → module object  */
    var bus       = createEventBus();

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

    /* Register built-in commands */
    var builtins = makeBuiltins(router);
    Object.keys(builtins).forEach(function (name) {
      registry[name] = builtins[name];
    });

    /* ────────────────────────────────────────────────────────────────────
     * registerCommand(name, handler)
     *   name    — string command identifier (case-insensitive)
     *   handler — function(args: string[], context: object) → any | Promise<any>
     * ──────────────────────────────────────────────────────────────────── */
    function registerCommand(name, handler) {
      if (!isString(name) || name.trim() === '') {
        throw new TypeError('Command name must be a non-empty string');
      }
      if (!isFunction(handler)) {
        throw new TypeError('Command handler must be a function');
      }
      var key = name.trim().toLowerCase();
      registry[key] = handler;
      log('[Router] registerCommand:', key);
      bus.emit('command:registered', key);
    }

    /* ────────────────────────────────────────────────────────────────────
     * unregisterCommand(name)
     * ──────────────────────────────────────────────────────────────────── */
    function unregisterCommand(name) {
      if (!isString(name)) throw new TypeError('Command name must be a string');
      var key = name.trim().toLowerCase();
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
     * use(moduleName, moduleObject)
     *   Hot-swaps a module into the router.  If the module exposes a
     *   .commands map ({ name: handler }), those commands are registered
     *   automatically.  If it exposes an .onMount(router) hook, that is
     *   called so the module can self-configure.
     * ──────────────────────────────────────────────────────────────────── */
    function use(moduleName, moduleObject) {
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

      /* Auto-register commands the module exposes */
      if (isObject(moduleObject.commands)) {
        Object.keys(moduleObject.commands).forEach(function (cmd) {
          if (isFunction(moduleObject.commands[cmd])) {
            registerCommand(cmd, moduleObject.commands[cmd]);
          }
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
     *   Unmounts a module and removes its auto-registered commands.
     * ──────────────────────────────────────────────────────────────────── */
    function unuse(moduleName) {
      if (!isString(moduleName)) throw new TypeError('Module name must be a string');
      var key = moduleName.trim().toLowerCase();
      var mod = modules[key];
      if (!mod) {
        warn('[Router] unuse: module not found:', key);
        return false;
      }

      /* Remove commands the module registered */
      if (isObject(mod.commands)) {
        Object.keys(mod.commands).forEach(function (cmd) {
          unregisterCommand(cmd);
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
     * handle(input)
     *   Main dispatcher.  Accepts a raw string or a structured object:
     *     { command: 'echo', args: ['hello', 'world'] }
     *   Returns a Promise that always resolves (never rejects) with a
     *   result object: { status, command, result }.
     * ──────────────────────────────────────────────────────────────────── */
    function handle(input, context) {
      var parsed = parseInput(input);
      context = isObject(context) ? context : {};

      log('[Router] handle:', parsed.command, parsed.args);
      bus.emit('command:before', parsed, context);

      var handler = registry[parsed.command];
      var handlerPromise;

      if (!handler) {
        if (parsed.command === '') {
          handlerPromise = Promise.resolve({ status: 'error', command: '', result: 'No command provided.' });
        } else {
          handlerPromise = Promise.resolve(fallbackHandler(parsed, context));
        }
      } else {
        try {
          var raw = handler(parsed.args, context);
          handlerPromise = (raw && isFunction(raw.then)) ? raw : Promise.resolve(raw);
        } catch (e) {
          handlerPromise = Promise.resolve({
            status: 'error',
            command: parsed.command,
            result: 'Handler threw an error: ' + e.message
          });
        }
      }

      return handlerPromise.then(function (result) {
        bus.emit('command:after', parsed, result, context);
        return result;
      }).catch(function (e) {
        var errResult = {
          status: 'error',
          command: parsed.command,
          result: 'Async handler error: ' + (e && e.message ? e.message : String(e))
        };
        bus.emit('command:after', parsed, errResult, context);
        return errResult;
      });
    }

    /* ────────────────────────────────────────────────────────────────────
     * Introspection helpers
     * ──────────────────────────────────────────────────────────────────── */
    function getCommands() { return Object.keys(registry).sort(); }
    function getModules()  { return Object.keys(modules).sort();  }

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
