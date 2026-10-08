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
