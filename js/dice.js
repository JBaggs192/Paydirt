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

function pick(faces) {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return faces[n % faces.length];
}

export function rollDice(kind) {
  const values = DICE[kind].map(die => pick(die.faces));
  return { values, total: TOTAL[kind](values) };
}

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Tumble each die through random faces, then land on its final value.
export function animateDice(dieEls, kind, finalValues) {
  return Promise.all(dieEls.map((el, i) => new Promise(resolve => {
    const { faces } = DICE[kind][i];
    const face = el.firstElementChild;
    const duration = reducedMotion.matches ? 150 : 450 + Math.random() * 300;

    el.classList.remove("settle");
    el.classList.add("rolling");
    const shuffle = setInterval(() => {
      face.textContent = faces[Math.floor(Math.random() * faces.length)];
    }, 60 + Math.random() * 40);

    setTimeout(() => {
      clearInterval(shuffle);
      face.textContent = finalValues[i];
      el.classList.replace("rolling", "settle");
      setTimeout(() => el.classList.remove("settle"), 180);
      resolve();
    }, duration);
  })));
}
