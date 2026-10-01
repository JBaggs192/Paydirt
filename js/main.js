// Wires input to the rules: every change goes through commit(), which keeps
// undo history, saves to localStorage, re-renders and (when hosting) sends the
// game to everyone watching.
import * as rules from "./rules.js";
import { accentColor, mascot } from "./teams.js";
import { DICE, rollDice } from "./dice.js";
import { createField } from "./field.js";
import { createUI } from "./ui.js";
import { joinRoom, newCode, normalizeCode, isValidCode } from "./room.js";
import { createLobby } from "./lobby.js";

const STORAGE_KEY = "paydirt.game";
const SESSION_KEY = "paydirt.session";
const PUBLISH_MS = 120; // batch rapid changes (ball drags) into one update
const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000; // rapid ball/clock nudges collapse into one undo step

let game = load();
let lastCommit = { key: null, at: 0 };
const history = [];

let session = null; // { role: "host" | "viewer", code }
let link = null;    // open room connection
let publishTimer = 0;
let waitingForHost = false;
const isViewer = () => session?.role === "viewer";
const isHost = () => session?.role === "host";

const ui = createUI();
const field = createField(document.getElementById("field"), {
  onPickYard: yard => { if (!isViewer()) commit(rules.setBall(game, yard), "ball"); },
});
const lobby = createLobby({
  onHost: () => startSession("host", newCode()),
  onJoin: code => startSession("viewer", code),
  onLeave: leaveSession,
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
  publish();
  return true;
}

function undo() {
  const previous = history.pop();
  if (!previous) return;
  game = previous;
  lastCommit = { key: null, at: 0 };
  save();
  render();
  publish();
}

function roll(kind) {
  if (ui.isRolling(kind)) return;
  const result = rollDice(kind);
  send({ kind: "roll", dice: kind, result });
  ui.animateRoll(kind, result).then(render);
  commit(rules.recordRoll(game, kind, result));
}

function announce(text, options) {
  ui.announce(text, options);
  send({ kind: "announce", text, options });
}

const ACTIONS = {
  ballLeft:         ({ shift }) => commit(rules.moveBall(game, shift ? -10 : -1), "ball"),
  ballRight:        ({ shift }) => commit(rules.moveBall(game, shift ? 10 : 1), "ball"),
  clockUp:          ({ shift }) => commit(rules.adjustClock(game, shift ? 5 : 0.5), "clock"),
  clockDown:        ({ shift }) => commit(rules.adjustClock(game, shift ? -5 : -0.5), "clock"),
  periodNext:       () => {
    if (!commit(rules.nextPeriod(game))) return;
    announce(game.period === 3 ? "Second half" : rules.periodLabel(game.period),
      { sub: game.period === 3 ? "Timeouts reset" : "" });
  },
  periodPrev:       () => commit(rules.prevPeriod(game)),
  firstAndTen:      () => commit(rules.firstAndTen(game)),
  nextDown:         () => {
    const before = game;
    if (!commit(rules.nextDown(game))) return;
    const offense = game.teams[game.possession];
    if (game.possession !== before.possession) {
      announce("Turnover on downs", { sub: `${mascot(offense)} ball`, color: accentColor(offense) });
    } else if (before.firstDownYard !== null && game.down === 1) {
      announce("First down", { sub: mascot(offense), color: accentColor(offense) });
    }
  },
  switchPossession: () => commit(rules.switchPossession(game)),
  rollOffense:      () => roll("offense"),
  rollDefense:      () => roll("defense"),
  score:            ({ points }) => {
    if (!commit(rules.addScore(game, game.possession, points))) return;
    const team = game.teams[game.possession];
    announce(SCORE_CALLS[points], { sub: mascot(team), color: accentColor(team), big: points >= 3 });
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
  announce("Timeout", { sub: `${mascot(team)} · ${remaining}`, color: accentColor(team) });
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
  if (!session || isViewer()) return;
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
  if (!target || !session || isViewer()) return;
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
  score.addEventListener("input", () => {
    if (!isViewer()) commit(rules.setScore(game, side, score.value), `score-${side}`);
  });
  score.addEventListener("blur", render);
  score.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === "Escape") score.blur(); });

  const select = document.querySelector(`.team[data-side="${side}"] .team-select`);
  select.addEventListener("change", () => {
    if (!isViewer()) commit(rules.setTeam(game, side, select.value));
    select.blur();
  });
}

// ---- Rooms ----

// Host only: share something with everyone watching.
function send(data) {
  if (isHost()) link?.send(data);
}

// Host only: send the latest game, batching rapid changes unless `now`.
function publish(now = false) {
  if (!isHost() || !link) return;
  const flush = () => {
    publishTimer = 0;
    link?.send({ kind: "state", game });
  };
  if (now) {
    clearTimeout(publishTimer);
    flush();
  } else if (!publishTimer) {
    publishTimer = setTimeout(flush, PUBLISH_MS);
  }
}

const validRoll = (kind, result) =>
  Array.isArray(DICE[kind]) && Array.isArray(result?.values)
  && DICE[kind].every((die, i) => die.faces.includes(result.values[i]));

function onRoomMessage(data, fromHost) {
  if (!data || typeof data !== "object") return;
  if (isHost()) {
    if (data.kind === "hello") publish(true); // someone joined: catch them up
    return;
  }
  if (!fromHost) return;
  if (data.kind === "state") {
    game = rules.restoreGame(data.game);
    if (waitingForHost) {
      waitingForHost = false;
      lobby.setStatus("live");
    }
    render();
  } else if (data.kind === "roll" && validRoll(data.dice, data.result) && !ui.isRolling(data.dice)) {
    ui.animateRoll(data.dice, data.result).then(render);
  } else if (data.kind === "announce" && typeof data.text === "string") {
    ui.announce(data.text, data.options);
  } else if (data.kind === "end") {
    lobby.setStatus("ended");
  }
}

function onRoomStatus(status, message) {
  if (status === "live") {
    if (isHost()) publish(true);
    else {
      link.send({ kind: "hello" });
      if (waitingForHost) status = "waiting";
    }
  }
  lobby.setStatus(status, message);
}

function setReadOnly(readOnly) {
  document.body.classList.toggle("viewing", readOnly);
  document.querySelectorAll(".score").forEach(input => { input.readOnly = readOnly; });
  document.querySelectorAll(".team-select").forEach(select => { select.disabled = readOnly; });
}

function startSession(role, code) {
  session = { role, code };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Without session storage a refresh just returns to the lobby.
  }
  setReadOnly(role === "viewer");
  if (role === "viewer") {
    // Show a blank board until the host's game arrives; don't touch our own save.
    history.length = 0;
    game = rules.createGame();
    waitingForHost = true;
    render();
  }
  lobby.setSession(session);
  lobby.setStatus("connecting");
  lobby.hide();
  link = joinRoom(code, role, { onMessage: onRoomMessage, onStatus: onRoomStatus });
}

function leaveSession() {
  if (isHost()) {
    if (!confirm("Stop hosting? Anyone watching will be disconnected.")) return;
    send({ kind: "end" });
  }
  const wasViewer = isViewer();
  clearTimeout(publishTimer);
  publishTimer = 0;
  link?.close();
  link = null;
  session = null;
  waitingForHost = false;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  setReadOnly(false);
  if (wasViewer) {
    game = load();
    render();
  }
  lobby.show();
}

// Start: an invite link (?code=) joins that room, a refresh rejoins the room
// this tab was in, otherwise show the lobby.
render();
const params = new URLSearchParams(location.search);
const invited = normalizeCode(params.get("code") || "");
if (params.has("code")) window.history.replaceState(null, "", location.pathname);
let resumed = null;
try { resumed = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { /* ignore */ }

if (isValidCode(invited)) startSession("viewer", invited);
else if (["host", "viewer"].includes(resumed?.role) && isValidCode(resumed.code)) startSession(resumed.role, resumed.code);
else lobby.show();
