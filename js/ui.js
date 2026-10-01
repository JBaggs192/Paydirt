// Everything outside the canvas: scoreboard, dice panel, team pickers, status line.
import { TEAMS, mascot, accentColor, hexToRgb } from "./teams.js";
import { SIDES, TIMEOUTS_PER_HALF, downAndDistance, fieldPosition, periodLabel } from "./rules.js";
import { DICE, animateDice } from "./dice.js";

const $ = (selector, root = document) => root.querySelector(selector);

function el(tag, { dataset = {}, ...props } = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  Object.assign(node.dataset, dataset);
  node.append(...children);
  return node;
}

export function createUI() {
  const teams = Object.fromEntries(SIDES.map(side => {
    const root = $(`.team[data-side="${side}"]`);
    const timeouts = $(".timeouts", root);
    const dots = Array.from({ length: TIMEOUTS_PER_HALF }, (_, index) => el("button", {
      type: "button",
      className: "timeout-dot",
      title: "Timeout (click to use or restore)",
      dataset: { action: "timeout", side, index },
    }));
    timeouts.append(...dots);

    const select = $(`.team-select[data-side="${side}"]`);
    select.append(...Object.keys(TEAMS).map(name => new Option(name, name)));

    return [side, { root, dots, select, logo: $(".team-logo", root), score: $(".score", root), down: $(".team-down", root) }];
  }));

  const dice = Object.fromEntries(Object.keys(DICE).map(kind => {
    const dieEls = DICE[kind].map(({ color }) => el("span", { className: `die ${color}` }, [el("span", { textContent: "–" })]));
    $(`[data-dice="${kind}"]`).append(...dieEls);
    return [kind, { dieEls, total: $(`[data-total="${kind}"]`) }];
  }));

  const clock = $("#clock-value");
  const period = $("#period-label");
  const status = $("#field-status");
  const rolling = { offense: false, defense: false };

  function renderTeam(game, side) {
    const t = teams[side];
    const name = game.teams[side];
    const accent = accentColor(name);

    if (t.logo.dataset.team !== name) {
      t.logo.dataset.team = name;
      t.logo.src = TEAMS[name].logo;
      t.logo.alt = name;
      t.root.style.setProperty("--team-rgb", hexToRgb(accent));
      t.root.style.setProperty("--team-glow", accent);
    }
    t.select.value = name;
    t.root.classList.toggle("possession", game.possession === side);

    // Leave the score alone while someone is typing in it.
    if (document.activeElement !== t.score) t.score.value = game.score[side];

    const { down, distance } = downAndDistance(game);
    t.down.textContent = `${down} & ${distance}`;

    t.dots.forEach((dot, i) => {
      const used = i >= game.timeouts[side];
      dot.classList.toggle("used", used);
      dot.setAttribute("aria-label", `${mascot(name)} timeout ${i + 1}: ${used ? "used" : "available"}`);
    });
  }

  function renderDice(game, kind) {
    if (rolling[kind]) return;
    const roll = game.dice[kind];
    dice[kind].dieEls.forEach((die, i) => { die.firstElementChild.textContent = roll ? roll.values[i] : "–"; });
    dice[kind].total.textContent = roll ? roll.total : "—";
  }

  function renderStatus(game) {
    const pos = fieldPosition(game);
    const spot = pos.side === null ? "at midfield"
      : pos.endZone ? `in the ${mascot(game.teams[pos.side])} end zone`
      : `on the ${mascot(game.teams[pos.side])} ${pos.yardLine}`;
    status.replaceChildren(
      el("strong", { textContent: `${mascot(game.teams[game.possession])} ball` }),
      ` ${spot}`,
    );
  }

  return {
    render(game) {
      SIDES.forEach(side => renderTeam(game, side));
      Object.keys(DICE).forEach(kind => renderDice(game, kind));
      clock.textContent = game.clock.toFixed(1);
      period.textContent = periodLabel(game.period);
      renderStatus(game);
    },

    isRolling: kind => rolling[kind],

    // Resolves once the dice land; the caller re-renders afterwards.
    animateRoll(kind, roll) {
      rolling[kind] = true;
      dice[kind].total.textContent = "…";
      return animateDice(dice[kind].dieEls, kind, roll.values).then(() => { rolling[kind] = false; });
    },
  };
}
