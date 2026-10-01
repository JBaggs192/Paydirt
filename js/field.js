// Canvas field. Drawn in a fixed 1000x400 coordinate space and scaled to the
// element's real pixel size so it stays sharp on high-DPI screens. The ball and
// markers glide toward their new spots instead of jumping.
import { TEAMS, mascot, accentColor } from "./teams.js";
import {
  TOTAL_YARDS, ENDZONE_YARDS, LEFT_GOAL_LINE, RIGHT_GOAL_LINE, MIDFIELD, direction, positionOf,
} from "./rules.js";

const W = 1000;
const H = 400;
const P = W / TOTAL_YARDS;
const LOGO_WIDTH_YARDS = 10;
const GLIDE_MS = 70; // time constant for ball/marker easing
const FONT = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
const LOS_COLOR = "#3d8bff";
const FIRST_DOWN_COLOR = "#ffd23f";
const FOURTH_DOWN_COLOR = "#ff4d4d";

const xOf = yard => yard * P;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function loadImage(src, onload) {
  const img = new Image();
  img.onload = onload;
  img.src = src;
  return img;
}

const ready = img => img.complete && img.naturalWidth > 0;

function makeNoise(ctx) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 128;
  const t = tile.getContext("2d");
  const pixels = t.createImageData(128, 128);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
    pixels.data[i + 3] = Math.random() * 22;
  }
  t.putImageData(pixels, 0, 0);
  return ctx.createPattern(tile, "repeat");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function createField(canvas, { onPickYard }) {
  const ctx = canvas.getContext("2d");
  const noise = makeNoise(ctx);
  const view = { ball: null, los: null, firstDown: null };
  let game = null;
  let frame = 0;
  let lastFrame = 0;
  let hoverYard = null;

  const schedule = () => { if (game && !frame) frame = requestAnimationFrame(paint); };
  const images = {
    football: loadImage("football_clean.png", schedule),
    logo: loadImage("BFL_logo.png", schedule),
  };
  // Canvas text only uses a web font once it has loaded.
  document.fonts?.load(`800 64px ${FONT}`).then(schedule, () => {});
  document.fonts?.ready.then(schedule);

  function approach(current, target, k) {
    if (target === null) return null;
    if (current === null || reducedMotion.matches) return target;
    const next = current + (target - current) * k;
    return Math.abs(target - next) < 0.02 ? target : next;
  }

  function paint(now = performance.now()) {
    frame = 0;
    const dt = lastFrame ? Math.min(64, now - lastFrame) : 16;
    lastFrame = now;
    const k = 1 - Math.exp(-dt / GLIDE_MS);
    view.ball = approach(view.ball, game.ballYard, k);
    view.los = approach(view.los, game.lineOfScrimmage, k);
    view.firstDown = approach(view.firstDown, game.firstDownYard, k);

    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    drawTurf();
    drawEndzone(game.teams.team1, LEFT_GOAL_LINE / 2, -Math.PI / 2);
    drawEndzone(game.teams.team2, RIGHT_GOAL_LINE + ENDZONE_YARDS / 2, Math.PI / 2);
    drawYardLines();
    drawHashMarks();
    drawNumbers();
    drawMidfieldLogo();
    drawLighting();
    drawHover();
    drawLine(view.los, LOS_COLOR);
    drawLine(view.firstDown, game.down === 4 ? FOURTH_DOWN_COLOR : FIRST_DOWN_COLOR);
    drawChainMarkers();
    drawBall();

    const settled = view.ball === game.ballYard && view.los === game.lineOfScrimmage
      && view.firstDown === game.firstDownYard;
    if (settled) lastFrame = 0;
    else schedule();
  }

  function drawTurf() {
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#21803a");
    base.addColorStop(0.5, "#1a6f30");
    base.addColorStop(1, "#21803a");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    // Mowing pattern: alternating 5-yard bands.
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    for (let y = LEFT_GOAL_LINE; y < RIGHT_GOAL_LINE; y += 10) ctx.fillRect(xOf(y), 0, 5 * P, H);
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    for (let y = LEFT_GOAL_LINE + 5; y < RIGHT_GOAL_LINE; y += 10) ctx.fillRect(xOf(y), 0, 5 * P, H);

    ctx.fillStyle = noise;
    ctx.fillRect(0, 0, W, H);
  }

  function drawEndzone(name, centerYard, rotation) {
    const { bg, text, outline } = TEAMS[name];
    const x0 = xOf(centerYard - ENDZONE_YARDS / 2);
    const w = ENDZONE_YARDS * P;

    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(x0, 0, w, H);
    ctx.beginPath();
    ctx.rect(x0, 0, w, H);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 6;
    for (let d = -H; d < w + H; d += 18) {
      ctx.beginPath();
      ctx.moveTo(x0 + d, 0);
      ctx.lineTo(x0 + d + H * 0.6, H);
      ctx.stroke();
    }
    const shade = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    const inner = rotation < 0 ? 1 : 0;
    shade.addColorStop(inner, "rgba(0,0,0,0)");
    shade.addColorStop(1 - inner, "rgba(0,0,0,0.25)");
    ctx.fillStyle = shade;
    ctx.fillRect(x0, 0, w, H);
    ctx.restore();

    const label = mascot(name);
    ctx.save();
    ctx.translate(xOf(centerYard), H / 2);
    ctx.rotate(rotation);
    ctx.font = `800 62px ${FONT}`;
    ctx.letterSpacing = "6px";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fit = Math.min(1, (H - 48) / ctx.measureText(label).width);
    ctx.scale(fit, fit);
    ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillText(label, 3, 4);
    ctx.lineWidth = 6;
    ctx.strokeStyle = outline;
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = text;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  function drawYardLines() {
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    for (let y = LEFT_GOAL_LINE + 5; y < RIGHT_GOAL_LINE; y += 5) {
      ctx.lineWidth = (y - LEFT_GOAL_LINE) % 10 === 0 ? 2.4 : 1.4;
      ctx.beginPath();
      ctx.moveTo(xOf(y), 0);
      ctx.lineTo(xOf(y), H);
      ctx.stroke();
    }
    // Goal lines and sidelines.
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (const yard of [LEFT_GOAL_LINE, RIGHT_GOAL_LINE]) {
      ctx.moveTo(xOf(yard), 0);
      ctx.lineTo(xOf(yard), H);
    }
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, W, H);
  }

  function drawHashMarks() {
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let y = LEFT_GOAL_LINE + 1; y < RIGHT_GOAL_LINE; y++) {
      if (y % 5 === 0) continue;
      const x = xOf(y);
      for (const [from, to] of [[3, 12], [H - 12, H - 3], [H * 0.34 - 5, H * 0.34 + 5], [H * 0.66 - 5, H * 0.66 + 5]]) {
        ctx.moveTo(x, from);
        ctx.lineTo(x, to);
      }
    }
    // Try-point marks at the 2-yard lines.
    for (const yard of [LEFT_GOAL_LINE + 2, RIGHT_GOAL_LINE - 2]) {
      ctx.moveTo(xOf(yard), H / 2 - 5);
      ctx.lineTo(xOf(yard), H / 2 + 5);
    }
    ctx.stroke();
  }

  function drawNumbers() {
    ctx.save();
    ctx.font = `700 34px ${FONT}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let n = 10; n <= 50; n += 10) {
      const yards = n === 50 ? [MIDFIELD] : [LEFT_GOAL_LINE + n, RIGHT_GOAL_LINE - n];
      for (const yard of yards) {
        const towardGoal = n === 50 ? 0 : yard < MIDFIELD ? -1 : 1;
        drawNumber(String(n), xOf(yard), H * 0.17, towardGoal, false);
        drawNumber(String(n), xOf(yard), H * 0.83, towardGoal, true);
      }
    }
    ctx.restore();
  }

  // Yard number with the little arrow pointing at the nearer goal line.
  function drawNumber(text, x, y, towardGoal, flipped) {
    ctx.save();
    ctx.translate(x, y);
    if (flipped) ctx.rotate(Math.PI);
    const dir = flipped ? -towardGoal : towardGoal;
    ctx.fillText(text, 0, 0);
    if (dir) {
      const ax = dir * 27;
      ctx.beginPath();
      ctx.moveTo(ax + dir * 7, 0);
      ctx.lineTo(ax, -5);
      ctx.lineTo(ax, 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMidfieldLogo() {
    const logo = images.logo;
    if (!ready(logo)) return;
    const w = LOGO_WIDTH_YARDS * P;
    const h = w * (logo.naturalHeight / logo.naturalWidth);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(logo, xOf(MIDFIELD) - w / 2, H / 2 - h / 2, w, h);
    ctx.restore();
  }

  // Stadium lights: bright centre, darker corners.
  function drawLighting() {
    const light = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H / 2, W * 0.62);
    light.addColorStop(0, "rgba(255,255,255,0.05)");
    light.addColorStop(1, "rgba(0,0,0,0.32)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
  }

  function drawLine(yard, color) {
    if (yard === null) return;
    const x = xOf(yard);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    ctx.fillRect(x - 2.5, 0, 5, H);
    ctx.restore();
  }

  // Sideline down box at the line of scrimmage and a chain stake at the line to gain.
  function drawChainMarkers() {
    if (view.firstDown !== null) {
      const x = xOf(view.firstDown);
      ctx.fillStyle = game.down === 4 ? FOURTH_DOWN_COLOR : FIRST_DOWN_COLOR;
      for (const [y, dir] of [[0, 1], [H, -1]]) {
        ctx.beginPath();
        ctx.moveTo(x - 9, y);
        ctx.lineTo(x + 9, y);
        ctx.lineTo(x, y + dir * 13);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (view.los !== null) {
      const x = xOf(view.los);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 6;
      ctx.fillStyle = "#ff7a1a";
      roundRect(ctx, x - 14, 8, 28, 26, 6);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#fff";
      ctx.font = `800 20px ${FONT}`;
      ctx.letterSpacing = "0px";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(game.down), x, 22);
    }
  }

  function drawHover() {
    if (hoverYard === null || hoverYard === game.ballYard) return;
    const x = xOf(hoverYard);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x, H - 40);
    ctx.stroke();
    ctx.setLineDash([]);

    const pos = positionOf(hoverYard);
    const label = pos.side === null ? "50"
      : pos.endZone ? "END ZONE"
      : `${mascot(game.teams[pos.side])} ${pos.yardLine}`;
    ctx.font = `700 15px ${FONT}`;
    ctx.letterSpacing = "1px";
    const w = ctx.measureText(label).width + 16;
    const bx = Math.min(W - w - 6, Math.max(6, x - w / 2));
    ctx.fillStyle = "rgba(8,12,18,0.82)";
    roundRect(ctx, bx, H - 34, w, 24, 12);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + w / 2, H - 22);
    ctx.restore();
  }

  function drawBall() {
    const x = xOf(view.ball);
    const y = H / 2;
    const dir = direction(game.possession);

    // Drive-direction chevrons in the offense's color.
    ctx.save();
    ctx.fillStyle = accentColor(game.teams[game.possession]);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    [40, 54].forEach((offset, i) => {
      const tip = x + dir * (offset + 10);
      ctx.globalAlpha = i === 0 ? 1 : 0.6;
      ctx.beginPath();
      ctx.moveTo(tip, y);
      ctx.lineTo(tip - dir * 10, y - 11);
      ctx.lineTo(tip - dir * 5, y);
      ctx.lineTo(tip - dir * 10, y + 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();

    // Ground shadow, then the ball.
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.filter = "blur(3px)";
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 25, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (ready(images.football)) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      ctx.drawImage(images.football, x - 25, y - 27, 50, 55);
      ctx.restore();
    }
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    if (game) paint(); // resizing clears the canvas, so repaint immediately
  }
  new ResizeObserver(resize).observe(canvas);

  // Click or drag on the field to spot the ball; hovering previews the yard line.
  const yardAt = e => {
    const rect = canvas.getBoundingClientRect();
    const yard = Math.round(((e.clientX - rect.left) / rect.width) * TOTAL_YARDS);
    return Math.min(TOTAL_YARDS, Math.max(0, yard));
  };
  let dragging = false;
  canvas.addEventListener("pointerdown", e => {
    dragging = true;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(e.pointerId);
    hoverYard = null;
    onPickYard(yardAt(e));
  });
  canvas.addEventListener("pointermove", e => {
    if (dragging) {
      onPickYard(yardAt(e));
    } else if (e.pointerType === "mouse") {
      const yard = yardAt(e);
      if (yard !== hoverYard) { hoverYard = yard; schedule(); }
    }
  });
  for (const type of ["pointerup", "pointercancel"]) {
    canvas.addEventListener(type, () => {
      dragging = false;
      canvas.classList.remove("dragging");
    });
  }
  canvas.addEventListener("pointerleave", () => {
    if (hoverYard !== null) { hoverYard = null; schedule(); }
  });

  return {
    draw(next) {
      game = next;
      schedule();
    },
  };
}
