/**
 * router.test.js — tests for the universal plug-and-play Router
 *
 * Runs with plain Node.js — no test framework required:
 *   node router.test.js
 */

'use strict';

var RouterModule = require('./router.js');
var createRouter = RouterModule.createRouter;

/* ── tiny test harness ─────────────────────────────────────────────────────── */
var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  ✓', message);
    passed++;
  } else {
    console.error('  ✗', message);
    failed++;
  }
}

function assertDeepEqual(a, b, message) {
  assert(JSON.stringify(a) === JSON.stringify(b), message);
}

function test(description, fn) {
  console.log('\n' + description);
  fn();
}

async function asyncTest(description, fn) {
  console.log('\n' + description);
  try {
    await fn();
  } catch (e) {
    console.error('  ✗ THREW:', e.message);
    failed++;
  }
}

/* ── tests ─────────────────────────────────────────────────────────────────── */

test('Module export', function () {
  assert(typeof RouterModule === 'object', 'RouterModule is an object');
  assert(typeof createRouter === 'function', 'createRouter is a function');
});

test('createRouter returns expected API', function () {
  var router = createRouter({ logger: null });
  assert(typeof router.handle === 'function',            'handle is a function');
  assert(typeof router.registerCommand === 'function',   'registerCommand is a function');
  assert(typeof router.unregisterCommand === 'function', 'unregisterCommand is a function');
  assert(typeof router.use === 'function',               'use is a function');
  assert(typeof router.unuse === 'function',             'unuse is a function');
  assert(typeof router.on === 'function',                'on is a function');
  assert(typeof router.off === 'function',               'off is a function');
  assert(typeof router.emit === 'function',              'emit is a function');
  assert(typeof router.once === 'function',              'once is a function');
  assert(typeof router.getCommands === 'function',       'getCommands is a function');
  assert(typeof router.getModules === 'function',        'getModules is a function');
  assert(typeof router.version === 'string',             'version is a string');
  assert(Array.isArray(router.knownModules),             'knownModules is an array');
});

test('Built-in commands are registered on creation', function () {
  var router = createRouter({ logger: null });
  var cmds = router.getCommands();
  assert(cmds.includes('help'),    'help command exists');
  assert(cmds.includes('echo'),    'echo command exists');
  assert(cmds.includes('version'), 'version command exists');
});

/* ─── async tests ─────────────────────────────────────────────────────────── */

var tests = [];

tests.push(asyncTest('handle("help") resolves with ok status', async function () {
  var router = createRouter({ logger: null });
  var res = await router.handle('help');
  assert(res.status === 'ok',        'status is ok');
  assert(res.command === 'help',     'command is help');
  assert(typeof res.result === 'string', 'result is a string');
  assert(res.result.includes('help'), 'result mentions help');
}));

tests.push(asyncTest('handle("echo hello world") resolves correctly', async function () {
  var router = createRouter({ logger: null });
  var res = await router.handle('echo hello world');
  assert(res.status === 'ok',           'status is ok');
  assert(res.result === 'hello world',  'result is the echoed text');
}));

tests.push(asyncTest('handle("version") returns router version string', async function () {
  var router = createRouter({ logger: null });
  var res = await router.handle('version');
  assert(res.status === 'ok',              'status is ok');
  assert(res.result.includes('Router'),    'result mentions Router');
  assert(res.result.includes('1.0.0'),     'result includes version number');
}));

tests.push(asyncTest('handle with object input { command, args }', async function () {
  var router = createRouter({ logger: null });
  var res = await router.handle({ command: 'echo', args: ['structured', 'input'] });
  assert(res.status === 'ok',                'status is ok');
  assert(res.result === 'structured input',  'result is correct');
}));

tests.push(asyncTest('Unknown command returns error status with helpful message', async function () {
  var router = createRouter({ logger: null });
  var res = await router.handle('unknowncmd');
  assert(res.status === 'error',                    'status is error');
  assert(res.result.includes('unknowncmd'),          'result mentions the unknown command');
  assert(res.result.toLowerCase().includes('help'),  'result suggests help');
}));

tests.push(asyncTest('Empty input returns error', async function () {
  var router = createRouter({ logger: null });
  var res = await router.handle('');
  assert(res.status === 'error', 'empty input yields error status');
}));

tests.push(asyncTest('registerCommand adds a new command', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('ping', function (args) {
    return { status: 'ok', command: 'ping', result: 'pong' };
  });
  assert(router.getCommands().includes('ping'), 'ping is in command list');
  var res = await router.handle('ping');
  assert(res.status === 'ok',    'ping resolves ok');
  assert(res.result === 'pong',  'ping returns pong');
}));

tests.push(asyncTest('registerCommand normalises command name to lowercase', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('UPPER', function () { return { status: 'ok', command: 'upper', result: 'yes' }; });
  assert(router.getCommands().includes('upper'), 'stored as lowercase');
  var res = await router.handle('UPPER');
  assert(res.status === 'ok', 'uppercase input resolves ok');
}));

tests.push(asyncTest('unregisterCommand removes a command', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('temp', function () { return { status: 'ok', command: 'temp', result: 'data' }; });
  assert(router.getCommands().includes('temp'), 'temp registered');
  var removed = router.unregisterCommand('temp');
  assert(removed === true, 'unregisterCommand returns true');
  assert(!router.getCommands().includes('temp'), 'temp unregistered');
  var res = await router.handle('temp');
  assert(res.status === 'error', 'removed command returns error');
}));

tests.push(asyncTest('unregisterCommand returns false for non-existent command', async function () {
  var router = createRouter({ logger: null });
  var result = router.unregisterCommand('nope');
  assert(result === false, 'returns false for missing command');
}));

tests.push(asyncTest('registerCommand validates arguments', async function () {
  var router = createRouter({ logger: null });
  var threw1 = false, threw2 = false;
  try { router.registerCommand('', function () {}); } catch (e) { threw1 = true; }
  try { router.registerCommand('valid', 'not-a-function'); } catch (e) { threw2 = true; }
  assert(threw1, 'throws on empty name');
  assert(threw2, 'throws on non-function handler');
}));

tests.push(asyncTest('Async command handler is awaited', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('async-op', function (args) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ status: 'ok', command: 'async-op', result: 'async-result' });
      }, 5);
    });
  });
  var res = await router.handle('async-op');
  assert(res.status === 'ok',              'async handler resolves ok');
  assert(res.result === 'async-result',    'async result is correct');
}));

tests.push(asyncTest('Handler that throws returns error result (no rejection)', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('boom', function () {
    throw new Error('handler exploded');
  });
  var res = await router.handle('boom');
  assert(res.status === 'error',              'error status on thrown exception');
  assert(res.result.includes('handler exploded'), 'error message included in result');
}));

tests.push(asyncTest('Async handler that rejects returns error result', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('async-boom', function () {
    return Promise.reject(new Error('async boom'));
  });
  var res = await router.handle('async-boom');
  assert(res.status === 'error',          'error status on rejection');
  assert(res.result.includes('async boom'), 'rejection message in result');
}));

tests.push(asyncTest('Custom fallback handler is called for unknown commands', async function () {
  var called = false;
  var router = createRouter({
    logger: null,
    fallback: function (parsed) {
      called = true;
      return Promise.resolve({ status: 'custom', command: parsed.command, result: 'custom-fallback' });
    }
  });
  var res = await router.handle('mystery');
  assert(called === true,              'custom fallback was called');
  assert(res.status === 'custom',      'custom fallback status returned');
  assert(res.result === 'custom-fallback', 'custom fallback result returned');
}));

tests.push(asyncTest('Event bus on/emit/off works', async function () {
  var router = createRouter({ logger: null });
  var received = [];
  var listener = function (val) { received.push(val); };
  router.on('test-event', listener);
  router.emit('test-event', 42);
  router.emit('test-event', 43);
  router.off('test-event', listener);
  router.emit('test-event', 99);   // should NOT be received
  assertDeepEqual(received, [42, 43], 'received correct events, no events after off');
}));

tests.push(asyncTest('Event bus once fires only once', async function () {
  var router = createRouter({ logger: null });
  var count = 0;
  router.once('once-event', function () { count++; });
  router.emit('once-event');
  router.emit('once-event');
  assert(count === 1, 'once listener fired exactly once');
}));

tests.push(asyncTest('handle emits command:before and command:after events', async function () {
  var router = createRouter({ logger: null });
  var before = 0, after = 0;
  router.on('command:before', function () { before++; });
  router.on('command:after',  function () { after++; });
  await router.handle('echo hi');
  assert(before === 1, 'command:before fired once');
  assert(after === 1,  'command:after fired once');
}));

tests.push(asyncTest('use() mounts a module and registers its commands', async function () {
  var router = createRouter({ logger: null });
  var mounted = false;
  var mod = {
    commands: {
      'fs-read': function (args) { return { status: 'ok', command: 'fs-read', result: 'file-data' }; }
    },
    onMount: function (r) { mounted = true; }
  };
  router.use('filesystem', mod);
  assert(mounted === true,                        'onMount was called');
  assert(router.getModules().includes('filesystem'), 'module is listed');
  assert(router.getCommands().includes('fs-read'),   'fs-read command registered');
  var res = await router.handle('fs-read');
  assert(res.result === 'file-data',              'fs-read command works');
}));

tests.push(asyncTest('unuse() unmounts a module and removes its commands', async function () {
  var router = createRouter({ logger: null });
  var unmounted = false;
  var mod = {
    commands: { 'svc-start': function () { return { status: 'ok', command: 'svc-start', result: 'started' }; } },
    onUnmount: function () { unmounted = true; }
  };
  router.use('services', mod);
  router.unuse('services');
  assert(unmounted === true,                         'onUnmount was called');
  assert(!router.getModules().includes('services'),  'module removed');
  assert(!router.getCommands().includes('svc-start'), 'svc-start command removed');
}));

tests.push(asyncTest('use() hot-swaps a module (re-mount replaces old module)', async function () {
  var router = createRouter({ logger: null });
  var mod1 = { commands: { 'ai-run': function () { return { status: 'ok', command: 'ai-run', result: 'v1' }; } } };
  var mod2 = { commands: { 'ai-run': function () { return { status: 'ok', command: 'ai-run', result: 'v2' }; } } };
  router.use('ai', mod1);
  var r1 = await router.handle('ai-run');
  assert(r1.result === 'v1', 'first module returns v1');
  router.use('ai', mod2);  /* hot-swap */
  var r2 = await router.handle('ai-run');
  assert(r2.result === 'v2', 'hot-swapped module returns v2');
}));

tests.push(asyncTest('use() validates arguments', async function () {
  var router = createRouter({ logger: null });
  var threw1 = false, threw2 = false;
  try { router.use('', {}); } catch (e) { threw1 = true; }
  try { router.use('valid', 'not-an-object'); } catch (e) { threw2 = true; }
  assert(threw1, 'throws on empty module name');
  assert(threw2, 'throws on non-object module');
}));

tests.push(asyncTest('Module without commands or hooks mounts cleanly', async function () {
  var router = createRouter({ logger: null });
  router.use('cpu', { name: 'cpu-v1' });
  assert(router.getModules().includes('cpu'), 'module listed');
  router.unuse('cpu');
  assert(!router.getModules().includes('cpu'), 'module removed');
}));

tests.push(asyncTest('Multiple independent routers do not share state', async function () {
  var r1 = createRouter({ logger: null });
  var r2 = createRouter({ logger: null });
  r1.registerCommand('r1-only', function () { return { status: 'ok', command: 'r1-only', result: 'r1' }; });
  assert(!r2.getCommands().includes('r1-only'), 'r1 command not in r2');
  var res = await r2.handle('r1-only');
  assert(res.status === 'error', 'r2 cannot handle r1-only command');
}));

tests.push(asyncTest('handle with context object passes context to handler', async function () {
  var router = createRouter({ logger: null });
  var receivedCtx = null;
  router.registerCommand('ctx-check', function (args, context) {
    receivedCtx = context;
    return { status: 'ok', command: 'ctx-check', result: 'ok' };
  });
  await router.handle('ctx-check', { userId: 42 });
  assert(receivedCtx !== null,        'context received');
  assert(receivedCtx.userId === 42,   'context value preserved');
}));

tests.push(asyncTest('getModules returns all mounted modules', async function () {
  var router = createRouter({ logger: null });
  router.use('cpu',        { name: 'cpu' });
  router.use('filesystem', { name: 'fs'  });
  var mods = router.getModules();
  assert(mods.includes('cpu'),        'cpu in modules');
  assert(mods.includes('filesystem'), 'filesystem in modules');
}));

/* ── run all async tests then print summary ─────────────────────────────────── */
Promise.all(tests).then(function () {
  console.log('\n─────────────────────────────────');
  console.log('Results:', passed, 'passed,', failed, 'failed');
  if (failed > 0) process.exit(1);
});
