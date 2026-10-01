// "Pick your team" screen: every team as a card, grouped by division, with a
// matchup panel up top (your pick VS theirs) and a Lock in button.
import { DIVISIONS, teamData, mascot, city, accentColor, isLight } from "./teams.js";

const $ = (selector, root = document) => root.querySelector(selector);
const LOCK_MS = 750; // reveal animation before handing back

function paint(node, name) {
  const team = teamData(name);
  node.style.setProperty("--team", team.bg);
  node.style.setProperty("--team-2", team.text);
  node.style.setProperty("--accent", accentColor(name));
  node.toggleAttribute("data-light", Boolean(name) && isLight(name));
}

export function createPicker({ onLock, onBack, onSkip }) {
  const root = $("#picker");
  const grid = $("#team-grid");
  const kicker = $("#picker-kicker");
  const lockButton = $("#lock-btn");
  const skipButton = $("#picker-skip");
  const slots = { left: $('[data-slot="left"]'), right: $('[data-slot="right"]') };

  let mode = "host";
  let selected = null;
  let rival = null; // the other player's team (taken)
  let locking = false;

  // Build the cards once: conferences, then divisions, then teams.
  const cards = new Map();
  let index = 0;
  for (const conference of ["AFC", "NFC"]) {
    const section = document.createElement("section");
    section.className = "conference";
    section.innerHTML = `<h2 class="conference-name">${conference}</h2><div class="conference-divisions"></div>`;
    for (const [d, division] of DIVISIONS.entries()) {
      if (!division.name.startsWith(conference)) continue;
      const column = document.createElement("div");
      column.className = "division";
      column.innerHTML = `<h3 class="division-name">${division.name.split(" ")[1]}</h3>`;
      division.teams.forEach((name, row) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "team-card";
        card.dataset.team = name;
        card.dataset.col = d;
        card.dataset.row = row;
        card.style.setProperty("--i", index++);
        card.setAttribute("aria-label", name);
        card.innerHTML = `
          <span class="team-card-logo"><img src="${teamData(name).logo}" alt="" loading="lazy"></span>
          <span class="team-card-name"><small>${city(name)}</small><strong>${mascot(name)}</strong></span>
          <span class="team-card-tag">Taken</span>`;
        paint(card, name);
        cards.set(name, card);
        column.append(card);
      });
      $(".conference-divisions", section).append(column);
    }
    grid.append(section);
  }

  function renderSlot(slot, name, label, emptyText) {
    const key = `${name}|${label}|${emptyText}`;
    if (slot.dataset.key === key) return; // unchanged: don't replay the pop-in
    slot.dataset.key = key;
    paint(slot, name);
    slot.toggleAttribute("data-open", !name);
    slot.toggleAttribute("data-you", label === "You");
    slot.innerHTML = name
      ? `<span class="matchup-rays"></span>
         <img class="matchup-logo" src="${teamData(name).logo}" alt="">
         <span class="matchup-label">${label}</span>
         <span class="matchup-city">${city(name)}</span>
         <span class="matchup-mascot">${mascot(name)}</span>`
      : `<span class="matchup-unknown">?</span>
         <span class="matchup-label">${label}</span>
         <span class="matchup-city">&nbsp;</span>
         <span class="matchup-mascot matchup-empty">${emptyText}</span>`;
    slot.classList.remove("swap");
    void slot.offsetWidth;
    slot.classList.add("swap");
  }

  function render() {
    for (const [name, card] of cards) {
      const taken = name === rival;
      card.classList.toggle("selected", name === selected);
      card.setAttribute("aria-pressed", String(name === selected));
      card.classList.toggle("taken", taken);
      card.disabled = taken;
    }
    if (mode === "host") {
      renderSlot(slots.left, selected, "You", "Pick a team");
      renderSlot(slots.right, null, "Opponent", "Joins with your code");
    } else {
      renderSlot(slots.left, rival, "Host", "Waiting for host…");
      renderSlot(slots.right, selected, "You", "Pick a team");
    }
    lockButton.disabled = !selected;
    lockButton.querySelector("span").textContent = selected ? `Lock in the ${mascot(selected)}` : "Pick a team";
  }

  function select(name) {
    if (locking || !cards.has(name) || name === rival) return;
    if (name === selected) return;
    selected = name;
    render();
  }

  function lock() {
    if (!selected || locking) return;
    locking = true;
    root.classList.add("locking");
    const pick = selected;
    setTimeout(() => {
      root.classList.remove("locking");
      close();
      onLock(pick);
    }, LOCK_MS);
  }

  function close() {
    root.hidden = true;
    locking = false;
  }

  grid.addEventListener("click", e => {
    const card = e.target.closest(".team-card");
    if (!card) return;
    card.focus({ preventScroll: true }); // so arrow keys carry on from here
    select(card.dataset.team);
  });
  grid.addEventListener("dblclick", e => {
    const card = e.target.closest(".team-card");
    if (card && card.dataset.team === selected) lock();
  });
  lockButton.addEventListener("click", lock);
  skipButton.addEventListener("click", () => { if (!locking) { close(); onSkip(); } });
  $("#picker-back").addEventListener("click", () => { if (!locking) { close(); onBack(); } });

  // Arrow keys move between cards: left/right across divisions, up/down within one.
  root.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); $("#picker-back").click(); return; }
    const card = e.target.closest?.(".team-card");
    if (!card) return;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    let col = Number(card.dataset.col);
    let row = Number(card.dataset.row);
    for (let step = 0; step < 8; step++) {
      col = (col + move[0] + 8) % 8;
      row = (row + move[1] + 4) % 4;
      const next = grid.querySelector(`.team-card[data-col="${col}"][data-row="${row}"]`);
      if (next && !next.disabled) { next.focus(); next.click(); return; }
    }
  });

  return {
    get isOpen() {
      return !root.hidden;
    },

    // mode "host": you are the left team. mode "guest": the host is on the
    // left (their team is taken) and you pick the right side.
    open(options) {
      mode = options.mode;
      rival = options.rival ?? null;
      selected = null;
      locking = false;
      kicker.textContent = mode === "host" ? "Hosting a new game" : `Joining Hoser code ${options.code}`;
      skipButton.hidden = !options.canSkip;
      slots.left.dataset.key = slots.right.dataset.key = "";
      root.hidden = false;
      root.scrollTop = 0;
      render();
      lockButton.focus();
    },

    // The host's team arrived (or changed) while a guest is picking.
    setRival(name, { canSkip } = {}) {
      if (root.hidden || mode !== "guest") return;
      if (canSkip !== undefined) skipButton.hidden = !canSkip;
      if (name === rival) return;
      rival = name ?? null;
      if (selected === rival) selected = null;
      render();
    },

    close,
  };
}
