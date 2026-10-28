const Game = (() => {
    let state = null;
    let balls = [];
    let isOnline = false;
    let myId = null;
    let physicsEvents = null;
    let ballsMoving = false;
    let awaitingServer = false;   // online: tacada enviada/animando, aguardando o estado oficial do servidor
    let accumulator = 0;
    let lastTime = 0;
    let loopStarted = false;
    let aiDifficulty = 'med';
    let calledPocket = null;      // caçapa cantada (índice em Shared.POCKETS) para a bola 8
    let shotCalledPocket = null;  // caçapa da tacada em andamento (single player)
    let noticeTimer = null;

    const screens = {
        menu: document.getElementById('main-menu'),
        game: document.getElementById('game-screen'),
        over: document.getElementById('game-over-screen')
    };

    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.add('hidden'));
        screens[name].classList.remove('hidden');
    }

    function startLoop() {
        if (loopStarted) return;
        loopStarted = true;
        requestAnimationFrame(loop);
    }

    function rebuildBalls(list) {
        return list.map(b => {
            const ball = new Physics.Ball(b.id, b.x, b.y);
            ball.active = b.active;
            return ball;
        });
    }

    // Aviso temporário no HUD (ex.: tacada recusada)
    function notice(text) {
        document.getElementById('message-log').innerText = text;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(updateHUD, 3500);
    }

    function initSinglePlayer(diff) {
        aiDifficulty = diff;
        isOnline = false;
        myId = 'P1';
        state = Rules.createInitialState('P1', 'BOT');
        balls = Physics.createRack();
        showScreen('game');
        updateHUD();
        startLoop();
    }

    function initMultiplayer() {
        isOnline = true;
        document.getElementById('turn-indicator').innerText = 'Aguardando oponente...';
        document.getElementById('message-log').innerText = 'Compartilhe o endereço da página para outro jogador entrar.';
        Network.init({
            onRoom: id => document.getElementById('room-id').innerText = id,
            onGameReady: data => {
                myId = Network.getId();
                state = Rules.createInitialState(data.p1, data.p2);
                balls = rebuildBalls(data.balls);
                awaitingServer = false;
                showScreen('game');
                updateHUD();
                startLoop();
            },
            onTurnChange: turnId => {
                if (!state) return;
                state.turnIndex = state.players.indexOf(turnId);
                updateHUD();
            },
            // Servidor aceitou a tacada: todos animam com a MESMA velocidade inicial (calculada no servidor)
            onBallSync: data => {
                const cue = getCueBall();
                if (!cue) return;
                awaitingServer = true;
                calledPocket = Rules.isPocketIndex(data.calledPocket) ? data.calledPocket : null;
                cue.vx = data.vx;
                cue.vy = data.vy;
                startMoving();
            },
            onCuePlaced: data => {
                state = data.state;
                const cue = getCueBall();
                if (cue) { cue.x = data.x; cue.y = data.y; cue.vx = 0; cue.vy = 0; cue.active = true; }
                updateHUD();
            },
            onShotRejected: data => {
                awaitingServer = false;
                notice(data.reason || 'Jogada recusada pelo servidor.');
            },
            // Estado oficial do servidor: encaixa posições, regras e turno (anula qualquer divergência)
            onSyncState: data => {
                state = data.state;
                balls = rebuildBalls(data.balls);
                ballsMoving = false;
                awaitingServer = false;
                accumulator = 0;
                calledPocket = null;
                updateHUD();
            },
            onGameOver: data => {
                state = data.state;
                if (data.balls) balls = rebuildBalls(data.balls);
                ballsMoving = false;
                awaitingServer = false;
                updateHUD();
                setTimeout(() => endGame(state.winner, state.foulMessage), 900);
            },
            onOpponentDisconnect: msg => {
                endGame(myId, "Oponente desconectou. Você venceu!");
            },
            onSpectator: msg => alert(msg)
        });
    }

    function groupLabel(playerId) {
        const g = state.playerGroups[playerId];
        if (!g) return "Grupo: Aberto";
        const left = Rules.getRemainingBalls(state, playerId).length;
        return "Grupo: " + (g === 'SOLID' ? 'Lisas' : 'Listradas') + " (" + left + " restantes)";
    }

    function canCallPocket() {
        return !!state && isMyTurn() && !ballsMoving && !awaitingServer &&
            Rules.mustCallPocket(state, myId);
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

        document.getElementById('p1-group').innerText = groupLabel(p1);
        document.getElementById('p2-group').innerText = groupLabel(p2);

        let msg = state.foulMessage || state.infoMessage || (state.groupsAssigned ? "Mesa Fechada" : "Mesa Aberta");
        if (state.ballInHand) msg += state.isBreak ? " - ESTOURO: posicione a branca atrás da linha" : " - BOLA NA MÃO";
        if (!state.isGameOver && Rules.mustCallPocket(state, state.players[state.turnIndex])) {
            msg += " - BOLA 8: cante a caçapa";
        }
        document.getElementById('message-log').innerText = msg;

        // Seletor de caçapa (obrigatório na bola 8)
        const callBox = document.getElementById('call-pocket');
        const show = canCallPocket();
        callBox.classList.toggle('hidden', !show);
        callBox.querySelectorAll('.pocket-btn').forEach(btn => {
            btn.classList.toggle('selected', Number(btn.dataset.pocket) === calledPocket);
        });
        document.getElementById('call-pocket-label').innerText = Rules.isPocketIndex(calledPocket)
            ? "Caçapa cantada: " + Shared.POCKET_NAMES[calledPocket]
            : "Bola 8: escolha a caçapa";

        Input.setMode(state.ballInHand && myTurn ? 'PLACE' : 'AIM');
    }

    function isMyTurn() { return !!state && state.players[state.turnIndex] === myId; }
    function getCueBall() { return balls.find(b => b.id === 0); }

    // Tacada do jogador humano (vem do Input)
    function handleShoot(angle, force) {
        if (!state || state.isGameOver || !isMyTurn() || ballsMoving || awaitingServer || state.ballInHand) return;
        force = Math.min(force, Shared.MAX_SHOT_FORCE);

        if (Rules.mustCallPocket(state, myId) && !Rules.isPocketIndex(calledPocket)) {
            notice("Cante a caçapa da bola 8 (botões acima da mesa) antes de tacar!");
            return;
        }

        if (isOnline) {
            awaitingServer = true;      // trava novas tacadas até o servidor responder
            Network.sendShot(angle, force, calledPocket);
        } else {
            launchShot(angle, force, calledPocket);
        }
    }

    // Aplica a tacada localmente (single player)
    function launchShot(angle, force, pocket) {
        const cue = getCueBall();
        if (!cue || !cue.active) return;
        shotCalledPocket = Rules.isPocketIndex(pocket) ? pocket : null;
        calledPocket = shotCalledPocket;
        cue.vx = Math.cos(angle) * force;
        cue.vy = Math.sin(angle) * force;
        startMoving();
    }

    // Posiciona a branca localmente (single player, usado pelo humano e pelo bot)
    function placeCueLocal(x, y) {
        if (!state || !state.ballInHand) return false;
        if (!Rules.isValidCuePlacement(x, y, balls, Rules.getPlacementOptions(state))) return false;
        let cue = getCueBall();
        if (!cue) { cue = new Physics.Ball(0, x, y); balls.push(cue); }
        else { cue.x = x; cue.y = y; cue.active = true; cue.vx = 0; cue.vy = 0; }
        state.ballInHand = false;
        updateHUD();
        return true;
    }

    function handlePlaceCue(x, y) {
        if (!state || !state.ballInHand || !isMyTurn() || ballsMoving || awaitingServer) return;
        if (!Rules.isValidCuePlacement(x, y, balls, Rules.getPlacementOptions(state))) {
            notice(state.isBreak ? "No estouro a branca fica atrás da linha de saída." : "Posição inválida para a bola branca.");
            return;
        }
        if (isOnline) Network.sendPlaceCue(x, y);   // o servidor valida e confirma via cuePlaced
        else placeCueLocal(x, y);
    }

    function startMoving() {
        ballsMoving = true;
        accumulator = 0;
        physicsEvents = Physics.createEvents();
        updateHUD();
    }

    function runBotTurn() {
        if (isOnline || !state || state.isGameOver || state.players[state.turnIndex] !== 'BOT') return;
        AI.takeTurn(state, balls, aiDifficulty, {
            place: (x, y) => placeCueLocal(x, y),
            shoot: (angle, force, pocket) => launchShot(angle, force, pocket)
        });
    }

    // Fim da tacada no single player (no online quem decide é o servidor)
    function endTurn() {
        ballsMoving = false;
        state = Rules.processShot(state, physicsEvents, shotCalledPocket);
        if (state.respot) {
            state.respot.forEach(id => Physics.respotBall(balls, id));
            state.respot = null;
        }
        calledPocket = null;
        shotCalledPocket = null;
        if (state.isGameOver) {
            updateHUD();
            setTimeout(() => endGame(state.winner, state.foulMessage), 900);
        } else {
            updateHUD();
            runBotTurn();
        }
    }

    function endGame(winner, reason) {
        showScreen('over');
        document.getElementById('game-over-title').innerText = winner === myId ? "Você Venceu!" : "Você Perdeu!";
        document.getElementById('game-over-reason').innerText = reason || "";
    }

    function loop(time) {
        if (!lastTime) lastTime = time;
        let dt = Math.min((time - lastTime) / 1000, 0.1);   // evita "salto" após aba em segundo plano
        lastTime = time;

        if (ballsMoving) {
            accumulator += dt;
            let stepped = false, moving = true;
            while (accumulator >= Physics.DT) {
                moving = Physics.step(balls, physicsEvents);
                stepped = true;
                accumulator -= Physics.DT;
                if (!moving) break;
            }
            // Só encerra se de fato simulou e tudo parou (frames curtos podem não dar nenhum passo)
            if (stepped && !moving) {
                balls.forEach(b => { b.vx = 0; b.vy = 0; });
                ballsMoving = false;
                if (!isOnline) endTurn();
                // online: aguarda o syncState oficial do servidor
            }
        }

        Render.drawTable();
        if (Rules.isPocketIndex(calledPocket)) Render.drawCalledPocket(calledPocket);
        Render.drawBalls(balls);

        if (!ballsMoving && !awaitingServer && isMyTurn() && state && !state.isGameOver) {
            if (state.ballInHand) {
                let mouse = Input.getMouse();
                let valid = Rules.isValidCuePlacement(mouse.x, mouse.y, balls, Rules.getPlacementOptions(state));
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

    document.getElementById('btn-sp-easy').onclick = () => { initSinglePlayer('easy'); };
    document.getElementById('btn-sp-med').onclick = () => { initSinglePlayer('med'); };
    document.getElementById('btn-sp-hard').onclick = () => { initSinglePlayer('hard'); };
    document.getElementById('btn-mp').onclick = () => { initMultiplayer(); showScreen('game'); };
    document.getElementById('btn-back-menu').onclick = () => { location.reload(); };

    document.querySelectorAll('.pocket-btn').forEach(btn => {
        btn.onclick = () => {
            if (!canCallPocket()) return;
            calledPocket = Number(btn.dataset.pocket);
            updateHUD();
        };
    });

    Input.init(handleShoot, handlePlaceCue);

    return { isMyTurn, getCueBall, isMoving: () => ballsMoving || awaitingServer };
})();
