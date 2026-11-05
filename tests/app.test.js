'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../game-core.js');
const content = require('../questions.js');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

// Exercise the actual app controller, persistence and two-window messaging.
// This deliberately small DOM surface does not replace visual browser QA.
function appHarness({ audience = false, storage = new Map(), opener = null, sourceOverride = source, now = 1800000000000 } = {}) {
  const documentEvents = {};
  const windowEvents = {};
  const elements = new Map();
  const intervals = new Map();
  let clock = now;
  let nextInterval = 0;
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  function element() {
    return {
      innerHTML: '', textContent: '', hidden: false, dataset: {},
      handlers: {}, classList: { add() {}, remove() {} },
      addEventListener(type, callback) { this.handlers[type] = callback; },
      querySelector() { return null; },
      focus() {},
    };
  }
  for (const id of ['app', 'dialog-root', 'toast', 'form-error']) elements.set(id, element());
  const document = {
    activeElement: null,
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    addEventListener(type, callback) { documentEvents[type] = callback; },
    documentElement: { dataset: {}, requestFullscreen: async () => {} },
  };
  // Confirmation dialogs ask for a default focus target.
  elements.get('dialog-root').querySelector = () => element();
  const popup = { closed: false, messages: [], postMessage(message) { this.messages.push(structuredClone(message)); } };
  const window = {
    opener,
    postMessage() {},
    addEventListener(type, callback) { windowEvents[type] = callback; },
    open(url) { popup.url = url; return popup; },
  };
  const context = {
    GAME_CONTENT: content, UnityGame: engine, UnityTimer: require('../timer-core.js'), URL, URLSearchParams, Intl, Date: ClockDate,
    document, window, location: { href: `file:///E:/game/index.html${audience ? '?audience=1' : ''}`, search: audience ? '?audience=1' : '' },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: () => 1, clearTimeout() {},
    setInterval(callback) { const id = ++nextInterval; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
  };
  vm.runInNewContext(sourceOverride, context, { filename: 'app.js' });
  return {
    document, window, popup, storage,
    get theme() { return document.documentElement.dataset.theme; },
    get html() { return elements.get('app').innerHTML; },
    get saved() { return JSON.parse(storage.get('unity-game-v1') || 'null'); },
    get timerSettings() { return JSON.parse(storage.get('unity-game-timer-settings-v1') || 'null'); },
    get timerSaved() { return JSON.parse(storage.get('unity-game-timer-v1') || 'null'); },
    get timer() { return this.timerSaved?.timer || null; },
    get now() { return clock; },
    click(action, dataset = {}) {
      const button = { disabled: false, dataset: { action, ...dataset } };
      documentEvents.click({ target: { closest: () => button } });
    },
    input(index, value) {
      elements.get('app').handlers.input({ target: { matches: selector => selector === '[data-team-input]', dataset: { teamInput: String(index) }, value } });
    },
    timerEnabled(checked) {
      elements.get('app').handlers.input({ target: { id: 'timer-enabled', checked, dataset: {}, matches: () => false } });
    },
    timerDuration(mode, value) {
      elements.get('app').handlers.change({ target: { dataset: { timerDuration: mode }, value: String(value), matches: selector => selector === '[data-timer-duration]' } });
    },
    advance(milliseconds) { clock += milliseconds; for (const callback of [...intervals.values()]) callback(); },
    setDateNow(value) { clock = value; },
    start() { elements.get('app').handlers.submit({ target: { id: 'setup-form' }, preventDefault() {} }); },
    message(data, sender = opener) { windowEvents.message({ data: structuredClone(data), source: sender }); },
    storageEvent(key, newValue) { windowEvents.storage?.({ key, newValue }); },
  };
}

test('actual UI controller handles wrong answer, reassignment, points, skipping, undo and reload', () => {
  const app = appHarness();
  assert.match(app.html, /Кто сегодня играет/);
  app.input(0, 'Знатоки'); app.input(1, 'Дружба'); app.start();
  assert.equal(app.saved.phase, 'playing');
  assert.match(app.html, /История единства/);
  app.click('open-question', { question: 'history-100' });
  assert.match(app.html, /Назовите обе фамилии/);
  assert.doesNotMatch(app.html, /Минин и Пожарский\./);
  app.click('select-team', { team: 'team-1' }); app.click('incorrect');
  assert.equal(app.saved.teams[0].score, 0);
  assert.deepEqual(app.saved.current.attemptedTeamIds, ['team-1']);
  app.click('select-team', { team: 'team-2' }); app.click('correct');
  assert.equal(app.saved.teams[1].score, 100);
  assert.match(app.html, /Минин и Пожарский\./);
  const restored = appHarness({ storage: app.storage });
  assert.equal(restored.saved.teams[1].score, 100);
  assert.match(restored.html, /Минин и Пожарский\./);
  restored.click('close-question');
  restored.click('open-question', { question: 'menu-200' }); restored.click('skip-question');
  assert.equal(restored.saved.usedQuestionIds.length, 2);
  restored.click('undo');
  assert.equal(restored.saved.current.resolved, false);
  assert.equal(restored.saved.usedQuestionIds.length, 1);
});

test('projector window receives changes while keeping answers hidden until the host opens them', () => {
  const host = appHarness();
  host.input(0, 'Первопроходцы'); host.input(1, 'Вместе'); host.start();
  host.click('projector');
  assert.match(host.popup.url, /audience=1/);
  const screen = appHarness({ audience: true, opener: host.window });
  screen.message(host.popup.messages.at(-1));
  assert.match(screen.html, /Первопроходцы/);
  assert.doesNotMatch(screen.html, /data-action="finish"/);
  host.click('open-question', { question: 'history-100' });
  screen.message(host.popup.messages.at(-1));
  assert.doesNotMatch(screen.html, /Минин и Пожарский\./);
  assert.doesNotMatch(screen.html, /data-action="correct"/);
  assert.doesNotMatch(screen.html, /data-action="select-team"/);
  host.click('select-team', { team: 'team-1' });
  screen.message(host.popup.messages.at(-1));
  assert.match(screen.html, /Отвечает команда «Первопроходцы»/);
  host.click('reveal'); screen.message(host.popup.messages.at(-1));
  assert.match(screen.html, /Минин и Пожарский\./);
  host.click('correct'); screen.message(host.popup.messages.at(-1));
  assert.match(screen.html, /\+100/);
  assert.equal(host.saved.teams[0].score, 100);
});

test('full round ends with named winner and results can return to the board', () => {
  const app = appHarness();
  app.input(0, 'Сила'); app.input(1, 'Единство'); app.start();
  for (const question of content.categories.flatMap(category => category.questions)) {
    app.click('open-question', { question: question.id });
    app.click('select-team', { team: 'team-1' }); app.click('correct'); app.click('close-question');
  }
  app.click('finish');
  assert.equal(app.saved.phase, 'finished');
  assert.equal(app.saved.teams[0].score, 5000);
  assert.match(app.html, /winner-name">Сила<\/h2>/);
  assert.match(app.html, /Победитель игры/);
  app.click('resume');
  assert.equal(app.saved.phase, 'playing');
  assert.equal(app.saved.usedQuestionIds.length, 20);
});

test('team names are escaped and duplicate team names keep the setup screen open', () => {
  const app = appHarness();
  app.input(0, '<img src=x onerror=alert(1)>'); app.input(1, 'Дружба'); app.click('add-team');
  assert.match(app.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(app.html, /<img src=x/);
  const duplicate = appHarness();
  duplicate.input(0, 'Вместе'); duplicate.input(1, 'ВМЕСТЕ'); duplicate.start();
  assert.equal(duplicate.saved, null);
  assert.match(duplicate.html, /Кто сегодня играет/);
});

test('theme switching during a question preserves scores, attempts, answer visibility and undo history', () => {
  const app = appHarness();
  assert.equal(app.theme, 'light');
  assert.match(app.html, /data-action="set-theme"/);
  app.input(0, 'Сура'); app.input(1, 'Волга'); app.start();
  app.click('open-question', { question: 'history-100' });
  app.click('select-team', { team: 'team-1' }); app.click('correct'); app.click('close-question');
  app.click('open-question', { question: 'history-200' });
  app.click('select-team', { team: 'team-1' }); app.click('incorrect');
  app.click('select-team', { team: 'team-2' }); app.click('reveal');
  const savedBefore = app.saved;
  assert.equal(savedBefore.teams[0].score, 100);
  assert.deepEqual(savedBefore.current.attemptedTeamIds, ['team-1']);
  assert.equal(savedBefore.current.answerVisible, true);

  app.click('set-theme', { theme: 'classic' });
  assert.equal(app.theme, 'classic');
  assert.equal(app.storage.get('unity-game-theme-v1'), 'classic');
  assert.deepEqual(app.saved, savedBefore);
  assert.match(app.html, /Нижний Новгород\./);
  app.click('set-theme', { theme: 'light' });
  assert.equal(app.theme, 'light');
  assert.equal(app.storage.get('unity-game-theme-v1'), 'light');
  assert.deepEqual(app.saved, savedBefore);
  app.click('correct');
  assert.equal(app.saved.teams[1].score, 200);
  assert.deepEqual(app.saved.usedQuestionIds, ['history-100', 'history-200']);
});

test('theme preference survives reload independently from a saved game', () => {
  const app = appHarness();
  app.click('set-theme', { theme: 'classic' });
  assert.equal(app.saved, null);
  const setupReload = appHarness({ storage: app.storage });
  assert.equal(setupReload.theme, 'classic');
  assert.match(setupReload.html, /Кто сегодня играет/);
  setupReload.start();
  setupReload.click('open-question', { question: 'history-100' });
  setupReload.click('select-team', { team: 'team-1' }); setupReload.click('correct');
  const savedBefore = setupReload.saved;
  const restored = appHarness({ storage: setupReload.storage });
  assert.equal(restored.theme, 'classic');
  assert.deepEqual(restored.saved, savedBefore);
  assert.match(restored.html, /Минин и Пожарский\./);
});

test('projector follows host theme messages and storage changes without exposing a theme control', () => {
  const host = appHarness();
  host.start();
  host.click('projector');
  const screen = appHarness({ audience: true, opener: host.window });
  screen.message(host.popup.messages.at(-1));
  assert.equal(screen.theme, 'light');
  assert.doesNotMatch(screen.html, /data-action="set-theme"/);
  host.click('open-question', { question: 'history-100' });
  host.click('select-team', { team: 'team-2' });
  const savedBefore = host.saved;
  host.click('set-theme', { theme: 'classic' });
  const themeMessage = host.popup.messages.at(-1);
  assert.equal(themeMessage.theme, 'classic');
  screen.message(themeMessage);
  assert.equal(screen.theme, 'classic');
  assert.match(screen.html, /Назовите обе фамилии/);
  assert.doesNotMatch(screen.html, /Минин и Пожарский\./);
  assert.deepEqual(host.saved, savedBefore);

  screen.click('set-theme', { theme: 'light' });
  assert.equal(screen.theme, 'classic');
  screen.storageEvent('unity-game-theme-v1', 'light');
  assert.equal(screen.theme, 'light');
  screen.storageEvent('unity-game-theme-v1', 'invalid-theme');
  assert.equal(screen.theme, 'light');
  screen.message({ ...themeMessage, theme: 'invalid-theme' });
  assert.equal(screen.theme, 'light');
});

test('corrupt theme preferences and unsupported theme clicks fall back safely', () => {
  for (const value of ['dark', '"classic"', '{"theme":"classic"}', '__proto__', 'classic" onclick="alert(1)']) {
    const app = appHarness({ storage: new Map([['unity-game-theme-v1', value]]) });
    assert.equal(app.theme, 'light');
    assert.match(app.html, /Кто сегодня играет/);
    app.click('set-theme', { theme: value });
    assert.equal(app.theme, 'light');
    assert.equal(app.saved, null);
  }
});

function timedGame() {
  const app = appHarness();
  app.start();
  app.click('open-question', { question: 'history-100' });
  app.timerEnabled(true);
  return app;
}

test('timer enables without changing the game and supports two stages, pause and reset', () => {
  const app = timedGame();
  const gameBefore = app.saved;
  assert.deepEqual(app.timerSettings, { enabled: true, thinkingSeconds: 60, answerSeconds: 30 });
  assert.equal(app.timer.questionId, 'history-100');
  assert.equal(app.timer.mode, 'thinking');
  assert.equal(app.timer.remainingMs, 60000);
  assert.equal(app.timer.deadline, null);

  app.click('timer-toggle');
  assert.equal(app.timer.deadline, app.now + 60000);
  app.advance(12500);
  app.click('timer-toggle');
  assert.equal(app.timer.deadline, null);
  assert.equal(app.timer.remainingMs, 47500);
  app.advance(10000);
  assert.equal(app.timer.remainingMs, 47500);
  app.click('timer-reset');
  assert.equal(app.timer.remainingMs, 60000);
  assert.equal(app.timer.deadline, null);

  app.click('timer-mode', { mode: 'answer' });
  assert.equal(app.timer.mode, 'answer');
  assert.equal(app.timer.remainingMs, 30000);
  assert.equal(app.timer.deadline, null);
  app.click('timer-mode', { mode: 'thinking' });
  app.timerDuration('thinking', 45);
  assert.equal(app.timerSettings.thinkingSeconds, 45);
  app.click('timer-reset');
  assert.equal(app.timer.remainingMs, 45000);
  assert.deepEqual(app.saved, gameBefore);

  app.timerEnabled(false);
  assert.equal(app.timerSettings.enabled, false);
  assert.equal(app.timer?.deadline ?? null, null);
  assert.deepEqual(app.saved, gameBefore);
});

test('timer reaching zero never grades, awards points or reveals an answer', () => {
  const app = timedGame();
  app.click('select-team', { team: 'team-1' });
  app.click('timer-mode', { mode: 'answer' });
  const gameBefore = app.saved;
  app.click('timer-toggle');
  app.advance(30001);
  assert.equal(app.timer.remainingMs, 0);
  assert.equal(app.timer.deadline, null);
  assert.deepEqual(app.saved, gameBefore);
  assert.equal(app.saved.current.answerVisible, false);
  assert.equal(app.saved.current.resolved, false);
  assert.equal(app.saved.usedQuestionIds.length, 0);
  assert.equal(app.saved.teams[0].score, 0);
  assert.doesNotMatch(app.html, /Минин и Пожарский\./);
});

test('answer timer pauses on grading, passing and closing, and resets for a different team', () => {
  for (const [action, dataset] of [
    ['correct', {}], ['incorrect', {}], ['pass-team', {}],
    ['skip-question', {}], ['close-question', {}],
    ['select-team', { team: 'team-2' }],
  ]) {
    const app = timedGame();
    app.click('select-team', { team: 'team-1' });
    app.click('timer-mode', { mode: 'answer' });
    app.click('timer-toggle');
    app.advance(5000);
    app.click(action, dataset);
    assert.equal(app.timer?.deadline ?? null, null, `${action} must pause the timer`);
    if (app.timer) assert.equal(app.timer.remainingMs, action === 'select-team' ? 30000 : 25000,
      action === 'select-team' ? 'a different team gets a full answer timer' : `${action} preserves time left`);
  }

  const app = timedGame();
  app.click('timer-toggle');
  const deadline = app.timer.deadline;
  app.click('select-team', { team: 'team-1' });
  assert.equal(app.timer.deadline, deadline, 'choosing a team does not interrupt thinking time');
  app.click('close-question');
  assert.equal(app.timer?.deadline ?? null, null);
});

test('running timer and settings survive reload with the original deadline', () => {
  const app = timedGame();
  app.timerDuration('answer', 40);
  app.click('select-team', { team: 'team-1' });
  app.click('timer-mode', { mode: 'answer' });
  app.click('timer-toggle');
  const deadline = app.timer.deadline;
  const gameBefore = app.saved;
  const restored = appHarness({ storage: app.storage, now: app.now + 7000 });
  assert.equal(restored.timerSettings.enabled, true);
  assert.equal(restored.timerSettings.answerSeconds, 40);
  assert.equal(restored.timer.deadline, deadline);
  assert.deepEqual(restored.saved, gameBefore);
  restored.click('timer-toggle');
  assert.equal(restored.timer.deadline, null);
  assert.equal(restored.timer.remainingMs, 33000);
});

test('projector follows timer messages and cannot operate the timer', () => {
  const host = timedGame();
  host.click('projector');
  const screen = appHarness({ audience: true, opener: host.window });
  host.click('timer-toggle');
  const message = host.popup.messages.at(-1);
  assert.deepEqual(message.timerSettings, host.timerSettings);
  assert.deepEqual(message.timer, host.timer);
  screen.message(message);
  assert.doesNotMatch(screen.html, /data-action="timer-(?:toggle|reset|mode|enable)"/);
  assert.doesNotMatch(screen.html, /id="timer-enabled"/);
  const gameBefore = host.saved;
  screen.click('timer-toggle');
  screen.click('timer-reset');
  screen.click('timer-mode', { mode: 'answer' });
  screen.timerEnabled(false);
  assert.equal(host.timer.deadline, message.timer.deadline);
  assert.deepEqual(host.saved, gameBefore);
  assert.equal(screen.timerSaved, null);
  assert.doesNotMatch(screen.html, /Минин и Пожарский\./);
});

test('corrupt saved timers are ignored without losing a valid game', () => {
  const sourceApp = timedGame();
  const gameBefore = sourceApp.saved;
  for (const [key, value] of [
    ['unity-game-timer-settings-v1', '{'],
    ['unity-game-timer-settings-v1', '{"enabled":true,"thinkingSeconds":-10,"answerSeconds":"no"}'],
    ['unity-game-timer-v1', '{'],
    ['unity-game-timer-v1', '{"gameStartedAt":"different-game","timer":{"questionId":"history-100","mode":"thinking","remainingMs":60000,"deadline":null}}'],
    ['unity-game-timer-v1', '{"gameStartedAt":"x","timer":{"questionId":"bogus","mode":"bogus","remainingMs":-1,"deadline":"oops"}}'],
  ]) {
    const storage = new Map(sourceApp.storage);
    storage.set(key, value);
    const restored = appHarness({ storage });
    assert.deepEqual(restored.saved, gameBefore);
    assert.match(restored.html, /Назовите обе фамилии/);
    restored.timerEnabled(true);
    restored.click('timer-reset');
    assert.equal(restored.timerSettings.enabled, true);
    assert.equal(restored.timer.questionId, 'history-100');
    assert.equal(restored.timer.deadline, null);
    assert.ok(restored.timer.remainingMs > 0);
  }
});

test('single-file offline artifact contains the actual app and needs no network files', () => {
  const html = fs.readFileSync(path.join(__dirname, '../Игра.html'), 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
  assert.doesNotMatch(html, /url\(["']?https?:/i);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 4);
  const app = appHarness({ sourceOverride: scripts.join('\n') });
  app.start();
  app.click('open-question', { question: 'history-100' });
  app.click('select-team', { team: 'team-1' }); app.click('correct');
  assert.equal(app.saved.teams[0].score, 100);
});
