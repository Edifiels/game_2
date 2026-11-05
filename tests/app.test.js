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
function appHarness({ audience = false, storage = new Map(), opener = null, sourceOverride = source } = {}) {
  const documentEvents = {};
  const windowEvents = {};
  const elements = new Map();
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
    GAME_CONTENT: content, UnityGame: engine, URL, URLSearchParams, Intl,
    document, window, location: { href: `file:///E:/game/index.html${audience ? '?audience=1' : ''}`, search: audience ? '?audience=1' : '' },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: () => 1, clearTimeout() {},
  };
  vm.runInNewContext(sourceOverride, context, { filename: 'app.js' });
  return {
    document, window, popup, storage,
    get theme() { return document.documentElement.dataset.theme; },
    get html() { return elements.get('app').innerHTML; },
    get saved() { return JSON.parse(storage.get('unity-game-v1') || 'null'); },
    click(action, dataset = {}) {
      const button = { disabled: false, dataset: { action, ...dataset } };
      documentEvents.click({ target: { closest: () => button } });
    },
    input(index, value) {
      elements.get('app').handlers.input({ target: { matches: () => true, dataset: { teamInput: String(index) }, value } });
    },
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

test('single-file offline artifact contains the actual app and needs no network files', () => {
  const html = fs.readFileSync(path.join(__dirname, '../Игра.html'), 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
  assert.doesNotMatch(html, /url\(["']?https?:/i);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 3);
  const app = appHarness({ sourceOverride: scripts.join('\n') });
  app.start();
  app.click('open-question', { question: 'history-100' });
  app.click('select-team', { team: 'team-1' }); app.click('correct');
  assert.equal(app.saved.teams[0].score, 100);
});
