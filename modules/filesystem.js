/**
 * modules/filesystem.js — Filesystem module for @cbetts1/router
 *
 * Mount with:
 *   const { createRouter }    = require('./router.js');
 *   const filesystemModule    = require('./modules/filesystem.js');
 *   const router = createRouter();
 *   router.use('filesystem', filesystemModule);
 *
 * Registered commands (namespaced automatically by the router):
 *   filesystem:read    — read a file as UTF-8 text
 *   filesystem:write   — write UTF-8 text to a file (creates or overwrites)
 *   filesystem:list    — list entries in a directory
 *   filesystem:delete  — delete a file
 *
 * Node.js: backed by fs/promises (or fs.promises on older Node).
 * Browser / WebView: all commands return a graceful error result.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.FilesystemModule = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Resolve the fs/promises API or return null in non-Node environments. */
  function getFsPromises() {
    try {
      if (typeof require !== 'undefined') {
        /* Node 14+: fs/promises  —  Node 10-13: fs.promises */
        try { return require('fs/promises'); } catch (_) {}
        var fs = require('fs');
        if (fs && fs.promises) return fs.promises;
      }
    } catch (_) { /* not available */ }
    return null;
  }

  var NOT_AVAILABLE = { status: 'error', result: 'Filesystem not available in this environment.' };

  var filesystemModule = {
    version: '1.0.0',

    commands: {
      /**
       * Read a file as UTF-8 text.
       * Usage: filesystem:read <path>
       */
      read: function fsRead(args, context) {
        var filePath = args[0];
        if (!filePath) {
          return { status: 'error', command: 'filesystem:read', result: 'Usage: filesystem:read <path>' };
        }
        var fsp = getFsPromises();
        if (!fsp) return Promise.resolve(Object.assign({ command: 'filesystem:read' }, NOT_AVAILABLE));
        return fsp.readFile(filePath, 'utf8')
          .then(function (data) {
            return { status: 'ok', command: 'filesystem:read', result: data };
          })
          .catch(function (e) {
            return { status: 'error', command: 'filesystem:read', result: e.message };
          });
      },

      /**
       * Write UTF-8 text to a file (creates or overwrites).
       * Usage: filesystem:write <path> <content...>
       */
      write: function fsWrite(args, context) {
        var filePath = args[0];
        var content  = args.slice(1).join(' ');
        if (!filePath) {
          return { status: 'error', command: 'filesystem:write', result: 'Usage: filesystem:write <path> <content>' };
        }
        var fsp = getFsPromises();
        if (!fsp) return Promise.resolve(Object.assign({ command: 'filesystem:write' }, NOT_AVAILABLE));
        return fsp.writeFile(filePath, content, 'utf8')
          .then(function () {
            return { status: 'ok', command: 'filesystem:write', result: 'Written: ' + filePath };
          })
          .catch(function (e) {
            return { status: 'error', command: 'filesystem:write', result: e.message };
          });
      },

      /**
       * List entries in a directory.
       * Usage: filesystem:list <path>
       */
      list: function fsList(args, context) {
        var dirPath = args[0] || '.';
        var fsp = getFsPromises();
        if (!fsp) return Promise.resolve(Object.assign({ command: 'filesystem:list' }, NOT_AVAILABLE));
        return fsp.readdir(dirPath)
          .then(function (entries) {
            return { status: 'ok', command: 'filesystem:list', result: entries };
          })
          .catch(function (e) {
            return { status: 'error', command: 'filesystem:list', result: e.message };
          });
      },

      /**
       * Delete a file.
       * Usage: filesystem:delete <path>
       */
      'delete': function fsDelete(args, context) {
        var filePath = args[0];
        if (!filePath) {
          return { status: 'error', command: 'filesystem:delete', result: 'Usage: filesystem:delete <path>' };
        }
        var fsp = getFsPromises();
        if (!fsp) return Promise.resolve(Object.assign({ command: 'filesystem:delete' }, NOT_AVAILABLE));
        return fsp.unlink(filePath)
          .then(function () {
            return { status: 'ok', command: 'filesystem:delete', result: 'Deleted: ' + filePath };
          })
          .catch(function (e) {
            return { status: 'error', command: 'filesystem:delete', result: e.message };
          });
      }
    },

    onMount: function (router) {
      /* intentionally empty */
    },

    onUnmount: function (router) {
      /* intentionally empty */
    }
  };

  return filesystemModule;
}));
