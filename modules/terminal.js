/**
 * modules/terminal.js — Terminal module for @cbetts1/router
 *
 * Mount with:
 *   const { createRouter }    = require('./router.js');
 *   const terminalModule      = require('./modules/terminal.js');
 *   const router = createRouter();
 *   router.use('terminal', terminalModule);
 *
 * Registered commands (namespaced automatically by the router):
 *   terminal:write  — writes text to stdout (Node) or console.log (browser)
 *   terminal:read   — reads one line from stdin (Node TTY) or returns empty string
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.TerminalModule = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var terminalModule = {
    version: '1.0.0',

    commands: {
      /**
       * Writes text to standard output.
       * Node.js: process.stdout.write()
       * Browser / WebView: console.log()
       */
      write: function termWrite(args, context) {
        var text = args.join(' ');
        try {
          if (typeof process !== 'undefined' && process.stdout) {
            process.stdout.write(text + '\n');
          } else if (typeof console !== 'undefined') {
            console.log(text);
          }
        } catch (e) { /* silently swallow write errors in constrained environments */ }
        return { status: 'ok', command: 'terminal:write', result: text };
      },

      /**
       * Reads one line of input.
       * Node.js TTY: uses readline for an interactive prompt.
       * Non-TTY / Browser: resolves immediately with an empty string.
       */
      read: function termRead(args, context) {
        var prompt = args[0] || '> ';

        /* Node.js interactive TTY */
        if (
          typeof require !== 'undefined' &&
          typeof process !== 'undefined' &&
          process.stdin &&
          process.stdin.isTTY
        ) {
          return new Promise(function (resolve) {
            var readline = require('readline');
            var rl = readline.createInterface({
              input:  process.stdin,
              output: process.stdout
            });
            rl.question(prompt, function (answer) {
              rl.close();
              resolve({ status: 'ok', command: 'terminal:read', result: answer });
            });
          });
        }

        /* Non-interactive / browser — return empty string */
        return Promise.resolve({ status: 'ok', command: 'terminal:read', result: '' });
      }
    },

    onMount: function (router) {
      /* intentionally empty */
    },

    onUnmount: function (router) {
      /* intentionally empty */
    }
  };

  return terminalModule;
}));
