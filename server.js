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
const sinucaIo = io.of('/sinuca');
let sinucaRooms = {};

function findWaitingSinucaRoom() {
    for (const [roomId, room] of Object.entries(sinucaRooms)) {
        if (room.players.length === 1) {
            return roomId;
        }
    }
    return null;
}

sinucaIo.on('connection', (socket) => {
    console.log(`[+] Jogador de Sinuca conectado: ${socket.id}`);

    let roomId = findWaitingSinucaRoom();

    if (!roomId) {
        roomId = generateRoomId(); // reusa a func do jogo da velha
        sinucaRooms[roomId] = { players: [], turnIndex: 0 };
    }

    const room = sinucaRooms[roomId];
    
    if (room.players.length < 2) {
        room.players.push(socket.id);
        socket.join(roomId);
        socket.room = roomId; // guarda pra facilitar
        
        socket.emit('roomAssigned', { roomId });

        if (room.players.length === 2) {
            sinucaIo.to(roomId).emit('gameReady', { message: 'Adversário encontrado! Partida de Sinuca iniciada!' });
            sinucaIo.to(roomId).emit('turnChange', { turnSocketId: room.players[room.turnIndex] });
        }
    } else {
        socket.emit('spectatorAssigned', { message: 'Sala cheia, você é um espectador ou espere nova sala.' });
    }

    // O jogador do turno atirou
    socket.on('playerShot', (data) => {
        const { force, angle } = data;
        const myRoom = sinucaRooms[socket.room];
        
        if (myRoom && myRoom.players[myRoom.turnIndex] === socket.id) {
            // Repassa a tacada (vetor) para ambos renderizarem a animação simultaneamente
            sinucaIo.to(socket.room).emit('ballSync', { force, angle, shooter: socket.id });
        }
    });

    // Quando as bolas param no cliente do turno atual
    socket.on('ballsStopped', (data) => {
        const myRoom = sinucaRooms[socket.room];
        if (myRoom && myRoom.players[myRoom.turnIndex] === socket.id) {
            const { foul, pottedBalls } = data;
            
            // Regra simples: passa o turno
            myRoom.turnIndex = myRoom.turnIndex === 0 ? 1 : 0;
            
            // Avisa de quem é a nova vez
            sinucaIo.to(socket.room).emit('turnChange', { turnSocketId: myRoom.players[myRoom.turnIndex] });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] Jogador de Sinuca desconectado: ${socket.id}`);
        if (socket.room && sinucaRooms[socket.room]) {
            socket.to(socket.room).emit('opponentDisconnected', 'O oponente saiu da mesa.');
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
