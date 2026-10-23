const Game = (() => {
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
        if (!Rules.isValidCuePlacement(x, y, balls)) return;
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

        if (!ballsMoving && isMyTurn() && state) {
            if (state.ballInHand) {
                let mouse = Input.getMouse();
                let valid = Rules.isValidCuePlacement(mouse.x, mouse.y, balls);
                Render.drawCuePlacement(mouse.x, mouse.y, valid);
            } else {
                let aim = Input.getAim();
                let cue = getCueBall();
                if (cue && cue.active) {
                    let dirX = Math.cos(aim.angle), dirY = Math.sin(aim.angle);
                    let projection = Physics.castCircle(balls, cue, dirX, dirY, 0);
                    Render.drawAim(cue, aim.angle, aim.force, projection);
                }
            }
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
})();
