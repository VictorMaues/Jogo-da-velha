const Engine = Matter.Engine,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Constraint = Matter.Constraint,
      Events = Matter.Events,
      Body = Matter.Body;

const WIDTH = 600;
const HEIGHT = 800;

// Configuração do Canvas para Custom Render
const canvas = document.getElementById('pinball-canvas');
canvas.width = WIDTH;
canvas.height = HEIGHT;
const ctx = canvas.getContext('2d');

let score = 0;
const scoreElement = document.getElementById('score-value');

// Motor físico
const engine = Engine.create();
// Reduzir um pouco a gravidade para um jogo mais fluido
engine.gravity.y = 1.2;
const world = engine.world;

// Executor físico (update loop do matter)
const runner = Runner.create();
Runner.run(runner, engine);

const GROUP_FLIPPER = Body.nextGroup(true);

// Cores Neon
const COLORS = {
    wall: '#111122',
    wallGlow: '#00ffff',
    bumper1: '#ff007f',
    bumper2: '#00ffff',
    bumper3: '#ffea00',
    flipper: '#00ffcc',
    ball: '#ffffff',
    ballGlow: '#ffffff'
};

// --- Estrutura da Mesa ---

// Bordas invisíveis / visíveis
const wallOptions = { isStatic: true, label: 'wall', friction: 0.1, restitution: 0.2 };
const walls = [
    Bodies.rectangle(WIDTH / 2, -25, WIDTH, 50, wallOptions), // Topo
    Bodies.rectangle(-25, HEIGHT / 2, 50, HEIGHT, wallOptions), // Esquerda
    Bodies.rectangle(WIDTH + 25, HEIGHT / 2, 50, HEIGHT, wallOptions), // Direita
    // Curvas Superiores
    Bodies.rectangle(60, 60, 200, 30, { ...wallOptions, angle: Math.PI / 4 }),
    Bodies.rectangle(WIDTH - 60, 60, 200, 30, { ...wallOptions, angle: -Math.PI / 4 }),
    // Rampas inferiores (levando aos flippers)
    Bodies.rectangle(110, HEIGHT - 180, 280, 20, { ...wallOptions, angle: Math.PI / 5.5 }),
    Bodies.rectangle(WIDTH - 110, HEIGHT - 180, 280, 20, { ...wallOptions, angle: -Math.PI / 5.5 }),
    // Corredor do Lançador (Plunger)
    Bodies.rectangle(WIDTH - 40, HEIGHT - 350, 10, 700, wallOptions)
];
Composite.add(world, walls);

// --- Bumpers ---
const bumpers = [
    createBumper(WIDTH / 2, 180, 35, COLORS.bumper1),
    createBumper(WIDTH / 2 - 80, 280, 30, COLORS.bumper2),
    createBumper(WIDTH / 2 + 80, 280, 30, COLORS.bumper2),
    createBumper(WIDTH / 2, 400, 40, COLORS.bumper3)
];

function createBumper(x, y, radius, color) {
    return Bodies.circle(x, y, radius, {
        isStatic: true,
        restitution: 1.5,
        label: 'bumper',
        plugin: { color: color, hitRadius: radius } // Custom data for rendering
    });
}
Composite.add(world, bumpers);

// --- Flippers ---
const flipperWidth = 110;
const flipperHeight = 18;
const flipperY = HEIGHT - 120;
const flipperGap = 90;

const flipperLeft = Bodies.rectangle(WIDTH/2 - flipperGap, flipperY, flipperWidth, flipperHeight, {
    collisionFilter: { group: GROUP_FLIPPER },
    density: 0.05,
    restitution: 0.2,
    friction: 0.1,
    label: 'flipper'
});

const hingeLeft = Constraint.create({
    pointA: { x: WIDTH/2 - flipperGap - flipperWidth/2 + 10, y: flipperY },
    bodyB: flipperLeft,
    pointB: { x: -flipperWidth/2 + 10, y: 0 },
    stiffness: 1,
    length: 0
});

const flipperRight = Bodies.rectangle(WIDTH/2 + flipperGap, flipperY, flipperWidth, flipperHeight, {
    collisionFilter: { group: GROUP_FLIPPER },
    density: 0.05,
    restitution: 0.2,
    friction: 0.1,
    label: 'flipper'
});

const hingeRight = Constraint.create({
    pointA: { x: WIDTH/2 + flipperGap + flipperWidth/2 - 10, y: flipperY },
    bodyB: flipperRight,
    pointB: { x: flipperWidth/2 - 10, y: 0 },
    stiffness: 1,
    length: 0
});

Composite.add(world, [flipperLeft, hingeLeft, flipperRight, hingeRight]);

// --- Bola ---
let ball;
let ballParticles = []; // Para o efeito de rastro
function createBall() {
    if (ball) Composite.remove(world, ball);
    ball = Bodies.circle(WIDTH - 15, HEIGHT - 50, 12, {
        restitution: 0.6,
        friction: 0.001,
        density: 0.06,
        label: 'ball'
    });
    ballParticles = [];
    Composite.add(world, ball);
}
createBall();

// --- Controles e Lógica ---
const keys = { ArrowLeft: false, ArrowRight: false };

document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.ArrowLeft = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.ArrowRight = true;
    
    // Lançador - Pressionar espaço
    if (e.code === 'Space') {
        // Verifica se a bola está na calha do lançador
        if (ball.position.x > WIDTH - 50 && ball.position.y > HEIGHT - 200) {
            // Aplica uma força impulsiva para cima
            Body.applyForce(ball, ball.position, { x: 0, y: -0.15 });
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.ArrowLeft = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.ArrowRight = false;
});

// Update dos Flippers
Events.on(engine, 'beforeUpdate', function() {
    const MAX_ANGLE = 0.6; // ~35 graus
    const FLIPPER_SPEED = 0.4;
    
    // Flipper Esquerdo
    if (keys.ArrowLeft) {
        // Rotacionar para cima
        if (flipperLeft.angle > -MAX_ANGLE) {
            Body.setAngularVelocity(flipperLeft, -FLIPPER_SPEED);
        } else {
            Body.setAngle(flipperLeft, -MAX_ANGLE);
            Body.setAngularVelocity(flipperLeft, 0);
        }
    } else {
        // Cair / voltar à posição normal
        if (flipperLeft.angle < MAX_ANGLE) {
            Body.setAngularVelocity(flipperLeft, FLIPPER_SPEED * 0.4);
        } else {
            Body.setAngle(flipperLeft, MAX_ANGLE);
            Body.setAngularVelocity(flipperLeft, 0);
        }
    }

    // Flipper Direito
    if (keys.ArrowRight) {
        if (flipperRight.angle < MAX_ANGLE) {
            Body.setAngularVelocity(flipperRight, FLIPPER_SPEED);
        } else {
            Body.setAngle(flipperRight, MAX_ANGLE);
            Body.setAngularVelocity(flipperRight, 0);
        }
    } else {
        if (flipperRight.angle > -MAX_ANGLE) {
            Body.setAngularVelocity(flipperRight, -FLIPPER_SPEED * 0.4);
        } else {
            Body.setAngle(flipperRight, -MAX_ANGLE);
            Body.setAngularVelocity(flipperRight, 0);
        }
    }

    // Reset da bola se cair
    if (ball.position.y > HEIGHT + 50) {
        createBall();
    }
    
    // Atualizar rastro
    if(ball.speed > 2) {
        ballParticles.push({ x: ball.position.x, y: ball.position.y, alpha: 1 });
    }
    for (let i = 0; i < ballParticles.length; i++) {
        ballParticles[i].alpha -= 0.05;
        if (ballParticles[i].alpha <= 0) {
            ballParticles.splice(i, 1);
            i--;
        }
    }
});

// Colisões (Score e Efeitos)
Events.on(engine, 'collisionStart', function(event) {
    const pairs = event.pairs;
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        if (pair.bodyA.label === 'bumper' || pair.bodyB.label === 'bumper') {
            score += 250;
            scoreElement.textContent = score;
            const bumper = pair.bodyA.label === 'bumper' ? pair.bodyA : pair.bodyB;
            
            // Efeito de Hit
            bumper.plugin.hitRadius = bumper.circleRadius * 1.3;
        }
    }
});

// Animação de volta do raio do bumper
Events.on(engine, 'afterUpdate', function() {
    bumpers.forEach(b => {
        if (b.plugin.hitRadius > b.circleRadius) {
            b.plugin.hitRadius -= 0.5;
        }
    });
});

// --- Custom Render Loop ---
function drawBody(body, color, glow = false) {
    ctx.beginPath();
    const vertices = body.vertices;
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let j = 1; j < vertices.length; j++) {
        ctx.lineTo(vertices[j].x, vertices[j].y);
    }
    ctx.lineTo(vertices[0].x, vertices[0].y);
    ctx.closePath();
    
    if (glow) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
    } else {
        ctx.shadowBlur = 0;
    }
    
    ctx.fillStyle = '#080811';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawCircle(x, y, radius, color, isHit = false) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = '#111';
    
    ctx.shadowBlur = isHit ? 30 : 15;
    ctx.shadowColor = color;
    
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = isHit ? 4 : 2;
    ctx.stroke();
    
    // Desenho interno para os bumpers (estilo neon)
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.4, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
}

function render() {
    // Fundo semi-transparente para motion blur leve
    ctx.fillStyle = 'rgba(13, 13, 26, 0.4)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    // Desenhar Rastro da Bola
    ctx.shadowBlur = 10;
    ctx.shadowColor = COLORS.ballGlow;
    for (let p of ballParticles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, ball.circleRadius * 0.6, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.5})`;
        ctx.fill();
    }

    // Desenhar Walls
    walls.forEach(w => drawBody(w, COLORS.wallGlow, true));
    
    // Desenhar Bumpers
    bumpers.forEach(b => {
        const hitRadius = b.plugin.hitRadius;
        drawCircle(b.position.x, b.position.y, hitRadius, b.plugin.color, hitRadius > b.circleRadius + 1);
    });
    
    // Desenhar Flippers
    drawBody(flipperLeft, COLORS.flipper, true);
    drawBody(flipperRight, COLORS.flipper, true);
    
    // Desenhar Bola
    ctx.beginPath();
    ctx.arc(ball.position.x, ball.position.y, ball.circleRadius, 0, 2 * Math.PI);
    ctx.fillStyle = COLORS.ball;
    ctx.shadowBlur = 20;
    ctx.shadowColor = COLORS.ballGlow;
    ctx.fill();
    ctx.shadowBlur = 0; // reset
    
    // Lançador - Mola visual
    ctx.beginPath();
    ctx.moveTo(WIDTH - 25, HEIGHT);
    ctx.lineTo(WIDTH - 25, HEIGHT - 100);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 10;
    ctx.stroke();

    requestAnimationFrame(render);
}

// Iniciar Loop
render();
