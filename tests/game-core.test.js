"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const game = require("../game-core.js");

const questions = Array.from({ length: 20 }, (_, index) => ({
  id: "question-" + (index + 1),
  value: ((index % 4) + 1) * 100
}));
const initial = (options) => game.createState(["Волга", "Сура"], questions, options);
const dispatch = (state, type, data = {}) => game.reduce(state, { type, ...data }, questions);
const open = (state, index = 0) => dispatch(state, "OPEN_QUESTION", { questionId: questions[index].id });
const select = (state, index = 0) => dispatch(state, "SELECT_TEAM", { teamId: state.teams[index].id });

test("20 questions form one round; scores and winner survive finishing", () => {
  let state = initial();
  for (let index = 0; index < questions.length; index += 1) {
    state = open(state, index);
    state = select(state, index < 12 ? 0 : 1);
    state = dispatch(state, "ANSWER", { correct: true });
    assert.equal(state.current.resolved, true);
    assert.equal(state.current.answerVisible, true);
    assert.equal(game.validateState(state, questions), true);
    state = dispatch(state, "CLOSE_QUESTION");
  }
  assert.equal(state.phase, "playing");
  assert.equal(state.usedQuestionIds.length, 20);
  assert.equal(state.teams[0].score, 3000);
  assert.equal(state.teams[1].score, 2000);
  assert.equal(state.teams.reduce((sum, team) => sum + team.score, 0), 5000);
  state = dispatch(state, "FINISH");
  assert.equal(state.phase, "finished");
  assert.equal(state.teams.slice().sort((a, b) => b.score - a.score)[0].name, "Волга");
  assert.equal(game.validateState(JSON.parse(JSON.stringify(state)), questions), true);
  assert.equal(state.history.length, 60);
  assert.ok(state.history.every((entry) => !Object.hasOwn(entry, "history")));
});

test("wrong answers hand the question to another team and are free by default", () => {
  let state = select(open(initial(), 3));
  const before = JSON.parse(JSON.stringify(state));
  state = dispatch(state, "ANSWER", { correct: false });
  assert.equal(state.teams[0].score, 0);
  assert.equal(state.current.selectedTeamId, null);
  assert.deepEqual(state.current.attemptedTeamIds, ["team-1"]);
  assert.equal(state.current.resolved, false);
  assert.equal(dispatch(state, "SELECT_TEAM", { teamId: "team-1" }), state);
  state = select(state, 1);
  state = dispatch(state, "ANSWER", { correct: true });
  assert.equal(state.teams[1].score, 400);
  assert.equal(state.current.winnerTeamId, "team-2");
  assert.equal(before.teams[0].score, 0);
  assert.deepEqual(before.current.attemptedTeamIds, []);
});

test("optional penalties subtract only for a wrong answer, never for a pass", () => {
  let state = select(open(initial({ penalizeWrong: true }), 2));
  state = dispatch(state, "ANSWER", { correct: false });
  assert.equal(state.teams[0].score, -300);
  state = select(state, 1);
  state = dispatch(state, "PASS_TEAM");
  assert.equal(state.teams[1].score, 0);
  assert.equal(state.current.outcome, "exhausted");
  assert.equal(state.current.answerVisible, true);
  assert.deepEqual(state.usedQuestionIds, ["question-3"]);
});

test("skip resolves a question without points; used questions cannot be replayed", () => {
  let state = open(initial());
  state = dispatch(state, "SKIP_QUESTION");
  assert.equal(state.current.outcome, "skipped");
  assert.equal(state.current.answerVisible, true);
  state = dispatch(state, "CLOSE_QUESTION");
  assert.equal(open(state), state);
  assert.equal(state.teams[0].score, 0);
});

test("undo restores scores, question and previous answering team after refresh", () => {
  let state = select(open(initial(), 1));
  const before = JSON.parse(JSON.stringify(state));
  state = dispatch(state, "ANSWER", { correct: true });
  state = JSON.parse(JSON.stringify(state));
  state = dispatch(state, "UNDO");
  assert.deepEqual(state, before);
  assert.equal(state.current.selectedTeamId, "team-1");
  assert.equal(state.current.resolved, false);
  assert.deepEqual(state.usedQuestionIds, []);
});

test("reveal is idempotent and still permits awarding points", () => {
  let state = open(initial());
  state = dispatch(state, "REVEAL_ANSWER");
  assert.equal(state.current.answerVisible, true);
  assert.equal(dispatch(state, "REVEAL_ANSWER"), state);
  state = select(state);
  state = dispatch(state, "ANSWER", { correct: true });
  assert.equal(state.teams[0].score, 100);
});

test("close and reopen preserve attempts and revealed answer, avoiding repeated penalties", () => {
  let state = select(open(initial({ penalizeWrong: true }), 3));
  state = dispatch(state, "ANSWER", { correct: false });
  state = dispatch(state, "REVEAL_ANSWER");
  state = dispatch(state, "CLOSE_QUESTION");
  assert.equal(state.current, null);
  assert.equal(state.pendingQuestions.length, 1);
  assert.equal(game.validateState(state, questions), true);
  state = JSON.parse(JSON.stringify(state));
  state = open(state, 3);
  assert.deepEqual(state.current.attemptedTeamIds, ["team-1"]);
  assert.equal(state.current.answerVisible, true);
  assert.equal(state.pendingQuestions.length, 0);
  assert.equal(select(state), state);
  assert.equal(state.teams[0].score, -400);
  state = select(state, 1);
  state = dispatch(state, "ANSWER", { correct: true });
  assert.equal(state.teams[1].score, 400);
  assert.equal(game.validateState(state, questions), true);
});

test("pending attempts survive history limit, early finish and resume", () => {
  let state = select(open(initial()), 0);
  state = dispatch(state, "PASS_TEAM");
  state = dispatch(state, "CLOSE_QUESTION");
  for (let index = 0; index < 40; index += 1) {
    state = open(state, 1);
    state = dispatch(state, "CLOSE_QUESTION");
  }
  assert.equal(state.history.length, 60);
  state = open(state);
  assert.deepEqual(state.current.attemptedTeamIds, ["team-1"]);
  state = dispatch(state, "FINISH");
  assert.equal(game.validateState(state, questions), true);
  state = dispatch(state, "RESUME");
  state = open(state);
  assert.deepEqual(state.current.attemptedTeamIds, ["team-1"]);
});

test("older saved games without pending questions remain valid", () => {
  const state = initial();
  delete state.pendingQuestions;
  assert.equal(game.validateState(state, questions), true);
  assert.equal(open(state).current.questionId, "question-1");
});

test("tie is preserved; an early finish can resume with its board intact", () => {
  let state = open(initial());
  state = dispatch(state, "SKIP_QUESTION");
  state = dispatch(state, "FINISH");
  assert.equal(state.phase, "finished");
  assert.equal(state.current, null);
  assert.equal(state.teams[0].score, state.teams[1].score);
  assert.equal(open(state, 1), state);
  state = dispatch(state, "RESUME");
  assert.equal(state.phase, "playing");
  assert.deepEqual(state.usedQuestionIds, ["question-1"]);
});

test("invalid or duplicate team names are rejected and harmless markup stays text", () => {
  for (const names of [["a"], ["a", ""], ["  Сура ", "сура"], ["a".repeat(41), "b"], [null, "b"]]) {
    assert.throws(() => game.createState(names, questions), TypeError);
  }
  assert.equal(game.createState(["  Волга   и Сура ", "<img src=x>"], questions).teams[0].name, "Волга и Сура");
});

test("invalid actions and repeat awards are ignored", () => {
  let state = initial();
  for (const action of [null, {}, { type: "OPEN_QUESTION", questionId: "missing" }, { type: "ANSWER", correct: true }]) {
    assert.equal(game.reduce(state, action, questions), state);
  }
  state = select(open(state));
  assert.equal(dispatch(state, "ANSWER", { correct: "true" }), state);
  state = dispatch(state, "ANSWER", { correct: true });
  assert.equal(dispatch(state, "ANSWER", { correct: true }), state);
  assert.equal(state.teams[0].score, 100);
});

test("saved-state validation rejects malformed or dangerous state shapes", () => {
  const good = initial();
  assert.equal(game.validateState(good, questions), true);
  for (const value of [null, {}, [], JSON.parse('{"__proto__":{"phase":"playing"}}')]) {
    assert.equal(game.validateState(value, questions), false);
  }
  const mutations = [
    (state) => { state.teams[0].score = NaN; },
    (state) => { state.teams[0].score = Infinity; },
    (state) => { state.teams[1].id = state.teams[0].id; },
    (state) => { state.teams[0].id = '\" onclick=\"alert(1)'; },
    (state) => { state.teams[0].colorIndex = 100; },
    (state) => { state.usedQuestionIds = ["missing"]; },
    (state) => { state.usedQuestionIds = ["question-1", "question-1"]; },
    (state) => { state.history = [{}]; },
    (state) => { state.history = [state]; },
    (state) => { state.current = { questionId: "question-1" }; },
    (state) => { state.pendingQuestions = [{}]; },
    (state) => { state.pendingQuestions = [open(initial()).current, open(initial()).current]; },
    (state) => { state.current = open(initial()).current; state.pendingQuestions = [state.current]; },
    (state) => { state.startedAt = "invalid"; }
  ];
  for (const mutate of mutations) {
    const state = JSON.parse(JSON.stringify(good));
    mutate(state);
    assert.equal(game.validateState(state, questions), false);
    assert.equal(dispatch(state, "FINISH"), state);
  }
});
