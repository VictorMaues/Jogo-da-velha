/* ============================================================
   PINBALL ARCADE NEON — script.js
   Abordagem cinemática para flippers: Body.setAngle() direto,
   sem depender de torque/velocidade angular (método mais estável).
   ============================================================ */

// ── API Matter.js ─────────────────────────────────────────────
const { Engine, Runner, Bodies, Composite, Constraint, Events, Body } = Matter;

// ── Canvas ────────────────────────────────────────────────────
const W = 600, H = 800;
const canvas = document.getElementById('pinball-canvas');
canvas.width  = W;
canvas.height = H;
const ctx = canvas.getContext('2d');

// ── Estado do jogo ────────────────────────────────────────────
let score      = 0;
let lives      = 3;
let gameOver   = false;
let charging   = false;
let power      = 0;   // 0..1

const scoreEl = document.getElementById('score-value');
function updateScore(n) { score = n; scoreEl.textContent = score.toString().padStart(6,'0'); }
updateScore(0);

// ── Motor Físico ──────────────────────────────────────────────
const engine = Engine.create();
engine.gravity.y = 1.8;
const world = engine.world;

Runner.run(Runner.create(), engine);

// ── Cores ─────────────────────────────────────────────────────
const C = {
  bg:      '#0a0a16',
  wall:    '#00ffff',
  flipper: '#00ffcc',
  ball:    '#ffffff',
  trail:   '#88bbff',
  b1:      '#ff007f',
  b2:      '#00ffff',
  b3:      '#ffea00',
};

// ── Helpers de corpo estático ─────────────────────────────────
function sRect(x, y, w, h, angle = 0, extra = {}) {
  return Bodies.rectangle(x, y, w, h, {
    isStatic: true, friction: 0.05, restitution: 0.4,
    angle, label: 'wall', ...extra
  });
}

// ── Paredes externas (grossas → sem tunelamento) ──────────────
const LANE_X = W - 45; // divisória da calha do lançador
const LANE_MID_X = (LANE_X + W) / 2; // centro horizontal da calha
const LANE_FLOOR_Y = H - 35; // piso da calha onde a bola repousa

const walls = [
  sRect(W/2,  -50,  W+400, 100),           // topo
  sRect(-55,  H/2,  110,   H+400),          // esquerda
  sRect(W+55, H/2,  110,   H+400),          // direita

  // deflectores diagonais superiores
  sRect(80,   80,   230,   28,  Math.PI/4),
  sRect(W-80, 80,   230,   28, -Math.PI/4),

  // rampas inferiores (guiam para os flippers)
  sRect(90,    H-170, 290, 26,  Math.PI/5.5),
  sRect(W-90,  H-170, 290, 26, -Math.PI/5.5),

  // Divisória da calha — CURTA: vai de Y=120 até o fundo.
  // Isso deixa abertura no TOPO para a bola sair para o campo.
  sRect(LANE_X, (H + 120) / 2, 14, H - 120),

  // Piso da calha — ESTREITO: apenas dentro do corredor do lançador.
  sRect(LANE_MID_X, LANE_FLOOR_Y, W - LANE_X - 14, 14),
];
Composite.add(world, walls);

// ── Bumpers ───────────────────────────────────────────────────
const bumperData = [
  { x: W/2,      y: 175, r: 30, color: C.b1 },
  { x: W/2 - 88, y: 275, r: 26, color: C.b2 },
  { x: W/2 + 88, y: 275, r: 26, color: C.b2 },
  { x: W/2,      y: 380, r: 34, color: C.b3 },
];

const bumpers = bumperData.map(d =>
  Bodies.circle(d.x, d.y, d.r, {
    isStatic: true, restitution: 2.0, friction: 0,
    label: 'bumper', plugin: { color: d.color, hit: 0 }
  })
);
Composite.add(world, bumpers);

// ── Flippers (cinemáticos) ────────────────────────────────────
// Usamos corpos estáticos controlados manualmente por setAngle.
// Isso evita TODOS os bugs de velocidade angular e de grupo de colisão.

const FW = 110, FH = 16;
const FY  = H - 118;
const GAP = 82;  // distância do centro para cada flipper

// Ângulos em repouso e levantado
const FL_REST = 0.45;   // descansando: ponta direita baixa
const FL_UP   = -0.45;  // levantado:   ponta direita sobe

const FR_REST = -0.45;  // descansando: ponta esquerda baixa
const FR_UP   =  0.45;  // levantado:   ponta esquerda sobe

// Pinos de articulação (mundiais)
const HL = { x: W/2 - GAP - FW/2 + 10, y: FY }; // hinge esquerdo
const HR = { x: W/2 + GAP + FW/2 - 10, y: FY }; // hinge direito

// Posição inicial dos centros dos flippers
const FL_CX = HL.x + FW/2 - 10;
const FR_CX = HR.x - FW/2 + 10;

const flipL = Bodies.rectangle(FL_CX, FY, FW, FH, {
  isStatic: true, label: 'flipper',
  friction: 0.05, restitution: 0.25,
  collisionFilter: { category: 0x0002, mask: 0x0001 }
});
const flipR = Bodies.rectangle(FR_CX, FY, FW, FH, {
  isStatic: true, label: 'flipper',
  friction: 0.05, restitution: 0.25,
  collisionFilter: { category: 0x0002, mask: 0x0001 }
});

Body.setAngle(flipL, FL_REST);
Body.setAngle(flipR, FR_REST);

Composite.add(world, [flipL, flipR]);

// Animação suave dos ângulos
let angleL = FL_REST;
let angleR = FR_REST;
const FLIP_SPEED = 0.12; // interpolação por frame

// ── Bola ──────────────────────────────────────────────────────
let ball, trail = [];

function spawnBall() {
  if (ball) Composite.remove(world, ball);
  // Bola repousa sobre o piso da calha (LANE_FLOOR_Y - raio - metade do piso)
  ball = Bodies.circle(W - 23, LANE_FLOOR_Y - 20, 11, {
    restitution: 0.7, friction: 0.003, frictionAir: 0.003,
    density: 0.05, label: 'ball', isBullet: true,
    collisionFilter: { category: 0x0001, mask: 0xFFFF }
  });
  Composite.add(world, ball);
  trail    = [];
  charging = false;
  power    = 0;
}
spawnBall();

// ── Controles ─────────────────────────────────────────────────
const keys = { left: false, right: false };

document.addEventListener('keydown', e => {
  if (['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))
    e.preventDefault();

  if (gameOver) return;

  if (e.code === 'ArrowLeft'  || e.code === 'KeyA') keys.left  = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;

  // Inicia carregamento se a bola estiver na calha (sem checar velocidade —
  // bola pode ter pequena oscilação sobre o piso)
  if (e.code === 'Space' && !e.repeat && !charging) {
    const inLane = ball.position.x > LANE_X - 30 && ball.position.y > H - 300;
    if (inLane) { charging = true; power = 0; }
  }
});

document.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft'  || e.code === 'KeyA') keys.left  = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;

  if (e.code === 'Space' && charging) {
    charging = false;
    // Lança usando setVelocity — direto e confiável
    const speed = 8 + power * 22; // px/frame: mínimo 8, máximo 30
    Body.setVelocity(ball, { x: 0, y: -speed });
    power = 0;
  }
});

window.addEventListener('blur', () => {
  keys.left = keys.right = false;
  charging  = false;
});

// ── Loop de atualização ───────────────────────────────────────
Events.on(engine, 'beforeUpdate', () => {
  if (gameOver) return;

  // Carrega power
  if (charging) power = Math.min(1, power + 0.018);

  // Interpola ângulos dos flippers e reposiciona (cinemático)
  const targetL = keys.left  ? FL_UP   : FL_REST;
  const targetR = keys.right ? FR_UP   : FR_REST;

  angleL += (targetL - angleL) * FLIP_SPEED;
  angleR += (targetR - angleR) * FLIP_SPEED;

  // Reposicionar ao redor do pino, depois aplicar ângulo
  setFlipperPose(flipL, HL, angleL,  1);  // 1 = hinge na esquerda
  setFlipperPose(flipR, HR, angleR, -1);  // -1 = hinge na direita

  // Rastro
  if (ball.speed > 1.5) {
    trail.push({ x: ball.position.x, y: ball.position.y, a: 0.7 });
    if (trail.length > 25) trail.shift();
  }
  for (let i = trail.length - 1; i >= 0; i--) {
    trail[i].a -= 0.055;
    if (trail[i].a <= 0) trail.splice(i, 1);
  }

  // Bola caiu
  if (ball.position.y > H + 60) {
    lives--;
    if (lives <= 0) { gameOver = true; }
    else            { spawnBall(); }
  }
});

// Posiciona flipper em torno do seu pino de articulação
// side: +1 = pino na extremidade ESQUERDA (centro fica à DIREITA do pino)
//       -1 = pino na extremidade DIREITA  (centro fica à ESQUERDA do pino)
function setFlipperPose(body, hinge, angle, side) {
  const offset = side * (FW / 2 - 10);
  // Centro do corpo = pino + offset rotacionado pelo ângulo
  const cx = hinge.x + offset * Math.cos(angle);
  const cy = hinge.y + offset * Math.sin(angle);
  Body.setPosition(body, { x: cx, y: cy });
  Body.setAngle(body, angle);
}

// ── Colisões ──────────────────────────────────────────────────
Events.on(engine, 'collisionStart', ev => {
  for (const p of ev.pairs) {
    const isB = lbl => p.bodyA.label === lbl || p.bodyB.label === lbl;
    if (isB('bumper')) {
      const b = p.bodyA.label === 'bumper' ? p.bodyA : p.bodyB;
      updateScore(score + 250);
      b.plugin.hit = 10;
    }
  }
});

Events.on(engine, 'afterUpdate', () => {
  for (const b of bumpers) if (b.plugin.hit > 0) b.plugin.hit--;
});

// ── Render ────────────────────────────────────────────────────
function poly(body, fill, stroke, glow = 0) {
  ctx.beginPath();
  const v = body.vertices;
  ctx.moveTo(v[0].x, v[0].y);
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();
  ctx.shadowBlur  = glow;
  ctx.shadowColor = stroke;
  ctx.fillStyle   = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.shadowBlur  = 0;
}

function circle(x, y, r, fill, stroke, glow = 0) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.shadowBlur  = glow;
  ctx.shadowColor = stroke;
  ctx.fillStyle   = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.shadowBlur  = 0;
}

function drawHUD() {
  // ── Vidas ──
  for (let i = 0; i < lives; i++) {
    circle(20 + i * 22, H - 20, 8, C.ball, C.trail, 10);
  }

  // ── Barra de potência ──
  const bx = W - 22, by = H - 15, bh = 100;
  // trilho
  ctx.beginPath();
  ctx.moveTo(bx, by); ctx.lineTo(bx, by - bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth   = 12; ctx.lineCap = 'round'; ctx.stroke();

  if (power > 0) {
    const fill = bh * power;
    const r = Math.round(255 * power);
    const g = Math.round(180 * (1 - power));
    const col = `rgb(${r},${g},40)`;
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx, by - fill);
    ctx.strokeStyle = col;
    ctx.lineWidth   = 12; ctx.lineCap = 'round';
    ctx.shadowBlur  = 16; ctx.shadowColor = col;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    ctx.fillStyle  = '#fff';
    ctx.font       = 'bold 10px Orbitron,monospace';
    ctx.textAlign  = 'center';
    ctx.fillText(Math.round(power * 100) + '%', bx, by - fill - 7);
  }
}

function drawGameOverScreen() {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign  = 'center';
  ctx.shadowBlur = 30; ctx.shadowColor = C.b1;
  ctx.fillStyle  = C.b1;
  ctx.font       = 'bold 54px Orbitron,monospace';
  ctx.fillText('GAME OVER', W/2, H/2 - 30);

  ctx.shadowBlur = 15; ctx.shadowColor = C.b2;
  ctx.fillStyle  = C.b2;
  ctx.font       = '20px Orbitron,monospace';
  ctx.fillText('Pontuação: ' + score.toString().padStart(6,'0'), W/2, H/2 + 15);

  ctx.fillStyle  = 'rgba(255,255,255,0.5)';
  ctx.font       = '13px Orbitron,monospace';
  ctx.fillText('Pressione F5 para jogar de novo', W/2, H/2 + 52);
  ctx.shadowBlur = 0;
}

function frame() {
  // fundo com leve persistence
  ctx.fillStyle = 'rgba(10,10,22,0.5)';
  ctx.fillRect(0, 0, W, H);

  // rastro
  for (const p of trail) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, ball.circleRadius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(136,187,255,${p.a * 0.4})`;
    ctx.fill();
  }

  // paredes
  for (const w of walls) poly(w, 'rgba(8,8,20,0.9)', C.wall, 10);

  // bumpers
  for (const b of bumpers) {
    const hit = b.plugin.hit > 0;
    const col = b.plugin.color;
    const r   = b.circleRadius;
    circle(b.position.x, b.position.y, r, '#0a0a1c', col, hit ? 30 : 14);
    // núcleo
    circle(b.position.x, b.position.y, r * 0.38, hit ? '#fff' : col, col, hit ? 18 : 6);
  }

  // flippers
  poly(flipL, 'rgba(0,20,24,0.95)', C.flipper, 16);
  poly(flipR, 'rgba(0,20,24,0.95)', C.flipper, 16);

  // bola
  circle(ball.position.x, ball.position.y, ball.circleRadius, C.ball, C.trail, 20);

  drawHUD();
  if (gameOver) drawGameOverScreen();

  requestAnimationFrame(frame);
}

frame();
