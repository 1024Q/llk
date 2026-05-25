const icons = ["🍓", "🍋", "🍇", "🍉", "🍒", "🥝", "🍑", "🥥", "🍍", "🥨", "🧀", "🍔", "🍟", "🍕", "🍩", "🍪", "🍫", "🍬"];
const levels = {
  easy: { rows: 6, cols: 8, seconds: 210 },
  normal: { rows: 8, cols: 10, seconds: 180 },
  hard: { rows: 10, cols: 12, seconds: 210 }
};

const boardEl = document.querySelector("#board");
const lineEl = document.querySelector("#connectionLine");
const stageEl = document.querySelector("#stage");
const bestScoreEl = document.querySelector("#bestScore");
const scoreEl = document.querySelector("#score");
const leftEl = document.querySelector("#left");
const comboEl = document.querySelector("#combo");
const timeEl = document.querySelector("#time");
const timeBarEl = document.querySelector("#timeBar");
const messageEl = document.querySelector("#message");
const levelButtons = document.querySelectorAll("[data-level]");
const pauseButton = document.querySelector("#pause");
const soundButton = document.querySelector("#sound");

const bestScoreKey = "llk-best-score";
const soundKey = "llk-sound-enabled";

let level = "normal";
let stage = 1;
let rows = 0;
let cols = 0;
let seconds = 0;
let timeLeft = 0;
let score = 0;
let combo = 0;
let selected = null;
let tiles = [];
let timer = null;
let locked = false;
let paused = false;
let bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
let soundEnabled = localStorage.getItem(soundKey) !== "off";
let audioContext = null;

function startGame(resetProgress = true) {
  if (resetProgress) {
    stage = 1;
    score = 0;
    combo = 0;
  }

  const config = getStageConfig();
  rows = config.rows;
  cols = config.cols;
  seconds = config.seconds;
  timeLeft = seconds;
  selected = null;
  locked = false;
  paused = false;
  tiles = makeDeck(rows * cols);
  renderBoard();
  clearConnectionLine();
  updateControlStates();
  updateStats();
  setMessage(`第 ${stage} 关开始，清空牌面进入下一关。`);
  clearInterval(timer);
  timer = setInterval(tick, 1000);
  ensureMove();
}

function getStageConfig() {
  const base = levels[level];
  const growth = Math.floor((stage - 1) / 2);
  const stageRows = Math.min(base.rows + growth * 2, 10);
  const stageCols = Math.min(base.cols + Math.floor((stage - 1) / 3) * 2, 12);
  return {
    rows: stageRows,
    cols: stageRows * stageCols % 2 === 0 ? stageCols : stageCols + 1,
    seconds: Math.max(75, base.seconds - (stage - 1) * 8 + growth * 12)
  };
}

function makeDeck(total) {
  const pairCount = total / 2;
  const deck = [];
  for (let i = 0; i < pairCount; i += 1) {
    const value = icons[i % icons.length];
    deck.push({ value, matched: false }, { value, matched: false });
  }
  return shuffleArray(deck);
}

function renderBoard() {
  boardEl.style.setProperty("--cols", cols);
  boardEl.innerHTML = "";
  tiles.forEach((tile, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tile";
    button.textContent = tile.value;
    button.dataset.index = index;
    button.setAttribute("aria-label", `牌 ${tile.value}`);
    button.addEventListener("click", () => chooseTile(index));
    boardEl.append(button);
  });
}

function chooseTile(index) {
  if (locked || paused || timeLeft <= 0) return;
  const tile = tiles[index];
  if (!tile || tile.matched) return;
  unlockAudio();
  playSound("tap");
  clearHints();
  clearConnectionLine();

  if (selected === index) {
    selected = null;
    updateTileClasses();
    return;
  }

  if (selected === null) {
    selected = index;
    updateTileClasses();
    return;
  }

  const previous = selected;
  selected = null;
  const path = tiles[previous].value === tile.value ? findConnectionPath(previous, index) : null;
  if (path) {
    locked = true;
    combo += 1;
    score += 10 + combo * 2;
    setMessage(combo > 2 ? `连击 ${combo}！` : "配对成功。");
    showConnectionLine(path);
    animateMatchedTiles(previous, index);
    playSound("match");
    updateStats();
    setTimeout(() => {
      tiles[previous].matched = true;
      tile.matched = true;
      clearConnectionLine();
      locked = false;
      updateTileClasses();
      updateStats();
      if (tiles.every(item => item.matched)) {
        finish(true);
      } else {
        ensureMove();
      }
    }, 430);
  } else {
    combo = 0;
    locked = true;
    updateTileClasses();
    setMessage("这两张还连不上，换一组试试。");
    playSound("miss");
    setTimeout(() => {
      locked = false;
      updateTileClasses();
      updateStats();
    }, 360);
  }
}

function canConnect(a, b) {
  return Boolean(findConnectionPath(a, b));
}

function findConnectionPath(a, b) {
  const start = toPoint(a);
  const end = toPoint(b);
  const grid = buildGrid();
  const queue = [];
  const visited = Array.from({ length: rows + 2 }, () =>
    Array.from({ length: cols + 2 }, () => Array(4).fill(4))
  );
  const directions = [
    { r: -1, c: 0 },
    { r: 1, c: 0 },
    { r: 0, c: -1 },
    { r: 0, c: 1 }
  ];

  directions.forEach((dir, directionIndex) => {
    const next = { r: start.r + dir.r, c: start.c + dir.c };
    if (isPassable(next, end, grid)) {
      visited[next.r][next.c][directionIndex] = 0;
      queue.push({ ...next, dir: directionIndex, turns: 0, path: [start, next] });
    }
  });

  while (queue.length) {
    const current = queue.shift();
    if (current.r === end.r && current.c === end.c) return simplifyPath(current.path);

    directions.forEach((dir, directionIndex) => {
      const turns = current.turns + (directionIndex === current.dir ? 0 : 1);
      if (turns > 2) return;
      const next = { r: current.r + dir.r, c: current.c + dir.c };
      if (!isPassable(next, end, grid)) return;
      if (visited[next.r][next.c][directionIndex] <= turns) return;
      visited[next.r][next.c][directionIndex] = turns;
      queue.push({ ...next, dir: directionIndex, turns, path: [...current.path, next] });
    });
  }

  return null;
}

function simplifyPath(path) {
  if (path.length <= 2) return path;
  const result = [path[0]];
  for (let i = 1; i < path.length - 1; i += 1) {
    const previous = path[i - 1];
    const current = path[i];
    const next = path[i + 1];
    const sameRow = previous.r === current.r && current.r === next.r;
    const sameCol = previous.c === current.c && current.c === next.c;
    if (!sameRow && !sameCol) result.push(current);
  }
  result.push(path[path.length - 1]);
  return result;
}

function showConnectionLine(path) {
  const points = path.map(pointToPixel);
  const boardRect = boardEl.getBoundingClientRect();
  lineEl.setAttribute("viewBox", `0 0 ${boardRect.width} ${boardRect.height}`);
  lineEl.innerHTML = "";

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points.map(point => `${point.x},${point.y}`).join(" "));
  lineEl.append(polyline);

  const length = polyline.getTotalLength();
  polyline.style.strokeDasharray = length;
  polyline.style.strokeDashoffset = length;
}

function clearConnectionLine() {
  lineEl.innerHTML = "";
}

function animateMatchedTiles(first, second) {
  [first, second].forEach(index => {
    const node = boardEl.children[index];
    node.classList.add("pop");
    node.classList.remove("selected");
  });
}

function pointToPixel(point) {
  const centers = [];
  const boardRect = boardEl.getBoundingClientRect();
  tiles.forEach((_, index) => {
    const rect = boardEl.children[index].getBoundingClientRect();
    centers[index] = {
      x: rect.left - boardRect.left + rect.width / 2,
      y: rect.top - boardRect.top + rect.height / 2
    };
  });

  const first = centers[0];
  const second = centers[1] || first;
  const below = centers[cols] || first;
  const lastInRow = centers[cols - 1] || first;
  const lastRowFirst = centers[(rows - 1) * cols] || first;
  const colStep = second.x - first.x || boardEl.children[0].getBoundingClientRect().width;
  const rowStep = below.y - first.y || boardEl.children[0].getBoundingClientRect().height;

  let x;
  let y;
  if (point.c === 0) x = first.x - colStep;
  else if (point.c === cols + 1) x = lastInRow.x + colStep;
  else x = centers[pointToIndex({ r: 1, c: point.c })].x;

  if (point.r === 0) y = first.y - rowStep;
  else if (point.r === rows + 1) y = lastRowFirst.y + rowStep;
  else y = centers[pointToIndex({ r: point.r, c: 1 })].y;

  return { x, y };
}

function buildGrid() {
  const grid = Array.from({ length: rows + 2 }, () => Array(cols + 2).fill(0));
  tiles.forEach((tile, index) => {
    if (!tile.matched) {
      const point = toPoint(index);
      grid[point.r][point.c] = 1;
    }
  });
  return grid;
}

function toPoint(index) {
  return {
    r: Math.floor(index / cols) + 1,
    c: (index % cols) + 1
  };
}

function pointToIndex(point) {
  return (point.r - 1) * cols + point.c - 1;
}

function isPassable(point, end, grid) {
  if (point.r < 0 || point.c < 0 || point.r > rows + 1 || point.c > cols + 1) return false;
  return grid[point.r][point.c] === 0 || (point.r === end.r && point.c === end.c);
}

function findMove() {
  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i].matched) continue;
    for (let j = i + 1; j < tiles.length; j += 1) {
      if (tiles[j].matched || tiles[i].value !== tiles[j].value) continue;
      if (canConnect(i, j)) return [i, j];
    }
  }
  return null;
}

function ensureMove() {
  if (tiles.every(item => item.matched)) return;
  let tries = 0;
  while (!findMove() && tries < 30) {
    shuffleRemaining(false);
    tries += 1;
  }
  if (!findMove()) setMessage("牌面有点僵，点洗牌换个局面。");
}

function shuffleRemaining(showMessage = true) {
  if (paused || locked || timeLeft <= 0) return;
  const indexes = [];
  const values = [];
  tiles.forEach((tile, index) => {
    if (!tile.matched) {
      indexes.push(index);
      values.push(tile.value);
    }
  });
  const shuffledValues = shuffleArray(values);
  indexes.forEach((index, offset) => {
    tiles[index].value = shuffledValues[offset];
  });
  selected = null;
  renderBoard();
  updateTileClasses();
  if (showMessage) {
    combo = 0;
    setMessage("已经洗牌。");
    playSound("shuffle");
    updateStats();
    ensureMove();
  }
}

function showHint() {
  if (paused || locked || timeLeft <= 0) return;
  clearHints();
  const move = findMove();
  if (!move) {
    setMessage("暂时没有可连的牌，已经帮你洗牌。");
    shuffleRemaining(false);
    ensureMove();
    updateTileClasses();
    return;
  }
  move.forEach(index => boardEl.children[index].classList.add("hint"));
  setMessage("这两张可以连。");
  playSound("hint");
  setTimeout(clearHints, 1200);
}

function clearHints() {
  boardEl.querySelectorAll(".hint").forEach(tile => tile.classList.remove("hint"));
}

function updateTileClasses() {
  tiles.forEach((tile, index) => {
    const node = boardEl.children[index];
    node.textContent = tile.value;
    node.classList.toggle("hidden", tile.matched);
    node.classList.toggle("selected", selected === index);
  });
}

function tick() {
  if (paused) return;
  timeLeft -= 1;
  updateStats();
  if (timeLeft <= 0) finish(false);
}

function finish(won) {
  clearInterval(timer);
  locked = true;
  selected = null;
  updateTileClasses();
  if (won) {
    const bonus = Math.max(0, timeLeft) + stage * 20;
    score += bonus;
    saveBestScore();
    updateStats();
    setMessage(`第 ${stage} 关完成！奖励 ${bonus} 分，即将进入下一关。`);
    playSound("win");
    setTimeout(() => {
      stage += 1;
      startGame(false);
    }, 1300);
    return;
  }

  saveBestScore();
  updateStats();
  setMessage(`时间到了，最终得分 ${score}。点新游戏再来一局。`);
  playSound("over");
}

function updateStats() {
  const remaining = tiles.filter(tile => !tile.matched).length;
  stageEl.textContent = stage;
  bestScoreEl.textContent = bestScore;
  scoreEl.textContent = score;
  leftEl.textContent = remaining;
  comboEl.textContent = combo;
  timeEl.textContent = formatTime(Math.max(0, timeLeft));
  timeBarEl.style.transform = `scaleX(${Math.max(0, timeLeft / seconds)})`;
}

function formatTime(value) {
  const minutes = String(Math.floor(value / 60)).padStart(2, "0");
  const secs = String(value % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

function setMessage(text) {
  messageEl.textContent = text;
}

function saveBestScore() {
  if (score <= bestScore) return;
  bestScore = score;
  localStorage.setItem(bestScoreKey, String(bestScore));
}

function togglePause() {
  if (timeLeft <= 0) return;
  paused = !paused;
  selected = null;
  clearHints();
  clearConnectionLine();
  updateTileClasses();
  updateControlStates();
  setMessage(paused ? "已暂停，点继续恢复游戏。" : "继续游戏。");
  playSound(paused ? "pause" : "resume");
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem(soundKey, soundEnabled ? "on" : "off");
  updateControlStates();
  playSound("tap");
}

function updateControlStates() {
  document.body.classList.toggle("paused", paused);
  pauseButton.textContent = paused ? "继续" : "暂停";
  soundButton.textContent = soundEnabled ? "音效：开" : "音效：关";
}

function unlockAudio() {
  if (!soundEnabled || audioContext) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  audioContext = new AudioCtor();
}

function playSound(type) {
  if (!soundEnabled) return;
  unlockAudio();
  if (!audioContext) return;

  const presets = {
    tap: [420, 0.035, "triangle", 0.035],
    match: [660, 0.09, "sine", 0.055],
    miss: [170, 0.12, "sawtooth", 0.04],
    hint: [520, 0.08, "triangle", 0.045],
    shuffle: [300, 0.11, "square", 0.035],
    pause: [220, 0.08, "sine", 0.035],
    resume: [440, 0.08, "sine", 0.04],
    win: [760, 0.16, "triangle", 0.07],
    over: [130, 0.22, "sine", 0.05]
  };
  const [frequency, duration, wave, gainValue] = presets[type] || presets.tap;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (type === "win") oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

document.querySelector("#newGame").addEventListener("click", () => {
  unlockAudio();
  playSound("tap");
  startGame(true);
});
document.querySelector("#hint").addEventListener("click", showHint);
document.querySelector("#shuffle").addEventListener("click", () => shuffleRemaining(true));
pauseButton.addEventListener("click", togglePause);
soundButton.addEventListener("click", toggleSound);
levelButtons.forEach(button => {
  button.addEventListener("click", () => {
    unlockAudio();
    playSound("tap");
    level = button.dataset.level;
    levelButtons.forEach(item => item.classList.toggle("active", item === button));
    startGame(true);
  });
});

updateControlStates();
startGame(true);
