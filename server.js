const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve arquivos estáticos da pasta atual
app.use(express.static(__dirname));

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
