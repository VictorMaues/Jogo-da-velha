const fs = require('fs');
const path = require('path');

const baseDir = __dirname + '/public/sinuca';
const jsDir = baseDir + '/js';

if (!fs.existsSync(jsDir)) { fs.mkdirSync(jsDir, { recursive: true }); }

fs.writeFileSync(jsDir + '/shared.js', `(function(exports){
    exports.TABLE_W = 800;
    exports.TABLE_H = 400;
    exports.BALL_RADIUS = 12;
    exports.POCKET_RADIUS = 25;

    exports.BALL_TYPES = { CUE: 0, SOLID: 1, STRIPE: 2, EIGHT: 8 };

    exports.getBallType = function(id) {
        if (id === 0) return exports.BALL_TYPES.CUE;
        if (id === 8) return exports.BALL_TYPES.EIGHT;
        if (id >= 1 && id <= 7) return exports.BALL_TYPES.SOLID;
        if (id >= 9 && id <= 15) return exports.BALL_TYPES.STRIPE;
        return null;
    };

    exports.BALL_COLORS = {
        0: '#ffffff', 1: '#f1c40f', 2: '#2980b9', 3: '#c0392b', 
        4: '#8e44ad', 5: '#e67e22', 6: '#27ae60', 7: '#7b241c', 
        8: '#111111', 9: '#f1c40f', 10: '#2980b9', 11: '#c0392b', 
        12: '#8e44ad', 13: '#e67e22', 14: '#27ae60', 15: '#7b241c'
    };

    exports.BALL_STRIPED = {
        0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false,
        9: true, 10: true, 11: true, 12: true, 13: true, 14: true, 15: true
    };
})(typeof exports === 'undefined' ? this['Shared'] = {} : exports);`);

fs.writeFileSync(jsDir + '/rules.js', `(function(exports){
    const Shared = typeof exports === 'undefined' ? window.Shared : require('./shared.js');

    exports.createInitialState = function(player1Id, player2Id) {
        return {
            players: [player1Id, player2Id],
            turnIndex: 0,
            groupsAssigned: false,
            playerGroups: { [player1Id]: null, [player2Id]: null },
            ballsOnTable: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
            isGameOver: false,
            winner: null,
            foulMessage: null,
            ballInHand: true
        };
    };

    exports.processShot = function(state, shotResult) {
        let turnPlayer = state.players[state.turnIndex];
        let nextTurnIndex = state.turnIndex === 0 ? 1 : 0;
        let foul = false;
        let foulMsg = "";

        const myGroupStr = state.playerGroups[turnPlayer];
        const myGroupType = myGroupStr ? Shared.BALL_TYPES[myGroupStr] : null;

        if (shotResult.cuePotted) {
            foul = true; foulMsg = "Bola branca encaçapada!";
        } else if (shotResult.firstHit === null) {
            foul = true; foulMsg = "Não tocou em nenhuma bola!";
        } else {
            let firstHitType = Shared.getBallType(shotResult.firstHit);
            if (myGroupType) {
                if (firstHitType !== myGroupType && firstHitType !== Shared.BALL_TYPES.EIGHT) {
                    foul = true; foulMsg = "Tocou na bola errada primeiro!";
                } else if (firstHitType === Shared.BALL_TYPES.EIGHT) {
                    let myBallsLeft = state.ballsOnTable.filter(b => Shared.getBallType(b) === myGroupType);
                    if (myBallsLeft.length > 0) {
                        foul = true; foulMsg = "Tocou na bola 8 primeiro!";
                    }
                }
            }
        }

        if (!foul && !shotResult.touchedCushion && shotResult.potted.length === 0) {
            foul = true; foulMsg = "Nenhuma bola tocou a tabela após o contato!";
        }

        let myLegalPotted = 0;
        let eightPotted = false;

        shotResult.potted.forEach(b => {
            if (b === 0) return;
            if (b === 8) eightPotted = true;

            let type = Shared.getBallType(b);
            if (!foul && !state.groupsAssigned && type !== Shared.BALL_TYPES.EIGHT) {
                state.groupsAssigned = true;
                let groupStr = type === Shared.BALL_TYPES.SOLID ? 'SOLID' : 'STRIPE';
                state.playerGroups[turnPlayer] = groupStr;
                state.playerGroups[state.players[nextTurnIndex]] = groupStr === 'SOLID' ? 'STRIPE' : 'SOLID';
            }

            if (state.groupsAssigned && type === Shared.BALL_TYPES[state.playerGroups[turnPlayer]]) {
                myLegalPotted++;
            }

            state.ballsOnTable = state.ballsOnTable.filter(ball => ball !== b);
        });

        if (eightPotted) {
            state.isGameOver = true;
            let myBallsLeft = state.ballsOnTable.filter(b => Shared.getBallType(b) === myGroupType);
            if (foul || myBallsLeft.length > 0) {
                state.winner = state.players[nextTurnIndex];
                state.foulMessage = foulMsg ? foulMsg + " E encaçapou a 8 (Derrota!)" : "Encaçapou a 8 antes da hora!";
            } else {
                state.winner = turnPlayer;
                state.foulMessage = "Encaçapou a 8 legalmente. Vitória!";
            }
            return state;
        }

        if (foul) {
            state.foulMessage = foulMsg;
            state.ballInHand = true;
            state.turnIndex = nextTurnIndex;
        } else {
            state.foulMessage = null;
            if (myLegalPotted > 0) {
                state.ballInHand = false;
            } else {
                state.turnIndex = nextTurnIndex;
                state.ballInHand = false;
            }
        }

        return state;
    };
})(typeof exports === 'undefined' ? this['Rules'] = {} : exports);`);

fs.writeFileSync(jsDir + '/physics.js', `const Physics = (() => {
    const DT = 1 / 120;
    const FRICTION = 300; 
    const RESTITUTION = 0.95;
    const CUSHION_RESTITUTION = 0.8;
    const MIN_VELOCITY = 5;

    const POCKETS = [
        {x: 0, y: 0}, {x: Shared.TABLE_W/2, y: -10}, {x: Shared.TABLE_W, y: 0},
        {x: 0, y: Shared.TABLE_H}, {x: Shared.TABLE_W/2, y: Shared.TABLE_H+10}, {x: Shared.TABLE_W, y: Shared.TABLE_H}
    ];

    class Ball {
        constructor(id, x, y) {
            this.id = id; this.x = x; this.y = y;
            this.vx = 0; this.vy = 0; this.active = true;
        }
    }

    function createRack() {
        let balls = [];
        balls.push(new Ball(0, 200, 200));
        const startX = 550, startY = 200, r = Shared.BALL_RADIUS;
        const rowSpacing = r * Math.sqrt(3);
        const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 13, 5, 14, 6, 15, 7];
        let idx = 0;
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col <= row; col++) {
                let bx = startX + row * rowSpacing;
                let by = startY - (row * r) + (col * r * 2);
                balls.push(new Ball(order[idx++], bx, by));
            }
        }
        return balls;
    }

    function step(balls, events) {
        let moving = false;
        balls.forEach(b => {
            if (!b.active) return;
            let speed = Math.hypot(b.vx, b.vy);
            if (speed > 0) {
                moving = true;
                let drop = FRICTION * DT;
                let newSpeed = Math.max(0, speed - drop);
                if (newSpeed < MIN_VELOCITY) newSpeed = 0;
                
                b.vx = speed > 0 ? (b.vx / speed) * newSpeed : 0;
                b.vy = speed > 0 ? (b.vy / speed) * newSpeed : 0;

                b.x += b.vx * DT;
                b.y += b.vy * DT;

                let r = Shared.BALL_RADIUS;
                let hitCushion = false;
                if (b.x < r) { b.x = r; b.vx *= -CUSHION_RESTITUTION; hitCushion = true; }
                if (b.x > Shared.TABLE_W - r) { b.x = Shared.TABLE_W - r; b.vx *= -CUSHION_RESTITUTION; hitCushion = true; }
                if (b.y < r) { b.y = r; b.vy *= -CUSHION_RESTITUTION; hitCushion = true; }
                if (b.y > Shared.TABLE_H - r) { b.y = Shared.TABLE_H - r; b.vy *= -CUSHION_RESTITUTION; hitCushion = true; }

                if (hitCushion && events.firstHit !== null) events.touchedCushion = true;

                for (let p of POCKETS) {
                    if (Math.hypot(b.x - p.x, b.y - p.y) < Shared.POCKET_RADIUS) {
                        b.active = false;
                        if (b.id === 0) events.cuePotted = true;
                        else events.potted.push(b.id);
                    }
                }
            }
        });

        for (let i = 0; i < balls.length; i++) {
            if (!balls[i].active) continue;
            for (let j = i + 1; j < balls.length; j++) {
                if (!balls[j].active) continue;
                let b1 = balls[i]; let b2 = balls[j];
                let dx = b2.x - b1.x; let dy = b2.y - b1.y;
                let dist = Math.hypot(dx, dy);
                let minDist = Shared.BALL_RADIUS * 2;

                if (dist < minDist) {
                    if (events.firstHit === null && (b1.id === 0 || b2.id === 0)) {
                        events.firstHit = b1.id === 0 ? b2.id : b1.id;
                    }
                    let overlap = minDist - dist;
                    let nx = dx / dist; let ny = dy / dist;

                    b1.x -= nx * (overlap / 2); b1.y -= ny * (overlap / 2);
                    b2.x += nx * (overlap / 2); b2.y += ny * (overlap / 2);

                    let kx = b1.vx - b2.vx; let ky = b1.vy - b2.vy;
                    let p = 2 * (nx * kx + ny * ky) / 2;

                    b1.vx -= p * nx * RESTITUTION; b1.vy -= p * ny * RESTITUTION;
                    b2.vx += p * nx * RESTITUTION; b2.vy += p * ny * RESTITUTION;
                }
            }
        }
        return moving;
    }

    return { Ball, createRack, step, DT };
})();`);

fs.writeFileSync(jsDir + '/render.js', `const Render = (() => {
    const canvas = document.getElementById('pool-canvas');
    const ctx = canvas.getContext('2d');

    function drawTable() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#0a0a0a';
        const POCKETS = [
            {x: 0, y: 0}, {x: Shared.TABLE_W/2, y: -10}, {x: Shared.TABLE_W, y: 0},
            {x: 0, y: Shared.TABLE_H}, {x: Shared.TABLE_W/2, y: Shared.TABLE_H+10}, {x: Shared.TABLE_W, y: Shared.TABLE_H}
        ];
        POCKETS.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, Shared.POCKET_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.beginPath();
        ctx.moveTo(200, 0); ctx.lineTo(200, Shared.TABLE_H);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2; ctx.stroke();
    }

    function drawBalls(balls) {
        balls.forEach(b => {
            if (!b.active) return;
            
            ctx.beginPath();
            ctx.arc(b.x + 2, b.y + 2, Shared.BALL_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(b.x, b.y, Shared.BALL_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = Shared.BALL_COLORS[b.id];
            ctx.fill();

            if (Shared.BALL_STRIPED[b.id]) {
                ctx.beginPath();
                ctx.arc(b.x, b.y, Shared.BALL_RADIUS * 0.8, -Math.PI/4, Math.PI*0.75);
                ctx.lineWidth = Shared.BALL_RADIUS * 0.6;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
            }

            if (b.id !== 0) {
                ctx.beginPath();
                ctx.arc(b.x, b.y, Shared.BALL_RADIUS * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                
                ctx.fillStyle = '#000000';
                ctx.font = 'bold 10px Outfit, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(b.id, b.x, b.y + 1);
            }

            ctx.beginPath();
            ctx.arc(b.x - 3, b.y - 3, Shared.BALL_RADIUS * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fill();
        });
    }

    function drawAim(cueBall, angle, force) {
        ctx.beginPath();
        ctx.moveTo(cueBall.x, cueBall.y);
        ctx.lineTo(cueBall.x + Math.cos(angle) * 1000, cueBall.y + Math.sin(angle) * 1000);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.setLineDash([5, 5]); ctx.lineWidth = 1; ctx.stroke();
        ctx.setLineDash([]);

        const cueDist = 20 + force * 2;
        const stickX = cueBall.x - Math.cos(angle) * cueDist;
        const stickY = cueBall.y - Math.sin(angle) * cueDist;
        const stickEndX = stickX - Math.cos(angle) * 200;
        const stickEndY = stickY - Math.sin(angle) * 200;

        ctx.beginPath();
        ctx.moveTo(stickX, stickY); ctx.lineTo(stickEndX, stickEndY);
        ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(stickX, stickY); ctx.lineTo(stickX - Math.cos(angle) * 10, stickY - Math.sin(angle) * 10);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.stroke();
    }

    return { drawTable, drawBalls, drawAim, canvas };
})();`);

fs.writeFileSync(jsDir + '/input.js', `const Input = (() => {
    let isDragging = false;
    let aimAngle = 0;
    let force = 0;
    let onShootCb = null;
    let onPlaceCueCb = null;
    let mode = 'AIM'; 
    const canvas = document.getElementById('pool-canvas');
    let mouse = { x: 0, y: 0 };
    let aimStart = { x: 0, y: 0 };

    function updateMouse(e) {
        const rect = canvas.getBoundingClientRect();
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;
        mouse.x = (clientX - rect.left) * (canvas.width / rect.width);
        mouse.y = (clientY - rect.top) * (canvas.height / rect.height);
    }

    function handleMove(e) {
        if(e.touches) e.preventDefault();
        updateMouse(e);
        if (mode === 'AIM' && isDragging) {
            let dx = aimStart.x - mouse.x;
            let dy = aimStart.y - mouse.y;
            aimAngle = Math.atan2(dy, dx);
            force = Math.min(Math.hypot(dx, dy) * 0.2, 30);
        } else if (mode === 'AIM' && !isDragging && Game.isMyTurn() && !Game.isMoving()) {
             let cue = Game.getCueBall();
             if (cue) aimAngle = Math.atan2(mouse.y - cue.y, mouse.x - cue.x);
        }
    }

    function handleDown(e) {
        if(e.touches) e.preventDefault();
        updateMouse(e);
        if (!Game.isMyTurn() || Game.isMoving()) return;
        if (mode === 'PLACE') {
            if (onPlaceCueCb) onPlaceCueCb(mouse.x, mouse.y);
            return;
        }
        isDragging = true;
        aimStart = { x: mouse.x, y: mouse.y };
        force = 0;
    }

    function handleUp(e) {
        if(e.touches) e.preventDefault();
        if (!isDragging) return;
        isDragging = false;
        if (mode === 'AIM' && force > 2 && onShootCb) {
            onShootCb(aimAngle, force * 50);
        }
        force = 0;
    }

    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mousedown', handleDown);
    canvas.addEventListener('mouseup', handleUp);
    canvas.addEventListener('touchmove', handleMove, {passive: false});
    canvas.addEventListener('touchstart', handleDown, {passive: false});
    canvas.addEventListener('touchend', handleUp, {passive: false});

    return {
        init: (onShoot, onPlace) => { onShootCb = onShoot; onPlaceCueCb = onPlace; },
        setMode: m => mode = m,
        getAim: () => ({ angle: aimAngle, force: force })
    };
})();`);

fs.writeFileSync(jsDir + '/ai.js', `const AI = (() => {
    function takeTurn(state, balls, difficulty, shootCb) {
        setTimeout(() => {
            let myGroupStr = state.playerGroups[state.players[state.turnIndex]];
            let validTypes = [];
            if (!state.groupsAssigned) {
                validTypes = [Shared.BALL_TYPES.SOLID, Shared.BALL_TYPES.STRIPE];
            } else {
                validTypes = [Shared.BALL_TYPES[myGroupStr]];
            }
            
            let myBalls = balls.filter(b => b.active && b.id !== 0 && b.id !== 8 && validTypes.includes(Shared.getBallType(b.id)));
            if (myBalls.length === 0) myBalls = balls.filter(b => b.active && b.id === 8);

            let cue = balls.find(b => b.id === 0);
            if (!cue || myBalls.length === 0) {
                shootCb(Math.random() * Math.PI * 2, 500);
                return;
            }

            let target = myBalls[Math.floor(Math.random() * myBalls.length)];
            let dx = target.x - cue.x;
            let dy = target.y - cue.y;
            let angle = Math.atan2(dy, dx);
            
            let error = 0;
            if (difficulty === 'easy') error = (Math.random() - 0.5) * 0.3;
            if (difficulty === 'med') error = (Math.random() - 0.5) * 0.1;
            if (difficulty === 'hard') error = (Math.random() - 0.5) * 0.02;
            
            shootCb(angle + error, 800 + Math.random() * 400);

        }, 1500);
    }
    return { takeTurn };
})();`);

fs.writeFileSync(jsDir + '/network.js', `const Network = (() => {
    let socket = null;

    function init(callbacks) {
        socket = io('/sinuca');
        socket.on('roomAssigned', data => callbacks.onRoom(data.roomId));
        socket.on('gameReady', callbacks.onGameReady);
        socket.on('turnChange', callbacks.onTurnChange);
        socket.on('ballSync', callbacks.onBallSync);
        socket.on('syncState', callbacks.onSyncState);
        socket.on('gameOver', callbacks.onGameOver);
        socket.on('opponentDisconnected', callbacks.onOpponentDisconnect);
        socket.on('spectatorAssigned', callbacks.onSpectator);
    }

    return {
        init,
        getId: () => socket ? socket.id : null,
        sendShot: (angle, force) => socket.emit('playerShot', { angle, force }),
        sendSimulationResult: (events, finalBalls) => socket.emit('simulationResult', { events, finalBalls }),
        requestRematch: () => socket.emit('requestRematch'),
        disconnect: () => { if(socket) socket.disconnect(); }
    };
})();`);

fs.writeFileSync(jsDir + '/main.js', `const Game = (() => {
    let state = null;
    let balls = [];
    let isOnline = false;
    let myId = null;
    let physicsEvents = null;
    let ballsMoving = false;
    let accumulator = 0;
    let lastTime = 0;
    let aiDifficulty = 'med';
    
    const screens = {
        menu: document.getElementById('main-menu'),
        game: document.getElementById('game-screen'),
        over: document.getElementById('game-over-screen')
    };

    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.add('hidden'));
        screens[name].classList.remove('hidden');
    }

    function initSinglePlayer(diff) {
        aiDifficulty = diff;
        isOnline = false;
        myId = 'P1';
        state = Rules.createInitialState('P1', 'BOT');
        balls = Physics.createRack();
        showScreen('game');
        updateHUD();
        requestAnimationFrame(loop);
    }

    function initMultiplayer() {
        isOnline = true;
        Network.init({
            onRoom: id => document.getElementById('room-id').innerText = id,
            onGameReady: data => {
                myId = Network.getId();
                state = Rules.createInitialState(data.p1, data.p2);
                balls = data.balls.map(b => {
                    let ball = new Physics.Ball(b.id, b.x, b.y);
                    ball.active = b.active;
                    return ball;
                });
                showScreen('game');
                updateHUD();
                requestAnimationFrame(loop);
            },
            onTurnChange: turnId => {
                state.turnIndex = state.players.indexOf(turnId);
                updateHUD();
            },
            onBallSync: data => {
                let cue = getCueBall();
                if(cue) {
                    cue.vx = Math.cos(data.angle) * data.force;
                    cue.vy = Math.sin(data.angle) * data.force;
                    startMoving();
                }
            },
            onSyncState: data => {
                state = data.state;
                balls = data.balls.map(b => {
                    let ball = new Physics.Ball(b.id, b.x, b.y);
                    ball.active = b.active;
                    return ball;
                });
                updateHUD();
            },
            onGameOver: data => {
                state = data.state;
                endGame(state.winner, state.foulMessage);
            },
            onOpponentDisconnect: msg => {
                endGame(myId, "Oponente desconectou. Você venceu!");
            },
            onSpectator: msg => alert(msg)
        });
    }

    function updateHUD() {
        if (!state) return;
        let p1 = state.players[0];
        let p2 = state.players[1];
        let myTurn = isMyTurn();

        document.getElementById('turn-indicator').innerText = state.isGameOver ? "Fim de Jogo" : (myTurn ? "SEU TURNO" : "Turno do Oponente");
        document.getElementById('turn-indicator').className = myTurn ? 'my-turn' : 'wait-turn';

        document.getElementById('p1-info').querySelector('.p-name').innerText = p1 === myId ? "Você" : "Oponente";
        document.getElementById('p2-info').querySelector('.p-name').innerText = p2 === myId ? "Você" : "Oponente";

        document.getElementById('p1-group').innerText = state.playerGroups[p1] ? "Grupo: " + (state.playerGroups[p1] === 'SOLID' ? 'Lisas' : 'Listradas') : "Grupo: Aberto";
        document.getElementById('p2-group').innerText = state.playerGroups[p2] ? "Grupo: " + (state.playerGroups[p2] === 'SOLID' ? 'Lisas' : 'Listradas') : "Grupo: Aberto";

        let msg = state.foulMessage || (state.groupsAssigned ? "Mesa Fechada" : "Mesa Aberta");
        if (state.ballInHand) msg += " - BOLA NA MÃO";
        document.getElementById('message-log').innerText = msg;

        Input.setMode(state.ballInHand && myTurn ? 'PLACE' : 'AIM');
    }

    function isMyTurn() { return state && state.players[state.turnIndex] === myId; }
    function getCueBall() { return balls.find(b => b.id === 0); }

    function handleShoot(angle, force) {
        if (isOnline) {
            Network.sendShot(angle, force);
            let cue = getCueBall();
            if(cue) { cue.vx = Math.cos(angle) * force; cue.vy = Math.sin(angle) * force; startMoving(); }
        } else {
            let cue = getCueBall();
            if(cue) { cue.vx = Math.cos(angle) * force; cue.vy = Math.sin(angle) * force; startMoving(); }
        }
    }

    function handlePlaceCue(x, y) {
        let cue = getCueBall();
        if (!cue) { cue = new Physics.Ball(0, x, y); balls.push(cue); } 
        else { cue.x = x; cue.y = y; cue.active = true; cue.vx = 0; cue.vy = 0; }
        state.ballInHand = false;
        Input.setMode('AIM');
        updateHUD();
    }

    function startMoving() {
        ballsMoving = true;
        physicsEvents = { firstHit: null, potted: [], cuePotted: false, touchedCushion: false };
        updateHUD();
    }

    function endTurn() {
        ballsMoving = false;
        if (!isOnline) {
            state = Rules.processShot(state, physicsEvents);
            if (state.isGameOver) {
                endGame(state.winner, state.foulMessage);
            } else {
                updateHUD();
                if (state.players[state.turnIndex] === 'BOT') {
                    AI.takeTurn(state, balls, aiDifficulty, handleShoot);
                }
            }
        } else {
            let finalBalls = balls.map(b => ({id: b.id, x: b.x, y: b.y, active: b.active}));
            Network.sendSimulationResult(physicsEvents, finalBalls);
        }
    }

    function endGame(winner, reason) {
        showScreen('game-over');
        document.getElementById('game-over-title').innerText = winner === myId ? "Você Venceu!" : "Você Perdeu!";
        document.getElementById('game-over-reason').innerText = reason;
    }

    function loop(time) {
        if (!lastTime) lastTime = time;
        let dt = (time - lastTime) / 1000;
        lastTime = time;

        if (ballsMoving) {
            accumulator += dt;
            let wasMoving = false;
            while (accumulator >= Physics.DT) {
                wasMoving = Physics.step(balls, physicsEvents) || wasMoving;
                accumulator -= Physics.DT;
            }
            if (!wasMoving) {
                balls.forEach(b => { b.vx = 0; b.vy = 0; });
                endTurn();
            }
        }

        Render.drawTable();
        Render.drawBalls(balls);

        if (!ballsMoving && isMyTurn() && state && !state.ballInHand) {
            let aim = Input.getAim();
            let cue = getCueBall();
            if (cue && cue.active) Render.drawAim(cue, aim.angle, aim.force);
        }

        requestAnimationFrame(loop);
    }

    document.getElementById('btn-sp-easy').onclick = () => initSinglePlayer('easy');
    document.getElementById('btn-sp-med').onclick = () => initSinglePlayer('med');
    document.getElementById('btn-sp-hard').onclick = () => initSinglePlayer('hard');
    document.getElementById('btn-mp').onclick = () => { initMultiplayer(); showScreen('game'); };
    document.getElementById('btn-back-menu').onclick = () => { location.reload(); };

    Input.init(handleShoot, handlePlaceCue);

    return { isMyTurn, getCueBall, isMoving: () => ballsMoving };
})();`);

fs.writeFileSync(baseDir + '/style.css', `body {
    background-color: #1a1a1a;
    color: white;
    font-family: 'Outfit', sans-serif;
    margin: 0; padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
}

.screen {
    width: 100%; height: 100%;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
}

.hidden { display: none !important; }

h1 { font-size: 3rem; color: #f1c40f; text-shadow: 0 4px 10px rgba(0,0,0,0.5); margin-bottom: 2rem; }

.menu-buttons button {
    display: block; width: 300px; padding: 15px; margin: 10px 0;
    font-size: 1.2rem; font-family: 'Outfit', sans-serif;
    border: none; border-radius: 8px;
    background: #333; color: #fff;
    cursor: pointer; transition: 0.2s;
}
.menu-buttons button:hover { background: #555; transform: scale(1.05); }

.back-link {
    display: block; text-align: center; margin-top: 20px;
    color: #aaa; text-decoration: none;
}

#hud {
    width: 800px;
    margin-bottom: 20px;
    background: rgba(0,0,0,0.5);
    padding: 10px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.5);
    box-sizing: border-box;
}

.hud-top {
    display: flex; justify-content: space-between; align-items: center;
}

.player-info {
    display: flex; flex-direction: column; align-items: center;
    font-size: 1.2rem;
}

.p-group { color: #f1c40f; font-size: 1rem; margin-top: 5px; }

.game-status { text-align: center; }

#turn-indicator { font-size: 1.5rem; font-weight: bold; margin-bottom: 5px; }
.my-turn { color: #2ecc71; }
.wait-turn { color: #e74c3c; }

#message-log { color: #e67e22; font-size: 0.9rem; margin-top: 5px; font-weight: 600; }
#room-indicator { font-size: 0.9rem; color: #aaa; }

.canvas-container {
    position: relative;
}

#pool-canvas {
    background: #005027;
    background-image: radial-gradient(circle, #006633 0%, #00401f 100%);
    border: 30px solid #5c3a21;
    border-radius: 15px;
    box-shadow: inset 0 0 40px rgba(0,0,0,0.8), 0 15px 40px rgba(0,0,0,0.9), 0 0 0 5px #3a2211;
}

#game-over-screen {
    background: rgba(0,0,0,0.9); position: absolute; z-index: 100; left: 0; top: 0; width: 100vw; height: 100vh;
}
#game-over-title { font-size: 4rem; color: #f1c40f; }
#game-over-reason { font-size: 1.5rem; margin-bottom: 30px; }
`);

fs.writeFileSync(baseDir + '/index.html', \`<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Sinuca Premium</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div id="main-menu" class="screen">
        <h1>Sinuca Premium</h1>
        <div class="menu-buttons">
            <button id="btn-sp-easy">Single Player (Fácil)</button>
            <button id="btn-sp-med">Single Player (Médio)</button>
            <button id="btn-sp-hard">Single Player (Difícil)</button>
            <button id="btn-mp">Multiplayer Online</button>
            <a href="/" class="back-link">Voltar ao Hub</a>
        </div>
    </div>

    <div id="game-screen" class="screen hidden">
        <div id="hud">
            <div class="hud-top">
                <div class="player-info" id="p1-info">
                    <span class="p-name">Você</span>
                    <span class="p-group" id="p1-group">Grupo: Aberto</span>
                </div>
                <div class="game-status">
                    <div id="turn-indicator">Turno...</div>
                    <div id="room-indicator">Sala: <span id="room-id">Local</span></div>
                    <div id="message-log">Mesa Aberta</div>
                </div>
                <div class="player-info" id="p2-info">
                    <span class="p-name">Oponente</span>
                    <span class="p-group" id="p2-group">Grupo: Aberto</span>
                </div>
            </div>
        </div>
        
        <div class="canvas-container">
            <canvas id="pool-canvas" width="800" height="400"></canvas>
        </div>
    </div>

    <div id="game-over-screen" class="screen hidden">
        <h2 id="game-over-title">Fim de Jogo</h2>
        <p id="game-over-reason">Motivo</p>
        <div class="menu-buttons">
            <button id="btn-back-menu">Voltar ao Menu</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script src="js/shared.js"></script>
    <script src="js/physics.js"></script>
    <script src="js/rules.js"></script>
    <script src="js/render.js"></script>
    <script src="js/input.js"></script>
    <script src="js/ai.js"></script>
    <script src="js/network.js"></script>
    <script src="js/main.js"></script>
</body>
</html>\`);
