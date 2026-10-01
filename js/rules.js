// Game rules. Every action takes a game state and returns a new one without
// touching the DOM, so the same logic can later run on a server for
// multiplayer rooms.
import { TEAMS, DEFAULT_TEAMS } from "./teams.js";

export const TOTAL_YARDS = 120;
export const ENDZONE_YARDS = 10;
export const LEFT_GOAL_LINE = ENDZONE_YARDS;
export const RIGHT_GOAL_LINE = TOTAL_YARDS - ENDZONE_YARDS;
export const MIDFIELD = TOTAL_YARDS / 2;
export const TIMEOUTS_PER_HALF = 3;

const FIRST_DOWN_YARDS = 10;
const KICKOFF_YARD = 35;
const START_CLOCK = 25;
const STATE_VERSION = 1;

export const SIDES = ["team1", "team2"];
export const other = side => (side === "team1" ? "team2" : "team1");
// team1 defends the left end zone and drives right.
export const direction = side => (side === "team1" ? 1 : -1);
const goalLine = side => (side === "team1" ? RIGHT_GOAL_LINE : LEFT_GOAL_LINE);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createGame(teams = DEFAULT_TEAMS) {
  return {
    version: STATE_VERSION,
    teams: { ...teams },
    score: { team1: 0, team2: 0 },
    timeouts: { team1: TIMEOUTS_PER_HALF, team2: TIMEOUTS_PER_HALF },
    possession: "team1",
    ballYard: KICKOFF_YARD,
    lineOfScrimmage: null,
    firstDownYard: null,
    down: 1,
    period: 1, // 1-4 are quarters, 5+ overtime
    clock: START_CLOCK,
    dice: { offense: null, defense: null },
  };
}

// Rebuild a saved game, falling back to defaults for anything missing or stale.
export function restoreGame(saved) {
  const base = createGame();
  if (!saved || saved.version !== STATE_VERSION) return base;
  const game = {
    ...base,
    ...saved,
    teams: { ...base.teams, ...saved.teams },
    score: { ...base.score, ...saved.score },
    timeouts: { ...base.timeouts, ...saved.timeouts },
    dice: { ...base.dice, ...saved.dice },
  };
  for (const side of SIDES) {
    if (!TEAMS[game.teams[side]]) game.teams[side] = base.teams[side];
  }
  if (!SIDES.includes(game.possession)) game.possession = base.possession;
  return game;
}

const update = (game, mutate) => {
  const next = structuredClone(game);
  mutate(next);
  return next;
};

function spotFirstDown(g) {
  g.down = 1;
  g.lineOfScrimmage = g.ballYard;
  const target = g.ballYard + direction(g.possession) * FIRST_DOWN_YARDS;
  g.firstDownYard = g.possession === "team1"
    ? Math.min(target, RIGHT_GOAL_LINE)
    : Math.max(target, LEFT_GOAL_LINE);
}

const lineGained = g =>
  g.firstDownYard !== null && (g.ballYard - g.firstDownYard) * direction(g.possession) >= 0;

export const newGame = game => createGame(game.teams);

export const setBall = (game, yard) =>
  update(game, g => { g.ballYard = clamp(Math.round(yard), 0, TOTAL_YARDS); });

export const moveBall = (game, yards) => setBall(game, game.ballYard + yards);

export const firstAndTen = game => update(game, spotFirstDown);

// Next down, or a fresh set of downs if the line was reached. Failing on
// 4th down turns the ball over.
export const nextDown = game => update(game, g => {
  if (g.firstDownYard === null || lineGained(g)) return spotFirstDown(g);
  if (g.down === 4) {
    g.possession = other(g.possession);
    return spotFirstDown(g);
  }
  g.down += 1;
  g.lineOfScrimmage = g.ballYard;
});

export const switchPossession = game => update(game, g => {
  g.possession = other(g.possession);
  if (g.firstDownYard !== null) spotFirstDown(g);
});

export const adjustClock = (game, delta) =>
  update(game, g => { g.clock = Math.max(0, Math.round((g.clock + delta) * 10) / 10); });

export const nextPeriod = game => update(game, g => {
  g.period += 1;
  if (g.period === 3) g.timeouts = { team1: TIMEOUTS_PER_HALF, team2: TIMEOUTS_PER_HALF };
});

export const prevPeriod = game => update(game, g => { g.period = Math.max(1, g.period - 1); });

// Clicking a lit dot spends a timeout; clicking a spent one gives it back.
export const toggleTimeout = (game, side, index) => update(game, g => {
  const left = g.timeouts[side];
  g.timeouts[side] = clamp(index < left ? left - 1 : left + 1, 0, TIMEOUTS_PER_HALF);
});

export const setScore = (game, side, value) =>
  update(game, g => { g.score[side] = clamp(Math.trunc(Number(value)) || 0, 0, 999); });

export const addScore = (game, side, points) => setScore(game, side, game.score[side] + points);

export const setTeam = (game, side, name) =>
  update(game, g => { if (TEAMS[name]) g.teams[side] = name; });

export const recordRoll = (game, kind, roll) => update(game, g => { g.dice[kind] = roll; });

// ---- Derived values for display ----

export const periodLabel = period =>
  period <= 4 ? `Q${period}` : period === 5 ? "OT" : `OT${period - 4}`;

const ORDINALS = ["1st", "2nd", "3rd", "4th"];

export function downAndDistance(g) {
  const down = ORDINALS[g.down - 1];
  if (g.firstDownYard === null) return { down, distance: FIRST_DOWN_YARDS };
  if (g.firstDownYard === goalLine(g.possession)) return { down, distance: "Goal" };
  const yards = Math.round((g.firstDownYard - g.ballYard) * direction(g.possession));
  return { down, distance: Math.max(0, yards) };
}

// Where the ball sits: { side, yardLine } or { side, endZone: true }; side is null at midfield.
export function fieldPosition(g) {
  const y = g.ballYard;
  if (y <= LEFT_GOAL_LINE) return { side: "team1", endZone: true };
  if (y >= RIGHT_GOAL_LINE) return { side: "team2", endZone: true };
  if (y === MIDFIELD) return { side: null, yardLine: 50 };
  return y < MIDFIELD
    ? { side: "team1", yardLine: y - LEFT_GOAL_LINE }
    : { side: "team2", yardLine: RIGHT_GOAL_LINE - y };
}
