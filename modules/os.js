/**
 * modules/os.js — OS module for @cbetts1/router
 *
 * Mount with:
 *   const { createRouter } = require('./router.js');
 *   const osModule         = require('./modules/os.js');
 *   const router = createRouter();
 *   router.use('os', osModule);
 *
 * Registered commands (namespaced automatically by the router):
 *   os:info     — returns platform, arch, hostname, and uptime
 *   os:shutdown — emits 'os:shutdown' event and returns an ok result (no-op in browsers)
 *   os:reboot   — emits 'os:reboot' event and returns an ok result (no-op in browsers)
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.OsModule = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var osModule = {
    version: '1.0.0',

    commands: {
      /**
       * Returns information about the host operating system.
       * Node.js: real data via the built-in `os` module.
       * Browser / WebView: stub values.
       */
      info: function osInfo(args, context) {
        var info;
        try {
          if (typeof require !== 'undefined') {
            var os = require('os');
            info = {
              platform: os.platform(),
              arch:     os.arch(),
              hostname: os.hostname(),
              uptime:   os.uptime()
            };
          } else {
            info = {
              platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
              arch:     'unknown',
              hostname: 'browser',
              uptime:   0
            };
          }
        } catch (e) {
          info = { platform: 'unknown', arch: 'unknown', hostname: 'unknown', uptime: 0 };
        }
        return { status: 'ok', command: 'os:info', result: info };
      },

      /**
       * Initiates a shutdown sequence.
       * Emits 'os:shutdown' on the router event bus so listeners can react.
       * Does NOT actually shut down the host process — use with care.
       */
      shutdown: function osShutdown(args, context) {
        if (osModule._router) {
          osModule._router.emit('os:shutdown');
        }
        return { status: 'ok', command: 'os:shutdown', result: 'Shutdown signal emitted.' };
      },

      /**
       * Initiates a reboot sequence.
       * Emits 'os:reboot' on the router event bus so listeners can react.
       * Does NOT actually reboot the host process — use with care.
       */
      reboot: function osReboot(args, context) {
        if (osModule._router) {
          osModule._router.emit('os:reboot');
        }
        return { status: 'ok', command: 'os:reboot', result: 'Reboot signal emitted.' };
      }
    },

    onMount: function (router) {
      /* Keep a reference so shutdown/reboot can emit events on the bus. */
      osModule._router = router;
    },

    onUnmount: function (router) {
      osModule._router = null;
    },

    /* Internal — set by onMount, cleared by onUnmount. Not part of public API. */
    _router: null
  };

  return osModule;
}));
