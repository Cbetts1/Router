/**
 * modules/cpu.js — CPU module for @cbetts1/router
 *
 * Mount with:
 *   const { createRouter }  = require('./router.js');
 *   const cpuModule         = require('./modules/cpu.js');
 *   const router = createRouter();
 *   router.use('cpu', cpuModule);
 *
 * Registered commands (namespaced automatically by the router):
 *   cpu:info  — returns CPU count, model, architecture, and platform
 *   cpu:exec  — stub for submitting a task to the CPU layer
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.CpuModule = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var cpuModule = {
    version: '1.0.0',

    commands: {
      /**
       * Returns CPU information for the current environment.
       * Node.js: real CPU data via the built-in `os` module.
       * Browser / WebView: navigator.hardwareConcurrency + stub fields.
       */
      info: function cpuInfo(args, context) {
        var info;
        try {
          if (typeof require !== 'undefined') {
            /* Node.js / CommonJS */
            var os   = require('os');
            var cpus = os.cpus();
            info = {
              count:    cpus.length,
              model:    cpus.length > 0 ? cpus[0].model : 'unknown',
              arch:     os.arch(),
              platform: os.platform()
            };
          } else if (typeof navigator !== 'undefined') {
            /* Browser / WebView */
            info = {
              count:    navigator.hardwareConcurrency || 1,
              model:    'unknown',
              arch:     'unknown',
              platform: 'browser'
            };
          } else {
            info = { count: 1, model: 'unknown', arch: 'unknown', platform: 'unknown' };
          }
        } catch (e) {
          info = { count: 1, model: 'unknown', arch: 'unknown', platform: 'unknown' };
        }
        return { status: 'ok', command: 'cpu:info', result: info };
      },

      /** Stub for submitting a task string to the CPU layer. */
      exec: function cpuExec(args, context) {
        var task = args.join(' ');
        if (!task) {
          return { status: 'error', command: 'cpu:exec', result: 'Usage: cpu:exec <task>' };
        }
        return { status: 'ok', command: 'cpu:exec', result: 'CPU task accepted: ' + task };
      }
    },

    onMount: function (router) {
      /* intentionally empty — no setup required */
    },

    onUnmount: function (router) {
      /* intentionally empty — no teardown required */
    }
  };

  return cpuModule;
}));
