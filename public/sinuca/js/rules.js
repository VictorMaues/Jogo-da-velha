(function(exports){
    // Isomórfico: no browser usa window.Shared; no Node usa require. (Não usar `typeof exports`
    // aqui dentro: `exports` é parâmetro da IIFE e sempre existe.)
    const IS_NODE = typeof module !== 'undefined' && !!module.exports;
    const Shared = IS_NODE ? require('./shared.js') : window.Shared;

    const POCKET_COUNT = Shared.POCKETS.length;

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
            infoMessage: null,
            ballInHand: true,
            isBreak: true,          // tacada de saída (estouro) ainda não aconteceu
            respot: null            // ids de bolas a recolocar na mesa (8 encaçapada no estouro)
        };
    };

    // Opções de posicionamento da branca: no estouro ela fica atrás da linha de saída.
    exports.getPlacementOptions = function(state) {
        return state && state.isBreak ? { maxX: Shared.HEADSTRING_X } : {};
    };

    // Valida onde a bola branca pode ser solta (bola na mão).
    // balls: [{id, x, y, active}]. options.maxX (opcional): limite da linha de saída.
    exports.isValidCuePlacement = function(x, y, balls, options) {
        options = options || {};
        const r = Shared.BALL_RADIUS;

        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

        // Dentro da área jogável (centro da bola a pelo menos r das tabelas)
        if (x < r || x > Shared.TABLE_W - r || y < r || y > Shared.TABLE_H - r) return false;
        if (options.maxX !== undefined && x > options.maxX) return false;

        // Distância >= 2r de toda bola ativa (comparando quadrados)
        const minDist2 = (2 * r) * (2 * r);
        for (const b of balls) {
            if (b.id === 0 || !b.active) continue;
            const dx = b.x - x, dy = b.y - y;
            if (dx * dx + dy * dy < minDist2 - 1e-6) return false;
        }

        // Não pode ser solta dentro de uma caçapa
        for (const p of Shared.POCKETS) {
            const dx = p.x - x, dy = p.y - y;
            if (Math.sqrt(dx * dx + dy * dy) < Shared.POCKET_RADIUS) return false;
        }

        return true;
    };

    // Bolas do grupo do jogador que ainda estão na mesa (vazio se mesa aberta).
    exports.getRemainingBalls = function(state, playerId) {
        const group = state.playerGroups[playerId];
        if (!state.groupsAssigned || !group) return [];
        const type = Shared.BALL_TYPES[group];
        return state.ballsOnTable.filter(b => Shared.getBallType(b) === type);
    };

    // O jogador já limpou o próprio grupo e agora joga na bola 8 (precisa CANTAR a caçapa).
    exports.mustCallPocket = function(state, playerId) {
        if (!state || state.isGameOver || !state.groupsAssigned) return false;
        if (!state.playerGroups[playerId]) return false;
        if (!state.ballsOnTable.includes(8)) return false;
        return exports.getRemainingBalls(state, playerId).length === 0;
    };

    function isPocketIndex(v) {
        return Number.isInteger(v) && v >= 0 && v < POCKET_COUNT;
    }
    exports.isPocketIndex = isPocketIndex;

    // Validação de uma tacada ANTES de simular (usada pelo servidor; o cliente usa para dar feedback).
    // shot: { angle, force, calledPocket }. cueBall: bola branca atual (ou undefined).
    exports.validateShot = function(state, playerId, shot, cueBall) {
        if (!state || state.isGameOver) return { ok: false, reason: 'A partida já terminou.' };
        if (state.players[state.turnIndex] !== playerId) return { ok: false, reason: 'Não é o seu turno.' };
        if (state.ballInHand) return { ok: false, reason: 'Posicione a bola branca antes de tacar (bola na mão).' };
        if (!cueBall || !cueBall.active) return { ok: false, reason: 'Bola branca fora da mesa.' };
        if (!shot || !Number.isFinite(shot.angle) || !Number.isFinite(shot.force)) {
            return { ok: false, reason: 'Tacada inválida.' };
        }
        if (shot.force <= 0 || shot.force > Shared.MAX_SHOT_FORCE + 1e-6) {
            return { ok: false, reason: 'Força da tacada fora do limite.' };
        }
        if (exports.mustCallPocket(state, playerId) && !isPocketIndex(shot.calledPocket)) {
            return { ok: false, reason: 'Cante a caçapa da bola 8 antes de tacar.' };
        }
        return { ok: true };
    };

    // Aplica o resultado de uma tacada. Muta e retorna `state`.
    // shotResult: eventos de Physics.createEvents(). calledPocket: caçapa cantada (obrigatória p/ a bola 8).
    exports.processShot = function(state, shotResult, calledPocket) {
        const turnPlayer = state.players[state.turnIndex];
        const nextTurnIndex = state.turnIndex === 0 ? 1 : 0;
        const opponent = state.players[nextTurnIndex];
        const isBreak = !!state.isBreak;
        const potted = shotResult.potted || [];
        const pockets = shotResult.pottedPockets || {};

        // Calculado ANTES de remover as bolas encaçapadas nesta tacada
        const onEight = exports.mustCallPocket(state, turnPlayer);
        const myGroupStr = state.playerGroups[turnPlayer];
        const myGroupType = myGroupStr ? Shared.BALL_TYPES[myGroupStr] : null;

        let foul = false;
        let foulMsg = "";
        state.infoMessage = null;
        state.respot = null;

        // ---------- Faltas ----------
        if (shotResult.cuePotted) {
            foul = true; foulMsg = "Bola branca encaçapada!";
        } else if (shotResult.firstHit === null) {
            foul = true; foulMsg = "Não tocou em nenhuma bola!";
        } else {
            const firstHitType = Shared.getBallType(shotResult.firstHit);
            if (myGroupType) {
                if (firstHitType === Shared.BALL_TYPES.EIGHT) {
                    if (!onEight) { foul = true; foulMsg = "Tocou na bola 8 primeiro!"; }
                } else if (firstHitType !== myGroupType) {
                    foul = true; foulMsg = "Tocou na bola errada primeiro!";
                }
            } else if (!isBreak && firstHitType === Shared.BALL_TYPES.EIGHT) {
                foul = true; foulMsg = "Tocou na bola 8 primeiro (mesa aberta)!";
            }
        }

        if (!foul && !shotResult.touchedCushion && potted.length === 0) {
            foul = true; foulMsg = "Nenhuma bola tocou a tabela após o contato!";
        }

        // ---------- Bola 8 ----------
        const eightPotted = potted.includes(8);
        if (eightPotted && isBreak) {
            // 8 no estouro: não é derrota; a bola volta para a mesa.
            state.respot = [8];
        } else if (eightPotted) {
            state.isGameOver = true;
            state.ballsOnTable = state.ballsOnTable.filter(b => b !== 8);
            const calledOk = isPocketIndex(calledPocket) && pockets[8] === calledPocket;
            if (!foul && onEight && calledOk) {
                state.winner = turnPlayer;
                state.foulMessage = "Encaçapou a 8 na caçapa cantada. Vitória!";
            } else {
                state.winner = opponent;
                if (foul) state.foulMessage = foulMsg + " E encaçapou a 8 (Derrota imediata!)";
                else if (!onEight) state.foulMessage = "Encaçapou a 8 antes da hora! Derrota imediata.";
                else state.foulMessage = "A 8 não caiu na caçapa cantada! Derrota imediata.";
            }
            potted.forEach(b => { state.ballsOnTable = state.ballsOnTable.filter(x => x !== b); });
            state.isBreak = false;
            state.ballInHand = false;
            return state;
        }

        // ---------- Definição de grupos (mesa aberta) ----------
        // Só na primeira tacada legal APÓS o estouro em que uma bola (não 8) é encaçapada.
        let assignedNow = false;
        if (!foul && !isBreak && !state.groupsAssigned) {
            const first = potted.find(id => id !== 0 && id !== 8);
            if (first !== undefined) {
                const type = Shared.getBallType(first);
                const groupStr = type === Shared.BALL_TYPES.SOLID ? 'SOLID' : 'STRIPE';
                state.groupsAssigned = true;
                state.playerGroups[turnPlayer] = groupStr;
                state.playerGroups[opponent] = groupStr === 'SOLID' ? 'STRIPE' : 'SOLID';
                assignedNow = true;
            }
        }

        // ---------- Bolas encaçapadas ----------
        let myLegalPotted = 0;
        let breakPotted = 0;
        potted.forEach(b => {
            if (b === 0 || b === 8) return;
            const type = Shared.getBallType(b);
            if (state.groupsAssigned && state.playerGroups[turnPlayer] &&
                type === Shared.BALL_TYPES[state.playerGroups[turnPlayer]]) {
                myLegalPotted++;
            }
            if (isBreak) breakPotted++;
            state.ballsOnTable = state.ballsOnTable.filter(ball => ball !== b);
        });

        // ---------- Turno ----------
        if (foul) {
            state.foulMessage = foulMsg;
            state.ballInHand = true;
            state.turnIndex = nextTurnIndex;
        } else {
            state.foulMessage = null;
            state.ballInHand = false;
            const keepsTurn = isBreak ? breakPotted > 0 : myLegalPotted > 0;
            if (!keepsTurn) state.turnIndex = nextTurnIndex;
            if (isBreak) state.infoMessage = breakPotted > 0 ? "Estouro com bola(s) encaçapada(s): a mesa continua aberta." : "Estouro sem encaçapar: mesa aberta.";
            else if (assignedNow) state.infoMessage = "Grupos definidos!";
        }
        if (foul && isBreak) state.infoMessage = "Falta no estouro: a mesa continua aberta.";

        state.isBreak = false;
        return state;
    };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this['Rules'] = {}));
