import pygame
import random
import sys

# Inicialização do Pygame
pygame.init()

# Constantes e Cores
CELL_SIZE = 24
BLACK = (0, 0, 0)
YELLOW = (255, 255, 0)
BLUE = (0, 0, 150)
WHITE = (255, 255, 255)
RED = (255, 0, 0)
PINK = (255, 184, 255)
CYAN = (0, 255, 255)
ORANGE = (255, 184, 82)

# Mapa: 1 = Parede, 0 = Ponto, 2 = Vazio
level = [
    "1111111111111111111111111111",
    "1000000000000110000000000001",
    "1011110111110110111110111101",
    "1311110111110110111110111131",
    "1011110111110110111110111101",
    "1000000000000000000000000001",
    "1011110110111111110110111101",
    "1011110110111111110110111101",
    "1000000110000110000110000001",
    "1111110111112112111110111111",
    "2222210111112112111110122222",
    "2222210112222222222110122222",
    "2222210112111221112110122222",
    "1111110112122222212110111111",
    "2222220222122222212220222222",
    "1111110112122222212110111111",
    "2222210112111111112110122222",
    "2222210112222222222110122222",
    "2222210112111111112110122222",
    "1111110112111111112110111111",
    "1000000000000110000000000001",
    "1011110111110110111110111101",
    "1011110111110110111110111101",
    "1300110000000220000000110031",
    "1110110110111111110110110111",
    "1110110110111111110110110111",
    "1000000110000110000110000001",
    "1011111111110110111111111101",
    "1011111111110110111111111101",
    "1000000000000000000000000001",
    "1111111111111111111111111111"
]

ROWS = len(level)
COLS = len(level[0])
WIDTH = COLS * CELL_SIZE
HEIGHT = ROWS * CELL_SIZE

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Pac-Man em Python")
clock = pygame.time.Clock()

grid = []
for r in range(ROWS):
    row = []
    for c in range(COLS):
        row.append(int(level[r][c]))
    grid.append(row)

class Pacman:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.dir_x = 0
        self.dir_y = 0
        self.next_dir_x = 0
        self.next_dir_y = 0
        self.score = 0
        self.radius = CELL_SIZE // 2 - 2
        self.power_timer = 0

    def draw(self):
        px = self.x * CELL_SIZE + CELL_SIZE // 2
        py = self.y * CELL_SIZE + CELL_SIZE // 2
        
        # Boca do pacman dependendo da direção
        pygame.draw.circle(screen, YELLOW, (px, py), self.radius)
        # Um olho
        pygame.draw.circle(screen, BLACK, (px, py - 4), 3)

    def update(self):
        if self.can_move(self.next_dir_x, self.next_dir_y):
            self.dir_x = self.next_dir_x
            self.dir_y = self.next_dir_y

        if self.can_move(self.dir_x, self.dir_y):
            self.x += self.dir_x
            self.y += self.dir_y

            # Teleporte (túnel)
            if self.x < 0:
                self.x = COLS - 1
            elif self.x >= COLS:
                self.x = 0

            # Comer ponto
            if grid[self.y][self.x] == 0:
                grid[self.y][self.x] = 2
                self.score += 10
            elif grid[self.y][self.x] == 3:
                grid[self.y][self.x] = 2
                self.score += 50
                self.power_timer = 10000 # 10 segundos de poder

    def can_move(self, dx, dy):
        nx = self.x + dx
        ny = self.y + dy
        if ny < 0 or ny >= ROWS:
            return False
        if nx < 0:
            nx = COLS - 1
        elif nx >= COLS:
            nx = 0

        if grid[ny][nx] == 1:
            return False
        return True

class Ghost:
    def __init__(self, x, y, color):
        self.x = x
        self.y = y
        self.start_x = x
        self.start_y = y
        self.color = color
        self.dir_x = 0
        self.dir_y = 0
        self.radius = CELL_SIZE // 2 - 2

    def draw(self):
        px = self.x * CELL_SIZE + CELL_SIZE // 2
        py = self.y * CELL_SIZE + CELL_SIZE // 2
        
        draw_color = self.color
        if pacman.power_timer > 0:
            draw_color = (0, 50, 255) # Azul escuro quando com medo
            if pacman.power_timer < 3000 and (pacman.power_timer // 200) % 2 == 0:
                draw_color = WHITE # Pisca em branco quando está acabando
                
        pygame.draw.circle(screen, draw_color, (px, py), self.radius)
        pygame.draw.rect(screen, draw_color, (px - self.radius, py, self.radius * 2, self.radius))
        # Olhos
        pygame.draw.circle(screen, WHITE, (px - 4, py - 2), 3)
        pygame.draw.circle(screen, WHITE, (px + 4, py - 2), 3)
        pygame.draw.circle(screen, BLACK, (px - 4, py - 2), 1)
        pygame.draw.circle(screen, BLACK, (px + 4, py - 2), 1)

    def update(self):
        directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]
        possible = []
        for dx, dy in directions:
            if self.can_move(dx, dy):
                # Evita voltar para trás se não for necessário
                if dx == -self.dir_x and dy == -self.dir_y and (self.dir_x != 0 or self.dir_y != 0):
                    continue
                possible.append((dx, dy))

        if not possible:
            # Se preso, pode voltar
            for dx, dy in directions:
                if self.can_move(dx, dy):
                    possible.append((dx, dy))

        if possible:
            if (self.dir_x, self.dir_y) in possible:
                # 20% de chance de mudar de direção numa interseção
                if len(possible) > 1 and random.random() < 0.2:
                    self.dir_x, self.dir_y = random.choice(possible)
            else:
                self.dir_x, self.dir_y = random.choice(possible)

            self.x += self.dir_x
            self.y += self.dir_y

    def can_move(self, dx, dy):
        nx = self.x + dx
        ny = self.y + dy
        if ny < 0 or ny >= ROWS:
            return False
        if nx < 0 or nx >= COLS:
            return False
        if grid[ny][nx] == 1:
            return False
        return True

# Posição inicial
pacman = Pacman(13, 23)
ghosts = [
    Ghost(12, 14, RED),
    Ghost(13, 14, PINK),
    Ghost(14, 14, CYAN),
    Ghost(15, 14, ORANGE)
]

def draw_grid():
    for r in range(ROWS):
        for c in range(COLS):
            cell = grid[r][c]
            x = c * CELL_SIZE
            y = r * CELL_SIZE
            if cell == 1:
                pygame.draw.rect(screen, BLUE, (x, y, CELL_SIZE, CELL_SIZE), border_radius=4)
            elif cell == 0:
                pygame.draw.circle(screen, WHITE, (x + CELL_SIZE//2, y + CELL_SIZE//2), 3)
            elif cell == 3:
                pygame.draw.circle(screen, WHITE, (x + CELL_SIZE//2, y + CELL_SIZE//2), 8)

running = True
move_timer = 0
move_delay = 180 # Milissegundos por movimento (define a velocidade)
game_over = False

while running:
    dt = clock.tick(60)
    
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_UP:
                pacman.next_dir_x, pacman.next_dir_y = 0, -1
            elif event.key == pygame.K_DOWN:
                pacman.next_dir_x, pacman.next_dir_y = 0, 1
            elif event.key == pygame.K_LEFT:
                pacman.next_dir_x, pacman.next_dir_y = -1, 0
            elif event.key == pygame.K_RIGHT:
                pacman.next_dir_x, pacman.next_dir_y = 1, 0
            elif event.key == pygame.K_r and game_over:
                # Reiniciar o jogo
                pacman = Pacman(13, 23)
                ghosts = [Ghost(12, 14, RED), Ghost(13, 14, PINK), Ghost(14, 14, CYAN), Ghost(15, 14, ORANGE)]
                # Resetar mapa
                grid = []
                for r in range(ROWS):
                    row = []
                    for c in range(COLS):
                        row.append(int(level[r][c]))
                    grid.append(row)
                game_over = False

    if not game_over:
        move_timer += dt
        if pacman.power_timer > 0:
            pacman.power_timer -= dt
            
        if move_timer >= move_delay:
            move_timer = 0
            pacman.update()
            
            # Verificar colisão com fantasmas
            for g in ghosts:
                if g.x == pacman.x and g.y == pacman.y:
                    if pacman.power_timer > 0:
                        g.x, g.y = g.start_x, g.start_y
                        pacman.score += 200
                    else:
                        game_over = True

            for g in ghosts:
                g.update()
                if g.x == pacman.x and g.y == pacman.y:
                    if pacman.power_timer > 0:
                        g.x, g.y = g.start_x, g.start_y
                        pacman.score += 200
                    else:
                        game_over = True

    screen.fill(BLACK)
    draw_grid()
    
    if not game_over:
        pacman.draw()
        for g in ghosts:
            g.draw()
        pygame.display.set_caption(f"Pac-Man em Python | Score: {pacman.score}")
    else:
        pygame.display.set_caption(f"GAME OVER! Score: {pacman.score} | Aperte R para reiniciar")

    pygame.display.flip()

pygame.quit()
sys.exit()
