// Paydirt dice. Offense reads the black die as tens; defense adds its two dice.
export const DICE = {
  offense: [
    { color: "black",  faces: [1, 2, 2, 3, 3, 3] },
    { color: "yellow", faces: [0, 1, 2, 3, 4, 5] },
    { color: "white",  faces: [0, 0, 1, 2, 3, 4] },
  ],
  defense: [
    { color: "green", faces: [0, 0, 0, 0, 1, 2] },
    { color: "red",   faces: [1, 1, 1, 2, 2, 3] },
  ],
};

const TOTAL = {
  offense: ([tens, a, b]) => tens * 10 + a + b,
  defense: ([a, b]) => a + b,
};

export const describeRoll = (kind, values) =>
  kind === "offense" ? `${values[0] * 10} + ${values[1]} + ${values[2]}` : values.join(" + ");

function randomInt(n) {
  const [x] = crypto.getRandomValues(new Uint32Array(1));
  return x % n;
}

export function rollDice(kind) {
  const values = DICE[kind].map(die => die.faces[randomInt(die.faces.length)]);
  return { values, total: TOTAL[kind](values) };
}

// ---- 3D cubes ----
// Faces sit front, back, right, left, top, bottom; ORIENT is the cube rotation
// [x, y] (degrees) that turns each face toward the viewer.
const ORIENT = [[0, 0], [0, 180], [0, -90], [0, 90], [-90, 0], [90, 0]];
const IDLE = [-28, 52];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

export function createDie(color, faces) {
  const el = document.createElement("span");
  el.className = `die die-${color}`;
  el.innerHTML = `<span class="die-shadow"></span><span class="die-toss"><span class="die-tilt"><span class="die-cube">
    <span class="die-core"></span><span class="die-core"></span><span class="die-core"></span>
    ${faces.map((f, i) => `<span class="die-face f${i}">${f}</span>`).join("")}
  </span></span></span>`;
  const die = { el, faces, cube: el.querySelector(".die-cube"), toss: el.querySelector(".die-toss"),
    shadow: el.querySelector(".die-shadow"), x: IDLE[0], y: IDLE[1], shown: "idle" };
  pose(die, IDLE[0], IDLE[1]);
  return die;
}

function pose(die, x, y) {
  die.x = x;
  die.y = y;
  die.cube.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
}

// Smallest angle >= from + spins full turns that lands on target (mod 360).
const spinTo = (from, target, spins) => {
  const base = from + spins * 360;
  return base + ((((target - base) % 360) + 360) % 360);
};

// Show a value (or the idle pose) instantly, e.g. after undo or on page load.
export function setDie(die, value) {
  const key = value === null ? "idle" : `v${value}`;
  if (die.shown === key) return;
  die.shown = key;
  const index = value === null ? -1 : die.faces.indexOf(value);
  const [x, y] = index < 0 ? IDLE : ORIENT[index];
  pose(die, x, y);
}

// Toss the die so it tumbles and lands showing `value`. Resolves on landing.
export function throwDie(die, value, delay = 0) {
  const matches = die.faces.flatMap((f, i) => (f === value ? [i] : []));
  const [fx, fy] = ORIENT[matches[randomInt(matches.length)]];
  const from = die.cube.style.transform;
  pose(die, spinTo(die.x, fx, 2 + randomInt(2)), spinTo(die.y, fy, 1 + randomInt(2)));
  die.shown = `v${value}`;
  if (reducedMotion.matches) return Promise.resolve();

  const duration = 950 + randomInt(250);
  const timing = { duration, delay, easing: "cubic-bezier(.18,.7,.28,1)", fill: "backwards" };
  die.cube.animate([{ transform: from }, { transform: die.cube.style.transform }], timing);
  const size = die.el.offsetHeight || 64;
  const lift = -size * (0.9 + Math.random() * 0.3);
  const tilt = (Math.random() * 2 - 1) * 14;
  die.toss.animate([
    { transform: "translateY(0px) rotateZ(0deg)", easing: "cubic-bezier(.2,.7,.4,1)" },
    { transform: `translateY(${lift}px) rotateZ(${tilt}deg)`, offset: 0.28, easing: "cubic-bezier(.6,0,.9,.5)" },
    { transform: "translateY(0px) rotateZ(0deg)", offset: 0.55, easing: "ease-out" },
    { transform: `translateY(${-size * 0.18}px) rotateZ(0deg)`, offset: 0.68, easing: "ease-in" },
    { transform: "translateY(0px) rotateZ(0deg)", offset: 0.8, easing: "ease-out" },
    { transform: `translateY(${-size * 0.04}px) rotateZ(0deg)`, offset: 0.88, easing: "ease-in" },
    { transform: "translateY(0px) rotateZ(0deg)" },
  ], { duration, delay, fill: "backwards" });
  die.shadow.animate([
    { transform: "scale(1)", opacity: 1 },
    { transform: "scale(.55)", opacity: 0.45, offset: 0.28 },
    { transform: "scale(1)", opacity: 1, offset: 0.55 },
    { transform: "scale(.85)", opacity: 0.85, offset: 0.68 },
    { transform: "scale(1)", opacity: 1 },
  ], { duration, delay, fill: "backwards" });
  return new Promise(resolve => setTimeout(resolve, delay + duration));
}
