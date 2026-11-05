(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.UnityGame = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HISTORY_LIMIT = 60;
  var TEAM_LIMIT = 8;

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function normalizedName(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  }

  function unique(values) {
    return new Set(values).size === values.length;
  }

  function getQuestions(questions) {
    if (!Array.isArray(questions) || questions.length === 0) return null;
    var entries = new Map();
    for (var i = 0; i < questions.length; i += 1) {
      var question = questions[i];
      if (!isRecord(question) || typeof question.id !== "string" || !question.id ||
          entries.has(question.id) || !Number.isSafeInteger(question.value) || question.value <= 0) return null;
      entries.set(question.id, question);
    }
    return entries;
  }

  function createState(teamNames, questions, options) {
    if (!getQuestions(questions)) throw new TypeError("Некорректный список вопросов.");
    if (!Array.isArray(teamNames) || teamNames.length < 2 || teamNames.length > TEAM_LIMIT) {
      throw new TypeError("Добавьте от 2 до 8 команд.");
    }
    var names = teamNames.map(normalizedName);
    if (names.some(function (name) { return !name || name.length > 40; }) ||
        !unique(names.map(function (name) { return name.toLocaleLowerCase("ru"); }))) {
      throw new TypeError("Названия команд должны быть разными и содержать от 1 до 40 символов.");
    }
    return {
      version: 1,
      phase: "playing",
      teams: names.map(function (name, index) {
        return { id: "team-" + (index + 1), name: name, score: 0, colorIndex: index };
      }),
      usedQuestionIds: [],
      current: null,
      pendingQuestions: [],
      history: [],
      penalizeWrong: Boolean(options && options.penalizeWrong),
      startedAt: new Date().toISOString()
    };
  }

  function validSnapshot(state, questions) {
    if (!isRecord(state) || state.version !== 1 ||
        (state.phase !== "playing" && state.phase !== "finished") ||
        typeof state.penalizeWrong !== "boolean" || typeof state.startedAt !== "string" ||
        !Number.isFinite(Date.parse(state.startedAt)) || !Array.isArray(state.teams) ||
        state.teams.length < 2 || state.teams.length > TEAM_LIMIT) return false;
    var teamIds = [];
    var names = [];
    for (var i = 0; i < state.teams.length; i += 1) {
      var team = state.teams[i];
      if (!isRecord(team) || typeof team.id !== "string" || !/^team-[1-8]$/.test(team.id) ||
          typeof team.name !== "string" || team.name !== normalizedName(team.name) ||
          !team.name || team.name.length > 40 || !Number.isSafeInteger(team.score) ||
          !Number.isInteger(team.colorIndex) || team.colorIndex < 0 || team.colorIndex >= TEAM_LIMIT) return false;
      teamIds.push(team.id);
      names.push(team.name.toLocaleLowerCase("ru"));
    }
    if (!unique(teamIds) || !unique(names) || !Array.isArray(state.usedQuestionIds) ||
        !unique(state.usedQuestionIds) || !state.usedQuestionIds.every(function (id) { return questions.has(id); })) return false;
    var pending = state.pendingQuestions === undefined ? [] : state.pendingQuestions;
    if (!Array.isArray(pending) || pending.length > questions.size ||
        !pending.every(function (entry) {
          return validProgress(entry, questions, teamIds, state.usedQuestionIds) && !entry.resolved &&
            (!state.current || entry.questionId !== state.current.questionId);
        }) || !unique(pending.map(function (entry) { return entry.questionId; }))) return false;
    return state.current === null || (state.phase !== "finished" &&
      validProgress(state.current, questions, teamIds, state.usedQuestionIds));
  }

  function validProgress(current, questions, teamIds, usedQuestionIds) {
    if (!isRecord(current) || !questions.has(current.questionId) ||
        typeof current.answerVisible !== "boolean" || typeof current.resolved !== "boolean" ||
        !Array.isArray(current.attemptedTeamIds) || !unique(current.attemptedTeamIds) ||
        !current.attemptedTeamIds.every(function (id) { return teamIds.includes(id); }) ||
        (current.selectedTeamId !== null && !teamIds.includes(current.selectedTeamId))) return false;
    if (!current.resolved) {
      return current.outcome === null && current.winnerTeamId === null &&
        !usedQuestionIds.includes(current.questionId) &&
        !current.attemptedTeamIds.includes(current.selectedTeamId) && current.attemptedTeamIds.length < teamIds.length;
    }
    if (!usedQuestionIds.includes(current.questionId) || !current.answerVisible) return false;
    if (current.outcome === "correct") {
      return teamIds.includes(current.winnerTeamId) && current.selectedTeamId === current.winnerTeamId &&
        !current.attemptedTeamIds.includes(current.winnerTeamId);
    }
    return (current.outcome === "skipped" ||
      (current.outcome === "exhausted" && current.attemptedTeamIds.length === teamIds.length)) &&
      current.winnerTeamId === null && current.selectedTeamId === null;
  }

  function validateState(state, questions) {
    var entries = getQuestions(questions);
    if (!entries || !validSnapshot(state, entries) || !Array.isArray(state.history) || state.history.length > HISTORY_LIMIT) return false;
    return state.history.every(function (entry) {
      return isRecord(entry) && !Object.prototype.hasOwnProperty.call(entry, "history") && validSnapshot(entry, entries);
    });
  }

  function snapshot(state) {
    return {
      version: state.version,
      phase: state.phase,
      teams: state.teams.map(function (team) { return Object.assign({}, team); }),
      usedQuestionIds: state.usedQuestionIds.slice(),
      current: state.current ? Object.assign({}, state.current, { attemptedTeamIds: state.current.attemptedTeamIds.slice() }) : null,
      pendingQuestions: (state.pendingQuestions || []).map(function (entry) {
        return Object.assign({}, entry, { attemptedTeamIds: entry.attemptedTeamIds.slice() });
      }),
      penalizeWrong: state.penalizeWrong,
      startedAt: state.startedAt
    };
  }

  function resolveQuestion(state, outcome, winnerTeamId) {
    state.current.resolved = true;
    state.current.outcome = outcome;
    state.current.winnerTeamId = winnerTeamId || null;
    state.current.answerVisible = true;
    if (!state.usedQuestionIds.includes(state.current.questionId)) state.usedQuestionIds.push(state.current.questionId);
    if (outcome !== "correct") state.current.selectedTeamId = null;
  }

  function reduce(state, action, questions) {
    if (!isRecord(action) || !validateState(state, questions)) return state;
    if (action.type === "UNDO") {
      if (!state.history.length) return state;
      return Object.assign(snapshot(state.history[state.history.length - 1]), { history: state.history.slice(0, -1) });
    }
    var next = snapshot(state);
    var current = next.current;
    var entries = getQuestions(questions);
    if (action.type === "RESUME") {
      if (state.phase !== "finished") return state;
      next.phase = "playing";
    } else if (state.phase !== "playing") {
      return state;
    } else if (action.type === "FINISH") {
      if (current && !current.resolved) next.pendingQuestions.push(current);
      next.phase = "finished";
      next.current = null;
    } else if (action.type === "OPEN_QUESTION") {
      if (!entries.has(action.questionId) || state.usedQuestionIds.includes(action.questionId) || state.current) return state;
      var pendingIndex = next.pendingQuestions.findIndex(function (entry) { return entry.questionId === action.questionId; });
      next.current = pendingIndex >= 0 ? next.pendingQuestions.splice(pendingIndex, 1)[0] : {
        questionId: action.questionId,
        selectedTeamId: null,
        attemptedTeamIds: [],
        answerVisible: false,
        resolved: false,
        outcome: null,
        winnerTeamId: null
      };
    } else if (action.type === "CLOSE_QUESTION") {
      if (!current) return state;
      if (!current.resolved) next.pendingQuestions.push(current);
      next.current = null;
    } else if (!current || current.resolved) {
      return state;
    } else if (action.type === "SELECT_TEAM") {
      if (!next.teams.some(function (team) { return team.id === action.teamId; }) ||
          current.attemptedTeamIds.includes(action.teamId) || current.selectedTeamId === action.teamId) return state;
      current.selectedTeamId = action.teamId;
    } else if (action.type === "REVEAL_ANSWER") {
      if (current.answerVisible) return state;
      current.answerVisible = true;
    } else if (action.type === "SKIP_QUESTION") {
      resolveQuestion(next, "skipped");
    } else if (action.type === "ANSWER" || action.type === "PASS_TEAM") {
      if (!current.selectedTeamId || current.attemptedTeamIds.includes(current.selectedTeamId) ||
          (action.type === "ANSWER" && typeof action.correct !== "boolean")) return state;
      var team = next.teams.find(function (entry) { return entry.id === current.selectedTeamId; });
      var value = entries.get(current.questionId).value;
      if (action.type === "ANSWER" && action.correct) {
        if (!Number.isSafeInteger(team.score + value)) return state;
        team.score += value;
        resolveQuestion(next, "correct", team.id);
      } else {
        if (action.type === "ANSWER" && next.penalizeWrong) {
          if (!Number.isSafeInteger(team.score - value)) return state;
          team.score -= value;
        }
        current.attemptedTeamIds.push(team.id);
        current.selectedTeamId = null;
        if (current.attemptedTeamIds.length === next.teams.length) resolveQuestion(next, "exhausted");
      }
    } else {
      return state;
    }
    next.history = state.history.concat([snapshot(state)]).slice(-HISTORY_LIMIT);
    return next;
  }

  return { createState: createState, reduce: reduce, validateState: validateState, HISTORY_LIMIT: HISTORY_LIMIT };
});
