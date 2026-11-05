(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UnityTimer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_REMAINING_MS = 600000;
  var DEFAULT_SETTINGS = Object.freeze({ enabled: false, thinkingSeconds: 60, answerSeconds: 30 });

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function validMode(mode) {
    return mode === 'thinking' || mode === 'answer';
  }

  function validQuestionId(questionId) {
    return typeof questionId === 'string' && questionId.length <= 64 && /^[a-z]+-\d+$/.test(questionId);
  }

  function validTimestamp(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
  }

  function normalizeSettings(value) {
    var settings = isRecord(value) ? value : {};
    function seconds(key) {
      return Number.isInteger(settings[key]) && settings[key] >= 5 && settings[key] <= 600 ? settings[key] : DEFAULT_SETTINGS[key];
    }
    return {
      enabled: typeof settings.enabled === 'boolean' ? settings.enabled : DEFAULT_SETTINGS.enabled,
      thinkingSeconds: seconds('thinkingSeconds'),
      answerSeconds: seconds('answerSeconds')
    };
  }

  function durationMs(mode, settings) {
    var normalized = normalizeSettings(settings);
    return normalized[mode === 'answer' ? 'answerSeconds' : 'thinkingSeconds'] * 1000;
  }

  function createTimer(questionId, mode, settings) {
    if (!validQuestionId(questionId)) throw new TypeError('Некорректный идентификатор вопроса для таймера.');
    if (!validMode(mode)) throw new TypeError('Некорректный режим таймера.');
    return { questionId: questionId, mode: mode, remainingMs: durationMs(mode, settings), deadline: null };
  }

  function validateTimer(value) {
    return isRecord(value) && validQuestionId(value.questionId) && validMode(value.mode) &&
      typeof value.remainingMs === 'number' && Number.isFinite(value.remainingMs) &&
      value.remainingMs >= 0 && value.remainingMs <= MAX_REMAINING_MS &&
      (value.deadline === null || validTimestamp(value.deadline));
  }

  function remainingMs(timer, now) {
    if (!validateTimer(timer)) return 0;
    var currentTime = now === undefined ? Date.now() : now;
    if (!validTimestamp(currentTime)) return 0;
    return Math.min(MAX_REMAINING_MS, Math.max(0, timer.deadline !== null ? timer.deadline - currentTime : timer.remainingMs));
  }

  function reduce(timer, action, settings, now) {
    if (!validateTimer(timer) || !isRecord(action)) return timer;
    var currentTime = now === undefined ? Date.now() : now;
    if (!validTimestamp(currentTime)) return timer;
    var remaining = remainingMs(timer, currentTime);
    switch (action.type) {
      case 'START': {
        if (timer.deadline !== null && timer.deadline > currentTime) return timer;
        var duration = remaining || durationMs(timer.mode, settings);
        if (!validTimestamp(currentTime + duration)) return timer;
        return Object.assign({}, timer, { remainingMs: duration, deadline: currentTime + duration });
      }
      case 'PAUSE':
        if (timer.deadline === null) return timer;
        return Object.assign({}, timer, { remainingMs: remaining, deadline: null });
      case 'RESET': {
        var fullDuration = durationMs(timer.mode, settings);
        if (timer.deadline === null && timer.remainingMs === fullDuration) return timer;
        return Object.assign({}, timer, { remainingMs: fullDuration, deadline: null });
      }
      case 'MODE':
        if (!validMode(action.mode) || action.mode === timer.mode) return timer;
        return Object.assign({}, timer, { mode: action.mode, remainingMs: durationMs(action.mode, settings), deadline: null });
      case 'TICK':
        if (timer.deadline === null || timer.deadline > currentTime) return timer;
        return Object.assign({}, timer, { remainingMs: 0, deadline: null });
      default:
        return timer;
    }
  }

  return {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    createTimer: createTimer,
    remainingMs: remainingMs,
    reduce: reduce,
    validateTimer: validateTimer
  };
});
