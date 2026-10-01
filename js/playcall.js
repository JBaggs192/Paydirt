// Play call panel: each side picks a play card face down, sees whether the
// other side is ready (never what they picked), then both flip on reveal.
import { teamData, mascot, accentColor } from "./teams.js";
import { PLAYS, ROLES, RAZZLE, playName, bothReady, other } from "./rules.js";

const $ = (selector, root = document) => root.querySelector(selector);
const ROLE_LABEL = { offense: "Offense", defense: "Defense" };

export function createPlayCall() {
  const panel = $("#playcall");
  const revealButton = $("#pc-reveal");
  const hint = $("#pc-hint");
  const slots = Object.fromEntries(ROLES.map(role => [role, $(`.pc-slot[data-role="${role}"]`, panel)]));
  const pickRows = Object.fromEntries(ROLES.map(role => [role, $(`.pc-picks[data-role="${role}"]`, panel)]));

  // Play buttons for each side, built once.
  const buttons = Object.fromEntries(ROLES.map(role => {
    const row = pickRows[role];
    const list = PLAYS[role].map(play => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = play.id === RAZZLE ? "pc-play razzle" : "pc-play";
      Object.assign(button.dataset, { action: "callPlay", role, play: play.id });
      button.innerHTML = `<span class="pc-code">${play.id === RAZZLE ? "★" : play.id}</span>
        <span class="pc-name">${play.name}</span>${play.id === RAZZLE ? '<span class="pc-left"></span>' : ""}`;
      row.querySelector(".pc-play-grid").append(button);
      return [play.id, button];
    });
    return [role, Object.fromEntries(list)];
  }));

  let lastRevealed = false;

  function renderSlot(game, role, mine) {
    const slot = slots[role];
    const side = role === "offense" ? game.possession : other(game.possession);
    const team = game.teams[side];
    const pick = game.call[role];
    const { revealed } = game.call;

    slot.style.setProperty("--accent", accentColor(team));
    $(".pc-team", slot).textContent = `${ROLE_LABEL[role]} · ${mascot(team)}`;
    const logo = $(".pc-logo", slot);
    if (team) logo.src = teamData(team).logo;
    else logo.removeAttribute("src");

    let state;
    let text;
    if (pick === null) {
      state = "waiting";
      text = mine ? "Pick a play" : "Choosing…";
    } else if (mine) {
      state = "ready";
      text = `Your call: ${playName(role, pick)}`;
    } else {
      state = "ready";
      text = "Ready";
    }
    slot.dataset.state = state;
    $(".pc-status", slot).textContent = text;

    // Card back: only filled in once revealed, so the other side's call
    // isn't sitting in the page beforehand.
    const shown = revealed ? pick : null;
    $(".pc-reveal-code", slot).textContent = shown === RAZZLE ? "★" : shown ?? "";
    $(".pc-reveal-name", slot).textContent = playName(role, shown);
    slot.classList.toggle("razzle", role === "offense" && shown === RAZZLE);
    slot.classList.toggle("flipped", revealed);
  }

  return {
    // mine: the roles this screen controls ("offense", "defense" or both).
    render(game, mine) {
      const { revealed } = game.call;
      for (const role of ROLES) {
        renderSlot(game, role, mine.has(role));
        const showPicks = mine.has(role) && !revealed;
        pickRows[role].hidden = !showPicks;
        for (const [id, button] of Object.entries(buttons[role])) {
          button.classList.toggle("selected", game.call[role] === id);
          button.setAttribute("aria-pressed", String(game.call[role] === id));
        }
      }

      const left = game.razzle[game.possession];
      const razzleButton = buttons.offense[RAZZLE];
      razzleButton.disabled = left <= 0 && game.call.offense !== RAZZLE;
      razzleButton.querySelector(".pc-left").textContent = left > 0 ? `${left} left` : "None left";

      const ready = bothReady(game);
      revealButton.disabled = revealed || !ready;
      revealButton.classList.toggle("armed", ready && !revealed);
      panel.classList.toggle("revealed", revealed);
      hint.textContent = revealed ? "Run the play, then Space for the next down"
        : ready ? "Both sides are ready"
        : "Pick your play. Your opponent only sees that you're ready.";

      if (revealed && !lastRevealed) panel.classList.add("just-revealed");
      if (!revealed) panel.classList.remove("just-revealed");
      lastRevealed = revealed;
    },

    // Shake whichever side is still choosing (R pressed too early).
    nudge(game) {
      for (const role of ROLES) {
        if (game.call[role] !== null) continue;
        const slot = slots[role];
        slot.classList.remove("nudge");
        void slot.offsetWidth;
        slot.classList.add("nudge");
        slot.addEventListener("animationend", () => slot.classList.remove("nudge"), { once: true });
      }
    },
  };
}
