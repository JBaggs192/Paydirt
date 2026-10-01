// Wires input to the rules: every change goes through commit(), which keeps
// undo history, saves to localStorage, re-renders and sends the game to the
// room. The host's browser owns the game; a guest's input is sent to the host
// to run, so both players share one board.
import * as rules from "./rules.js";
import { accentColor, mascot } from "./teams.js";
import { DICE, rollDice } from "./dice.js";
import { createField } from "./field.js";
import { createUI } from "./ui.js";
import { joinRoom, newCode, normalizeCode, isValidCode } from "./room.js";
import { createLobby } from "./lobby.js";
import { createPicker } from "./picker.js";
import { createPlayCall } from "./playcall.js";

const STORAGE_KEY = "paydirt.game";
const SESSION_KEY = "paydirt.session";
const PUBLISH_MS = 120; // batch rapid changes (ball drags) into one update
const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000; // rapid ball/clock nudges collapse into one undo step
const NEW_GAME_PROMPT = "Start a new game? Scores, downs, timeouts and the clock reset; teams stay.";

let game = load();
let lastCommit = { key: null, at: 0 };
const history = [];

let session = null; // { role: "solo" } or { role: "host" | "guest", code }
let link = null;    // open room connection
let publishTimer = 0;
let waitingForHost = false;
let hostCanUndo = false; // guests: whether the host has anything to undo
const isHost = () => session?.role === "host";
const isGuest = () => session?.role === "guest";

const ui = createUI();
const playcall = createPlayCall();
const field = createField(document.getElementById("field"), {
  onPickYard: yard => run("setBall", { yard }),
});
const lobby = createLobby({
  onSolo: startSolo,
  onHost: () => picker.open({ mode: "host" }),
  onJoin: joinAsGuest,
  onLeave: () => leaveSession(),
});
const picker = createPicker({
  onLock: team => (isGuest() ? run("setTeam", { side: "team2", name: team }) : hostWith(team)),
  onBack: () => (session ? leaveSession({ ask: false, step: "multi" }) : lobby.show({ step: "multi" })),
  onSkip: () => {},
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
  ui.render(game, { canUndo: isGuest() ? hostCanUndo : history.length > 0 });
  playcall.render(game, myRoles());
  field.draw(game);
}

// Which play cards this screen picks: single player calls both sides; in a
// room the host plays the left team (and the right one until someone joins)
// and a guest plays the right team.
function myRoles() {
  if (!session || session.role === "solo") return new Set(rules.ROLES);
  const sides = isHost() ? (game.teams.team2 === null ? rules.SIDES : ["team1"]) : ["team2"];
  return new Set(sides.map(side => (side === game.possession ? "offense" : "defense")));
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
  setBall:          ({ yard }) => commit(rules.setBall(game, yard), "ball"),
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
  rollRazzleOffense: () => { if (rules.razzleActive(game)) roll("razzleOffense"); },
  rollRazzleDefense: () => { if (rules.razzleActive(game)) roll("razzleDefense"); },
  callPlay:         ({ role, play }) => commit(rules.callPlay(game, role, play)),
  revealCall:       () => {
    if (!rules.bothReady(game)) return playcall.nudge(game);
    if (!commit(rules.revealCall(game))) return;
    const offense = game.teams[game.possession];
    const defenseCall = rules.playName("defense", game.call.defense);
    if (game.call.offense === rules.RAZZLE) {
      announce("Razzle Dazzle!", { sub: `vs ${defenseCall} · roll the extra dice`, color: accentColor(offense), big: true });
    } else {
      announce(`${rules.playName("offense", game.call.offense)} vs ${defenseCall}`, { color: accentColor(offense) });
    }
  },
  score:            ({ points }) => {
    if (!commit(rules.addScore(game, game.possession, points))) return;
    const team = game.teams[game.possession];
    announce(SCORE_CALLS[points], { sub: mascot(team), color: accentColor(team), big: points >= 3 });
  },
  setScore:         ({ side, value }) => commit(rules.setScore(game, side, value), `score-${side}`),
  // Scoreboard bars toggle; the Timeouts buttons only ever spend one.
  timeout:          ({ side, index }) => {
    const before = game.timeouts[side];
    if (commit(rules.toggleTimeout(game, side, index)) && game.timeouts[side] < before) announceTimeout(side);
  },
  callTimeout:      ({ side }) => { if (commit(rules.callTimeout(game, side))) announceTimeout(side); },
  setTeam:          ({ side, name }) => {
    if (name === game.teams[rules.other(side)]) return; // a team can only play one side
    const filledSlot = game.teams[side] === null;
    if (!commit(rules.setTeam(game, side, name)) || !filledSlot) return;
    const { team1, team2 } = game.teams;
    if (team1 && team2) announce("Game on", { sub: `${mascot(team1)} vs ${mascot(team2)}`, big: true });
  },
  undo,
  newGame:          () => commit(rules.newGame(game)),
};

// Options an action needs, checked before running anything (guests' input
// arrives over the network).
const SIDE = side => rules.SIDES.includes(side);
const OPTION_CHECKS = {
  setBall:     o => Number.isFinite(o.yard),
  score:       o => o.points in SCORE_CALLS,
  setScore:    o => SIDE(o.side) && Number.isFinite(Number(o.value)),
  timeout:     o => SIDE(o.side) && Number.isInteger(o.index) && o.index >= 0 && o.index < rules.TIMEOUTS_PER_HALF,
  callTimeout: o => SIDE(o.side),
  setTeam:     o => SIDE(o.side) && typeof o.name === "string",
  callPlay:    o => rules.ROLES.includes(o.role) && typeof o.play === "string",
};

const ROLL_KIND = {
  rollOffense: "offense",
  rollDefense: "defense",
  rollRazzleOffense: "razzleOffense",
  rollRazzleDefense: "razzleDefense",
};

function execute(name, options = {}) {
  if (!Object.hasOwn(ACTIONS, name)) return;
  const checked = { ...options, shift: Boolean(options.shift) };
  if (OPTION_CHECKS[name] && !OPTION_CHECKS[name](checked)) return;
  ACTIONS[name](checked);
}

// Run an action here, or (as a guest) ask the host to run it.
function run(name, options = {}) {
  if (!session || !Object.hasOwn(ACTIONS, name)) return;
  if (name === "newGame" && !confirm(NEW_GAME_PROMPT)) return;
  if (isGuest()) {
    if (ROLL_KIND[name] && ui.isRolling(ROLL_KIND[name])) return;
    if (name === "revealCall" && !rules.bothReady(game)) return playcall.nudge(game);
    link?.send({ kind: "action", name, options });
  } else {
    execute(name, options);
  }
}

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
  r: "revealCall",
};
const SCORE_KEYS = { 6: 6, 3: 3, 2: 2, 1: 1 };
const REPEATABLE = new Set(["ballLeft", "ballRight", "clockUp", "clockDown"]);

function keyAction(e) {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.metaKey || e.ctrlKey) return key === "z" ? ["undo"] : null;
  if (e.altKey) return null;
  if (key === "q") return [e.shiftKey ? "periodPrev" : "periodNext"];
  // Shift+O / Shift+D roll the Razzle Dazzle dice.
  if (key === "o" && e.shiftKey) return ["rollRazzleOffense"];
  if (key === "d" && e.shiftKey) return ["rollRazzleDefense"];
  // T: offense calls timeout; Shift+T: defense.
  if (key === "t") return ["callTimeout", { side: e.shiftKey ? rules.other(game.possession) : game.possession }];
  if (key in SCORE_KEYS) return ["score", { points: SCORE_KEYS[key] }];
  return KEYS[key] ? [KEYS[key]] : null;
}

document.addEventListener("keydown", e => {
  if (!session || picker.isOpen) return;
  const target = e.target instanceof Element ? e.target : document.body;
  if (target.closest("input, select, textarea")) return;
  // A keyboard-focused button should still activate normally.
  if (target.closest("button") && (e.key === "Enter" || e.key === " ")) return;

  const match = keyAction(e);
  if (!match) return;
  e.preventDefault();
  const [name, options = {}] = match;
  if (e.repeat && !REPEATABLE.has(name)) return;
  run(name, { shift: e.shiftKey, ...options });
  ui.flash(name, options);
});

document.addEventListener("click", e => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const { action, points, side, index, role, play } = target.dataset;
  run(action, { shift: e.shiftKey, points: Number(points), side, index: Number(index), role, play });
});

// Clicking a button shouldn't steal focus, or Space/Enter would re-press it
// instead of driving the game.
document.addEventListener("mousedown", e => {
  if (e.target.closest("button")) e.preventDefault();
});

for (const side of rules.SIDES) {
  const score = document.querySelector(`.team[data-side="${side}"] .score`);
  score.addEventListener("input", () => run("setScore", { side, value: score.value }));
  score.addEventListener("blur", render);
  score.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === "Escape") score.blur(); });

  const select = document.querySelector(`.team[data-side="${side}"] .team-select`);
  select.addEventListener("change", () => {
    run("setTeam", { side, name: select.value });
    select.blur();
    render(); // snap back if the pick was refused
  });
}

// ---- Rooms ----

// Host only: share something with everyone in the room.
function send(data) {
  if (isHost()) link?.send(data);
}

// Host only: send the latest game, batching rapid changes unless `now`.
function publish(now = false) {
  if (!isHost() || !link) return;
  const flush = () => {
    publishTimer = 0;
    link?.send({ kind: "state", game, canUndo: history.length > 0 });
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
    else if (data.kind === "action" && typeof data.name === "string") execute(data.name, data.options ?? {});
    return;
  }
  if (!fromHost) return;
  if (data.kind === "state") {
    game = rules.restoreGame(data.game);
    hostCanUndo = Boolean(data.canUndo);
    if (waitingForHost) {
      waitingForHost = false;
      lobby.setStatus("live");
    }
    picker.setRival(game.teams.team1, { canSkip: game.teams.team2 !== null });
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

function remember(current) {
  session = current;
  document.body.dataset.mode = current.role;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(current));
  } catch {
    // Without session storage a refresh just returns to the menu.
  }
}

// Single player: your own saved game, no room.
function startSolo() {
  remember({ role: "solo" });
  lobby.setSession(session);
  lobby.hide();
  render();
}

function startSession(role, code) {
  remember({ role, code });
  if (role === "guest") {
    // An empty board until the host's game arrives; our own save stays untouched.
    history.length = 0;
    game = rules.createGame({ team1: null, team2: null });
    waitingForHost = true;
    hostCanUndo = false;
    render();
  }
  lobby.setSession(session);
  lobby.setStatus("connecting");
  lobby.hide();
  link = joinRoom(code, role, { onMessage: onRoomMessage, onStatus: onRoomStatus });
}

// The host's pick starts a fresh game (undoable) with the other side open.
function hostWith(team) {
  commit(rules.createGame({ team1: team, team2: null }));
  startSession("host", newCode());
}

function joinAsGuest(code) {
  startSession("guest", code);
  picker.open({ mode: "guest", code });
}

function leaveSession({ ask = true, step = "main" } = {}) {
  if (isHost()) {
    if (ask && !confirm("Stop hosting? Anyone in the room will be disconnected.")) return;
    send({ kind: "end" });
  }
  const wasGuest = isGuest();
  clearTimeout(publishTimer);
  publishTimer = 0;
  link?.close();
  link = null;
  session = null;
  delete document.body.dataset.mode;
  waitingForHost = false;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  if (wasGuest) {
    game = load();
    render();
  }
  picker.close();
  lobby.show({ step });
}

// Start: an invite link (?code=) joins that room, a refresh returns to
// whatever this tab was doing, otherwise show the menu.
render();
const params = new URLSearchParams(location.search);
const invited = normalizeCode(params.get("code") || "");
if (params.has("code")) window.history.replaceState(null, "", location.pathname);
let resumed = null;
try { resumed = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { /* ignore */ }

if (isValidCode(invited)) joinAsGuest(invited);
else if (resumed?.role === "solo") startSolo();
else if (resumed?.role === "host" && isValidCode(resumed.code)) startSession("host", resumed.code);
else if (["guest", "viewer"].includes(resumed?.role) && isValidCode(resumed.code)) startSession("guest", resumed.code);
else lobby.show();
