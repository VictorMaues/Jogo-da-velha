const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Gerencia salas para permitir múltiplos jogos simultâneos
let rooms = {};

// Função auxiliar para achar uma sala aguardando jogador
function findWaitingRoom() {
    for (const [roomId, room] of Object.entries(rooms)) {
        if (room.players.length === 1) {
            return roomId;
        }
    }
    return null;
}

// Cria uma string aleatória para ID de sala
function generateRoomId() {
    return Math.random().toString(36).substring(2, 9);
}

io.on('connection', (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);

    // Procurar uma sala com apenas 1 jogador aguardando
    let roomId = findWaitingRoom();

    if (roomId) {
        // Entrar na sala existente
        socket.join(roomId);
        rooms[roomId].players.push(socket.id);
        
        // Atribui 'O' para o segundo jogador que entrou
        rooms[roomId].roles[socket.id] = 'O';

        // Notifica ambos os jogadores que o jogo começou
        io.to(roomId).emit('gameStart', { 
            message: 'Oponente encontrado! O jogo começou.',
            turn: 'X' // X sempre começa
        });

        // Envia o símbolo para cada jogador individualmente
        io.to(rooms[roomId].players[0]).emit('assignRole', 'X');
        io.to(rooms[roomId].players[1]).emit('assignRole', 'O');

    } else {
        // Criar uma nova sala
        roomId = generateRoomId();
        socket.join(roomId);
        rooms[roomId] = {
            players: [socket.id],
            roles: {},
            board: ['', '', '', '', '', '', '', '', ''],
            currentTurn: 'X',
            startTurn: 'X'
        };
        // Atribui 'X' para o criador da sala
        rooms[roomId].roles[socket.id] = 'X';

        socket.emit('waitingForOpponent', 'Aguardando um oponente se conectar...');
        socket.emit('assignRole', 'X'); // Localmente ele sabe que é o X, mas espera
    }

    // Lida com as jogadas
    socket.on('makeMove', (data) => {
        const room = rooms[roomId];
        if (!room) return;

        const { index, player } = data;

        // Se for realmente a vez dele e a casa estiver vazia
        if (room.currentTurn === player && room.board[index] === '') {
            room.board[index] = player;
            room.currentTurn = room.currentTurn === 'X' ? 'O' : 'X';

            // Envia a atualização do tabuleiro para a sala toda
            io.to(roomId).emit('updateBoard', {
                index: index,
                player: player,
                nextTurn: room.currentTurn
            });
        }
    });

    // Lida com reinício do jogo
    socket.on('requestRestart', () => {
        const room = rooms[roomId];
        if (!room) return;

        // Limpa o tabuleiro e inverte quem começa
        room.board = ['', '', '', '', '', '', '', '', ''];
        room.startTurn = room.startTurn === 'X' ? 'O' : 'X';
        room.currentTurn = room.startTurn;

        // Informa os clientes para resetarem a tela
        io.to(roomId).emit('gameRestarted', {
            turn: room.currentTurn
        });
    });

    // Lida com desconexão
    socket.on('disconnect', () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        const room = rooms[roomId];
        if (room) {
            // Notifica o outro jogador que o oponente saiu
            socket.to(roomId).emit('opponentDisconnected', 'Seu oponente se desconectou.');
            // Deleta a sala
            delete rooms[roomId];
        }
    });
});

// ==========================================
// CÓDIGO DO SERVIDOR DO SLITHER.IO CLONE
// ==========================================
const slitherIo = io.of('/slither');
let slitherPlayers = {};
let slitherFoods = [];
const MAP_SIZE = 2000;

function spawnFood() {
    return {
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        color: `hsl(${Math.floor(Math.random() * 360)}, 100%, 50%)`
    };
}

// Gera algumas comidas iniciais
for (let i = 0; i < 200; i++) {
    slitherFoods.push(spawnFood());
}

slitherIo.on('connection', (socket) => {
    console.log(`Jogador Slither conectado: ${socket.id}`);
    
    // Inicializa o jogador
    slitherPlayers[socket.id] = {
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        r: 15,
        color: `hsl(${Math.floor(Math.random() * 360)}, 100%, 50%)`,
        targetAngle: 0,
        body: [],
        score: 0,
        sizeScore: 0,
        isBoosting: false
    };

    socket.emit('init', { id: socket.id, mapSize: MAP_SIZE });

    // Atualiza o ângulo alvo baseado no mouse do cliente
    socket.on('input', (angle) => {
        if (slitherPlayers[socket.id]) {
            slitherPlayers[socket.id].targetAngle = angle;
        }
    });

    // Recebe o comando de boost (acelerar)
    socket.on('boost', (isBoosting) => {
        if (slitherPlayers[socket.id]) {
            slitherPlayers[socket.id].isBoosting = isBoosting;
        }
    });

    socket.on('disconnect', () => {
        console.log(`Jogador Slither desconectado: ${socket.id}`);
        delete slitherPlayers[socket.id];
    });
});

// Loop principal do servidor (Game Loop) a ~30 FPS
setInterval(() => {
    let deadPlayers = [];

    for (let id in slitherPlayers) {
        let p = slitherPlayers[id];
        
        // --- SISTEMA DE VELOCIDADE DINÂMICA ---
        // Velocidade inicial é 6. Conforme cresce (tamanho aumenta), vai ficando mais lenta.
        // Velocidade mínima é 1/4 da inicial, ou seja, 1.5
        let baseSpeed = 6;
        let speedDrop = p.sizeScore / 100; // Depende do tamanho físico
        let currentSpeed = Math.max(1.5, baseSpeed - speedDrop);

        // --- SISTEMA DE BOOST ---
        if (p.isBoosting && p.sizeScore > 10) {
            currentSpeed *= 2; // Dobra a velocidade
            p.sizeScore -= 0.5; // Gasta apenas o TAMANHO enquanto corre (não afeta o score da tabela)
            
            if (Math.random() < 0.2) { // 20% de chance por tick de soltar uma comida para trás
                let tail = p.body[p.body.length - 1] || p;
                slitherFoods.push({
                    x: tail.x + (Math.random() * 10 - 5),
                    y: tail.y + (Math.random() * 10 - 5),
                    color: p.color
                });
            }
        } else {
            p.isBoosting = false; // Força parar se não tiver tamanho suficiente
        }

        // Move o jogador
        p.x += Math.cos(p.targetAngle) * currentSpeed;
        p.y += Math.sin(p.targetAngle) * currentSpeed;

        // --- SISTEMA DE COLISÃO COM A PAREDE ---
        if (p.x < 0 || p.x > MAP_SIZE || p.y < 0 || p.y > MAP_SIZE) {
            deadPlayers.push(id);
            continue;
        }

        // Atualiza o rastro (corpo da cobra)
        p.body.unshift({ x: p.x, y: p.y });
        const maxLen = 10 + Math.floor(p.sizeScore / 2); // Tamanho físico depende do sizeScore
        while (p.body.length > maxLen) {
            p.body.pop();
        }

        // --- SISTEMA DE COLISÃO COM O CORPO DAS INIMIGAS ---
        let collided = false;
        for (let otherId in slitherPlayers) {
            if (id === otherId) continue; // Não colide consigo mesmo
            let enemy = slitherPlayers[otherId];
            
            // Verifica a cabeça desse jogador (p) contra todos os segmentos do inimigo (enemy)
            for (let i = 0; i < enemy.body.length; i++) {
                let seg = enemy.body[i];
                let dist = Math.hypot(p.x - seg.x, p.y - seg.y);
                // Se a distância for menor que o raio combinado (com uma margem para não ser injusto)
                if (dist < (p.r + enemy.r) * 0.6) {
                    collided = true;
                    break;
                }
            }
            if (collided) break;
        }
        
        if (collided) {
            deadPlayers.push(id);
            continue;
        }

        // Checa colisão com as comidas
        for (let i = slitherFoods.length - 1; i >= 0; i--) {
            let f = slitherFoods[i];
            let dx = p.x - f.x;
            let dy = p.y - f.y;
            // Distância menor que o raio do jogador significa que comeu
            if (Math.hypot(dx, dy) < p.r + 5) {
                slitherFoods.splice(i, 1);
                p.score += 5;     // Aumenta a pontuação da tabela (não diminui nunca)
                p.sizeScore += 5; // Aumenta o tamanho físico atual da cobra
                // Cresce um pouquinho de espessura (raio) baseado no tamanho atual
                p.r = Math.min(40, 15 + p.sizeScore / 50); 
                slitherFoods.push(spawnFood()); // Spawna uma nova comida
            }
        }
    }

    // Processa jogadores mortos
    for (let id of deadPlayers) {
        if (slitherPlayers[id]) {
            let p = slitherPlayers[id];
            // Transforma o corpo do jogador morto em comida
            for (let i = 0; i < p.body.length; i += 2) { // Pula alguns pra não lagar
                slitherFoods.push({
                    x: p.body[i].x + (Math.random() * 10 - 5),
                    y: p.body[i].y + (Math.random() * 10 - 5),
                    color: p.color
                });
            }
            // Envia evento de morte para o cliente
            slitherIo.to(id).emit('died');
            delete slitherPlayers[id];
        }
    }

    // Envia o estado atualizado para todos os clientes conectados no Slither
    slitherIo.emit('update', { players: slitherPlayers, foods: slitherFoods });
}, 1000 / 30);
// ==========================================

// ==========================================
// CÓDIGO DO SERVIDOR DE SINUCA
// ==========================================
// O servidor é a FONTE DA VERDADE: valida cada tacada, roda a MESMA física dos clientes
// (public/sinuca/js/physics.js) e só então aplica as regras (rules.js) e publica o estado.
// Os clientes apenas animam a tacada e "encaixam" no estado oficial ao receber syncState.
const sinucaIo = io.of('/sinuca');
let sinucaRooms = {};
const SinucaPhysics = require('./public/sinuca/js/physics.js');
const Rules = require('./public/sinuca/js/rules.js');

const SINUCA_SYNC_MARGIN_MS = 300; // folga após a duração da animação antes de publicar o estado

function findWaitingSinucaRoom() {
    for (const [roomId, room] of Object.entries(sinucaRooms)) {
        if (room.players.length === 1) {
            return roomId;
        }
    }
    return null;
}

function serializeSinucaBalls(balls) {
    return balls.map(b => ({ id: b.id, x: b.x, y: b.y, active: b.active }));
}

sinucaIo.on('connection', (socket) => {
    console.log(`[+] Jogador de Sinuca conectado: ${socket.id}`);

    let roomId = findWaitingSinucaRoom();

    if (!roomId) {
        roomId = generateRoomId();
        sinucaRooms[roomId] = { players: [], state: null, balls: null, busy: false, timer: null };
    }

    const room = sinucaRooms[roomId];

    if (room.players.length < 2) {
        room.players.push(socket.id);
        socket.join(roomId);
        socket.room = roomId;

        socket.emit('roomAssigned', { roomId });

        if (room.players.length === 2) {
            room.state = Rules.createInitialState(room.players[0], room.players[1]);
            room.balls = SinucaPhysics.createRack();

            sinucaIo.to(roomId).emit('gameReady', {
                message: 'Partida iniciada!',
                p1: room.players[0], p2: room.players[1],
                balls: serializeSinucaBalls(room.balls)
            });
            sinucaIo.to(roomId).emit('turnChange', room.players[room.state.turnIndex]);
        }
    } else {
        socket.emit('spectatorAssigned', { message: 'Sala cheia, você é um espectador ou espere nova sala.' });
    }

    // Bola na mão (e estouro): o servidor valida a posição da branca.
    socket.on('placeCue', (data) => {
        const myRoom = sinucaRooms[socket.room];
        if (!myRoom || !myRoom.state || myRoom.busy || myRoom.state.isGameOver) return;
        if (myRoom.players[myRoom.state.turnIndex] !== socket.id || !myRoom.state.ballInHand) return;

        const x = Number(data && data.x), y = Number(data && data.y);
        if (!Rules.isValidCuePlacement(x, y, myRoom.balls, Rules.getPlacementOptions(myRoom.state))) {
            socket.emit('shotRejected', { reason: 'Posição inválida para a bola branca.' });
            return;
        }

        const cue = myRoom.balls.find(b => b.id === 0);
        cue.x = x; cue.y = y; cue.vx = 0; cue.vy = 0; cue.active = true;
        myRoom.state.ballInHand = false;
        sinucaIo.to(socket.room).emit('cuePlaced', { x, y, state: myRoom.state });
    });

    socket.on('playerShot', (data) => {
        const myRoom = sinucaRooms[socket.room];
        if (!myRoom || !myRoom.state || myRoom.busy) return;

        const shot = {
            angle: Number(data && data.angle),
            force: Number(data && data.force),
            calledPocket: Rules.isPocketIndex(data && data.calledPocket) ? data.calledPocket : null
        };
        const cue = myRoom.balls.find(b => b.id === 0);
        const check = Rules.validateShot(myRoom.state, socket.id, shot, cue);
        if (!check.ok) {
            socket.emit('shotRejected', { reason: check.reason });
            return;
        }

        // Simula a tacada inteira AGORA (determinístico) e publica o resultado após a animação.
        myRoom.busy = true;
        const vx = Math.cos(shot.angle) * shot.force;
        const vy = Math.sin(shot.angle) * shot.force;
        cue.vx = vx; cue.vy = vy;

        const events = SinucaPhysics.createEvents();
        const steps = SinucaPhysics.simulate(myRoom.balls, events);

        const state = Rules.processShot(myRoom.state, events, shot.calledPocket);
        if (state.respot) {
            state.respot.forEach(id => SinucaPhysics.respotBall(myRoom.balls, id));
            state.respot = null;
        }

        // Clientes recebem a velocidade já calculada (evita divergência de Math.cos/sin entre engines)
        sinucaIo.to(socket.room).emit('ballSync', {
            angle: shot.angle, force: shot.force, vx, vy,
            calledPocket: shot.calledPocket, shooter: socket.id
        });

        const roomRef = myRoom;
        const delay = steps * SinucaPhysics.DT * 1000 + SINUCA_SYNC_MARGIN_MS;
        roomRef.timer = setTimeout(() => {
            roomRef.timer = null;
            roomRef.busy = false;
            const balls = serializeSinucaBalls(roomRef.balls);
            if (roomRef.state.isGameOver) {
                sinucaIo.to(roomId).emit('gameOver', { state: roomRef.state, balls });
            } else {
                sinucaIo.to(roomId).emit('syncState', { state: roomRef.state, balls });
                sinucaIo.to(roomId).emit('turnChange', roomRef.players[roomRef.state.turnIndex]);
            }
        }, delay);
    });

    socket.on('disconnect', () => {
        console.log(`[-] Jogador de Sinuca desconectado: ${socket.id}`);
        const myRoom = sinucaRooms[socket.room];
        if (socket.room && myRoom) {
            if (myRoom.timer) clearTimeout(myRoom.timer);
            const finished = myRoom.state && myRoom.state.isGameOver;
            if (!finished) socket.to(socket.room).emit('opponentDisconnected', 'O oponente saiu da mesa.');
            delete sinucaRooms[socket.room];
        }
    });
});
// ==========================================
const PORT = process.env.PORT || 3000;
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

server.listen(PORT, () => {
    const localIP = getLocalIP();
    console.log("==================================================");
    console.log("JOGO DA VELHA INICIADO COM SUCESSO\n");
    console.log(`> Servidor rodando no computador local em: http://localhost:${PORT}`);
    console.log(`> Acesso por outros aparelhos na mesma rede: http://${localIP}:${PORT}`);
    console.log("==================================================");
});
