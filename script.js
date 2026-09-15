// Inicializa o Socket.io conectando ao servidor local
const socket = io();

const selectionScreen = document.getElementById('selection-screen');
const gameScreen = document.getElementById('game-screen');
const resultScreen = document.getElementById('result-screen');
const cells = document.querySelectorAll('.cell');
const currentPlayerDisplay = document.getElementById('current-player');
const resultMessage = document.getElementById('result-message');
const connectionStatus = document.getElementById('connection-status');
const waitingSpinner = document.getElementById('waiting-spinner');
const myRoleDisplay = document.getElementById('my-role');
const newGameBtn = document.getElementById('new-game-btn');
const scoreXDisplay = document.getElementById('score-x');
const scoreODisplay = document.getElementById('score-o');
const scoreDrawDisplay = document.getElementById('score-draw');
const roundDisplay = document.getElementById('round-number');

let board = ['', '', '', '', '', '', '', '', ''];
let myRole = ''; // Pode ser 'X' ou 'O'
let currentTurn = 'X';
let gameActive = false;

let scoreX = 0;
let scoreO = 0;
let scoreDraw = 0;
let round = 1;

const winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Linhas
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Colunas
    [0, 4, 8], [2, 4, 6]             // Diagonais
];

// Eventos do Servidor (Socket.io)

socket.on('connect', () => {
    connectionStatus.textContent = "Conectado. Entrando em uma sala...";
});

socket.on('waitingForOpponent', (message) => {
    connectionStatus.textContent = message;
    waitingSpinner.classList.remove('hidden');
});

socket.on('assignRole', (role) => {
    myRole = role;
    myRoleDisplay.textContent = role;
    myRoleDisplay.className = role === 'X' ? 'x-turn' : 'o-turn';
});

socket.on('gameStart', (data) => {
    // Inicia a partida!
    selectionScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    
    currentTurn = data.turn;
    gameActive = true;
    updatePlayerDisplay();
});

socket.on('updateBoard', (data) => {
    const { index, player, nextTurn } = data;
    
    // Atualiza o tabuleiro local
    board[index] = player;
    
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    cell.textContent = player;
    cell.classList.add(player.toLowerCase());

    currentTurn = nextTurn;
    updatePlayerDisplay();
    
    // Verifica vitória ou empate localmente depois de receber atualização
    checkWinCondition();
});

socket.on('opponentDisconnected', (message) => {
    gameActive = false;
    alert(message);
    window.location.reload(); // Recarrega para voltar à fila
});

socket.on('gameRestarted', (data) => {
    board = ['', '', '', '', '', '', '', '', ''];
    currentTurn = data.turn;
    gameActive = true;
    round++;
    roundDisplay.textContent = round;
    
    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('x', 'o');
    });

    resultScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    updatePlayerDisplay();
});

// Eventos da Interface (Frontend)

cells.forEach(cell => {
    cell.addEventListener('click', () => handleCellClick(cell));
});

newGameBtn.addEventListener('click', () => {
    // Pede ao servidor para reiniciar
    socket.emit('requestRestart');
});

function handleCellClick(cell) {
    const cellIndex = parseInt(cell.getAttribute('data-index'));

    // Não permite jogar se não for sua vez, ou se o jogo acabou, ou se a célula estiver cheia
    if (!gameActive || board[cellIndex] !== '' || currentTurn !== myRole) {
        return;
    }

    // Informa ao servidor que fez uma jogada
    socket.emit('makeMove', {
        index: cellIndex,
        player: myRole
    });
}

function updatePlayerDisplay() {
    currentPlayerDisplay.textContent = currentTurn;
    currentPlayerDisplay.className = currentTurn === 'X' ? 'x-turn' : 'o-turn';
    
    // Avisa se é a vez do jogador atual
    const turnIndicator = document.getElementById('turn-indicator');
    if(currentTurn === myRole) {
        turnIndicator.innerHTML = `Sua Vez! (<strong id="current-player" class="${currentTurn === 'X' ? 'x-turn' : 'o-turn'}">${currentTurn}</strong>)`;
    } else {
        turnIndicator.innerHTML = `Aguarde... (<strong id="current-player" class="${currentTurn === 'X' ? 'x-turn' : 'o-turn'}">${currentTurn}</strong> jogando)`;
    }
}

function checkWinCondition() {
    let roundWon = false;
    let winner = null;

    for (let i = 0; i < winningConditions.length; i++) {
        const winCondition = winningConditions[i];
        let a = board[winCondition[0]];
        let b = board[winCondition[1]];
        let c = board[winCondition[2]];

        if (a === '' || b === '' || c === '') {
            continue;
        }

        if (a === b && b === c) {
            roundWon = true;
            winner = a;
            break;
        }
    }

    if (roundWon) {
        if (winner === 'X') {
            scoreX++;
            scoreXDisplay.textContent = scoreX;
        } else if (winner === 'O') {
            scoreO++;
            scoreODisplay.textContent = scoreO;
        }
        let msg = winner === myRole ? "Você Venceu!" : `O Jogador ${winner} Venceu!`;
        endGame(msg, winner === 'X' ? 'x-win' : 'o-win');
        return;
    }

    let roundDraw = !board.includes('');
    if (roundDraw) {
        scoreDraw++;
        scoreDrawDisplay.textContent = scoreDraw;
        endGame('Deu Velha! Empate!', 'draw');
        return;
    }
}

function endGame(message, className) {
    gameActive = false;
    setTimeout(() => {
        gameScreen.classList.add('hidden');
        resultScreen.classList.remove('hidden');
        resultMessage.textContent = message;
        resultMessage.className = `result-message ${className}`;
    }, 600);
}
