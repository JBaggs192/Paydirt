// Wires input to the rules: every change goes through commit(), which keeps
// undo history, saves to localStorage and re-renders.
import * as rules from "./rules.js";
import { accentColor, mascot } from "./teams.js";
import { rollDice } from "./dice.js";
import { createField } from "./field.js";
import { createUI } from "./ui.js";

const STORAGE_KEY = "paydirt.game";
const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000; // rapid ball/clock nudges collapse into one undo step

let game = load();
let lastCommit = { key: null, at: 0 };
const history = [];

const ui = createUI();
const field = createField(document.getElementById("field"), {
  onPickYard: yard => commit(rules.setBall(game, yard), "ball"),
});

function load() {
  try {
    return rules.restoreGame(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return rules.createGame();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch {
    // Storage blocked (private window etc.) - the game still works, it just won't persist.
  }
}

function render() {
  ui.render(game, { canUndo: history.length > 0 });
  field.draw(game);
}

// Returns whether anything changed.
function commit(next, coalesceKey = null) {
  if (JSON.stringify(next) === JSON.stringify(game)) return false;
  const now = performance.now();
  const coalesce = coalesceKey && coalesceKey === lastCommit.key && now - lastCommit.at < COALESCE_MS;
  if (!coalesce) {
    history.push(game);
    if (history.length > HISTORY_LIMIT) history.shift();
  }
  lastCommit = { key: coalesceKey, at: now };
  game = next;
  save();
  render();
  return true;
}

function undo() {
  const previous = history.pop();
  if (!previous) return;
  game = previous;
  lastCommit = { key: null, at: 0 };
  save();
  render();
}

function roll(kind) {
  if (ui.isRolling(kind)) return;
  const result = rollDice(kind);
  ui.animateRoll(kind, result).then(render);
  commit(rules.recordRoll(game, kind, result));
}

const ACTIONS = {
  ballLeft:         ({ shift }) => commit(rules.moveBall(game, shift ? -10 : -1), "ball"),
  ballRight:        ({ shift }) => commit(rules.moveBall(game, shift ? 10 : 1), "ball"),
  clockUp:          ({ shift }) => commit(rules.adjustClock(game, shift ? 5 : 0.5), "clock"),
  clockDown:        ({ shift }) => commit(rules.adjustClock(game, shift ? -5 : -0.5), "clock"),
  periodNext:       () => {
    if (!commit(rules.nextPeriod(game))) return;
    ui.announce(game.period === 3 ? "Second half" : rules.periodLabel(game.period),
      { sub: game.period === 3 ? "Timeouts reset" : "" });
  },
  periodPrev:       () => commit(rules.prevPeriod(game)),
  firstAndTen:      () => commit(rules.firstAndTen(game)),
  nextDown:         () => {
    const before = game;
    if (!commit(rules.nextDown(game))) return;
    const offense = game.teams[game.possession];
    if (game.possession !== before.possession) {
      ui.announce("Turnover on downs", { sub: `${mascot(offense)} ball`, color: accentColor(offense) });
    } else if (before.firstDownYard !== null && game.down === 1) {
      ui.announce("First down", { sub: mascot(offense), color: accentColor(offense) });
    }
  },
  switchPossession: () => commit(rules.switchPossession(game)),
  rollOffense:      () => roll("offense"),
  rollDefense:      () => roll("defense"),
  score:            ({ points }) => {
    if (!commit(rules.addScore(game, game.possession, points))) return;
    const team = game.teams[game.possession];
    ui.announce(SCORE_CALLS[points], { sub: mascot(team), color: accentColor(team), big: points >= 3 });
  },
  // Scoreboard bars toggle; the Timeouts buttons only ever spend one.
  timeout:          ({ side, index }) => {
    const before = game.timeouts[side];
    if (commit(rules.toggleTimeout(game, side, index)) && game.timeouts[side] < before) announceTimeout(side);
  },
  callTimeout:      ({ side }) => { if (commit(rules.callTimeout(game, side))) announceTimeout(side); },
  undo,
  newGame: () => {
    if (confirm("Start a new game? Scores, downs, timeouts and the clock reset; teams stay.")) {
      commit(rules.newGame(game));
    }
  },
};

function announceTimeout(side) {
  const team = game.teams[side];
  const left = game.timeouts[side];
  const remaining = left === 0 ? "no timeouts left" : `${left} left`;
  ui.announce("Timeout", { sub: `${mascot(team)} · ${remaining}`, color: accentColor(team) });
}

const SCORE_CALLS = { 6: "Touchdown", 3: "Field goal", 2: "Two points", 1: "Extra point" };

const KEYS = {
  ArrowLeft: "ballLeft",
  ArrowRight: "ballRight",
  ArrowUp: "clockUp",
  ArrowDown: "clockDown",
  Enter: "firstAndTen",
  " ": "nextDown",
  b: "switchPossession",
  o: "rollOffense",
  d: "rollDefense",
  u: "undo",
};
const SCORE_KEYS = { 6: 6, 3: 3, 2: 2, 1: 1 };
const REPEATABLE = new Set(["ballLeft", "ballRight", "clockUp", "clockDown"]);

function keyAction(e) {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.metaKey || e.ctrlKey) return key === "z" ? ["undo"] : null;
  if (e.altKey) return null;
  if (key === "q") return [e.shiftKey ? "periodPrev" : "periodNext"];
  // T: offense calls timeout; Shift+T: defense.
  if (key === "t") return ["callTimeout", { side: e.shiftKey ? rules.other(game.possession) : game.possession }];
  if (key in SCORE_KEYS) return ["score", { points: SCORE_KEYS[key] }];
  return KEYS[key] ? [KEYS[key]] : null;
}

document.addEventListener("keydown", e => {
  const target = e.target instanceof Element ? e.target : document.body;
  if (target.closest("input, select, textarea")) return;
  // A keyboard-focused button should still activate normally.
  if (target.closest("button") && (e.key === "Enter" || e.key === " ")) return;

  const match = keyAction(e);
  if (!match) return;
  e.preventDefault();
  const [name, options = {}] = match;
  if (e.repeat && !REPEATABLE.has(name)) return;
  ACTIONS[name]({ shift: e.shiftKey, ...options });
  ui.flash(name, options);
});

document.addEventListener("click", e => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const { action, points, side, index } = target.dataset;
  ACTIONS[action]({ shift: e.shiftKey, points: Number(points), side, index: Number(index) });
});

// Clicking a button shouldn't steal focus, or Space/Enter would re-press it
// instead of driving the game.
document.addEventListener("mousedown", e => {
  if (e.target.closest("button")) e.preventDefault();
});

for (const side of rules.SIDES) {
  const score = document.querySelector(`.team[data-side="${side}"] .score`);
  score.addEventListener("input", () => commit(rules.setScore(game, side, score.value), `score-${side}`));
  score.addEventListener("blur", render);
  score.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === "Escape") score.blur(); });

  const select = document.querySelector(`.team[data-side="${side}"] .team-select`);
  select.addEventListener("change", () => {
    commit(rules.setTeam(game, side, select.value));
    select.blur();
  });
}

render();
