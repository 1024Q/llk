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
const turnLimitInput = document.querySelector("#turnLimit");
const turnLimitValueEl = document.querySelector("#turnLimitValue");
const normalModeButton = document.querySelector("#normalMode");
const dailyModeButton = document.querySelector("#dailyMode");
const bombButton = document.querySelector("#powerBomb");
const freezeButton = document.querySelector("#powerFreeze");
const revealButton = document.querySelector("#powerReveal");
const bombCountEl = document.querySelector("#bombCount");
const freezeCountEl = document.querySelector("#freezeCount");
const revealCountEl = document.querySelector("#revealCount");
const resultModalEl = document.querySelector("#resultModal");
const resultTitleEl = document.querySelector("#resultTitle");
const resultSummaryEl = document.querySelector("#resultSummary");
const resultTimeEl = document.querySelector("#resultTime");
const resultBonusEl = document.querySelector("#resultBonus");
const resultScoreEl = document.querySelector("#resultScore");
const resultComboEl = document.querySelector("#resultCombo");
const nextStageButton = document.querySelector("#nextStage");
const restartFromModalButton = document.querySelector("#restartFromModal");
const leaderboardEls = {
  easy: document.querySelector("#lbEasy"),
  normal: document.querySelector("#lbNormal"),
  hard: document.querySelector("#lbHard"),
  daily: document.querySelector("#lbDaily"),
  stage: document.querySelector("#lbStage"),
  fast: document.querySelector("#lbFast"),
  combo: document.querySelector("#lbCombo")
};

const legacyBestScoreKey = "llk-best-score";
const leaderboardKey = "llk-leaderboard";
const soundKey = "llk-sound-enabled";
const turnLimitKey = "llk-turn-limit";

let level = "normal";
let dailyMode = false;
let stage = 1;
let rows = 0;
let cols = 0;
let seconds = 0;
let timeLeft = 0;
let score = 0;
let combo = 0;
let longestComboRun = 0;
let selected = null;
let tiles = [];
let timer = null;
let shuffleCount = 0;
let locked = false;
let paused = false;
let powerups = { bomb: 1, freeze: 1, reveal: 2 };
let leaderboard = loadLeaderboard();
let bestScore = getCurrentBestScore();
let soundEnabled = localStorage.getItem(soundKey) !== "off";
let turnLimit = clampTurnLimit(Number(localStorage.getItem(turnLimitKey) || 2));
let audioContext = null;

function startGame(resetProgress = true) {
  hideResultModal();
  if (resetProgress) {
    stage = 1;
    score = 0;
    combo = 0;
    longestComboRun = 0;
  }

  const config = getStageConfig();
  rows = config.rows;
  cols = config.cols;
  seconds = config.seconds;
  timeLeft = seconds;
  selected = null;
  locked = false;
  paused = false;
  shuffleCount = 0;
  powerups = getStagePowerups();
  bestScore = getCurrentBestScore();
  tiles = makeDeck(rows * cols);
  renderBoard();
  clearConnectionLine();
  updateControlStates();
  updateStats();
  updateLeaderboardView();
  setMessage(`${getModeName()}第 ${stage} 关开始，当前最多可转弯 ${turnLimit} 次。`);
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

function getStagePowerups() {
  return {
    bomb: 1,
    freeze: stage % 3 === 0 ? 2 : 1,
    reveal: dailyMode ? 1 : 2
  };
}

function makeDeck(total) {
  const pairCount = total / 2;
  const deck = [];
  for (let i = 0; i < pairCount; i += 1) {
    const value = icons[i % icons.length];
    deck.push({ value, matched: false }, { value, matched: false });
  }
  return shuffleArray(deck, getDeckRandom());
}

function getDeckRandom(salt = "deck") {
  if (!dailyMode) return Math.random;
  return createSeededRandom(`${getDailyKey()}-${level}-${stage}-${turnLimit}-${salt}`);
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
    clearMatchedPair(previous, index, path, 10 + combo * 2, true);
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

function clearMatchedPair(first, second, path, points, countCombo) {
  locked = true;
  if (countCombo) {
    combo += 1;
    longestComboRun = Math.max(longestComboRun, combo);
  }
  score += points;
  setMessage(countCombo && combo > 2 ? `连击 ${combo}！` : "配对成功。");
  showConnectionLine(path);
  animateMatchedTiles(first, second);
  playSound("match");
  updateStats();
  setTimeout(() => {
    tiles[first].matched = true;
    tiles[second].matched = true;
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
    Array.from({ length: cols + 2 }, () => Array(4).fill(6))
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
      if (turns > turnLimit) return;
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
  const shuffledValues = shuffleArray(values, dailyMode ? getDeckRandom(`shuffle-${shuffleCount++}`) : Math.random);
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

function showHint(duration = 1200) {
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
  setTimeout(clearHints, duration);
}

function useBomb() {
  if (!canUsePowerup("bomb")) return;
  const move = findMove();
  if (!move) {
    setMessage("没有可炸掉的组合，先洗牌试试。");
    return;
  }
  powerups.bomb -= 1;
  combo = 0;
  updatePowerupCounts();
  const path = findConnectionPath(move[0], move[1]);
  setMessage("炸弹消除一对牌。");
  clearMatchedPair(move[0], move[1], path, 8, false);
  playSound("bomb");
}

function useFreeze() {
  if (!canUsePowerup("freeze")) return;
  powerups.freeze -= 1;
  timeLeft = Math.min(seconds, timeLeft + 15);
  updatePowerupCounts();
  updateStats();
  setMessage("冻结时间，倒计时回补 15 秒。");
  playSound("freeze");
}

function useReveal() {
  if (!canUsePowerup("reveal")) return;
  powerups.reveal -= 1;
  updatePowerupCounts();
  showHint(2600);
}

function canUsePowerup(name) {
  if (paused || locked || timeLeft <= 0) return false;
  if (powerups[name] <= 0) {
    setMessage("这个道具已经用完了。");
    playSound("miss");
    return false;
  }
  unlockAudio();
  return true;
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

  const usedTime = seconds - Math.max(0, timeLeft);
  if (won) {
    const bonus = Math.max(0, timeLeft) + stage * 20;
    score += bonus;
    saveRecords({ won: true, usedTime });
    updateStats();
    setMessage(`第 ${stage} 关完成！`);
    playSound("win");
    showResultModal({
      won: true,
      usedTime,
      bonus,
      title: "关卡完成",
      summary: dailyMode ? `每日挑战第 ${stage} 关完成。` : `第 ${stage} 关完成，准备进入下一关。`
    });
    return;
  }

  saveRecords({ won: false, usedTime });
  updateStats();
  setMessage(`时间到了，最终得分 ${score}。`);
  playSound("over");
  showResultModal({
    won: false,
    usedTime,
    bonus: 0,
    title: "挑战结束",
    summary: "点重新开始再来一局。"
  });
}

function showResultModal(result) {
  resultTitleEl.textContent = result.title;
  resultSummaryEl.textContent = result.summary;
  resultTimeEl.textContent = formatTime(result.usedTime);
  resultBonusEl.textContent = result.bonus;
  resultScoreEl.textContent = score;
  resultComboEl.textContent = longestComboRun;
  nextStageButton.classList.toggle("hidden", !result.won);
  resultModalEl.classList.remove("hidden");
}

function hideResultModal() {
  resultModalEl.classList.add("hidden");
}

function continueToNextStage() {
  if (timeLeft <= 0 && !tiles.every(tile => tile.matched)) return;
  stage += 1;
  startGame(false);
}

function updateStats() {
  const remaining = tiles.filter(tile => !tile.matched).length;
  bestScore = getCurrentBestScore();
  stageEl.textContent = stage;
  bestScoreEl.textContent = bestScore;
  scoreEl.textContent = score;
  leftEl.textContent = remaining;
  comboEl.textContent = combo;
  timeEl.textContent = formatTime(Math.max(0, timeLeft));
  timeBarEl.style.transform = `scaleX(${Math.max(0, timeLeft / seconds)})`;
}

function updatePowerupCounts() {
  bombCountEl.textContent = powerups.bomb;
  freezeCountEl.textContent = powerups.freeze;
  revealCountEl.textContent = powerups.reveal;
}

function updateLeaderboardView() {
  leaderboardEls.easy.textContent = leaderboard.best.easy;
  leaderboardEls.normal.textContent = leaderboard.best.normal;
  leaderboardEls.hard.textContent = leaderboard.best.hard;
  leaderboardEls.daily.textContent = leaderboard.dailyBest[getDailyKey()] || 0;
  leaderboardEls.stage.textContent = leaderboard.maxStage;
  leaderboardEls.fast.textContent = leaderboard.fastestStage ? formatTime(leaderboard.fastestStage) : "--";
  leaderboardEls.combo.textContent = leaderboard.longestCombo;
}

function formatTime(value) {
  const minutes = String(Math.floor(value / 60)).padStart(2, "0");
  const secs = String(value % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

function setMessage(text) {
  messageEl.textContent = text;
}

function saveRecords({ won, usedTime }) {
  if (dailyMode) {
    const key = getDailyKey();
    leaderboard.dailyBest[key] = Math.max(leaderboard.dailyBest[key] || 0, score);
  } else {
    leaderboard.best[level] = Math.max(leaderboard.best[level] || 0, score);
  }
  if (won) {
    leaderboard.maxStage = Math.max(leaderboard.maxStage || 1, stage);
    if (leaderboard.fastestStage === null || usedTime < leaderboard.fastestStage) {
      leaderboard.fastestStage = usedTime;
    }
  }
  leaderboard.longestCombo = Math.max(leaderboard.longestCombo || 0, longestComboRun);
  localStorage.setItem(leaderboardKey, JSON.stringify(leaderboard));
  bestScore = getCurrentBestScore();
  updateLeaderboardView();
}

function loadLeaderboard() {
  const fallback = {
    best: { easy: 0, normal: Number(localStorage.getItem(legacyBestScoreKey) || 0), hard: 0 },
    dailyBest: {},
    maxStage: 1,
    fastestStage: null,
    longestCombo: 0
  };
  try {
    const saved = JSON.parse(localStorage.getItem(leaderboardKey));
    return {
      best: { ...fallback.best, ...(saved?.best || {}) },
      dailyBest: saved?.dailyBest || {},
      maxStage: saved?.maxStage || 1,
      fastestStage: saved?.fastestStage || null,
      longestCombo: saved?.longestCombo || 0
    };
  } catch {
    return fallback;
  }
}

function getCurrentBestScore() {
  if (dailyMode) return leaderboard.dailyBest[getDailyKey()] || 0;
  return leaderboard.best[level] || 0;
}

function getDailyKey() {
  return new Date().toISOString().slice(0, 10);
}

function getModeName() {
  return dailyMode ? "每日挑战 " : "";
}

function setDailyMode(enabled) {
  dailyMode = enabled;
  dailyModeButton.classList.toggle("active", dailyMode);
  normalModeButton.classList.toggle("active", !dailyMode);
  startGame(true);
}

function togglePause() {
  if (timeLeft <= 0 || !resultModalEl.classList.contains("hidden")) return;
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
  turnLimitInput.value = turnLimit;
  turnLimitValueEl.textContent = `${turnLimit} 次`;
  dailyModeButton.classList.toggle("active", dailyMode);
  normalModeButton.classList.toggle("active", !dailyMode);
  updatePowerupCounts();
}

function changeTurnLimit() {
  turnLimit = clampTurnLimit(Number(turnLimitInput.value));
  localStorage.setItem(turnLimitKey, String(turnLimit));
  selected = null;
  clearHints();
  clearConnectionLine();
  updateTileClasses();
  updateControlStates();
  setMessage(`已设置为最多转弯 ${turnLimit} 次。`);
  playSound("tap");
  ensureMove();
}

function clampTurnLimit(value) {
  return Math.min(5, Math.max(2, Number.isFinite(value) ? value : 2));
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
    over: [130, 0.22, "sine", 0.05],
    bomb: [90, 0.18, "sawtooth", 0.065],
    freeze: [880, 0.12, "sine", 0.045]
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

function shuffleArray(array, random = Math.random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createSeededRandom(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

document.querySelector("#newGame").addEventListener("click", () => {
  unlockAudio();
  playSound("tap");
  startGame(true);
});
document.querySelector("#hint").addEventListener("click", () => showHint());
document.querySelector("#shuffle").addEventListener("click", () => shuffleRemaining(true));
pauseButton.addEventListener("click", togglePause);
soundButton.addEventListener("click", toggleSound);
turnLimitInput.addEventListener("input", changeTurnLimit);
normalModeButton.addEventListener("click", () => setDailyMode(false));
dailyModeButton.addEventListener("click", () => setDailyMode(true));
bombButton.addEventListener("click", useBomb);
freezeButton.addEventListener("click", useFreeze);
revealButton.addEventListener("click", useReveal);
nextStageButton.addEventListener("click", continueToNextStage);
restartFromModalButton.addEventListener("click", () => startGame(true));
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
updateLeaderboardView();
startGame(true);
