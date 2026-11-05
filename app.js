(function () {
  'use strict';
  const content = globalThis.GAME_CONTENT;
  const engine = globalThis.UnityGame;
  const countdown = globalThis.UnityTimer;
  const questions = content.categories.flatMap(category => category.questions);
  const questionMap = new Map(questions.map(question => [question.id, question]));
  const categoryMap = new Map(content.categories.flatMap(category => category.questions.map(question => [question.id, category])));
  const STORAGE_KEY = 'unity-game-v1';
  const DRAFT_KEY = 'unity-game-teams-v1';
  const THEME_KEY = 'unity-game-theme-v1';
  const TIMER_SETTINGS_KEY = 'unity-game-timer-settings-v1';
  const TIMER_KEY = 'unity-game-timer-v1';
  const isAudience = new URLSearchParams(location.search).get('audience') === '1';
  const app = document.getElementById('app');
  const dialogs = document.getElementById('dialog-root');
  const colors = ['#7b64ae', '#648565', '#b58248', '#ba7970', '#66899c', '#a56a91', '#6b8990', '#908348'];
  const lightColors = ['#eee8f7', '#eaf1e8', '#f9efdc', '#f7e9e5', '#e7f0f5', '#f5e8ef', '#e8f0f0', '#f2f0df'];
  let state = null;
  let theme = 'light';
  let timerSettings = countdown.normalizeSettings(null);
  let timer = null;
  let draft = { names: ['', ''], penalizeWrong: false };
  let audienceWindow = null;
  let channel = null;
  let storageAvailable = true;
  let toastTimeout;
  let confirmAction = null;
  let previousFocus = null;

  function esc(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  const paths = {
    unity: '<path d="M5 6v8a7 7 0 0 0 14 0V6M9 4v10a3 3 0 0 0 6 0V4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    grid: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 15h18M10 4v16m6-16v16"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    projector: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="m8 21 4-5 4 5M1 4h22"/>',
    undo: '<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3"/>',
    landmark: '<path d="m3 8 9-5 9 5H3Zm0 13h18M5 9v9m5-9v9m4-9v9m5-9v9M3 18h18"/>',
    people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
    sparkles: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Zm7 0v4m-2-2h4M4 18v4m-2-2h4"/>',
    utensils: '<path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18m13 0V3c-4 1-5 5-5 9h5"/>',
    bridge: '<path d="M3 21V5m18 16V5M1 16h22M3 8c5 9 13 9 18 0M7 13v3m5-1v1m5-3v3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    skip: '<path d="m5 5 10 7-10 7V5Zm14 0v14"/>',
    trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4m-4 2v7m-5 0h10"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    refresh: '<path d="M20 8a9 9 0 1 0 1 7M20 3v5h-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>'
  };
  function icon(name, extra = '') {
    return `<svg ${extra} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`;
  }
  function teamStyle(index) {
    return `--team-color:${colors[index % colors.length]};--team-light:${lightColors[index % colors.length]}`;
  }
  function points(number) { return new Intl.NumberFormat('ru-RU').format(number); }
  function pointWord(number) {
    const absolute = Math.abs(number);
    return absolute % 10 === 1 && absolute % 100 !== 11 ? 'балл' : absolute % 10 >= 2 && absolute % 10 <= 4 && (absolute % 100 < 12 || absolute % 100 > 14) ? 'балла' : 'баллов';
  }

  function art() {
    return '<div class="unity-art" aria-hidden="true"><svg viewBox="0 0 480 160" fill="none"><path d="M30 32v40c0 85 120 85 120 0V32" stroke="#dfd6ed" stroke-width="29"/><path d="M118 32v40c0 85 120 85 120 0V32" stroke="#b5a2d1" stroke-width="29"/><path d="M206 32v40c0 85 120 85 120 0V32" stroke="#ecd478" stroke-width="29"/><path d="M294 32v40c0 85 120 85 120 0V32" stroke="#bdcfb6" stroke-width="29"/><circle cx="30" cy="14" r="11" fill="#dfd6ed"/><circle cx="118" cy="14" r="11" fill="#b5a2d1"/><circle cx="206" cy="14" r="11" fill="#ecd478"/><circle cx="294" cy="14" r="11" fill="#bdcfb6"/><circle cx="414" cy="14" r="11" fill="#bdcfb6"/><path d="m446 89 5 12 13 5-13 5-5 12-5-12-12-5 12-5 5-12Z" fill="#b5a2d1"/></svg></div>';
  }

  function header() {
    return `<header class="topbar"><div class="brand"><div class="brand-mark">${icon('unity')}</div><div><div class="brand-name">ЕДИНСТВО</div><div class="brand-caption">Своя игра · вместе интереснее</div></div></div><div class="header-tools">${!isAudience ? themeSwitch() : ''}${isAudience ? `<div class="audience-banner">${icon('projector')}<span>Экран для участников</span></div>` : `${!state ? '<span class="tag pill setup-top-tag">Один раунд · 20 вопросов</span>' : `<button class="button ghost" data-action="undo" ${!state.history.length ? 'disabled' : ''} title="Отменить последнее действие (Ctrl+Z / Cmd+Z)" aria-label="Отменить последнее действие">${icon('undo')}<span class="button-label">Отменить</span></button><button class="button ghost" data-action="new-game" title="Начать новую игру">${icon('refresh')}<span class="button-label">Новая игра</span></button>`}<button class="button secondary" data-action="projector" title="Открыть отдельное окно для проектора" aria-label="Экран для проектора">${icon('projector')}<span class="button-label">Экран для проектора</span></button>`}<button class="button secondary icon-button" data-action="fullscreen" title="Полноэкранный режим" aria-label="Полноэкранный режим">${icon('fullscreen')}</button></div></header>`;
  }

  function themeSwitch() {
    return `<div class="theme-switch" role="group" aria-label="Оформление"><button class="theme-option" data-action="set-theme" data-theme="light" aria-pressed="${theme === 'light'}" title="Светлая тема">${icon('sun')}<span>Светлая</span></button><button class="theme-option" data-action="set-theme" data-theme="classic" aria-pressed="${theme === 'classic'}" title="Классическая синяя тема">${icon('grid')}<span>Классика</span></button></div>`;
  }

  function ensureQuestionTimer() {
    if (state?.current && !state.current.resolved && (!timer || timer.questionId !== state.current.questionId)) {
      timer = countdown.createTimer(state.current.questionId, 'thinking', timerSettings);
    }
  }

  function timerSeconds(mode = timer?.mode || 'thinking') {
    return mode === 'answer' ? timerSettings.answerSeconds : timerSettings.thinkingSeconds;
  }

  function timerTime(milliseconds) {
    const seconds = Math.ceil(milliseconds / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function timerStatus(remaining) {
    if (remaining === 0) return 'Время вышло';
    if (timer.deadline !== null) return 'Идёт отсчёт';
    return remaining === timerSeconds() * 1000 ? 'Готов к запуску' : 'Пауза';
  }

  function timerPanel() {
    if (!state?.current || state.current.resolved || !timer) return '';
    if (isAudience && !timerSettings.enabled) return '';
    const remaining = countdown.remainingMs(timer, Date.now());
    const running = timer.deadline !== null && remaining > 0;
    const modeLabel = timer.mode === 'answer' ? 'На ответ' : 'На размышление';
    const readout = `<div class="timer-readout"><strong data-timer-count role="timer" aria-live="off">${timerTime(remaining)}</strong><span data-timer-status aria-live="polite">${timerStatus(remaining)}</span></div>`;
    const progress = `<div class="timer-track" aria-hidden="true"><span data-timer-progress style="width:${Math.min(100, remaining / (timerSeconds() * 10))}%"></span></div>`;
    if (isAudience) return `<section class="question-timer audience-timer ${remaining === 0 ? 'timer-expired' : ''}" aria-label="Таймер вопроса"><div class="timer-audience-label">${icon('clock')}<span data-timer-mode>${modeLabel}</span></div>${readout}${progress}</section>`;
    return `<section class="question-timer ${timerSettings.enabled && remaining === 0 ? 'timer-expired' : ''}" aria-label="Таймер вопроса"><div class="timer-heading"><span>${icon('clock')}Таймеры</span><label class="timer-enable-label" for="timer-enabled">Включить<input class="toggle" id="timer-enabled" type="checkbox" ${timerSettings.enabled ? 'checked' : ''}></label></div>${timerSettings.enabled ? `<div class="timer-main"><div class="timer-modes" role="group" aria-label="Этап таймера"><button class="timer-mode" data-action="timer-mode" data-mode="thinking" aria-pressed="${timer.mode === 'thinking'}">На размышление</button><button class="timer-mode" data-action="timer-mode" data-mode="answer" aria-pressed="${timer.mode === 'answer'}">На ответ</button></div><label class="timer-duration">Секунд<input data-timer-duration="${timer.mode}" type="number" min="5" max="600" step="1" value="${timerSeconds()}" aria-label="${modeLabel}: длительность в секундах"></label>${readout}<button class="button primary" data-action="timer-toggle">${icon(running ? 'pause' : 'play')}${running ? 'Пауза' : remaining === 0 ? 'Ещё раз' : 'Старт'}</button><button class="button secondary icon-button" data-action="timer-reset" aria-label="Сбросить таймер" title="Сбросить таймер">${icon('refresh')}</button></div>${progress}` : ''}</section>`;
  }

  function pauseTimer() {
    if (timer) timer = countdown.reduce(timer, { type: 'PAUSE' }, timerSettings, Date.now());
  }

  function updateTimer(action) {
    if (isAudience || !timerSettings.enabled || !state?.current || state.current.resolved || !timer) return;
    timer = countdown.reduce(timer, action, timerSettings, Date.now());
    persist();
    render();
    syncAudience();
  }

  function enableTimers(enabled) {
    if (isAudience || !state?.current || state.current.resolved || timerSettings.enabled === enabled) return;
    pauseTimer();
    timerSettings = { ...timerSettings, enabled };
    ensureQuestionTimer();
    persist();
    render();
    syncAudience();
  }

  function tickTimer() {
    if (!timerSettings.enabled || !timer || !state?.current || state.current.resolved) return;
    const now = Date.now();
    const remaining = countdown.remainingMs(timer, now);
    if (!isAudience && timer.deadline !== null && remaining === 0) {
      timer = countdown.reduce(timer, { type: 'TICK' }, timerSettings, now);
      persist();
      syncAudience();
      toast('Время вышло. Решение об ответе принимает ведущий.');
      const button = app.querySelector('[data-action="timer-toggle"]');
      if (button) button.innerHTML = `${icon('play')}Ещё раз`;
    }
    const count = app.querySelector('[data-timer-count]');
    const status = app.querySelector('[data-timer-status]');
    const progress = app.querySelector('[data-timer-progress]');
    const panel = app.querySelector('.question-timer');
    if (count && count.textContent !== timerTime(remaining)) count.textContent = timerTime(remaining);
    if (status && status.textContent !== timerStatus(remaining)) status.textContent = timerStatus(remaining);
    if (progress) progress.style.width = `${Math.min(100, remaining / (timerSeconds() * 10))}%`;
    if (panel) panel.classList.toggle('timer-expired', remaining === 0);
  }

  function setupView() {
    return `<main class="setup-layout"><section class="intro"><div class="eyebrow">4 ноября · День народного единства</div><h1 class="display">В единстве<br>— <em>сила.</em></h1><p class="intro-text">Разные народы. Общая история.<br>Объединяйтесь в команды, открывайте вопросы и узнавайте Россию вместе.</p><div class="intro-stats"><div class="stat"><strong>5</strong><span>интересных тем</span></div><div class="stat"><strong>20</strong><span>вопросов на поле</span></div><div class="stat"><strong>5 000</strong><span>баллов в игре</span></div></div>${art()}<div class="small-note">${icon('heart')}Побеждают знания. Объединяет игра.</div></section><section class="setup-card" aria-labelledby="teams-title"><div class="section-heading"><h2 id="teams-title">Кто сегодня играет?</h2><span class="tag pill">${draft.names.length} из 8 команд</span></div><p class="section-description">Придумайте названия команд —<br>они появятся на игровом поле и в финале.</p><form id="setup-form"><div class="teams-form">${draft.names.map((name, index) => `<div class="team-input-row"><label class="team-number" style="${teamStyle(index)}" for="team-${index}">${String(index + 1).padStart(2, '0')}</label><input id="team-${index}" name="team-${index}" data-team-input="${index}" value="${esc(name)}" maxlength="40" placeholder="Название команды ${index + 1}" aria-label="Название команды ${index + 1}" autocomplete="off">${draft.names.length > 2 ? `<button class="remove-team" type="button" data-action="remove-team" data-index="${index}" aria-label="Убрать команду ${index + 1}">${icon('close')}</button>` : '<span class="remove-placeholder"></span>'}</div>`).join('')}</div><button type="button" class="button add-team" data-action="add-team" ${draft.names.length >= 8 ? 'disabled' : ''}>${icon('plus')}Добавить команду</button><label class="rules-setting"><span><strong>Штраф за неверный ответ</strong><small>Вычитать стоимость вопроса из счёта команды</small></span><input class="toggle" id="penalty-toggle" type="checkbox" ${draft.penalizeWrong ? 'checked' : ''} aria-label="Штраф за неверный ответ"></label><p id="form-error" class="form-error" role="alert" hidden></p><button class="button primary start-button" type="submit"><span>Начать игру</span>${icon('arrow')}</button></form><div class="small-note setup-hint">${icon('shield')}Без регистрации. Без интернета. Всё готово.</div></section></main><footer class="setup-footer"><div class="steps"><span class="step"><b>1</b>Выберите вопрос</span><span class="step"><b>2</b>Назовите команду</span><span class="step"><b>3</b>Оцените ответ</span></div><span>Вы — ведущий. <strong>Игра под вашим управлением.</strong></span></footer>`;
  }

  function scoreBoard() {
    const leadingScore = Math.max(...state.teams.map(team => team.score));
    return `<section class="scoreboard" aria-label="Счёт команд">${state.teams.map(team => `<div class="score-card ${leadingScore > 0 && team.score === leadingScore ? 'leading' : ''}" style="${teamStyle(team.colorIndex)}"><span class="team-dot"></span><span class="score-name" title="${esc(team.name)}">${esc(team.name)}</span><strong class="score-value">${points(team.score)}<span class="sr-only"> ${pointWord(team.score)}</span></strong></div>`).join('')}</section>`;
  }

  function boardView() {
    const answered = state.usedQuestionIds.length;
    return `<main><div class="game-heading"><div><div class="eyebrow">Один раунд · Пять тем</div><h1 class="display">В единстве — сила</h1></div><div class="game-progress"><div class="progress-label"><span>Сыграно вопросов</span><strong>${answered} / 20</strong></div><div class="progress-track" role="progressbar" aria-label="Сыграно вопросов" aria-valuenow="${answered}" aria-valuemin="0" aria-valuemax="20"><span style="width:${answered * 5}%"></span></div></div></div>${scoreBoard()}<section class="game-board" aria-label="Игровое поле">${content.categories.map((category, index) => `<section class="category-row" aria-labelledby="category-${category.id}"><div class="category-heading"><div class="category-icon">${icon(category.icon)}<span>ТЕМА 0${index + 1}</span></div><h2 id="category-${category.id}">${esc(category.title)}</h2></div>${category.questions.map(question => { const used = state.usedQuestionIds.includes(question.id); const pending = (state.pendingQuestions || []).some(item => item.questionId === question.id); return `<button class="question-tile ${used ? 'used' : ''} ${pending ? 'pending' : ''} ${isAudience ? 'audience-tile' : ''}" ${used || isAudience ? 'disabled' : ''} data-action="open-question" data-question="${question.id}" aria-label="${esc(category.title)}, ${question.value} баллов${used ? ', сыгран' : ''}">${used ? icon('check') : `${question.value}<small>баллов</small>`}</button>`; }).join('')}</section>`).join('')}</section><footer class="board-footer"><div class="board-caption">${icon(answered === 20 ? 'trophy' : 'info')}${answered === 20 ? 'Все вопросы сыграны. Время узнать победителя!' : isAudience ? 'Выбирайте тему и стоимость вопроса' : 'Выберите вопрос, а затем команду, которая отвечает'}${!isAudience && state.penalizeWrong ? ' · Штрафы включены' : ''}</div>${!isAudience ? `<div class="board-actions"><span class="save-indicator"><i class="save-dot"></i>${storageAvailable ? 'Игра сохраняется' : 'Сохранение недоступно'}</span><button class="button ${answered === 20 ? 'primary' : 'secondary'}" data-action="finish">${icon('trophy')}Подвести итоги</button></div>` : '<span class="tag pill">Одна страна. Много историй.</span>'}</footer></main>${state.current ? questionView() : ''}`;
  }

  function questionView() {
    const current = state.current;
    const question = questionMap.get(current.questionId);
    const category = categoryMap.get(question.id);
    const selectedTeam = state.teams.find(team => team.id === current.selectedTeamId);
    const winner = state.teams.find(team => team.id === current.winnerTeamId);
    const answer = current.answerVisible ? `<section class="answer-box" aria-label="Правильный ответ"><div class="eyebrow">Правильный ответ</div><div class="answer-text">${esc(question.answer)}</div></section>` : '';
    let controls;
    if (isAudience) {
      controls = `<div class="audience-status">${icon(current.resolved ? (winner ? 'check' : 'eye') : 'people')}${winner ? `${esc(winner.name)} <strong class="outcome-points">+${question.value}</strong>` : current.resolved ? 'Вопрос сыгран' : selectedTeam ? `Отвечает команда «${esc(selectedTeam.name)}»` : 'Команды, ваш ответ!'}</div><span class="tag pill">${current.resolved ? 'Ответ открыт' : 'Обсуждаем вместе'}</span>`;
    } else if (current.resolved) {
      controls = `<div class="question-feedback"><div class="outcome-copy"><span class="outcome-icon">${icon(winner ? 'check' : 'skip')}</span><div>${winner ? `${esc(winner.name)} <span class="outcome-points">+${question.value}</span>` : current.outcome === 'exhausted' ? 'Команды ответили — идём дальше' : 'Вопрос пропущен'}<small>${winner ? 'Верный ответ! Баллы уже на счёте.' : 'Правильный ответ открыт. Баллы не начислены.'}</small></div></div><button class="button primary" data-action="close-question">К игровому полю${icon('arrow')}</button></div>`;
    } else {
      controls = `<div class="team-picker-heading"><strong>Кто отвечает?</strong><span>${current.attemptedTeamIds.length ? 'Слово другой команде' : 'Выберите команду перед оценкой ответа'}</span></div><div class="team-picker">${state.teams.map(team => { const attempted = current.attemptedTeamIds.includes(team.id); return `<button class="team-choice ${current.selectedTeamId === team.id ? 'selected' : ''}" style="${teamStyle(team.colorIndex)}" data-action="select-team" data-team="${team.id}" ${attempted ? 'disabled' : ''} aria-pressed="${current.selectedTeamId === team.id}"><i class="team-dot"></i><span>${esc(team.name)}</span>${attempted ? icon('check') : ''}</button>`; }).join('')}</div><div class="judgement"><button class="button correct" data-action="correct" ${!selectedTeam ? 'disabled' : ''}>${icon('check')}Верно · +${question.value}</button><button class="button incorrect" data-action="incorrect" ${!selectedTeam ? 'disabled' : ''}>${icon('close')}Неверно${state.penalizeWrong ? ` · −${question.value}` : ''}</button><button class="button secondary" data-action="pass-team" ${!selectedTeam ? 'disabled' : ''} title="Команда пропускает ответ без штрафа">${icon('skip')}Пас</button><span class="judge-spacer"></span><button class="button ghost" data-action="reveal" ${current.answerVisible ? 'disabled' : ''}>${icon('eye')}Ответ</button><button class="button ghost" data-action="skip-question" title="Пропустить весь вопрос без начисления баллов">Пропустить вопрос</button></div>`;
    }
    return `<div class="question-layer ${isAudience ? 'audience-question' : ''}"><section class="question-dialog" ${!isAudience ? 'role="dialog" aria-modal="true"' : ''} aria-labelledby="question-text"><header class="question-top"><div class="question-meta">${icon(category.icon)}<span>${esc(category.title)}</span><span class="question-price">${question.value} баллов</span></div>${!isAudience ? `<button class="button ghost icon-button" data-action="close-question" aria-label="Вернуться к игровому полю" title="К полю (Esc)">${icon('close')}</button>` : '<span class="eyebrow">Своя игра</span>'}</header><div class="question-body"><h2 id="question-text" class="${question.text.length > 240 ? 'long' : ''}">${esc(question.text)}</h2>${answer}</div>${timerPanel()}<div class="question-controls">${controls}</div></section></div>`;
  }

  function resultsView() {
    const sorted = [...state.teams].sort((first, second) => second.score - first.score);
    const winners = sorted.filter(team => team.score === sorted[0].score);
    const isTie = winners.length > 1;
    return `<main class="results"><div class="eyebrow">День народного единства · Итоги игры</div><h1 class="display">${isTie ? 'Победа, которую делят!' : 'Вот это команда!'}</h1><p class="results-subtitle">${isTie ? 'Одинаковый результат — общий повод для аплодисментов.' : 'Знания, смекалка и командный дух привели вас к победе.'}</p><section class="winner-card" aria-label="Победители"><div class="trophy">${icon('trophy')}</div><div class="winner-label">${isTie ? 'Победители игры' : 'Победитель игры'}</div><h2 class="winner-name">${winners.map(team => esc(team.name)).join('<br>')}</h2><div class="winner-score">${points(sorted[0].score)} ${pointWord(sorted[0].score)}${isTie ? ' у каждой команды' : ''}</div></section><section class="ranking" aria-label="Итоговый счёт">${sorted.map((team, index) => `<div class="ranking-row" style="${teamStyle(team.colorIndex)}"><span class="ranking-rank">${sorted.findIndex(other => other.score === team.score) + 1}</span><i class="team-dot"></i><span class="ranking-name">${esc(team.name)}</span><strong>${points(team.score)} <small>${pointWord(team.score)}</small></strong></div>`).join('')}</section>${!isAudience ? `<div class="results-actions"><button class="button secondary" data-action="resume">${icon('back')}К игровому полю</button><button class="button primary" data-action="new-game">Сыграть ещё раз${icon('refresh')}</button></div>` : '<div style="height:24px"></div>'}<p class="results-footnote">Сыграно ${state.usedQuestionIds.length} из 20 вопросов · Спасибо за игру. Мы разные — и мы вместе.</p></main>`;
  }

  function waitingView() {
    return `<main class="audience-waiting"><div class="eyebrow">4 ноября · День народного единства</div><h1 class="display">В единстве<br>— <span style="color:var(--purple)">сила.</span></h1><p>Придумайте название своей команды.<br>Скоро узнаем, кто лучше знает Россию!</p>${art()}<div class="audience-teams">${draft.names.map((name, index) => `<span class="team-choice" style="${teamStyle(index)}"><i class="team-dot"></i>${esc(name.trim() || `Команда ${index + 1}`)}</span>`).join('')}</div></main>`;
  }

  function render(focusAction) {
    document.documentElement.dataset.theme = theme;
    const previous = document.activeElement;
    const activeAction = focusAction || previous?.dataset?.action;
    const activeTeam = previous?.dataset?.team;
    app.innerHTML = `<div class="app-shell ${isAudience ? 'audience-shell' : ''} ${state?.teams.length > 4 ? 'many-teams' : ''}">${header()}${!state ? (isAudience ? waitingView() : setupView()) : state.phase === 'finished' ? resultsView() : boardView()}</div>`;
    if (!isAudience) {
      let target;
      if (activeAction === 'set-theme') target = app.querySelector(`[data-action="set-theme"][data-theme="${theme}"]`);
      else if (activeAction === 'select-team' && activeTeam) target = app.querySelector(`[data-action="select-team"][data-team="${activeTeam}"]:not(:disabled)`);
      else if (activeAction) target = app.querySelector(`[data-action="${activeAction}"]:not(:disabled)`);
      if (state?.current?.resolved) target = app.querySelector('.question-feedback [data-action="close-question"]');
      target?.focus({ preventScroll: true });
    }
  }

  function toast(message) {
    const element = document.getElementById('toast');
    clearTimeout(toastTimeout);
    element.textContent = message;
    element.classList.add('visible');
    toastTimeout = setTimeout(() => element.classList.remove('visible'), 3600);
  }

  function persist() {
    if (isAudience) return;
    try {
      if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      else localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      localStorage.setItem(THEME_KEY, theme);
      localStorage.setItem(TIMER_SETTINGS_KEY, JSON.stringify(timerSettings));
      if (state && timer) localStorage.setItem(TIMER_KEY, JSON.stringify({ gameStartedAt: state.startedAt, timer }));
      else localStorage.removeItem(TIMER_KEY);
      storageAvailable = true;
    } catch (_) {
      if (storageAvailable) toast('Браузер не разрешил сохранение. Держите это окно открытым до конца игры.');
      storageAvailable = false;
    }
  }

  function syncAudience() {
    if (isAudience) return;
    const message = { type: 'unity-game-state', state, draft, theme, timerSettings, timer };
    if (audienceWindow && !audienceWindow.closed) audienceWindow.postMessage(message, '*');
    try { channel?.postMessage(message); } catch (_) { /* Direct popup sync remains available. */ }
  }

  function update(action, focusAction) {
    if (isAudience || !state) return;
    const nextState = engine.reduce(state, action, questions);
    if (nextState === state) return;
    const previousTeamId = state.current?.selectedTeamId;
    state = nextState;
    if (['CLOSE_QUESTION', 'ANSWER', 'PASS_TEAM', 'SKIP_QUESTION', 'REVEAL_ANSWER', 'FINISH', 'UNDO'].includes(action.type)) pauseTimer();
    if (action.type === 'SELECT_TEAM' && timer?.mode === 'answer' && previousTeamId !== state.current?.selectedTeamId) {
      timer = countdown.reduce(timer, { type: 'RESET' }, timerSettings, Date.now());
    }
    ensureQuestionTimer();
    persist();
    render(focusAction);
    syncAudience();
  }

  function saveDraft() { persist(); syncAudience(); }

  function startGame() {
    const names = draft.names.map((name, index) => name.trim() || `Команда ${index + 1}`);
    try {
      state = engine.createState(names, questions, { penalizeWrong: draft.penalizeWrong });
      timer = null;
      draft.names = names;
      persist();
      render();
      syncAudience();
      toast('Игра началась. Выберите первый вопрос!');
    } catch (_) {
      const error = document.getElementById('form-error');
      error.textContent = 'Названия команд должны различаться. Используйте до 40 символов.';
      error.hidden = false;
    }
  }

  function closeConfirm() {
    dialogs.innerHTML = '';
    confirmAction = null;
    previousFocus?.focus?.({ preventScroll: true });
  }

  function confirm(title, description, label, callback) {
    previousFocus = document.activeElement;
    confirmAction = callback;
    dialogs.innerHTML = `<div class="dialog-overlay"><section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description"><h2 id="confirm-title">${esc(title)}</h2><p id="confirm-description">${esc(description)}</p><div class="confirm-actions"><button class="button secondary" data-action="cancel-confirm">Отмена</button><button class="button primary" data-action="accept-confirm">${esc(label)}</button></div></section></div>`;
    dialogs.querySelector('[data-action="cancel-confirm"]').focus();
  }

  function requestFinish() {
    if (state.usedQuestionIds.length === questions.length) update({ type: 'FINISH' });
    else confirm('Подвести итоги сейчас?', `Сыграно ${state.usedQuestionIds.length} из 20 вопросов. Покажем победителя по текущему счёту. Вернуться к оставшимся вопросам можно с экрана итогов.`, 'Показать итоги', () => update({ type: 'FINISH' }));
  }

  function requestNewGame() {
    confirm('Начать новую игру?', 'Текущий счёт и сыгранные вопросы будут сброшены. Названия команд сохранятся, и их можно будет изменить.', 'Новая игра', () => {
      draft = { names: state.teams.map(team => team.name), penalizeWrong: state.penalizeWrong };
      state = null;
      timer = null;
      persist();
      render();
      syncAudience();
    });
  }

  function openProjector() {
    const url = new URL(location.href);
    url.searchParams.set('audience', '1');
    url.searchParams.set('theme', theme);
    audienceWindow = window.open(url.href, 'unity-game-audience', 'popup=yes,width=1280,height=800');
    if (audienceWindow) {
      syncAudience();
      toast('Перенесите новое окно на проектор и включите в нём полный экран.');
    } else toast('Разрешите всплывающие окна для игры, затем нажмите «Экран для проектора» ещё раз.');
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_) { toast('Включите полноэкранный режим через меню браузера.'); }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'fullscreen') { fullscreen(); return; }
    if (isAudience) return;
    if (action === 'cancel-confirm') { closeConfirm(); return; }
    if (action === 'accept-confirm') { const callback = confirmAction; closeConfirm(); callback?.(); return; }
    if (confirmAction) return;
    switch (action) {
      case 'timer-mode': updateTimer({ type: 'MODE', mode: button.dataset.mode }); break;
      case 'timer-toggle': updateTimer({ type: timer?.deadline !== null && timer?.deadline > Date.now() ? 'PAUSE' : 'START' }); break;
      case 'timer-reset': updateTimer({ type: 'RESET' }); break;
      case 'set-theme':
        if (!['light', 'classic'].includes(button.dataset.theme) || button.dataset.theme === theme) break;
        theme = button.dataset.theme;
        persist();
        render();
        syncAudience();
        break;
      case 'add-team':
        if (draft.names.length >= 8) break;
        draft.names.push(''); saveDraft(); render();
        document.getElementById(`team-${draft.names.length - 1}`).focus();
        break;
      case 'remove-team':
        if (draft.names.length <= 2) break;
        draft.names.splice(Number(button.dataset.index), 1); saveDraft(); render('add-team');
        break;
      case 'projector': openProjector(); break;
      case 'new-game': requestNewGame(); break;
      case 'finish': requestFinish(); break;
      case 'resume': update({ type: 'RESUME' }); break;
      case 'undo':
        if (state?.history.length) { update({ type: 'UNDO' }); toast('Последнее действие отменено'); }
        break;
      case 'open-question': update({ type: 'OPEN_QUESTION', questionId: button.dataset.question }, 'close-question'); break;
      case 'close-question': {
        const questionId = state?.current?.questionId;
        update({ type: 'CLOSE_QUESTION' });
        app.querySelector(`[data-question="${questionId}"]:not(:disabled)`)?.focus();
        break;
      }
      case 'select-team': update({ type: 'SELECT_TEAM', teamId: button.dataset.team }); break;
      case 'correct': update({ type: 'ANSWER', correct: true }); break;
      case 'incorrect': {
        const question = questionMap.get(state.current.questionId);
        const penalty = state.penalizeWrong;
        update({ type: 'ANSWER', correct: false });
        toast(state.current?.resolved ? 'Все команды ответили. Правильный ответ открыт.' : penalty ? `Неверно: −${question.value}. Слово другой команде.` : 'Неверный ответ. Слово другой команде.');
        break;
      }
      case 'pass-team': update({ type: 'PASS_TEAM' }); toast(state.current?.resolved ? 'Все команды ответили. Правильный ответ открыт.' : 'Пас без штрафа. Слово другой команде.'); break;
      case 'reveal': update({ type: 'REVEAL_ANSWER' }); break;
      case 'skip-question': update({ type: 'SKIP_QUESTION' }); break;
    }
  });

  app.addEventListener('submit', event => {
    if (event.target.id === 'setup-form') { event.preventDefault(); startGame(); }
  });
  app.addEventListener('input', event => {
    if (isAudience) return;
    if (event.target.id === 'timer-enabled') { enableTimers(event.target.checked); return; }
    if (event.target.matches('[data-team-input]')) {
      draft.names[Number(event.target.dataset.teamInput)] = event.target.value;
      const error = document.getElementById('form-error');
      if (error) error.hidden = true;
      saveDraft();
    }
    if (event.target.id === 'penalty-toggle') { draft.penalizeWrong = event.target.checked; saveDraft(); }
  });
  app.addEventListener('change', event => {
    if (isAudience || !event.target.matches('[data-timer-duration]') || !state?.current || state.current.resolved) return;
    const mode = event.target.dataset.timerDuration;
    const seconds = Number(event.target.value);
    if (!['thinking', 'answer'].includes(mode)) return;
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 600) {
      event.target.value = String(timerSeconds(mode));
      toast('Задайте от 5 до 600 секунд.');
      return;
    }
    timerSettings = { ...timerSettings, [mode === 'answer' ? 'answerSeconds' : 'thinkingSeconds']: seconds };
    if (timer?.mode === mode) timer = countdown.reduce(timer, { type: 'RESET' }, timerSettings, Date.now());
    persist();
    render();
    syncAudience();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      const dialog = dialogs.querySelector('[role="dialog"]') || app.querySelector('[role="dialog"]');
      if (dialog) {
        const buttons = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    }
    if (isAudience) return;
    if (event.key === 'Escape') {
      if (confirmAction) closeConfirm();
      else if (state?.current) update({ type: 'CLOSE_QUESTION' });
    }
    const isEditing = /INPUT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !isEditing && !confirmAction && state?.history.length) {
      event.preventDefault(); update({ type: 'UNDO' }); toast('Последнее действие отменено');
    }
  });

  function applyAudienceMessage(message) {
    if (!isAudience || message?.type !== 'unity-game-state') return;
    if (message.state !== null && !engine.validateState(message.state, questions)) return;
    state = message.state;
    if (message.theme === 'light' || message.theme === 'classic') theme = message.theme;
    if (message.timerSettings) timerSettings = countdown.normalizeSettings(message.timerSettings);
    if (Object.prototype.hasOwnProperty.call(message, 'timer')) {
      timer = countdown.validateTimer(message.timer) && questionMap.has(message.timer.questionId) ? message.timer : null;
    }
    ensureQuestionTimer();
    if (message.draft && Array.isArray(message.draft.names) && message.draft.names.length >= 2 && message.draft.names.length <= 8 && message.draft.names.every(name => typeof name === 'string' && name.length <= 40)) draft = message.draft;
    render();
  }
  window.addEventListener('message', event => {
    if (isAudience && event.source === window.opener) applyAudienceMessage(event.data);
    else if (!isAudience && event.source === audienceWindow && event.data?.type === 'unity-game-ready') syncAudience();
  });
  try {
    channel = new BroadcastChannel('unity-game-projector-v1');
    if (isAudience) channel.onmessage = event => applyAudienceMessage(event.data);
  } catch (_) { /* postMessage works with local files too. */ }

  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'light' || savedTheme === 'classic') theme = savedTheme;
    const savedDraft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (savedDraft && Array.isArray(savedDraft.names) && savedDraft.names.length >= 2 && savedDraft.names.length <= 8 && savedDraft.names.every(name => typeof name === 'string' && name.length <= 40)) draft = { names: savedDraft.names, penalizeWrong: savedDraft.penalizeWrong === true };
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (savedState && engine.validateState(savedState, questions)) state = savedState;
  } catch (_) { storageAvailable = false; }
  try {
    timerSettings = countdown.normalizeSettings(JSON.parse(localStorage.getItem(TIMER_SETTINGS_KEY) || 'null'));
    const savedTimer = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null');
    if (state && savedTimer?.gameStartedAt === state.startedAt && countdown.validateTimer(savedTimer.timer) && questionMap.has(savedTimer.timer.questionId)) timer = savedTimer.timer;
  } catch (_) { /* Invalid timer preferences do not prevent restoring the game. */ }
  ensureQuestionTimer();
  if (!state?.current || state.current.resolved || !timerSettings.enabled) pauseTimer();
  if (isAudience) {
    const requestedTheme = new URLSearchParams(location.search).get('theme');
    if (requestedTheme === 'light' || requestedTheme === 'classic') theme = requestedTheme;
    document.title = 'В единстве — сила · Экран участников';
    if (window.opener) window.opener.postMessage({ type: 'unity-game-ready' }, '*');
    window.addEventListener('storage', event => {
      if (event.key === TIMER_SETTINGS_KEY) {
        try { timerSettings = countdown.normalizeSettings(JSON.parse(event.newValue || 'null')); render(); } catch (_) { /* Keep valid settings. */ }
      }
      if (event.key === TIMER_KEY) {
        try {
          const savedTimer = JSON.parse(event.newValue || 'null');
          if (savedTimer === null) { timer = null; render(); }
          else if (savedTimer.gameStartedAt === state?.startedAt && countdown.validateTimer(savedTimer.timer) && questionMap.has(savedTimer.timer.questionId)) { timer = savedTimer.timer; render(); }
        } catch (_) { /* Wait for the next valid timer update. */ }
      }
      if (event.key === THEME_KEY && (event.newValue === 'light' || event.newValue === 'classic')) {
        theme = event.newValue;
        render();
      }
      if (event.key === STORAGE_KEY) {
        try { const next = event.newValue ? JSON.parse(event.newValue) : null; if (next === null || engine.validateState(next, questions)) { state = next; ensureQuestionTimer(); render(); } } catch (_) { /* Wait for the next valid update. */ }
      }
    });
  }
  render();
  setInterval(tickTimer, 250);
  if (state && !isAudience) toast('Игра восстановлена. Продолжаем с сохранённого места.');
})();
