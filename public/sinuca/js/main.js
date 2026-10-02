const socket = io('/sinuca');
const canvas = document.getElementById('pool-canvas');
const ctx = canvas.getContext('2d');
const turnIndicator = document.getElementById('turn-indicator');
const roomIdSpan = document.getElementById('room-id');

let myId = null;
let isMyTurn = false;
let ballsMoving = false;
let myRoomId = null;

// Tabela (Canvas: 800x400)
const TABLE_W = 800;
const TABLE_H = 400;

// Estado das Bolas
// Vamos criar a Branca e um pequeno triângulo de bolas coloridas
let balls = [
    { id: 'cue', x: 200, y: 200, vx: 0, vy: 0, radius: 12, color: '#ffffff' }
];

// Monta o triângulo de bolas (Sinuca/8-ball simplificado)
const startX = 550;
const startY = 200;
const ballRadius = 12;
const rowSpacing = ballRadius * Math.sqrt(3);

let ballIdCount = 1;
for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
        let bx = startX + row * rowSpacing;
        let by = startY - (row * ballRadius) + (col * ballRadius * 2);
        let color = (row === 2 && col === 1) ? '#111111' : `hsl(${Math.random() * 360}, 80%, 50%)`; // Bola 8 no meio
        balls.push({ id: `ball_${ballIdCount++}`, x: bx, y: by, vx: 0, vy: 0, radius: 12, color: color });
    }
}

// --- Networking ---
socket.on('connect', () => {
    myId = socket.id;
});

socket.on('roomAssigned', (data) => {
    myRoomId = data.roomId;
    roomIdSpan.textContent = myRoomId;
});

socket.on('spectatorAssigned', (data) => {
    turnIndicator.textContent = data.message;
    turnIndicator.className = 'wait-turn';
});

socket.on('gameReady', (data) => {
    console.log(data.message);
});

socket.on('turnChange', (data) => {
    isMyTurn = (data.turnSocketId === myId);
    turnIndicator.textContent = isMyTurn ? "SEU TURNO! Arraste o mouse para atirar." : "Turno do Oponente aguarde...";
    turnIndicator.className = isMyTurn ? 'my-turn' : 'wait-turn';
});

socket.on('ballSync', (data) => {
    // Aplica o vetor na bola branca ao receber a tacada
    const cueBall = balls.find(b => b.id === 'cue');
    if (cueBall) {
        cueBall.vx = Math.cos(data.angle) * data.force;
        cueBall.vy = Math.sin(data.angle) * data.force;
        ballsMoving = true;
        isMyTurn = false; // Bloqueia input enquanto rola
        turnIndicator.textContent = "Bolas em movimento...";
        turnIndicator.className = 'wait-turn';
    }
});

socket.on('opponentDisconnected', (msg) => {
    turnIndicator.textContent = msg + " Recarregue a página.";
    turnIndicator.className = 'wait-turn';
});

// --- Input do Jogador (Estilingue) ---
let isAiming = false;
let aimStart = { x: 0, y: 0 };
let mouseCurrent = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
    if (!isMyTurn || ballsMoving) return;
    const rect = canvas.getBoundingClientRect();
    const cueBall = balls.find(b => b.id === 'cue');
    
    // Calcula a posição do mouse na tela
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    // Verifica se clicou perto da bola branca
    const dist = Math.hypot(mx - cueBall.x, my - cueBall.y);
    if (dist < cueBall.radius * 3) {
        isAiming = true;
        aimStart = { x: mx, y: my };
        mouseCurrent = { x: mx, y: my };
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!isAiming) return;
    const rect = canvas.getBoundingClientRect();
    mouseCurrent = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});

canvas.addEventListener('mouseup', (e) => {
    if (!isAiming) return;
    isAiming = false;
    
    const dx = aimStart.x - mouseCurrent.x;
    const dy = aimStart.y - mouseCurrent.y;
    
    if (Math.hypot(dx, dy) < 5) return; // Clique muito fraco ignorado

    const angle = Math.atan2(dy, dx);
    // Limite de força
    const force = Math.min(Math.sqrt(dx*dx + dy*dy) * 0.15, 25); 

    socket.emit('playerShot', { force, angle });
});

// --- Física e Renderização Simples ---
function updatePhysics() {
    let stillMoving = false;
    const FRICTION = 0.985; // Desaceleração por frame

    // Atualiza posições e atrito
    balls.forEach(b => {
        b.vx *= FRICTION;
        b.vy *= FRICTION;
        
        if (Math.abs(b.vx) < 0.05) b.vx = 0;
        if (Math.abs(b.vy) < 0.05) b.vy = 0;

        b.x += b.vx;
        b.y += b.vy;

        // Colisão com as tabelas (bordas)
        if (b.x < b.radius) { b.x = b.radius; b.vx *= -0.8; }
        if (b.x > TABLE_W - b.radius) { b.x = TABLE_W - b.radius; b.vx *= -0.8; }
        if (b.y < b.radius) { b.y = b.radius; b.vy *= -0.8; }
        if (b.y > TABLE_H - b.radius) { b.y = TABLE_H - b.radius; b.vy *= -0.8; }

        if (b.vx !== 0 || b.vy !== 0) stillMoving = true;
    });

    // Resolve colisões Bolas contra Bolas (Física elástica 2D simplificada)
    for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
            let b1 = balls[i];
            let b2 = balls[j];
            
            let dx = b2.x - b1.x;
            let dy = b2.y - b1.y;
            let dist = Math.hypot(dx, dy);
            let minDist = b1.radius + b2.radius;

            if (dist < minDist) {
                // Sobreposição - separa as bolas para não grudarem
                let overlap = minDist - dist;
                let nx = dx / dist;
                let ny = dy / dist;
                
                b1.x -= nx * (overlap / 2);
                b1.y -= ny * (overlap / 2);
                b2.x += nx * (overlap / 2);
                b2.y += ny * (overlap / 2);

                // Conservação do Momento (Assumindo massas iguais = 1)
                // Projeção da velocidade na normal do impacto
                let p = 2 * (b1.vx * nx + b1.vy * ny - b2.vx * nx - b2.vy * ny) / 2;
                
                let bounciness = 0.9; // Perda de energia na colisão
                b1.vx -= p * nx * bounciness;
                b1.vy -= p * ny * bounciness;
                b2.vx += p * nx * bounciness;
                b2.vy += p * ny * bounciness;
            }
        }
    }

    // Se parou de mover neste frame
    if (ballsMoving && !stillMoving) {
        ballsMoving = false;
        // O jogador cujo turno cabia a ele avisa que as bolas pararam
        socket.emit('ballsStopped', { foul: false, pottedBalls: [] });
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Desenhar caçapas (6 buracos pretos)
    ctx.fillStyle = '#0a0a0a';
    const holes = [
        { x: 0, y: 0 }, { x: TABLE_W/2, y: 0 }, { x: TABLE_W, y: 0 },
        { x: 0, y: TABLE_H }, { x: TABLE_W/2, y: TABLE_H }, { x: TABLE_W, y: TABLE_H }
    ];
    holes.forEach(h => {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 25, 0, Math.PI * 2);
        ctx.fill();
    });

    // Desenhar linha de mira se estiver mirando
    if (isAiming) {
        const cueBall = balls.find(b => b.id === 'cue');
        if (cueBall) {
            ctx.beginPath();
            ctx.moveTo(cueBall.x, cueBall.y);
            const dx = aimStart.x - mouseCurrent.x;
            const dy = aimStart.y - mouseCurrent.y;
            ctx.lineTo(cueBall.x - dx * 3, cueBall.y - dy * 3); // Oposto do drag
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // Desenhar bolas
    balls.forEach(b => {
        // Sombra suave
        ctx.beginPath();
        ctx.arc(b.x + 2, b.y + 2, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        // Bola principal
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();

        // Brilho
        ctx.beginPath();
        ctx.arc(b.x - 4, b.y - 4, b.radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
    });
}

function gameLoop() {
    updatePhysics();
    render();
    requestAnimationFrame(gameLoop);
}
gameLoop();
