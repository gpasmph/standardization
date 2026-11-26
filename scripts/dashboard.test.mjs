import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, dependencies, globals = {}) {
  const code = ts.transpileModule(readFileSync(file, 'utf8').replaceAll('import.meta.env', '({})'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  }, Error, setTimeout, clearTimeout, AbortController, AbortSignal, ...globals });
  return exports;
}

test('dashboard reuses one pending request and retains totals after refresh failure', async () => {
  const old = { total: 10 };
  const S = { user: { id: 'user1' }, stats: old };
  let resolve, reject, calls = 0;
  const api = { fetchStats: () => { calls++; return new Promise((a, b) => { resolve = a; reject = b; }); } };
  const { loadStats } = load('src/loaders.ts', {
    './api': api, './state': { S }, './render': { render() {} }, './lib/dom': { toast() {} },
  });
  const a = loadStats(), b = loadStats();
  assert.equal(calls, 1);
  assert.equal(S.stats, old);
  resolve({ total: 20 });
  await Promise.all([a, b]);
  assert.equal(S.stats.total, 20);
  const failed = loadStats();
  reject(new Error('Network unavailable'));
  await failed;
  assert.equal(S.stats.total, 20);
  assert.equal(S.statsLoading, false);
  assert.equal(S.statsError, 'Network unavailable');
  const retry = loadStats();
  resolve({ total: 30 });
  await retry;
  assert.equal(S.statsError, '');
  assert.equal(S.stats.total, 30);
});

test('stalled dashboard request times out and aborts', async () => {
  let trigger, signal;
  const { fetchStats } = load('src/api.ts', {
    './lib/supabase': { supabase: { rpc: () => ({ abortSignal: s => { signal = s; return new Promise(() => {}); } }) } },
    './state': { PAGE_SIZE: 25 },
  }, { setTimeout: callback => { trigger = callback; return 1; }, clearTimeout() {} });
  const pending = fetchStats();
  trigger();
  await assert.rejects(pending, /timed out/);
  assert.equal(signal.aborted, true);
});

test('late dashboard response cannot populate another user session', async () => {
  let resolve;
  const S = { user: { id: 'first' }, stats: null };
  const { loadStats } = load('src/loaders.ts', {
    './api': { fetchStats: () => new Promise(r => { resolve = r; }) },
    './state': { S }, './render': { render() {} }, './lib/dom': { toast() {} },
  });
  const pending = loadStats();
  S.user = { id: 'second' };
  resolve({ total: 100 });
  await pending;
  assert.equal(S.stats, null);
});
