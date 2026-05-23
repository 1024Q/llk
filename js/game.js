const icons = ["🍓", "🍋", "🍇", "🍉", "🍒", "🥝", "🍑", "🥥", "🍍", "🥨", "🧀", "🍔", "🍟", "🍕", "🍩", "🍪", "🍫", "🍬"];
const levels = {
  easy: { rows: 6, cols: 8, seconds: 210 },
  normal: { rows: 8, cols: 10, seconds: 180 },
  hard: { rows: 10, cols: 12, seconds: 210 }
};

const boardEl = document.querySelector("#board");
const lineEl = document.querySelector("#connectionLine");
const scoreEl = document.querySelector("#score");
const leftEl = document.querySelector("#left");
const comboEl = document.querySelector("#combo");
const timeEl = document.querySelector("#time");
const timeBarEl = document.querySelector("#timeBar");
const messageEl = document.querySelector("#message");
const levelButtons = document.querySelectorAll("[data-level]");

let level = "normal";
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

function startGame() {
  const config = levels[level];
  rows = config.rows;
  cols = config.cols;
  seconds = config.seconds;
  timeLeft = seconds;
  score = 0;
  combo = 0;
  selected = null;
  locked = false;
  tiles = makeDeck(rows * cols);
  renderBoard();
  clearConnectionLine();
  updateStats();
  setMessage("点击两张相同的牌开始。");
  clearInterval(timer);
  timer = setInterval(tick, 1000);
  ensureMove();
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
  if (locked || timeLeft <= 0) return;
  const tile = tiles[index];
  if (!tile || tile.matched) return;
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
  tiles.forEach((_, index) => {
    const rect = boardEl.children[index].getBoundingClientRect();
    const boardRect = boardEl.getBoundingClientRect();
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
    updateStats();
    ensureMove();
  }
}

function showHint() {
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
  timeLeft -= 1;
  updateStats();
  if (timeLeft <= 0) finish(false);
}

function finish(won) {
  clearInterval(timer);
  locked = true;
  selected = null;
  updateTileClasses();
  setMessage(won ? `全部消除！最终得分 ${score}。` : "时间到了，再开一局吧。");
}

function updateStats() {
  const remaining = tiles.filter(tile => !tile.matched).length;
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

function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

document.querySelector("#newGame").addEventListener("click", startGame);
document.querySelector("#hint").addEventListener("click", showHint);
document.querySelector("#shuffle").addEventListener("click", () => shuffleRemaining(true));
levelButtons.forEach(button => {
  button.addEventListener("click", () => {
    level = button.dataset.level;
    levelButtons.forEach(item => item.classList.toggle("active", item === button));
    startGame();
  });
});

startGame();
