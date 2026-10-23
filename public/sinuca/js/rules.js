(function(exports){
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

    // Valida onde a bola branca pode ser solta (bola na mão).
    // balls: [{id, x, y, active}]. options.maxX (opcional): limite da linha de saída.
    exports.isValidCuePlacement = function(x, y, balls, options) {
        options = options || {};
        const r = Shared.BALL_RADIUS;

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
            if (Math.hypot(p.x - x, p.y - y) < Shared.POCKET_RADIUS) return false;
        }

        return true;
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
})(typeof exports === 'undefined' ? this['Rules'] = {} : exports);
