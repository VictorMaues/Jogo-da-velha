const socket = io('/slither');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');

let myId = null;
let mapSize = 2000;
let players = {};
let foods = [];
let cameraX = 0;
let cameraY = 0;

// Ajusta o tamanho do canvas para o tamanho da janela
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Variáveis de input do mouse
let mouseX = canvas.width / 2;
let mouseY = canvas.height / 2;

canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// Impede o menu de contexto (clique direito padrão)
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Detecta quando aperta/solta o botão do mouse (botão 0=esquerdo, 2=direito)
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2 || e.button === 0) { // Aceita tanto botão esquerdo quanto direito para boost
        socket.emit('boost', true);
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 2 || e.button === 0) {
        socket.emit('boost', false);
    }
});

// Loop de envio de input para o servidor
setInterval(() => {
    if (!myId || !players[myId]) return;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const angle = Math.atan2(mouseY - centerY, mouseX - centerX);
    
    socket.emit('input', angle);
}, 50);

socket.on('died', () => {
    alert('Game Over! Você morreu. Recarregue a página para jogar de novo.');
    window.location.reload(); // Recarrega para reviver automaticamente
});

// Recebe as configurações iniciais
socket.on('init', (data) => {
    myId = data.id;
    mapSize = data.mapSize;
});

const leaderboardEl = document.getElementById('leaderboard');

// Recebe as atualizações do estado do jogo (30x por segundo)
socket.on('update', (state) => {
    players = state.players;
    foods = state.foods;
    
    // Atualiza a interface do próprio jogador
    if (players[myId]) {
        scoreEl.innerText = players[myId].score;
    }

    // Atualiza a Tabela de Pontuação (Leaderboard)
    const sortedPlayers = Object.keys(players)
        .map(id => ({ id, ...players[id] }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // Mostra os top 10
        
    leaderboardEl.innerHTML = sortedPlayers.map((p, index) => `
        <div class="leaderboard-item" style="${p.id === myId ? 'font-weight: bold; color: #f1c40f;' : ''}">
            <span>
                <strong>${index + 1}.</strong> 
                <span class="color-box" style="background: ${p.color};"></span>
                ${p.id === myId ? 'Você' : 'Inimigo_' + p.id.substring(0, 4)}
            </span>
            <span>${p.score} pts</span>
        </div>
    `).join('');
});

// Loop de renderização (desenha o mais rápido possível)
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Desenha o fundo em grade
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (myId && players[myId]) {
        // A câmera foca no jogador local
        const me = players[myId];
        cameraX = me.x - canvas.width / 2;
        cameraY = me.y - canvas.height / 2;
    }

    ctx.save();
    ctx.translate(-cameraX, -cameraY); // Move a câmera

    // Desenha a borda do mapa
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, mapSize, mapSize);

    // Desenha as comidas
    for (let f of foods) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = f.color;
        ctx.fill();
        ctx.closePath();
    }

    // Desenha os jogadores (cobrinhas)
    for (let id in players) {
        const p = players[id];
        
        // Desenha o corpo da cobra
        for (let i = p.body.length - 1; i >= 0; i--) {
            const segment = p.body[i];
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 0.8;
            ctx.fill();
            ctx.closePath();
        }
        
        // Desenha a cabeça
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 1.0;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.closePath();
        
        // Desenha o nome/id (opcional)
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(id === myId ? "Você" : "Inimigo", p.x, p.y - p.r - 10);
    }

    ctx.restore();
    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
