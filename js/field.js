// Canvas field. Drawn in a fixed 1000x400 coordinate space and scaled to the
// element's real pixel size so it stays sharp on high-DPI screens.
import { TEAMS, mascot } from "./teams.js";
import { TOTAL_YARDS, ENDZONE_YARDS, LEFT_GOAL_LINE, RIGHT_GOAL_LINE, MIDFIELD, direction } from "./rules.js";

const W = 1000;
const H = 400;
const P = W / TOTAL_YARDS;
const LOGO_WIDTH_YARDS = 10;
const xOf = yard => yard * P;

function loadImage(src, onload) {
  const img = new Image();
  img.onload = onload;
  img.src = src;
  return img;
}

const ready = img => img.complete && img.naturalWidth > 0;

export function createField(canvas, { onPickYard }) {
  const ctx = canvas.getContext("2d");
  let game = null;
  let frame = 0;

  const schedule = () => { if (game && !frame) frame = requestAnimationFrame(paint); };
  const images = {
    football: loadImage("football_clean.png", schedule),
    logo: loadImage("BFL_logo.png", schedule),
  };

  function paint() {
    frame = 0;
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    drawTurf();
    drawEndzone(game.teams.team1, xOf(ENDZONE_YARDS / 2), -Math.PI / 2);
    drawEndzone(game.teams.team2, xOf(RIGHT_GOAL_LINE + ENDZONE_YARDS / 2), Math.PI / 2);
    drawBoundaries();
    drawYardLines();
    drawHashMarks();
    drawNumbers();
    drawMidfieldLogo();
    drawLine(game.lineOfScrimmage, "#3b82f6", 3);
    drawLine(game.firstDownYard, game.down === 4 ? "#b0122a" : "#FFD400", 4);
    drawBall();
  }

  function drawTurf() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#166b24");
    g.addColorStop(0.5, "#0b5c1b");
    g.addColorStop(1, "#166b24");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let y = LEFT_GOAL_LINE + 5; y < RIGHT_GOAL_LINE; y += 10) {
      ctx.fillRect(xOf(y), 0, 5 * P, H);
    }
  }

  function drawEndzone(name, centerX, rotation) {
    const { bg, text, outline } = TEAMS[name];
    ctx.fillStyle = bg;
    ctx.fillRect(centerX - (ENDZONE_YARDS * P) / 2, 0, ENDZONE_YARDS * P, H);

    const label = mascot(name);
    ctx.save();
    ctx.translate(centerX, H / 2);
    ctx.rotate(rotation);
    ctx.font = "bold 40px 'Arial Black', Arial, sans-serif";
    const fit = Math.min(1, (H - 40) / ctx.measureText(label).width);
    ctx.scale(fit, fit);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = outline;
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = text;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  function drawBoundaries() {
    ctx.strokeStyle = "white";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, W, H);
    ctx.beginPath();
    for (const yard of [LEFT_GOAL_LINE, RIGHT_GOAL_LINE]) {
      ctx.moveTo(xOf(yard), 0);
      ctx.lineTo(xOf(yard), H);
    }
    ctx.stroke();
  }

  function drawYardLines() {
    ctx.strokeStyle = "white";
    for (let y = LEFT_GOAL_LINE; y <= RIGHT_GOAL_LINE; y += 5) {
      ctx.lineWidth = (y - LEFT_GOAL_LINE) % 10 === 0 ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(xOf(y), 0);
      ctx.lineTo(xOf(y), H);
      ctx.stroke();
    }
  }

  function drawHashMarks() {
    const top = H * 0.32;
    const bottom = H * 0.68;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = LEFT_GOAL_LINE + 1; y < RIGHT_GOAL_LINE; y++) {
      ctx.moveTo(xOf(y), top);
      ctx.lineTo(xOf(y), top + 6);
      ctx.moveTo(xOf(y), bottom);
      ctx.lineTo(xOf(y), bottom - 6);
    }
    ctx.stroke();
  }

  function drawNumbers() {
    ctx.fillStyle = "white";
    ctx.font = "26px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let n = 10; n <= 50; n += 10) {
      for (const x of new Set([xOf(LEFT_GOAL_LINE + n), xOf(RIGHT_GOAL_LINE - n)])) {
        ctx.fillText(n, x, H * 0.18);
        ctx.save();
        ctx.translate(x, H * 0.82);
        ctx.rotate(Math.PI);
        ctx.fillText(n, 0, 0);
        ctx.restore();
      }
    }
  }

  function drawMidfieldLogo() {
    const logo = images.logo;
    if (!ready(logo)) return;
    const w = LOGO_WIDTH_YARDS * P;
    const h = w * (logo.naturalHeight / logo.naturalWidth);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logo, xOf(MIDFIELD) - w / 2, H / 2 - h / 2, w, h);
    ctx.restore();
  }

  function drawLine(yard, color, width) {
    if (yard === null) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(xOf(yard), 0);
    ctx.lineTo(xOf(yard), H);
    ctx.stroke();
  }

  function drawBall() {
    const x = xOf(game.ballYard);
    const y = H / 2;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    if (ready(images.football)) ctx.drawImage(images.football, x - 25, y - 27, 50, 55);

    // Arrow showing which way the offense is driving.
    const dir = direction(game.possession);
    const tip = x + dir * 44;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.moveTo(tip, y);
    ctx.lineTo(tip - dir * 12, y - 10);
    ctx.lineTo(tip - dir * 12, y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    if (game) paint(); // resizing clears the canvas, so repaint immediately
  }
  new ResizeObserver(resize).observe(canvas);

  // Click or drag on the field to spot the ball.
  const yardAt = e => {
    const rect = canvas.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * TOTAL_YARDS;
  };
  let dragging = false;
  canvas.addEventListener("pointerdown", e => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    onPickYard(yardAt(e));
  });
  canvas.addEventListener("pointermove", e => { if (dragging) onPickYard(yardAt(e)); });
  for (const type of ["pointerup", "pointercancel"]) {
    canvas.addEventListener(type, () => { dragging = false; });
  }

  return {
    draw(next) {
      game = next;
      schedule();
    },
  };
}
