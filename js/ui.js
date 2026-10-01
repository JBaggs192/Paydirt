// Everything outside the canvas: scoreboard, drive bar, dice, controls and banners.
import { TEAMS, mascot, city, accentColor } from "./teams.js";
import { SIDES, TIMEOUTS_PER_HALF, downAndDistance, fieldPosition, periodLabel } from "./rules.js";
import { DICE, createDie, setDie, throwDie, describeRoll } from "./dice.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function el(tag, className, text = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

// Shrink a single-line label until it fits its box.
function fitText(node, minPx) {
  node.style.fontSize = "";
  let size = parseFloat(getComputedStyle(node).fontSize);
  while (node.scrollWidth > node.clientWidth && size > minPx) {
    size -= 1;
    node.style.fontSize = `${size}px`;
  }
}

// Re-trigger a one-shot CSS animation class.
function replay(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  node.addEventListener("animationend", () => node.classList.remove(className), { once: true });
}

function setTeamColors(node, name) {
  const team = TEAMS[name];
  node.style.setProperty("--team", team.bg);
  node.style.setProperty("--team-2", team.text);
  node.style.setProperty("--accent", accentColor(name));
}

// Controls-panel button that spends one of a team's timeouts.
function callButton(side) {
  const button = $(`.timeout-btn[data-side="${side}"]`);
  const pips = Array.from({ length: TIMEOUTS_PER_HALF }, () => el("i", ""));
  $(".timeout-btn-pips", button).append(...pips);
  return { button, pips, team: $(".timeout-btn-team", button), key: $("kbd", button) };
}

export function createUI() {
  const teams = Object.fromEntries(SIDES.map(side => {
    const root = $(`.team[data-side="${side}"]`);
    const dots = Array.from({ length: TIMEOUTS_PER_HALF }, (_, index) => {
      const dot = el("button", "timeout-dot");
      dot.type = "button";
      Object.assign(dot.dataset, { action: "timeout", side, index });
      return dot;
    });
    $(".timeouts", root).append(...dots);

    const select = $(".team-select", root);
    select.append(...Object.keys(TEAMS).map(name => new Option(name, name)));

    return [side, {
      root, dots, select,
      logo: $(".team-logo", root),
      city: $(".team-city", root),
      mascot: $(".team-mascot", root),
      score: $(".score", root),
      down: $(".team-down", root),
      call: callButton(side),
      lastScore: null,
    }];
  }));

  const dice = Object.fromEntries(Object.entries(DICE).map(([kind, set]) => {
    const cubes = set.map(({ color, faces }) => createDie(color, faces));
    $(`[data-dice="${kind}"]`).append(...cubes.map(d => d.el));
    return [kind, { cubes, total: $(`[data-total="${kind}"]`), math: $(`[data-math="${kind}"]`) }];
  }));

  const drive = (() => {
    const bar = $("#drive-bar");
    const chip = el("span", "drive-team");
    const logo = el("img", "drive-logo");
    logo.alt = "";
    const offense = el("span", "");
    chip.append(logo, offense);
    const spot = el("span", "drive-spot");
    const dd = el("span", "drive-dd");
    bar.append(chip, spot, el("span", "drive-sep", "•"), dd);
    return { chip, logo, offense, spot, dd, team: null };
  })();

  // Names re-fit whenever the scoreboard changes width.
  new ResizeObserver(() => SIDES.forEach(side => fitText(teams[side].mascot, 16)))
    .observe($(".scoreboard"));
  document.fonts?.ready.then(() => SIDES.forEach(side => fitText(teams[side].mascot, 16)));

  const clock = $("#clock-value");
  const period = $("#period-label");
  const scoreFor = $("#score-for");
  const announcer = $(".announce");
  const undoButtons = $$('[data-action="undo"]');
  const rolling = { offense: false, defense: false };

  function renderTeam(game, side) {
    const t = teams[side];
    const name = game.teams[side];

    if (t.root.dataset.team !== name) {
      t.root.dataset.team = name;
      t.logo.src = TEAMS[name].logo;
      t.logo.alt = name;
      t.city.textContent = city(name);
      t.mascot.textContent = mascot(name);
      fitText(t.mascot, 16);
      setTeamColors(t.root, name);
      setTeamColors(t.call.button, name);
      t.call.team.textContent = mascot(name);
    }
    t.select.value = name;
    t.root.classList.toggle("possession", game.possession === side);

    const score = game.score[side];
    // Leave the score alone while someone is typing in it.
    if (document.activeElement !== t.score) t.score.value = score;
    if (t.lastScore !== null && score !== t.lastScore) replay(t.score, "bump");
    t.lastScore = score;

    const { down, distance } = downAndDistance(game);
    t.down.textContent = `${down} & ${distance}`;

    const left = game.timeouts[side];
    t.call.button.disabled = left === 0;
    t.call.button.title = left === 0 ? "No timeouts left" : `${left} left`;
    t.call.pips.forEach((pip, i) => pip.classList.toggle("used", i >= left));
    t.call.key.textContent = game.possession === side ? "T" : "⇧T";

    t.dots.forEach((dot, i) => {
      const used = i >= game.timeouts[side];
      dot.classList.toggle("used", used);
      dot.setAttribute("aria-label", `${mascot(name)} timeout ${i + 1}: ${used ? "used" : "available"}`);
      dot.title = used ? "Timeout used (click to restore)" : "Timeout available (click to use)";
    });
  }

  function renderDrive(game) {
    const name = game.teams[game.possession];
    if (drive.team !== name) {
      drive.team = name;
      drive.logo.src = TEAMS[name].logo;
      setTeamColors(drive.chip, name);
    }
    drive.offense.textContent = `${mascot(name)} ball`;

    const pos = fieldPosition(game);
    drive.spot.textContent = pos.side === null ? "at midfield"
      : pos.endZone ? `in the ${mascot(game.teams[pos.side])} end zone`
      : `on the ${mascot(game.teams[pos.side])} ${pos.yardLine}`;

    const { down, distance } = downAndDistance(game);
    drive.dd.textContent = `${down} & ${distance}`;
    drive.dd.classList.toggle("fourth", game.down === 4 && game.firstDownYard !== null);

    scoreFor.textContent = mascot(name);
    scoreFor.style.setProperty("--accent", accentColor(name));
  }

  function renderDice(game, kind) {
    if (rolling[kind]) return;
    const roll = game.dice[kind];
    const d = dice[kind];
    d.cubes.forEach((cube, i) => setDie(cube, roll ? roll.values[i] : null));
    d.total.textContent = roll ? roll.total : "—";
    d.total.classList.toggle("empty", !roll);
    d.math.textContent = roll
      ? `${describeRoll(kind, roll.values)} =`
      : `Tap the dice or press ${kind === "offense" ? "O" : "D"}`;
  }

  return {
    render(game, { canUndo }) {
      SIDES.forEach(side => renderTeam(game, side));
      renderDrive(game);
      Object.keys(DICE).forEach(kind => renderDice(game, kind));
      clock.textContent = game.clock.toFixed(1);
      period.textContent = periodLabel(game.period);
      undoButtons.forEach(button => { button.disabled = !canUndo; });
    },

    isRolling: kind => rolling[kind],

    // Resolves once every die has landed; the caller re-renders afterwards.
    async animateRoll(kind, roll) {
      const d = dice[kind];
      rolling[kind] = true;
      d.total.textContent = "";
      d.math.textContent = "Rolling…";
      await Promise.all(d.cubes.map((cube, i) => throwDie(cube, roll.values[i], i * 90)));
      rolling[kind] = false;
      replay(d.total, "pop");
    },

    // Broadcast-style banner across the field.
    announce(text, { sub = "", color = "#ffc531", big = false } = {}) {
      const card = el("div", big ? "announce-card big" : "announce-card", text);
      card.style.setProperty("--c", color);
      if (sub) card.append(el("small", "", sub));
      card.addEventListener("animationend", () => card.remove());
      announcer.replaceChildren(card);
    },

    // Light up the on-screen button for a keyboard shortcut.
    flash(action, { points, side } = {}) {
      let selector = `[data-action="${action}"]`;
      if (points) selector += `[data-points="${points}"]`;
      if (side) selector += `[data-side="${side}"]`;
      $$(selector).forEach(button => {
        if (button.matches(".action, .keycap, .score-btn, .roll-btn, .ghost-btn, .timeout-btn")) replay(button, "flash");
      });
    },
  };
}
