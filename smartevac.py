import heapq
import math
import random
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

import pygame


GRID_SIZE = 20
CELL = 28
MAP_GAP = 28
PANEL_W = 300
TOP_H = 86
MARGIN = 24
WIDTH = MARGIN * 2 + GRID_SIZE * CELL * 2 + MAP_GAP + PANEL_W
HEIGHT = TOP_H + MARGIN + GRID_SIZE * CELL + 88
FPS = 30

Coord = Tuple[int, int]


PALETTE = {
    "bg": (18, 23, 31),
    "panel": (29, 36, 48),
    "panel_2": (36, 45, 60),
    "line": (68, 80, 101),
    "text": (238, 242, 247),
    "muted": (165, 176, 192),
    "road": (51, 60, 74),
    "block": (42, 49, 60),
    "shelter": (70, 199, 142),
    "agent": (255, 213, 79),
    "agent_no_ai": (255, 151, 91),
    "route": (84, 182, 255),
    "route_simple": (255, 189, 86),
    "white": (255, 255, 255),
    "danger_fire": (232, 81, 71),
    "danger_flood": (58, 145, 214),
    "danger_industrial": (174, 111, 232),
    "button": (48, 60, 80),
    "button_active": (76, 112, 148),
}


SCENARIOS = [
    {
        "name": "Incendio",
        "kind": "fire",
        "color": PALETTE["danger_fire"],
        "description": "Focos de calor bloqueiam quarteiroes e criam corredores estreitos.",
    },
    {
        "name": "Enchente",
        "kind": "flood",
        "color": PALETTE["danger_flood"],
        "description": "Agua invade areas baixas e corta ruas proximas ao rio.",
    },
    {
        "name": "Acidente industrial",
        "kind": "industrial",
        "color": PALETTE["danger_industrial"],
        "description": "Zonas contaminadas isolam regioes perto da fabrica.",
    },
]


SHELTERS: List[Coord] = [(1, 1), (18, 2), (2, 18), (18, 18)]
STARTS: List[Coord] = [
    (9, 10), (10, 10), (8, 9), (11, 9), (7, 11), (12, 11), (8, 13), (11, 13),
    (6, 6), (13, 6), (5, 14), (14, 14), (4, 9), (15, 10), (9, 4), (10, 15),
    (3, 12), (16, 7), (7, 16), (13, 3), (6, 12), (12, 6), (15, 15), (4, 4),
]


@dataclass
class Agent:
    start: Coord
    pos: Coord
    route: List[Coord]
    step: int = 0
    evacuated: bool = False
    evac_time: Optional[float] = None
    wait_ticks: int = 0


class Button:
    def __init__(self, rect: pygame.Rect, label: str, action: str):
        self.rect = rect
        self.label = label
        self.action = action


def heuristic(a: Coord, b: Coord) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def neighbors(cell: Coord) -> List[Coord]:
    x, y = cell
    options = [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return [(nx, ny) for nx, ny in options if 0 <= nx < GRID_SIZE and 0 <= ny < GRID_SIZE]


def a_star(start: Coord, goals: Sequence[Coord], blocked: set[Coord]) -> List[Coord]:
    open_heap: List[Tuple[int, int, Coord]] = []
    heapq.heappush(open_heap, (0, 0, start))
    came_from: Dict[Coord, Coord] = {}
    g_score: Dict[Coord, int] = {start: 0}
    goal_set = set(goals)
    counter = 0

    while open_heap:
        _, _, current = heapq.heappop(open_heap)
        if current in goal_set:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            return list(reversed(path))

        for nxt in neighbors(current):
            if nxt in blocked and nxt not in goal_set:
                continue
            tentative = g_score[current] + 1
            if tentative < g_score.get(nxt, 99999):
                came_from[nxt] = current
                g_score[nxt] = tentative
                counter += 1
                best_goal = min(goals, key=lambda g: heuristic(nxt, g))
                heapq.heappush(open_heap, (tentative + heuristic(nxt, best_goal), counter, nxt))
    return [start]


def simple_route(start: Coord, goals: Sequence[Coord], blocked: set[Coord]) -> List[Coord]:
    target = min(goals, key=lambda g: heuristic(start, g))
    x, y = start
    route = [start]
    guard = 0
    while (x, y) != target and guard < 140:
        guard += 1
        candidates: List[Coord] = []
        if x < target[0]:
            candidates.append((x + 1, y))
        elif x > target[0]:
            candidates.append((x - 1, y))
        if y < target[1]:
            candidates.append((x, y + 1))
        elif y > target[1]:
            candidates.append((x, y - 1))
        candidates.extend(neighbors((x, y)))
        moved = False
        for nxt in candidates:
            if 0 <= nxt[0] < GRID_SIZE and 0 <= nxt[1] < GRID_SIZE and nxt not in blocked:
                if len(route) < 2 or nxt != route[-2]:
                    x, y = nxt
                    route.append((x, y))
                    moved = True
                    break
        if not moved:
            break
    return route


def generate_obstacles(kind: str, seed: int) -> set[Coord]:
    rng = random.Random(seed)
    blocked: set[Coord] = set()

    if kind == "fire":
        centers = [(6, 7), (11, 11), (14, 6)]
        for cx, cy in centers:
            for x in range(cx - 2, cx + 3):
                for y in range(cy - 2, cy + 3):
                    if 0 <= x < GRID_SIZE and 0 <= y < GRID_SIZE and rng.random() < 0.58:
                        blocked.add((x, y))
        for y in range(3, 17):
            if y not in (5, 12):
                blocked.add((9, y))
    elif kind == "flood":
        for x in range(GRID_SIZE):
            wave = 9 + int(2 * math.sin(x / 2))
            for dy in range(-1, 2):
                if rng.random() < 0.86:
                    blocked.add((x, wave + dy))
        for x in range(3, 17):
            if x not in (5, 14):
                blocked.add((x, 13))
    else:
        for x in range(12, 18):
            for y in range(7, 14):
                if rng.random() < 0.64:
                    blocked.add((x, y))
        for x in range(4, 9):
            for y in range(4, 9):
                if rng.random() < 0.45:
                    blocked.add((x, y))
        for y in range(2, 18):
            if y not in (4, 15):
                blocked.add((11, y))

    for cell in SHELTERS + STARTS:
        blocked.discard(cell)
    return blocked


def build_agents(blocked: set[Coord], use_ai: bool) -> List[Agent]:
    agents: List[Agent] = []
    for start in STARTS:
        route = a_star(start, SHELTERS, blocked) if use_ai else simple_route(start, SHELTERS, blocked)
        agents.append(Agent(start=start, pos=start, route=route))
    return agents


class Simulation:
    def __init__(self) -> None:
        pygame.init()
        pygame.display.set_caption("SmartEvac")
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        self.clock = pygame.time.Clock()
        self.title_font = pygame.font.SysFont("segoeui", 30, bold=True)
        self.font = pygame.font.SysFont("segoeui", 18)
        self.small = pygame.font.SysFont("segoeui", 14)
        self.big = pygame.font.SysFont("segoeui", 24, bold=True)
        self.scenario_index = 0
        self.seed = 42
        self.paused = False
        self.elapsed = 0.0
        self.last_step = 0.0
        self.buttons = self.make_buttons()
        self.reset()

    def make_buttons(self) -> List[Button]:
        buttons: List[Button] = []
        x = MARGIN
        y = 48
        for i, scenario in enumerate(SCENARIOS):
            buttons.append(Button(pygame.Rect(x, y, 142, 30), scenario["name"], f"scenario:{i}"))
            x += 150
        buttons.append(Button(pygame.Rect(WIDTH - PANEL_W - 18, 48, 92, 30), "Pausar", "pause"))
        buttons.append(Button(pygame.Rect(WIDTH - PANEL_W + 82, 48, 96, 30), "Reiniciar", "reset"))
        buttons.append(Button(pygame.Rect(WIDTH - PANEL_W + 186, 48, 82, 30), "Novo", "new"))
        return buttons

    def reset(self, new_seed: bool = False) -> None:
        if new_seed:
            self.seed = random.randint(1, 99999)
        scenario = SCENARIOS[self.scenario_index]
        self.blocked = generate_obstacles(scenario["kind"], self.seed + self.scenario_index * 1000)
        self.ai_agents = build_agents(self.blocked, True)
        self.simple_agents = build_agents(self.blocked, False)
        self.elapsed = 0.0
        self.last_step = 0.0
        self.paused = False

    def run(self) -> None:
        while True:
            dt = self.clock.tick(FPS) / 1000
            self.handle_events()
            if not self.paused:
                self.elapsed += dt
                if self.elapsed - self.last_step >= 0.18:
                    self.update_agents(self.ai_agents)
                    self.update_agents(self.simple_agents)
                    self.last_step = self.elapsed
            self.draw()

    def handle_events(self) -> None:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    pygame.quit()
                    sys.exit()
                if event.key == pygame.K_SPACE:
                    self.paused = not self.paused
                if event.key == pygame.K_r:
                    self.reset()
                if event.key == pygame.K_n:
                    self.reset(new_seed=True)
                if event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                    self.scenario_index = event.key - pygame.K_1
                    self.reset()
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                for button in self.buttons:
                    if button.rect.collidepoint(event.pos):
                        self.activate(button.action)

    def activate(self, action: str) -> None:
        if action.startswith("scenario:"):
            self.scenario_index = int(action.split(":")[1])
            self.reset()
        elif action == "pause":
            self.paused = not self.paused
        elif action == "reset":
            self.reset()
        elif action == "new":
            self.reset(new_seed=True)

    def update_agents(self, agents: List[Agent]) -> None:
        occupied: Dict[Coord, int] = {}
        for agent in agents:
            if not agent.evacuated:
                occupied[agent.pos] = occupied.get(agent.pos, 0) + 1

        for agent in agents:
            if agent.evacuated:
                continue
            if agent.pos in SHELTERS:
                agent.evacuated = True
                agent.evac_time = self.elapsed
                continue
            if agent.step + 1 >= len(agent.route):
                agent.wait_ticks += 1
                continue
            nxt = agent.route[agent.step + 1]
            if occupied.get(nxt, 0) > 1 and random.random() < 0.5:
                agent.wait_ticks += 1
                continue
            agent.step += 1
            agent.pos = nxt
            occupied[agent.pos] = occupied.get(agent.pos, 0) + 1
            if agent.pos in SHELTERS:
                agent.evacuated = True
                agent.evac_time = self.elapsed

    def metrics(self, agents: List[Agent]) -> Dict[str, float]:
        evacuated = [a for a in agents if a.evacuated]
        active = [a for a in agents if not a.evacuated]
        waits = sum(a.wait_ticks for a in agents)
        steps = max(1, sum(max(a.step, 1) for a in agents))
        return {
            "evacuated": len(evacuated),
            "avg_time": sum(a.evac_time or 0 for a in evacuated) / len(evacuated) if evacuated else 0,
            "congestion": min(100, waits / steps * 100),
            "remaining": len(active),
        }

    def draw(self) -> None:
        self.screen.fill(PALETTE["bg"])
        scenario = SCENARIOS[self.scenario_index]
        self.draw_header(scenario)
        ai_origin = (MARGIN, TOP_H + MARGIN)
        simple_origin = (MARGIN + GRID_SIZE * CELL + MAP_GAP, TOP_H + MARGIN)
        self.draw_map(ai_origin, self.ai_agents, True)
        self.draw_map(simple_origin, self.simple_agents, False)
        self.draw_side_panel(scenario)
        pygame.display.flip()

    def draw_header(self, scenario: dict) -> None:
        self.screen.blit(self.title_font.render("SmartEvac", True, PALETTE["text"]), (MARGIN, 12))
        self.screen.blit(self.small.render("Simulador urbano de evacuacao com comparacao entre IA e rota simples", True, PALETTE["muted"]), (176, 22))
        for button in self.buttons:
            active = False
            if button.action.startswith("scenario:") and int(button.action.split(":")[1]) == self.scenario_index:
                active = True
            color = PALETTE["button_active"] if active else PALETTE["button"]
            pygame.draw.rect(self.screen, color, button.rect, border_radius=6)
            pygame.draw.rect(self.screen, PALETTE["line"], button.rect, 1, border_radius=6)
            label = button.label if button.action != "pause" else ("Continuar" if self.paused else "Pausar")
            text = self.small.render(label, True, PALETTE["text"])
            self.screen.blit(text, text.get_rect(center=button.rect.center))
        pygame.draw.line(self.screen, scenario["color"], (MARGIN, 84), (WIDTH - MARGIN, 84), 3)

    def draw_map(self, origin: Coord, agents: List[Agent], use_ai: bool) -> None:
        ox, oy = origin
        label = "Com IA (A*)" if use_ai else "Sem IA (rota simples)"
        color = PALETTE["route"] if use_ai else PALETTE["route_simple"]
        self.screen.blit(self.big.render(label, True, PALETTE["text"]), (ox, oy - 34))

        for x in range(GRID_SIZE):
            for y in range(GRID_SIZE):
                rect = pygame.Rect(ox + x * CELL, oy + y * CELL, CELL - 1, CELL - 1)
                base = PALETTE["road"] if (x + y) % 2 else PALETTE["block"]
                if (x, y) in self.blocked:
                    base = SCENARIOS[self.scenario_index]["color"]
                pygame.draw.rect(self.screen, base, rect)
                if (x, y) in SHELTERS:
                    pygame.draw.rect(self.screen, PALETTE["shelter"], rect.inflate(-5, -5), border_radius=5)

        for agent in agents:
            if len(agent.route) > 1:
                points = [(ox + cx * CELL + CELL // 2, oy + cy * CELL + CELL // 2) for cx, cy in agent.route[agent.step:]]
                if len(points) > 1:
                    pygame.draw.lines(self.screen, color, False, points, 2)

        cell_counts: Dict[Coord, int] = {}
        for agent in agents:
            if not agent.evacuated:
                cell_counts[agent.pos] = cell_counts.get(agent.pos, 0) + 1

        for agent in agents:
            if agent.evacuated:
                continue
            px = ox + agent.pos[0] * CELL + CELL // 2
            py = oy + agent.pos[1] * CELL + CELL // 2
            radius = 7 if cell_counts[agent.pos] == 1 else 10
            pygame.draw.circle(self.screen, PALETTE["agent"] if use_ai else PALETTE["agent_no_ai"], (px, py), radius)
            pygame.draw.circle(self.screen, PALETTE["bg"], (px, py), radius, 2)

        pygame.draw.rect(self.screen, PALETTE["line"], pygame.Rect(ox, oy, GRID_SIZE * CELL, GRID_SIZE * CELL), 2)

    def draw_side_panel(self, scenario: dict) -> None:
        x = WIDTH - PANEL_W - MARGIN
        y = TOP_H + MARGIN - 34
        panel = pygame.Rect(x, y, PANEL_W, GRID_SIZE * CELL + 34)
        pygame.draw.rect(self.screen, PALETTE["panel"], panel, border_radius=8)
        pygame.draw.rect(self.screen, PALETTE["line"], panel, 1, border_radius=8)

        self.screen.blit(self.big.render("Painel ao vivo", True, PALETTE["text"]), (x + 18, y + 16))
        self.screen.blit(self.font.render(f"Cenario: {scenario['name']}", True, scenario["color"]), (x + 18, y + 52))
        self.wrap_text(scenario["description"], x + 18, y + 82, PANEL_W - 36)

        ai = self.metrics(self.ai_agents)
        simple = self.metrics(self.simple_agents)
        yy = y + 148
        self.metric_block(x + 18, yy, "Com IA", ai, PALETTE["route"])
        self.metric_block(x + 18, yy + 152, "Sem IA", simple, PALETTE["route_simple"])

        advantage = ai["evacuated"] - simple["evacuated"]
        avg_gain = simple["avg_time"] - ai["avg_time"] if simple["avg_time"] and ai["avg_time"] else 0
        yy += 314
        pygame.draw.rect(self.screen, PALETTE["panel_2"], pygame.Rect(x + 18, yy, PANEL_W - 36, 88), border_radius=6)
        self.screen.blit(self.font.render("Comparacao de desempenho", True, PALETTE["text"]), (x + 30, yy + 12))
        comp = f"IA evacuou {advantage:+.0f} pessoa(s)"
        self.screen.blit(self.small.render(comp, True, PALETTE["muted"]), (x + 30, yy + 40))
        self.screen.blit(self.small.render(f"Ganho medio de tempo: {avg_gain:+.1f}s", True, PALETTE["muted"]), (x + 30, yy + 60))

        footer = "Espaco pausa | R reinicia | N novo mapa"
        self.screen.blit(self.small.render(footer, True, PALETTE["muted"]), (x + 18, panel.bottom - 28))

    def metric_block(self, x: int, y: int, title: str, data: Dict[str, float], color: Coord) -> None:
        pygame.draw.rect(self.screen, PALETTE["panel_2"], pygame.Rect(x, y, PANEL_W - 36, 132), border_radius=6)
        self.screen.blit(self.font.render(title, True, color), (x + 12, y + 10))
        rows = [
            ("Pessoas evacuadas", f"{data['evacuated']}/{len(STARTS)}"),
            ("Tempo medio", f"{data['avg_time']:.1f}s"),
            ("Congestionamento", f"{data['congestion']:.0f}%"),
            ("Restantes", f"{data['remaining']:.0f}"),
        ]
        for i, (label, value) in enumerate(rows):
            yy = y + 40 + i * 21
            self.screen.blit(self.small.render(label, True, PALETTE["muted"]), (x + 12, yy))
            value_surf = self.small.render(value, True, PALETTE["text"])
            self.screen.blit(value_surf, (x + PANEL_W - 58 - value_surf.get_width(), yy))

    def wrap_text(self, text: str, x: int, y: int, width: int) -> None:
        words = text.split()
        line = ""
        yy = y
        for word in words:
            test = f"{line} {word}".strip()
            if self.small.size(test)[0] <= width:
                line = test
            else:
                self.screen.blit(self.small.render(line, True, PALETTE["muted"]), (x, yy))
                yy += 18
                line = word
        if line:
            self.screen.blit(self.small.render(line, True, PALETTE["muted"]), (x, yy))


if __name__ == "__main__":
    Simulation().run()
