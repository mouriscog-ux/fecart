const CELL = 32;
const COLS = 28;
const ROWS = 20;
const TOTAL = 24;
const STEP_MS = 180;

const roads = new Set();
for (let x = 0; x < COLS; x += 1) [3, 7, 11, 15, 18].forEach((y) => roads.add(`${x},${y}`));
for (let y = 0; y < ROWS; y += 1) [4, 9, 14, 20, 24].forEach((x) => roads.add(`${x},${y}`));

const shelters = [[3, 3], [24, 3], [4, 18], [24, 18]];
const starts = [
  [13, 10], [14, 10], [12, 11], [15, 11], [11, 9], [16, 9], [13, 12], [14, 12],
  [9, 7], [18, 7], [8, 15], [19, 15], [6, 11], [22, 11], [10, 4], [17, 18],
  [5, 15], [23, 7], [7, 18], [20, 3], [9, 15], [18, 11], [22, 18], [5, 4],
];

const scenarios = [
  {
    label: "Incendio",
    icon: "🔥",
    kind: "fire",
    color: "#ff4f5f",
    story: "Um incendio começou no centro da cidade. 24 pessoas precisam ser evacuadas. Voce consegue fazer melhor que a Inteligencia Artificial?",
  },
  {
    label: "Enchente",
    icon: "🌊",
    kind: "flood",
    color: "#2fa7ff",
    story: "Uma enchente bloqueou vias importantes. 24 pessoas precisam chegar aos abrigos verdes antes que a agua avance.",
  },
  {
    label: "Acidente Industrial",
    icon: "☣️",
    kind: "industrial",
    color: "#ffb13b",
    story: "Um vazamento industrial criou uma zona de risco. 24 pessoas precisam sair da area contaminada rapidamente.",
  },
];

const state = {
  scenario: 0,
  blocked: new Set(),
  selectedRoute: [],
  visitorAgents: [],
  aiAgents: [],
  mode: "home",
  elapsed: 0,
  lastFrame: performance.now(),
  accumulator: 0,
  visitorResult: null,
  aiResult: null,
  messages: ["Escolha ruas conectadas para guiar a evacuacao."],
};

const canvas = document.querySelector("#cityCanvas");
const ctx = canvas.getContext("2d");

function show(id) {
  ["home", "story", "app", "result"].forEach((screen) => document.querySelector(`#${screen}`).classList.add("hidden"));
  document.querySelector(`#${id}`).classList.remove("hidden");
}

function key([x, y]) {
  return `${x},${y}`;
}

function same(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function neighbors([x, y]) {
  return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
    .filter(([nx, ny]) => nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && roads.has(`${nx},${ny}`));
}

function dist(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function nearestShelter(cell) {
  return shelters.reduce((best, shelter) => dist(cell, shelter) < dist(cell, best) ? shelter : best, shelters[0]);
}

function makeBlocked(kind) {
  const blocked = new Set();
  const add = (x, y) => roads.has(`${x},${y}`) && blocked.add(`${x},${y}`);
  if (kind === "fire") {
    for (let x = 10; x <= 17; x += 1) add(x, 11);
    for (let y = 6; y <= 14; y += 1) add(14, y);
    add(9, 7); add(20, 15);
  } else if (kind === "flood") {
    for (let x = 0; x < COLS; x += 1) if (![4, 20].includes(x)) add(x, 15);
    for (let y = 8; y <= 18; y += 1) add(9, y);
  } else {
    for (let y = 4; y <= 18; y += 1) if (![7, 15].includes(y)) add(20, y);
    for (let x = 14; x <= 24; x += 1) add(x, 7);
  }
  [...shelters, ...starts].forEach((cell) => blocked.delete(key(cell)));
  return blocked;
}

function aStar(start, goals, blocked) {
  const open = [{ cell: start, priority: 0 }];
  const came = new Map();
  const cost = new Map([[key(start), 0]]);
  const goalKeys = new Set(goals.map(key));
  while (open.length) {
    open.sort((a, b) => a.priority - b.priority);
    const current = open.shift().cell;
    if (goalKeys.has(key(current))) return rebuild(came, key(current));
    for (const next of neighbors(current)) {
      if (blocked.has(key(next)) && !goalKeys.has(key(next))) continue;
      const newCost = cost.get(key(current)) + 1;
      if (newCost < (cost.get(key(next)) ?? 9999)) {
        came.set(key(next), key(current));
        cost.set(key(next), newCost);
        const goal = nearestShelter(next);
        open.push({ cell: next, priority: newCost + dist(next, goal) });
      }
    }
  }
  return [start];
}

function rebuild(came, current) {
  const path = [current.split(",").map(Number)];
  while (came.has(current)) {
    current = came.get(current);
    path.push(current.split(",").map(Number));
  }
  return path.reverse();
}

function visitorPath(start) {
  if (state.selectedRoute.length < 2) return [start];
  let bestIndex = 0;
  state.selectedRoute.forEach((cell, index) => {
    if (dist(start, cell) < dist(start, state.selectedRoute[bestIndex])) bestIndex = index;
  });
  const approach = aStar(start, [state.selectedRoute[bestIndex]], state.blocked);
  const manual = state.selectedRoute.slice(bestIndex);
  const finish = aStar(manual[manual.length - 1], shelters, state.blocked);
  return [...approach, ...manual.slice(1), ...finish.slice(1)];
}

function makeAgents(kind) {
  return starts.map((start) => {
    const route = kind === "ai" ? aStar(start, shelters, state.blocked) : visitorPath(start);
    return { pos: [...start], visual: [...start], from: [...start], to: [...start], route, step: 0, progress: 1, saved: false, time: 0, wait: 0 };
  });
}

function addMessage(text) {
  if (state.messages[0] !== text) state.messages.unshift(text);
  state.messages = state.messages.slice(0, 4);
  document.querySelector("#messages").innerHTML = state.messages.map((m) => `<li>${m}</li>`).join("");
}

function startScenario(index) {
  state.scenario = index;
  state.blocked = makeBlocked(scenarios[index].kind);
  state.selectedRoute = [];
  state.visitorResult = null;
  state.aiResult = null;
  document.querySelector("#storyTag").textContent = `${scenarios[index].icon} ${scenarios[index].label}`;
  document.querySelector("#storyTitle").textContent = "A cidade precisa de uma decisao rapida.";
  document.querySelector("#storyText").textContent = scenarios[index].story;
  show("story");
}

function startChallenge() {
  state.mode = "draw";
  state.elapsed = 0;
  state.messages = ["Clique nas ruas para desenhar sua rota.", "Tente chegar aos abrigos verdes evitando o perigo."];
  document.querySelector("#emergencyName").textContent = `${scenarios[state.scenario].icon} ${scenarios[state.scenario].label}`;
  document.querySelector("#instruction").textContent = "Clique nas ruas para criar uma rota. Depois confirme sua estrategia.";
  document.querySelector("#modeLabel").textContent = "Modo desafio do visitante";
  document.querySelector("#confirmRoute").classList.remove("hidden");
  document.querySelector("#runAi").classList.add("hidden");
  resetMetrics();
  addMessage("Clique nas ruas para desenhar sua rota.");
  show("app");
}

function runVisitor() {
  state.mode = "visitor";
  state.elapsed = 0;
  state.accumulator = 0;
  state.visitorAgents = makeAgents("visitor");
  document.querySelector("#confirmRoute").classList.add("hidden");
  document.querySelector("#instruction").textContent = "Sua estrategia esta em execucao.";
  addMessage("Executando a estrategia do visitante.");
}

function runAi() {
  state.mode = "ai";
  state.elapsed = 0;
  state.accumulator = 0;
  state.aiAgents = makeAgents("ai");
  document.querySelector("#runAi").classList.add("hidden");
  document.querySelector("#modeLabel").textContent = "Inteligencia Artificial em acao";
  document.querySelector("#instruction").textContent = "Agora veja a IA trabalhando.";
  addMessage("🧠 Agora veja a IA trabalhando.");
  addMessage("IA recalculando rotas mais eficientes.");
}

function resetMetrics() {
  ["savedMetric", "timeMetric", "congestionMetric"].forEach((id) => document.querySelector(`#${id}`).textContent = id === "timeMetric" ? "0.0s" : id === "congestionMetric" ? "0%" : "0");
  document.querySelector("#efficiencyMetric").textContent = "--";
  document.querySelector("#progressText").textContent = "0%";
  document.querySelector("#progressBar").style.width = "0%";
  document.querySelector("#visitorSummary").textContent = "Aguardando";
  document.querySelector("#aiSummary").textContent = "Aguardando";
}

function updateAgents(agents) {
  const occupied = new Map();
  agents.filter((a) => !a.saved).forEach((a) => occupied.set(key(a.pos), (occupied.get(key(a.pos)) ?? 0) + 1));
  for (const agent of agents) {
    if (agent.saved || agent.progress < 1) continue;
    if (shelters.some((s) => same(s, agent.pos))) {
      agent.saved = true;
      agent.time = state.elapsed;
      continue;
    }
    if (agent.step + 1 >= agent.route.length) {
      agent.wait += 1;
      continue;
    }
    const next = agent.route[agent.step + 1];
    if ((occupied.get(key(next)) ?? 0) > 1 && Math.random() < 0.35) {
      agent.wait += 1;
      addMessage("Congestionamento identificado.");
      continue;
    }
    agent.from = [...agent.pos];
    agent.to = [...next];
    agent.pos = [...next];
    agent.step += 1;
    agent.progress = 0;
  }
}

function animate(agents, delta) {
  for (const a of agents) {
    if (a.saved || a.progress >= 1) continue;
    a.progress = Math.min(1, a.progress + delta / STEP_MS);
    const t = a.progress < 0.5 ? 2 * a.progress * a.progress : 1 - ((-2 * a.progress + 2) ** 2) / 2;
    a.visual = [a.from[0] + (a.to[0] - a.from[0]) * t, a.from[1] + (a.to[1] - a.from[1]) * t];
  }
}

function metrics(agents) {
  const saved = agents.filter((a) => a.saved);
  const waits = agents.reduce((sum, a) => sum + a.wait, 0);
  const steps = Math.max(1, agents.reduce((sum, a) => sum + Math.max(a.step, 1), 0));
  return {
    saved: saved.length,
    time: saved.length ? Math.max(...saved.map((a) => a.time)) : state.elapsed,
    avg: saved.length ? saved.reduce((sum, a) => sum + a.time, 0) / saved.length : 0,
    congestion: Math.min(100, (waits / steps) * 100),
  };
}

function finishRun(kind) {
  const result = metrics(kind === "ai" ? state.aiAgents : state.visitorAgents);
  if (kind === "visitor") {
    state.visitorResult = result;
    document.querySelector("#visitorSummary").textContent = `${result.saved} salvas`;
    document.querySelector("#runAi").classList.remove("hidden");
    document.querySelector("#instruction").textContent = "Boa! Agora compare com a Inteligencia Artificial.";
    state.mode = "afterVisitor";
    addMessage("Estrategia do visitante concluida.");
  } else {
    state.aiResult = result;
    showResult();
  }
}

function score(result) {
  return result.saved * 100 - result.time * 5 - result.congestion * 2;
}

function showResult() {
  const visitorWins = score(state.visitorResult) > score(state.aiResult);
  document.querySelector("#resultPhrase").textContent = visitorWins
    ? "Parabens! Voce conseguiu superar a estrategia da IA."
    : "A Inteligencia Artificial encontrou rotas mais eficientes.";
  document.querySelector("#visitorTime").textContent = `${state.visitorResult.time.toFixed(1)}s`;
  document.querySelector("#visitorSaved").textContent = `${state.visitorResult.saved}/${TOTAL}`;
  document.querySelector("#visitorCongestion").textContent = `${state.visitorResult.congestion.toFixed(0)}%`;
  document.querySelector("#aiTime").textContent = `${state.aiResult.time.toFixed(1)}s`;
  document.querySelector("#aiSaved").textContent = `${state.aiResult.saved}/${TOTAL}`;
  document.querySelector("#aiCongestion").textContent = `${state.aiResult.congestion.toFixed(0)}%`;
  document.querySelector("#aiRecalc").textContent = "24";
  document.querySelector("#visitorResult").classList.toggle("winner", visitorWins);
  document.querySelector("#aiResult").classList.toggle("winner", !visitorWins);
  show("result");
}

function updatePanel() {
  const agents = state.mode === "ai" ? state.aiAgents : state.visitorAgents;
  if (!["visitor", "ai"].includes(state.mode)) return;
  const data = metrics(agents);
  const pct = Math.round((data.saved / TOTAL) * 100);
  document.querySelector("#savedMetric").textContent = data.saved;
  document.querySelector("#timeMetric").textContent = `${state.elapsed.toFixed(1)}s`;
  document.querySelector("#congestionMetric").textContent = `${data.congestion.toFixed(0)}%`;
  document.querySelector("#progressText").textContent = `${pct}%`;
  document.querySelector("#progressBar").style.width = `${pct}%`;
  if (state.visitorResult && state.mode === "ai") {
    const eff = Math.max(0, Math.min(100, Math.round(score(data) - score(state.visitorResult) + 50)));
    document.querySelector("#efficiencyMetric").textContent = `${eff}%`;
    document.querySelector("#aiSummary").textContent = `${data.saved} salvas`;
  }
}

function draw() {
  drawCity();
  drawHazards();
  drawShelters();
  drawSelectedRoute();
  if (state.mode === "visitor" || state.mode === "afterVisitor") drawAgents(state.visitorAgents, "#ffd95a");
  if (state.mode === "ai") {
    drawAiRoutes();
    drawAgents(state.aiAgents, "#33c7ff");
  }
  drawHint();
}

function drawCity() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#7890a0");
  grad.addColorStop(1, "#596d7d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x < COLS; x += 1) {
    for (let y = 0; y < ROWS; y += 1) {
      const px = x * CELL;
      const py = y * CELL;
      if (roads.has(`${x},${y}`)) {
        ctx.fillStyle = "#314452";
        ctx.fillRect(px, py, CELL, CELL);
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + CELL / 2, py + 4);
        ctx.lineTo(px + CELL / 2, py + CELL - 4);
        ctx.moveTo(px + 4, py + CELL / 2);
        ctx.lineTo(px + CELL - 4, py + CELL / 2);
        ctx.stroke();
      } else if ((x < 4 && y > 14) || (x > 21 && y > 8 && y < 13)) {
        ctx.fillStyle = "#2f9663";
        round(px + 3, py + 3, CELL - 6, CELL - 6, 8);
        ctx.fill();
      } else {
        ctx.fillStyle = (x + y) % 2 ? "#1c3348" : "#223b52";
        round(px + 5, py + 5, CELL - 10, CELL - 10, 5);
        ctx.fill();
        ctx.fillStyle = "rgba(170,230,255,0.26)";
        ctx.fillRect(px + 10, py + 10, 4, 4);
        ctx.fillRect(px + 18, py + 10, 4, 4);
      }
    }
  }
}

function drawHazards() {
  const scenario = scenarios[state.scenario];
  const t = performance.now() / 1000;
  for (const item of state.blocked) {
    const [x, y] = item.split(",").map(Number);
    const px = x * CELL;
    const py = y * CELL;
    if (scenario.kind === "fire") {
      ctx.fillStyle = `rgba(255,79,95,${0.68 + Math.sin(t * 8 + x) * 0.18})`;
      round(px + 3, py + 3, CELL - 6, CELL - 6, 8); ctx.fill();
      ctx.fillStyle = "#ffd95a"; ctx.font = "20px Segoe UI"; ctx.fillText("🔥", px + 5, py + 23);
    } else if (scenario.kind === "flood") {
      ctx.fillStyle = "rgba(47,167,255,0.72)";
      round(px + 2, py + 5 + Math.sin(t * 3 + x) * 2, CELL - 4, CELL - 10, 9); ctx.fill();
    } else {
      ctx.fillStyle = "rgba(255,177,59,0.76)";
      round(px + 3, py + 3, CELL - 6, CELL - 6, 8); ctx.fill();
      ctx.fillStyle = "#101820"; ctx.font = "19px Segoe UI"; ctx.fillText("☣", px + 7, py + 23);
    }
  }
}

function drawShelters() {
  for (const [x, y] of shelters) {
    const px = x * CELL, py = y * CELL;
    ctx.shadowColor = "#28e28b"; ctx.shadowBlur = 24;
    ctx.fillStyle = "#28e28b"; round(px + 2, py + 2, CELL - 4, CELL - 4, 10); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#062014"; ctx.font = "bold 22px Segoe UI"; ctx.fillText("✚", px + 8, py + 24);
  }
}

function drawSelectedRoute() {
  if (state.selectedRoute.length < 2) return;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,217,90,0.9)"; ctx.lineWidth = 7;
  trace(state.selectedRoute); ctx.stroke();
}

function drawAiRoutes() {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const a of state.aiAgents) {
    if (a.saved || a.route.length < 2) continue;
    ctx.shadowColor = "#33c7ff"; ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(51,199,255,0.86)"; ctx.lineWidth = 5;
    trace(a.route.slice(a.step)); ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawAgents(agents, color) {
  const t = performance.now() / 120;
  for (const a of agents) {
    if (a.saved) continue;
    const px = a.visual[0] * CELL + CELL / 2;
    const py = a.visual[1] * CELL + CELL / 2;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px, py - 5, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(px - 4, py, 8, 10);
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 2, py + 9); ctx.lineTo(px - 7, py + 15 + Math.sin(t + px) * 2);
    ctx.moveTo(px + 2, py + 9); ctx.lineTo(px + 7, py + 15 - Math.sin(t + px) * 2);
    ctx.stroke();
  }
}

function drawHint() {
  if (state.mode !== "draw") return;
  ctx.fillStyle = "rgba(5,11,20,0.72)";
  round(20, 20, 360, 54, 16); ctx.fill();
  ctx.fillStyle = "#f7fbff"; ctx.font = "bold 18px Segoe UI";
  ctx.fillText("Clique nas ruas para desenhar sua rota", 40, 54);
}

function trace(points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const px = x * CELL + CELL / 2;
    const py = y * CELL + CELL / 2;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  });
}

function round(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function canvasCell(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * COLS);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * ROWS);
  return [x, y];
}

function tick(now) {
  const delta = Math.min(50, now - state.lastFrame);
  state.lastFrame = now;
  if (state.mode === "visitor" || state.mode === "ai") {
    state.elapsed += delta / 1000;
    const agents = state.mode === "visitor" ? state.visitorAgents : state.aiAgents;
    animate(agents, delta);
    state.accumulator += delta;
    while (state.accumulator >= STEP_MS) {
      updateAgents(agents);
      state.accumulator -= STEP_MS;
    }
    updatePanel();
    if (metrics(agents).saved === TOTAL || state.elapsed > 45) finishRun(state.mode);
  }
  draw();
  requestAnimationFrame(tick);
}

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => startScenario(Number(button.dataset.scenario)));
});

document.querySelector("#howBtn").addEventListener("click", () => {
  document.querySelector("#learnText").textContent = "Voce cria uma rota, a cidade evacua pessoas, e depois a IA tenta resolver o mesmo problema usando A*.";
});

document.querySelector("#aiBtn").addEventListener("click", () => {
  document.querySelector("#learnText").textContent = "A IA procura caminhos curtos, evita bloqueios e reduz congestionamentos automaticamente.";
});

document.querySelector("#challengeBtn").addEventListener("click", startChallenge);
document.querySelector("#confirmRoute").addEventListener("click", runVisitor);
document.querySelector("#runAi").addEventListener("click", runAi);
document.querySelector("#restart").addEventListener("click", () => show("home"));
document.querySelector("#playAgain").addEventListener("click", () => show("home"));

canvas.addEventListener("click", (event) => {
  if (state.mode !== "draw") return;
  const cell = canvasCell(event);
  if (!roads.has(key(cell)) || state.blocked.has(key(cell))) {
    addMessage("Essa area esta bloqueada. Escolha uma rua livre.");
    return;
  }
  const last = state.selectedRoute[state.selectedRoute.length - 1];
  if (last && dist(last, cell) > 1) {
    addMessage("Escolha ruas conectadas para formar uma rota clara.");
    return;
  }
  state.selectedRoute.push(cell);
  addMessage("Rota adicionada. Continue ate perto de um abrigo verde.");
});

state.blocked = makeBlocked(scenarios[0].kind);
requestAnimationFrame(tick);
