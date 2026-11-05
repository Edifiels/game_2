'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const timerCore = require('../timer-core.js');
const settings = { enabled: true, thinkingSeconds: 60, answerSeconds: 30 };

test('countdown uses its deadline after delayed and hidden-tab ticks', () => {
  const paused = timerCore.createTimer('history-100', 'thinking', settings);
  const running = timerCore.reduce(paused, { type: 'START' }, settings, 1000);
  assert.equal(running.deadline, 61000);
  assert.equal(timerCore.remainingMs(running, 1100), 59900);
  assert.equal(timerCore.remainingMs(running, 45123), 15877);
  assert.equal(timerCore.reduce(running, { type: 'TICK' }, settings, 45123), running);
  assert.equal(timerCore.remainingMs(running, 180000), 0);
  const expired = timerCore.reduce(running, { type: 'TICK' }, settings, 180000);
  assert.equal(expired.remainingMs, 0);
  assert.equal(expired.deadline, null);
  assert.equal(expired.questionId, 'history-100');
  assert.equal(timerCore.validateTimer(expired), true);
  assert.equal(running.deadline, 61000);
});

test('pause and resume preserve the true remainder; reset restores a paused full duration', () => {
  let timer = timerCore.createTimer('menu-200', 'answer', settings);
  timer = timerCore.reduce(timer, { type: 'START' }, settings, 1000);
  assert.equal(timerCore.reduce(timer, { type: 'START' }, settings, 5000), timer);
  timer = timerCore.reduce(timer, { type: 'PAUSE' }, settings, 12500);
  assert.equal(timer.remainingMs, 18500);
  assert.equal(timer.deadline, null);
  assert.equal(timerCore.remainingMs(timer, 999999), 18500);
  assert.equal(timerCore.reduce(timer, { type: 'PAUSE' }, settings, 999999), timer);
  timer = timerCore.reduce(timer, { type: 'START' }, settings, 100000);
  assert.equal(timer.deadline, 118500);
  assert.equal(timerCore.remainingMs(timer, 110000), 8500);
  timer = timerCore.reduce(timer, { type: 'RESET' }, settings, 110000);
  assert.equal(timer.remainingMs, 30000);
  assert.equal(timer.deadline, null);
  assert.equal(timerCore.reduce(timer, { type: 'RESET' }, settings, 120000), timer);
});

test('start after zero restarts the full configured mode duration', () => {
  let timer = timerCore.createTimer('traditions-300', 'thinking', settings);
  timer = timerCore.reduce(timer, { type: 'START' }, settings, 1000);
  timer = timerCore.reduce(timer, { type: 'TICK' }, settings, 61000);
  timer = timerCore.reduce(timer, { type: 'START' }, settings, 90000);
  assert.equal(timer.remainingMs, 60000);
  assert.equal(timer.deadline, 150000);
  const restartedWithoutTick = timerCore.reduce(timer, { type: 'START' }, settings, 200000);
  assert.equal(restartedWithoutTick.deadline, 260000);
});

test('mode switching cancels the old deadline and uses separately configured durations', () => {
  const custom = { enabled: true, thinkingSeconds: 90, answerSeconds: 15 };
  let timer = timerCore.createTimer('people-400', 'thinking', custom);
  timer = timerCore.reduce(timer, { type: 'START' }, custom, 1000);
  timer = timerCore.reduce(timer, { type: 'MODE', mode: 'answer' }, custom, 2000);
  assert.equal(timer.mode, 'answer');
  assert.equal(timer.remainingMs, 15000);
  assert.equal(timer.deadline, null);
  assert.equal(timerCore.reduce(timer, { type: 'MODE', mode: 'answer' }, custom, 3000), timer);
  timer = timerCore.reduce(timer, { type: 'MODE', mode: 'thinking' }, custom, 4000);
  assert.equal(timer.remainingMs, 90000);
});

test('settings accept only boolean enabled and integer durations from 5 to 600 seconds', () => {
  assert.deepEqual(timerCore.DEFAULT_SETTINGS, { enabled: false, thinkingSeconds: 60, answerSeconds: 30 });
  for (const value of [null, undefined, [], 'timer', 42]) {
    assert.deepEqual(timerCore.normalizeSettings(value), timerCore.DEFAULT_SETTINGS);
  }
  for (const duration of [0, 4, 601, -1, NaN, Infinity, '60', 5.5]) {
    assert.deepEqual(timerCore.normalizeSettings({ enabled: 'true', thinkingSeconds: duration, answerSeconds: duration }), timerCore.DEFAULT_SETTINGS);
  }
  assert.deepEqual(timerCore.normalizeSettings({ enabled: true, thinkingSeconds: 5, answerSeconds: 600 }), {
    enabled: true, thinkingSeconds: 5, answerSeconds: 600
  });
  assert.deepEqual(timerCore.normalizeSettings({ enabled: true, thinkingSeconds: 12, answerSeconds: 1000 }), {
    enabled: true, thinkingSeconds: 12, answerSeconds: 30
  });
  const normalized = timerCore.normalizeSettings(null);
  normalized.thinkingSeconds = 500;
  assert.equal(timerCore.DEFAULT_SETTINGS.thinkingSeconds, 60);
});

test('timer validation rejects malformed identifiers, modes, times and deadlines', () => {
  const valid = timerCore.createTimer('history-100', 'thinking', settings);
  assert.equal(timerCore.validateTimer(valid), true);
  for (const value of [null, undefined, {}, [], 'timer']) assert.equal(timerCore.validateTimer(value), false);
  const invalid = [
    { questionId: '' }, { questionId: 'history' }, { questionId: 'history-100" onclick="x' },
    { questionId: 'a'.repeat(64) + '-1' }, { questionId: 'History-100' },
    { mode: 'break' }, { remainingMs: -1 }, { remainingMs: 600001 },
    { remainingMs: Infinity }, { remainingMs: NaN }, { remainingMs: '1000' },
    { deadline: -1 }, { deadline: Infinity }, { deadline: NaN }, { deadline: '1000' },
    { deadline: Number.MAX_SAFE_INTEGER + 1 }, { deadline: undefined }
  ];
  for (const patch of invalid) {
    const malformed = { ...valid, ...patch };
    assert.equal(timerCore.validateTimer(malformed), false);
    assert.equal(timerCore.reduce(malformed, { type: 'START' }, settings, 1000), malformed);
  }
  assert.throws(() => timerCore.createTimer('invalid', 'thinking', settings), TypeError);
  assert.throws(() => timerCore.createTimer('history-100', 'invalid', settings), TypeError);
});

test('remaining is capped, invalid actions are ignored and expiration cannot affect game data', () => {
  const timer = { ...timerCore.createTimer('history-100', 'thinking', settings), deadline: 1000000 };
  assert.equal(timerCore.remainingMs(timer, 0), 600000);
  assert.equal(timerCore.remainingMs(timer, 1000001), 0);
  for (const action of [null, {}, { type: 'UNKNOWN' }, { type: 'MODE', mode: 'bad' }]) {
    assert.equal(timerCore.reduce(timer, action, settings, 1000), timer);
  }
  assert.equal(timerCore.reduce(timer, { type: 'START' }, settings, NaN), timer);
  assert.equal(timerCore.remainingMs(null, 1000), 0);
  const expired = timerCore.reduce(timer, { type: 'TICK' }, settings, 2000000);
  assert.deepEqual(Object.keys(expired).sort(), ['deadline', 'mode', 'questionId', 'remainingMs']);
  assert.equal(expired.remainingMs, 0);
});
