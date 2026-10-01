// The opening screen (Host Game / Enter Hoser Code) and the room chip in the top bar.
import { normalizeCode, isValidCode, CODE_LENGTH } from "./room.js";

const $ = selector => document.querySelector(selector);

const STATUS_TEXT = {
  connecting: "Connecting…",
  live: "Live",
  offline: "Reconnecting…",
  waiting: "Waiting for host…",
  ended: "Host ended the game",
};

export function createLobby({ onHost, onJoin, onLeave }) {
  const lobby = $("#lobby");
  const input = $("#lobby-code");
  const error = $("#lobby-error");
  const chip = $("#session-chip");
  const chipLabel = $("#session-label");
  const chipCode = $("#session-code");
  const chipStatus = $("#session-status");
  let code = "";
  let statusText = "";
  let copiedTimer = 0;

  $("#lobby-host").addEventListener("click", onHost);
  input.addEventListener("input", () => {
    input.value = normalizeCode(input.value);
    error.textContent = "";
  });
  $("#lobby-join").addEventListener("submit", e => {
    e.preventDefault();
    const entered = normalizeCode(input.value);
    if (!isValidCode(entered)) {
      error.textContent = `Hoser codes are ${CODE_LENGTH} letters and numbers.`;
      input.focus();
      return;
    }
    onJoin(entered);
  });
  document.querySelectorAll('[data-session="leave"]').forEach(button => button.addEventListener("click", onLeave));

  // Clicking the code copies an invite link that opens straight into the room.
  chipCode.addEventListener("click", async () => {
    const link = `${location.origin}${location.pathname}?code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      chipStatus.textContent = "Invite link copied!";
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => { chipStatus.textContent = statusText; }, 1600);
    } catch {
      prompt("Copy this invite link:", link);
    }
  });

  return {
    show({ prefill = "", message = "" } = {}) {
      chip.hidden = true;
      lobby.hidden = false;
      input.value = prefill;
      error.textContent = message;
      (prefill ? input : $("#lobby-host")).focus();
    },

    hide() {
      lobby.hidden = true;
    },

    get open() {
      return !lobby.hidden;
    },

    setSession(session) {
      code = session.code;
      chip.hidden = false;
      chip.dataset.role = session.role;
      chipLabel.textContent = "Hoser code:";
      chipCode.textContent = code;
    },

    setStatus(status, message = "") {
      chip.dataset.status = status;
      statusText = message || STATUS_TEXT[status] || "";
      clearTimeout(copiedTimer);
      chipStatus.textContent = statusText;
    },
  };
}
