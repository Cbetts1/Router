/**
 * router.mjs — ES Module wrapper for @cbetts1/router
 *
 * Allows native ESM consumers to import the router:
 *   import { createRouter } from '@cbetts1/router';
 *
 * The runtime implementation lives in router.js (CommonJS/UMD).
 * This file re-exports it as named and default ES Module exports.
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { createRouter } = _require('./router.js');

export { createRouter };
export default { createRouter };
