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
  assert(typeof router.getHistory === 'function',        'getHistory is a function');
  assert(typeof router.getMetrics === 'function',        'getMetrics is a function');
  assert(typeof router.describe === 'function',          'describe is a function');
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
  assert(res.result.includes('1.1.0'),     'result includes version number');
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

tests.push(asyncTest('use() mounts a module and registers its namespaced commands', async function () {
  var router = createRouter({ logger: null });
  var mounted = false;
  var mod = {
    commands: {
      'fs-read': function (args) { return { status: 'ok', command: 'filesystem:fs-read', result: 'file-data' }; }
    },
    onMount: function (r) { mounted = true; }
  };
  router.use('filesystem', mod);
  assert(mounted === true,                                   'onMount was called');
  assert(router.getModules().some(function (m) { return m.name === 'filesystem'; }), 'module is listed');
  assert(router.getCommands().includes('filesystem:fs-read'), 'filesystem:fs-read command registered');
  var res = await router.handle('filesystem:fs-read');
  assert(res.result === 'file-data',                        'filesystem:fs-read command works');
}));

tests.push(asyncTest('unuse() unmounts a module and removes its namespaced commands', async function () {
  var router = createRouter({ logger: null });
  var unmounted = false;
  var mod = {
    commands: { 'svc-start': function () { return { status: 'ok', command: 'services:svc-start', result: 'started' }; } },
    onUnmount: function () { unmounted = true; }
  };
  router.use('services', mod);
  router.unuse('services');
  assert(unmounted === true,                                          'onUnmount was called');
  assert(!router.getModules().some(function (m) { return m.name === 'services'; }), 'module removed');
  assert(!router.getCommands().includes('services:svc-start'),        'services:svc-start command removed');
}));

tests.push(asyncTest('use() hot-swaps a module (re-mount replaces old module)', async function () {
  var router = createRouter({ logger: null });
  var mod1 = { commands: { 'ai-run': function () { return { status: 'ok', command: 'ai:ai-run', result: 'v1' }; } } };
  var mod2 = { commands: { 'ai-run': function () { return { status: 'ok', command: 'ai:ai-run', result: 'v2' }; } } };
  router.use('ai', mod1);
  var r1 = await router.handle('ai:ai-run');
  assert(r1.result === 'v1', 'first module returns v1');
  router.use('ai', mod2);  /* hot-swap */
  var r2 = await router.handle('ai:ai-run');
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
  assert(router.getModules().some(function (m) { return m.name === 'cpu'; }), 'module listed');
  router.unuse('cpu');
  assert(!router.getModules().some(function (m) { return m.name === 'cpu'; }), 'module removed');
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

tests.push(asyncTest('getModules returns all mounted modules as objects with name and version', async function () {
  var router = createRouter({ logger: null });
  router.use('cpu',        { name: 'cpu' });
  router.use('filesystem', { name: 'fs', version: '2.0.0' });
  var mods = router.getModules();
  assert(mods.some(function (m) { return m.name === 'cpu'; }),        'cpu in modules');
  assert(mods.some(function (m) { return m.name === 'filesystem'; }), 'filesystem in modules');
  var fsMod = mods.find(function (m) { return m.name === 'filesystem'; });
  assert(fsMod && fsMod.version === '2.0.0', 'filesystem module version is reported');
  var cpuMod = mods.find(function (m) { return m.name === 'cpu'; });
  assert(cpuMod && cpuMod.version === null, 'module without version reports null');
}));

/* ─── Phase 2: Middleware pipeline ──────────────────────────────────────────── */

tests.push(asyncTest('use(fn) registers a middleware function', async function () {
  var router = createRouter({ logger: null });
  var ran = false;
  router.use(function (parsed, context, next) {
    ran = true;
    return next();
  });
  await router.handle('echo test');
  assert(ran === true, 'middleware ran');
}));

tests.push(asyncTest('Middleware receives parsed and context, and passes them to handler', async function () {
  var router = createRouter({ logger: null });
  var mwParsed = null;
  router.use(function (parsed, context, next) {
    mwParsed = parsed;
    context.enriched = true;
    return next();
  });
  var receivedCtx = null;
  router.registerCommand('mw-check', function (args, context) {
    receivedCtx = context;
    return { status: 'ok', command: 'mw-check', result: 'ok' };
  });
  await router.handle('mw-check hello', {});
  assert(mwParsed !== null,              'middleware received parsed');
  assert(mwParsed.command === 'mw-check', 'middleware parsed.command is correct');
  assert(receivedCtx && receivedCtx.enriched === true, 'middleware mutation visible in handler');
}));

tests.push(asyncTest('Middleware can short-circuit without calling next()', async function () {
  var router = createRouter({ logger: null });
  var handlerCalled = false;
  router.use(function (parsed, context, next) {
    return Promise.resolve({ status: 'blocked', command: parsed.command, result: 'short-circuited' });
  });
  router.registerCommand('blocked-cmd', function () {
    handlerCalled = true;
    return { status: 'ok', command: 'blocked-cmd', result: 'should not reach here' };
  });
  var res = await router.handle('blocked-cmd');
  assert(handlerCalled === false,        'handler was NOT called');
  assert(res.status === 'blocked',       'middleware short-circuit result returned');
  assert(res.result === 'short-circuited', 'middleware result value correct');
}));

tests.push(asyncTest('Middleware post-processing (onion model) can transform result', async function () {
  var router = createRouter({ logger: null });
  router.use(function (parsed, context, next) {
    return next().then(function (result) {
      result.enriched = true;
      return result;
    });
  });
  router.registerCommand('enrich-me', function () {
    return { status: 'ok', command: 'enrich-me', result: 'raw' };
  });
  var res = await router.handle('enrich-me');
  assert(res.status === 'ok',       'status is ok');
  assert(res.result === 'raw',      'original result preserved');
  assert(res.enriched === true,     'middleware added enriched field');
}));

tests.push(asyncTest('Multiple middlewares run in registration order', async function () {
  var router = createRouter({ logger: null });
  var order = [];
  router.use(function (parsed, context, next) { order.push(1); return next(); });
  router.use(function (parsed, context, next) { order.push(2); return next(); });
  router.use(function (parsed, context, next) { order.push(3); return next(); });
  await router.handle('echo test');
  assertDeepEqual(order, [1, 2, 3], 'middlewares ran in order 1, 2, 3');
}));

/* ─── Phase 3: Command routing enhancements ─────────────────────────────────── */

tests.push(asyncTest('Module commands are namespaced as moduleName:commandName', async function () {
  var router = createRouter({ logger: null });
  router.use('mymod', {
    commands: {
      greet: function (args) { return { status: 'ok', command: 'mymod:greet', result: 'hello' }; }
    }
  });
  assert(router.getCommands().includes('mymod:greet'), 'command registered as mymod:greet');
  assert(!router.getCommands().includes('greet'),      'bare greet not in registry');
  var res = await router.handle('mymod:greet');
  assert(res.status === 'ok',   'namespaced command resolves ok');
  assert(res.result === 'hello', 'namespaced command result correct');
}));

tests.push(asyncTest('Wildcard handler matches commands in its namespace', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('wild:*', function (args, context) {
    return { status: 'ok', command: 'wild:*', result: 'caught-by-wildcard' };
  });
  var res1 = await router.handle('wild:anything');
  var res2 = await router.handle('wild:foo');
  assert(res1.result === 'caught-by-wildcard', 'wild:anything matched by wildcard');
  assert(res2.result === 'caught-by-wildcard', 'wild:foo matched by wildcard');
}));

tests.push(asyncTest('Exact match takes precedence over wildcard at equal priority', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('ns:*', function () {
    return { status: 'ok', command: 'ns:*', result: 'wildcard' };
  });
  router.registerCommand('ns:specific', function () {
    return { status: 'ok', command: 'ns:specific', result: 'exact' };
  });
  var res1 = await router.handle('ns:specific');
  var res2 = await router.handle('ns:other');
  assert(res1.result === 'exact',    'exact match wins over wildcard');
  assert(res2.result === 'wildcard', 'wildcard handles non-exact command');
}));

tests.push(asyncTest('Wildcard pattern can be unregistered', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('tmp:*', function () {
    return { status: 'ok', command: 'tmp:*', result: 'wildcard' };
  });
  var r1 = await router.handle('tmp:test');
  assert(r1.result === 'wildcard', 'wildcard works before unregister');
  var removed = router.unregisterCommand('tmp:*');
  assert(removed === true, 'unregisterCommand returns true for wildcard');
  var r2 = await router.handle('tmp:test');
  assert(r2.status === 'error', 'wildcard removed, command unknown');
}));

tests.push(asyncTest('Higher-priority handler wins over lower-priority for same command', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('prio-cmd', function () {
    return { status: 'ok', command: 'prio-cmd', result: 'low' };
  }, { priority: 0 });
  router.registerCommand('prio-cmd', function () {
    return { status: 'ok', command: 'prio-cmd', result: 'high' };
  }, { priority: 5 });
  var res = await router.handle('prio-cmd');
  assert(res.result === 'high', 'higher priority handler registered last wins');
}));

tests.push(asyncTest('Higher-priority wildcard can beat exact match', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('override:specific', function () {
    return { status: 'ok', command: 'override:specific', result: 'exact-priority-0' };
  }, { priority: 0 });
  router.registerCommand('override:*', function () {
    return { status: 'ok', command: 'override:*', result: 'wildcard-priority-10' };
  }, { priority: 10 });
  var res = await router.handle('override:specific');
  assert(res.result === 'wildcard-priority-10', 'higher-priority wildcard beats lower-priority exact');
}));

/* ─── Phase 4: Module system improvements ───────────────────────────────────── */

tests.push(asyncTest('onCommand hook is called for every dispatched command', async function () {
  var router = createRouter({ logger: null });
  var intercepted = [];
  router.use('observer', {
    onCommand: function (parsed, context) { intercepted.push(parsed.command); }
  });
  await router.handle('echo hello');
  await router.handle('version');
  assert(intercepted.includes('echo'),    'onCommand intercepted echo');
  assert(intercepted.includes('version'), 'onCommand intercepted version');
}));

tests.push(asyncTest('Module dependency check returns error when dep is missing', async function () {
  var router = createRouter({ logger: null });
  router.use('service-a', {
    requires: ['service-b'],
    commands: {
      action: function () { return { status: 'ok', command: 'service-a:action', result: 'done' }; }
    }
  });
  var res = await router.handle('service-a:action');
  assert(res.status === 'error',                         'error when dep missing');
  assert(res.result.includes('service-b'),               'error mentions missing dep');
}));

tests.push(asyncTest('Module dependency check passes when all deps are mounted', async function () {
  var router = createRouter({ logger: null });
  router.use('service-b', {});
  router.use('service-a', {
    requires: ['service-b'],
    commands: {
      action: function () { return { status: 'ok', command: 'service-a:action', result: 'done' }; }
    }
  });
  var res = await router.handle('service-a:action');
  assert(res.status === 'ok', 'resolves ok when all deps mounted');
}));

tests.push(asyncTest('Module versioning is exposed through getModules()', async function () {
  var router = createRouter({ logger: null });
  router.use('versioned', { version: '3.0.0', commands: {} });
  router.use('unversioned', { commands: {} });
  var mods = router.getModules();
  var vm = mods.find(function (m) { return m.name === 'versioned'; });
  var um = mods.find(function (m) { return m.name === 'unversioned'; });
  assert(vm && vm.version === '3.0.0', 'versioned module reports version');
  assert(um && um.version === null,    'unversioned module reports null');
}));

tests.push(asyncTest('Non-function commands in module are skipped (not registered)', async function () {
  var router = createRouter({ logger: null });
  router.use('badmod', {
    commands: {
      valid:   function () { return { status: 'ok', command: 'badmod:valid', result: 'ok' }; },
      invalid: 'not-a-function'
    }
  });
  assert(router.getCommands().includes('badmod:valid'),    'valid command registered');
  assert(!router.getCommands().includes('badmod:invalid'), 'invalid command skipped');
}));

/* ─── Phase 5: Observability and introspection ──────────────────────────────── */

tests.push(asyncTest('getHistory() returns entries after commands are dispatched', async function () {
  var router = createRouter({ logger: null });
  await router.handle('echo alpha');
  await router.handle('echo beta');
  var h = router.getHistory();
  assert(h.length === 2,                'two history entries recorded');
  assert(h[0].command === 'echo',       'first entry command is echo');
  assert(h[0].args[0] === 'alpha',      'first entry args correct');
  assert(h[1].args[0] === 'beta',       'second entry args correct');
  assert(typeof h[0].duration === 'number', 'duration is a number');
  assert(typeof h[0].timestamp === 'number', 'timestamp is a number');
}));

tests.push(asyncTest('getHistory() is bounded by historySize option', async function () {
  var router = createRouter({ logger: null, historySize: 3 });
  await router.handle('echo 1');
  await router.handle('echo 2');
  await router.handle('echo 3');
  await router.handle('echo 4');
  var h = router.getHistory();
  assert(h.length === 3, 'history capped at historySize');
  assert(h[0].args[0] === '2', 'oldest entry is the second command (first was evicted)');
}));

tests.push(asyncTest('getHistory() returns a copy (mutations do not affect internal state)', async function () {
  var router = createRouter({ logger: null });
  await router.handle('echo test');
  var h = router.getHistory();
  h.push({ command: 'fake', args: [], status: 'ok', duration: 0, timestamp: 0 });
  assert(router.getHistory().length === 1, 'internal history not affected by mutation of returned copy');
}));

tests.push(asyncTest('getMetrics() tracks calls and errors per command', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('counted', function () { return { status: 'ok', command: 'counted', result: 'ok' }; });
  router.registerCommand('erring', function () { return { status: 'error', command: 'erring', result: 'fail' }; });
  await router.handle('counted');
  await router.handle('counted');
  await router.handle('erring');
  var m = router.getMetrics();
  assert(m['counted'] && m['counted'].calls === 2,  'counted command: 2 calls');
  assert(m['counted'] && m['counted'].errors === 0, 'counted command: 0 errors');
  assert(m['erring'] && m['erring'].calls === 1,    'erring command: 1 call');
  assert(m['erring'] && m['erring'].errors === 1,   'erring command: 1 error');
  assert(typeof m['counted'].avgLatency === 'number', 'avgLatency is a number');
}));

tests.push(asyncTest('describe() returns metadata for a registered command', async function () {
  var router = createRouter({ logger: null });
  function myHandler(args) { return { status: 'ok', command: 'my-cmd', result: 'ok' }; }
  router.registerCommand('my-cmd', myHandler);
  var d = router.describe('my-cmd');
  assert(d !== null,                'describe returns object for known command');
  assert(d.name === 'my-cmd',       'describe returns correct name');
  assert(d.source === 'user',       'source is user');
  assert(d.handlerName === 'myHandler', 'handlerName matches function name');
  assert(typeof d.registeredAt === 'number', 'registeredAt is a number');
  assert(typeof d.priority === 'number',     'priority is a number');
}));

tests.push(asyncTest('describe() works for built-in commands', async function () {
  var router = createRouter({ logger: null });
  var d = router.describe('echo');
  assert(d !== null,            'describe returns object for built-in');
  assert(d.source === 'builtin', 'source is builtin');
}));

tests.push(asyncTest('describe() works for module commands', async function () {
  var router = createRouter({ logger: null });
  router.use('mymod2', {
    commands: { action: function () { return { status: 'ok', command: 'mymod2:action', result: 'ok' }; } }
  });
  var d = router.describe('mymod2:action');
  assert(d !== null,                    'describe returns object for module command');
  assert(d.source === 'module:mymod2',  'source identifies the owning module');
}));

tests.push(asyncTest('describe() works for wildcard patterns', async function () {
  var router = createRouter({ logger: null });
  router.registerCommand('glob:*', function wildcardFn() { return { status: 'ok', command: 'glob:*', result: 'wc' }; });
  var d = router.describe('glob:*');
  assert(d !== null,               'describe returns object for wildcard');
  assert(d.name === 'glob:*',      'name is the pattern string');
  assert(d.source === 'user',      'source is user');
  assert(d.handlerName === 'wildcardFn', 'handlerName matches function name');
}));

tests.push(asyncTest('describe() returns null for unknown commands', async function () {
  var router = createRouter({ logger: null });
  var d = router.describe('does-not-exist');
  assert(d === null, 'returns null for unknown command');
}));

/* ── run all async tests then print summary ─────────────────────────────────── */
Promise.all(tests).then(function () {
  console.log('\n─────────────────────────────────');
  console.log('Results:', passed, 'passed,', failed, 'failed');
  if (failed > 0) process.exit(1);
});
