const GRID_SIZE = 20;
const CELL = 28;
const TOTAL_AGENTS = 24;
const STEP_INTERVAL = 240;

const colors = {
  bg: "#07111f",
  line: "#3a5877",
  road: "#e6edf3",
  roadAlt: "#c7d3df",
  obstacle: "#101820",
  shelter: "#20d17d",
  agent: "#ffd84d",
  agentSimple: "#ff9f43",
  route: "#31c5ff",
  routeGlow: "rgba(49, 197, 255, 0.95)",
  routeSimple: "#ffb347",
  fire: "#ff4d4d",
  flood: "#2f9cff",
  industrial: "#b56cff",
  textDark: "#07111f",
};

const scenarios = [
  {
    name: "🔥 Incendio",
    kind: "fire",
    color: colors.fire,
    description: "Focos de calor bloqueiam quarteiroes e criam corredores estreitos.",
  },
  {
    name: "🌊 Enchente",
    kind: "flood",
    color: colors.flood,
    description: "Agua invade areas baixas e corta ruas proximas ao rio.",
  },
  {
    name: "🏭 Acidente industrial",
    kind: "industrial",
    color: colors.industrial,
    description: "Zonas contaminadas isolam regioes perto da fabrica.",
  },
];

const shelters = [[1, 1], [18, 2], [2, 18], [18, 18]];
const starts = [
  [9, 10], [10, 10], [8, 9], [11, 9], [7, 11], [12, 11], [8, 13], [11, 13],
  [6, 6], [13, 6], [5, 14], [14, 14], [4, 9], [15, 10], [9, 4], [10, 15],
  [3, 12], [16, 7], [7, 16], [13, 3], [6, 12], [12, 6], [15, 15], [4, 4],
];

const state = {
  scenarioIndex: 0,
  seed: 42,
  blocked: new Set(),
  aiAgents: [],
  simpleAgents: [],
  paused: false,
  elapsed: 0,
  lastFrame: performance.now(),
  stepAccumulator: 0,
  aiFinishTime: null,
  simpleFinishTime: null,
  resultShown: false,
  alertUntil: 0,
};

const aiCanvas = document.querySelector("#aiCanvas");
const simpleCanvas = document.querySelector("#simpleCanvas");
const aiCtx = aiCanvas.getContext("2d");
const simpleCtx = simpleCanvas.getContext("2d");

function key(cell) {
  return `${cell[0]},${cell[1]}`;
}

function sameCell(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function heuristic(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function neighbors(cell) {
  const [x, y] = cell;
  return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
    .filter(([nx, ny]) => nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE);
}

function nearestGoal(cell, goals) {
  return goals.reduce((best, goal) => heuristic(cell, goal) < heuristic(cell, best) ? goal : best, goals[0]);
}

function reconstruct(cameFrom, currentKey) {
  const path = [currentKey.split(",").map(Number)];
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey);
    path.push(currentKey.split(",").map(Number));
  }
  return path.reverse();
}

function aStar(start, goals, blocked) {
  const open = [{ cell: start, priority: 0 }];
  const cameFrom = new Map();
  const gScore = new Map([[key(start), 0]]);
  const goalKeys = new Set(goals.map(key));

  while (open.length) {
    open.sort((a, b) => a.priority - b.priority);
    const current = open.shift().cell;
    const currentKey = key(current);
    if (goalKeys.has(currentKey)) return reconstruct(cameFrom, currentKey);

    for (const next of neighbors(current)) {
      const nextKey = key(next);
      if (blocked.has(nextKey) && !goalKeys.has(nextKey)) continue;
      const tentative = gScore.get(currentKey) + 1;
      if (tentative < (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentative);
        const goal = nearestGoal(next, goals);
        open.push({ cell: next, priority: tentative + heuristic(next, goal) });
      }
    }
  }
  return [start];
}

function simpleRoute(start, goals, blocked) {
  const target = nearestGoal(start, goals);
  let [x, y] = start;
  const route = [[x, y]];
  let guard = 0;

  while ((x !== target[0] || y !== target[1]) && guard < 140) {
    guard += 1;
    const candidates = [];
    if (x < target[0]) candidates.push([x + 1, y]);
    else if (x > target[0]) candidates.push([x - 1, y]);
    if (y < target[1]) candidates.push([x, y + 1]);
    else if (y > target[1]) candidates.push([x, y - 1]);
    candidates.push(...neighbors([x, y]));

    let moved = false;
    for (const next of candidates) {
      const previous = route.length > 1 ? route[route.length - 2] : null;
      if (!state.blocked.has(key(next)) && (!previous || !sameCell(next, previous))) {
        [x, y] = next;
        route.push([x, y]);
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  return route;
}

function generateObstacles(kind, seed) {
  const rng = seededRandom(seed);
  const blocked = new Set();
  const add = (x, y) => {
    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) blocked.add(`${x},${y}`);
  };

  if (kind === "fire") {
    for (const [cx, cy] of [[6, 7], [11, 11], [14, 6]]) {
      for (let x = cx - 2; x <= cx + 2; x += 1) {
        for (let y = cy - 2; y <= cy + 2; y += 1) if (rng() < 0.58) add(x, y);
      }
    }
    for (let y = 3; y < 17; y += 1) if (![5, 12].includes(y)) add(9, y);
  } else if (kind === "flood") {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const wave = 9 + Math.trunc(2 * Math.sin(x / 2));
      for (let dy = -1; dy <= 1; dy += 1) if (rng() < 0.86) add(x, wave + dy);
    }
    for (let x = 3; x < 17; x += 1) if (![5, 14].includes(x)) add(x, 13);
  } else {
    for (let x = 12; x < 18; x += 1) {
      for (let y = 7; y < 14; y += 1) if (rng() < 0.64) add(x, y);
    }
    for (let x = 4; x < 9; x += 1) {
      for (let y = 4; y < 9; y += 1) if (rng() < 0.45) add(x, y);
    }
    for (let y = 2; y < 18; y += 1) if (![4, 15].includes(y)) add(11, y);
  }

  [...shelters, ...starts].forEach((cell) => blocked.delete(key(cell)));
  return blocked;
}

function makeAgents(blocked, useAi) {
  return starts.map((start) => {
    const route = useAi ? aStar(start, shelters, blocked) : simpleRoute(start, shelters, blocked);
    return {
      start,
      pos: [...start],
      from: [...start],
      to: [...start],
      visual: [...start],
      route,
      step: 0,
      moveProgress: 1,
      evacuated: false,
      evacTime: null,
      waitTicks: 0,
      recalcCount: 0,
    };
  });
}

function reset(newSeed = false) {
  if (newSeed) state.seed = Math.floor(Math.random() * 99999) + 1;
  const scenario = scenarios[state.scenarioIndex];
  state.blocked = generateObstacles(scenario.kind, state.seed + state.scenarioIndex * 1000);
  state.aiAgents = makeAgents(state.blocked, true);
  state.simpleAgents = makeAgents(state.blocked, false);
  state.elapsed = 0;
  state.stepAccumulator = 0;
  state.paused = false;
  state.aiFinishTime = null;
  state.simpleFinishTime = null;
  state.resultShown = false;
  state.alertUntil = performance.now() + 1800;
  document.querySelector("#resultModal").classList.remove("show");
  updateScenarioUi();
  updatePauseButton();
}

function triggerAiAlert() {
  state.alertUntil = performance.now() + 1800;
}

function updateAgents(agents, useAi) {
  const occupied = new Map();
  for (const agent of agents) {
    if (!agent.evacuated) occupied.set(key(agent.pos), (occupied.get(key(agent.pos)) ?? 0) + 1);
  }

  for (const agent of agents) {
    if (agent.evacuated || agent.moveProgress < 1) continue;
    if (shelters.some((shelter) => sameCell(agent.pos, shelter))) {
      agent.evacuated = true;
      agent.evacTime = state.elapsed;
      continue;
    }

    if (agent.step + 1 >= agent.route.length) {
      agent.waitTicks += 1;
      if (useAi && agent.recalcCount < 2) {
        agent.route = aStar(agent.pos, shelters, state.blocked);
        agent.step = 0;
        agent.recalcCount += 1;
        triggerAiAlert();
      }
      continue;
    }

    const next = agent.route[agent.step + 1];
    if ((occupied.get(key(next)) ?? 0) > 1 && Math.random() < 0.42) {
      agent.waitTicks += 1;
      if (useAi && agent.waitTicks % 4 === 0) {
        agent.route = aStar(agent.pos, shelters, state.blocked);
        agent.step = 0;
        agent.recalcCount += 1;
        triggerAiAlert();
      }
      continue;
    }

    agent.step += 1;
    agent.from = [...agent.pos];
    agent.to = [...next];
    agent.moveProgress = 0;
    agent.pos = [...next];
    occupied.set(key(agent.pos), (occupied.get(key(agent.pos)) ?? 0) + 1);
  }
}

function animateAgents(agents, delta) {
  for (const agent of agents) {
    if (agent.evacuated) continue;
    if (agent.moveProgress < 1) {
      agent.moveProgress = Math.min(1, agent.moveProgress + delta / STEP_INTERVAL);
      const t = easeInOut(agent.moveProgress);
      agent.visual = [
        agent.from[0] + (agent.to[0] - agent.from[0]) * t,
        agent.from[1] + (agent.to[1] - agent.from[1]) * t,
      ];
      if (agent.moveProgress >= 1) {
        agent.visual = [...agent.pos];
        if (shelters.some((shelter) => sameCell(agent.pos, shelter))) {
          agent.evacuated = true;
          agent.evacTime = state.elapsed;
        }
      }
    }
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function metrics(agents, finishTime) {
  const evacuated = agents.filter((agent) => agent.evacuated);
  const waits = agents.reduce((sum, agent) => sum + agent.waitTicks, 0);
  const steps = Math.max(1, agents.reduce((sum, agent) => sum + Math.max(agent.step, 1), 0));
  return {
    evacuated: evacuated.length,
    avgTime: evacuated.length ? evacuated.reduce((sum, agent) => sum + agent.evacTime, 0) / evacuated.length : 0,
    congestion: Math.min(100, (waits / steps) * 100),
    remaining: agents.length - evacuated.length,
    totalTime: finishTime ?? state.elapsed,
  };
}

function scoreFor(data) {
  const savedScore = (data.evacuated / TOTAL_AGENTS) * 70;
  const timeScore = Math.max(0, 20 - data.avgTime * 0.75);
  const congestionScore = Math.max(0, 10 - data.congestion * 0.1);
  return Math.round(savedScore + timeScore + congestionScore);
}

function drawMap(ctx, agents, routeColor, agentColor, useAi) {
  const scenario = scenarios[state.scenarioIndex];
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      ctx.fillStyle = (x + y) % 2 ? colors.road : colors.roadAlt;
      if (state.blocked.has(`${x},${y}`)) ctx.fillStyle = scenario.color;
      ctx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
    }
  }

  drawGrid(ctx);
  drawShelters(ctx);
  drawRoutes(ctx, agents, routeColor, useAi);
  drawAgents(ctx, agents, agentColor);

  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, ctx.canvas.width - 3, ctx.canvas.height - 3);
}

function drawGrid(ctx) {
  ctx.strokeStyle = "rgba(7, 17, 31, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0);
    ctx.lineTo(i * CELL, GRID_SIZE * CELL);
    ctx.moveTo(0, i * CELL);
    ctx.lineTo(GRID_SIZE * CELL, i * CELL);
    ctx.stroke();
  }
}

function drawShelters(ctx) {
  for (const [x, y] of shelters) {
    const px = x * CELL;
    const py = y * CELL;
    ctx.fillStyle = colors.shelter;
    roundedRect(ctx, px + 4, py + 4, CELL - 8, CELL - 8, 6);
    ctx.fill();
    ctx.fillStyle = colors.textDark;
    ctx.font = "bold 15px Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("A", px + CELL / 2, py + CELL / 2);
  }
}

function drawRoutes(ctx, agents, routeColor, useAi) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const agent of agents) {
    if (agent.route.length < 2 || agent.evacuated) continue;
    const visible = agent.route.slice(agent.step);
    if (visible.length < 2) continue;

    if (useAi) {
      ctx.shadowColor = colors.routeGlow;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(49, 197, 255, 0.42)";
      tracePath(ctx, visible);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.lineWidth = useAi ? 3 : 2;
    ctx.strokeStyle = routeColor;
    tracePath(ctx, visible);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function tracePath(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    const px = x * CELL + CELL / 2;
    const py = y * CELL + CELL / 2;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
}

function drawAgents(ctx, agents, agentColor) {
  const cellCounts = new Map();
  for (const agent of agents) {
    if (!agent.evacuated) cellCounts.set(key(agent.pos), (cellCounts.get(key(agent.pos)) ?? 0) + 1);
  }

  for (const agent of agents) {
    if (agent.evacuated) continue;
    const px = agent.visual[0] * CELL + CELL / 2;
    const py = agent.visual[1] * CELL + CELL / 2;
    const crowded = (cellCounts.get(key(agent.pos)) ?? 0) > 1;
    const radius = crowded ? 10 : 7.5;
    ctx.beginPath();
    ctx.fillStyle = agentColor;
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = colors.bg;
    ctx.stroke();
    if (crowded) {
      ctx.beginPath();
      ctx.strokeStyle = "#ff4d4d";
      ctx.lineWidth = 2;
      ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function updateMetrics() {
  const ai = metrics(state.aiAgents, state.aiFinishTime);
  const human = metrics(state.simpleAgents, state.simpleFinishTime);
  const aiScore = scoreFor(ai);
  const humanScore = scoreFor(human);
  const efficiency = Math.max(0, Math.min(100, aiScore - humanScore + 50));

  setText("savedKpi", ai.evacuated.toFixed(0));
  setText("remainingKpi", ai.remaining.toFixed(0));
  setText("avgKpi", `${ai.avgTime.toFixed(1)}s`);
  setText("efficiencyKpi", `${efficiency}%`);

  setText("aiEvacuated", `${ai.evacuated}/${TOTAL_AGENTS}`);
  setText("aiAvg", `${ai.avgTime.toFixed(1)}s`);
  setText("aiCongestion", `${ai.congestion.toFixed(0)}%`);
  setText("aiRemaining", ai.remaining.toFixed(0));
  setText("simpleEvacuated", `${human.evacuated}/${TOTAL_AGENTS}`);
  setText("simpleAvg", `${human.avgTime.toFixed(1)}s`);
  setText("simpleCongestion", `${human.congestion.toFixed(0)}%`);
  setText("simpleRemaining", human.remaining.toFixed(0));
  setText("aiScore", `${aiScore} pontos`);
  setText("humanScore", `${humanScore} pontos`);
  setText("winnerText", aiScore >= humanScore ? "🤖 A IA esta conduzindo a evacuacao com melhor desempenho." : "👤 A rota simples esta temporariamente na frente.");
  setText("evacuationComparison", `IA salvou ${(ai.evacuated - human.evacuated) >= 0 ? "+" : ""}${ai.evacuated - human.evacuated} pessoa(s)`);
  const avgGain = human.avgTime && ai.avgTime ? human.avgTime - ai.avgTime : 0;
  setText("timeComparison", `Ganho medio de tempo: ${avgGain >= 0 ? "+" : ""}${avgGain.toFixed(1)}s`);

  document.querySelector("#aiAlert").classList.toggle("show", performance.now() < state.alertUntil);
}

function checkFinish() {
  const ai = metrics(state.aiAgents, state.aiFinishTime);
  const human = metrics(state.simpleAgents, state.simpleFinishTime);

  if (!state.aiFinishTime && ai.evacuated === TOTAL_AGENTS) state.aiFinishTime = state.elapsed;
  if (!state.simpleFinishTime && human.evacuated === TOTAL_AGENTS) state.simpleFinishTime = state.elapsed;

  const allDone = (state.aiFinishTime || ai.remaining === 0) && (state.simpleFinishTime || human.remaining === 0);
  const timedOut = state.elapsed > 42;
  if (!state.resultShown && (allDone || timedOut)) showResults();
}

function showResults() {
  state.resultShown = true;
  const ai = metrics(state.aiAgents, state.aiFinishTime);
  const human = metrics(state.simpleAgents, state.simpleFinishTime);
  const aiScore = scoreFor(ai);
  const humanScore = scoreFor(human);
  const aiBest = aiScore >= humanScore;

  setText("aiTotalResult", `${ai.totalTime.toFixed(1)}s`);
  setText("aiSavedResult", `${ai.evacuated}/${TOTAL_AGENTS}`);
  setText("aiCongestionResult", `${ai.congestion.toFixed(0)}%`);
  setText("humanTotalResult", `${human.totalTime.toFixed(1)}s`);
  setText("humanSavedResult", `${human.evacuated}/${TOTAL_AGENTS}`);
  setText("humanCongestionResult", `${human.congestion.toFixed(0)}%`);
  setText("resultWinner", aiBest ? "🏆 Melhor estrategia: Inteligencia Artificial" : "🏆 Melhor estrategia: Rota simples");
  document.querySelector("#aiResultCard").classList.toggle("best", aiBest);
  document.querySelector("#humanResultCard").classList.toggle("best", !aiBest);
  document.querySelector("#resultModal").classList.add("show");
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function updateScenarioUi() {
  const scenario = scenarios[state.scenarioIndex];
  document.documentElement.style.setProperty("--fire", scenario.color);
  document.querySelectorAll(".scenario-button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.scenario) === state.scenarioIndex);
  });
  const tag = document.querySelector("#scenarioTag");
  tag.textContent = scenario.name;
  tag.style.color = scenario.color;
  setText("scenarioDescription", scenario.description);
}

function updatePauseButton() {
  document.querySelector("#pauseButton").textContent = state.paused ? "▶️ Continuar" : "⏸️ Pausar";
}

function frame(now) {
  const delta = Math.min(50, now - state.lastFrame);
  state.lastFrame = now;
  if (!state.paused) {
    state.elapsed += delta / 1000;
    state.stepAccumulator += delta;
    animateAgents(state.aiAgents, delta);
    animateAgents(state.simpleAgents, delta);
    while (state.stepAccumulator >= STEP_INTERVAL) {
      updateAgents(state.aiAgents, true);
      updateAgents(state.simpleAgents, false);
      state.stepAccumulator -= STEP_INTERVAL;
    }
    checkFinish();
  }
  drawMap(aiCtx, state.aiAgents, colors.route, colors.agent, true);
  drawMap(simpleCtx, state.simpleAgents, colors.routeSimple, colors.agentSimple, false);
  updateMetrics();
  requestAnimationFrame(frame);
}

document.querySelectorAll(".scenario-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.scenarioIndex = Number(button.dataset.scenario);
    reset();
  });
});

document.querySelector("#pauseButton").addEventListener("click", () => {
  state.paused = !state.paused;
  updatePauseButton();
});

document.querySelector("#resetButton").addEventListener("click", () => reset());
document.querySelector("#newButton").addEventListener("click", () => reset(true));
document.querySelector("#closeResultButton").addEventListener("click", () => {
  document.querySelector("#resultModal").classList.remove("show");
});

window.addEventListener("keydown", (event) => {
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(document.activeElement.tagName)) return;
  if (event.code === "Space") {
    event.preventDefault();
    state.paused = !state.paused;
    updatePauseButton();
  } else if (event.key.toLowerCase() === "r") {
    reset();
  } else if (event.key.toLowerCase() === "n") {
    reset(true);
  } else if (["1", "2", "3"].includes(event.key)) {
    state.scenarioIndex = Number(event.key) - 1;
    reset();
  }
});

reset();
requestAnimationFrame(frame);
