// Partidas bot vs bot: exercita IA + física + árbitro de ponta a ponta (sem navegador).
const test = require('node:test');
const assert = require('node:assert/strict');

global.Shared = require('../public/sinuca/js/shared.js');
global.Physics = require('../public/sinuca/js/physics.js');
global.Rules = require('../public/sinuca/js/rules.js');
const AI = require('../public/sinuca/js/ai.js');

function playMatch(difficulty, maxTurns = 200) {
    const state = Rules.createInitialState('P1', 'BOT');
    const balls = Physics.createRack();
    const stats = { turns: 0, fouls: 0, potted: 0, gameOver: false, winner: null, calls: 0 };

    while (!state.isGameOver && stats.turns < maxTurns) {
        stats.turns++;

        if (state.ballInHand) {
            const pos = AI.planPlacement(state, balls);
            const cue = balls.find(b => b.id === 0);
            assert.ok(Rules.isValidCuePlacement(pos.x, pos.y, balls, Rules.getPlacementOptions(state)),
                'IA escolheu posição inválida para a branca');
            cue.x = pos.x; cue.y = pos.y; cue.active = true; cue.vx = 0; cue.vy = 0;
            state.ballInHand = false;
        }

        const mustCall = Rules.mustCallPocket(state, state.players[state.turnIndex]);
        const shot = AI.planShot(state, balls, difficulty);
        if (mustCall) { assert.ok(Rules.isPocketIndex(shot.calledPocket), 'IA não cantou a caçapa da 8'); stats.calls++; }
        const cue = balls.find(b => b.id === 0);
        const check = Rules.validateShot(state, state.players[state.turnIndex], shot, cue);
        assert.ok(check.ok, check.reason);

        cue.vx = Math.cos(shot.angle) * shot.force;
        cue.vy = Math.sin(shot.angle) * shot.force;
        const events = Physics.createEvents();
        Physics.simulate(balls, events);

        Rules.processShot(state, events, shot.calledPocket);
        if (state.respot) { state.respot.forEach(id => Physics.respotBall(balls, id)); state.respot = null; }
        if (state.foulMessage && !state.isGameOver) stats.fouls++;
        stats.potted += events.potted.length;

        // Invariantes: bolas ativas dentro da mesa e sem sobreposição
        const act = balls.filter(b => b.active);
        for (const b of act) {
            assert.ok(b.x >= Shared.BALL_RADIUS - 1e-6 && b.x <= Shared.TABLE_W - Shared.BALL_RADIUS + 1e-6);
            assert.ok(b.y >= Shared.BALL_RADIUS - 1e-6 && b.y <= Shared.TABLE_H - Shared.BALL_RADIUS + 1e-6);
        }
        // O estado das regras e a mesa física devem concordar sobre quais bolas existem
        const onTable = new Set(act.map(b => b.id));
        for (const id of state.ballsOnTable) {
            if (id !== 0) assert.ok(onTable.has(id), 'bola ' + id + ' deveria estar na mesa');
        }
    }
    stats.gameOver = state.isGameOver;
    stats.winner = state.winner;
    return stats;
}

test('partidas bot vs bot terminam sem erros e com bolas sendo encaçapadas', () => {
    const results = [];
    for (const diff of ['easy', 'med', 'hard']) {
        for (let i = 0; i < 6; i++) results.push({ diff, ...playMatch(diff) });
    }
    const finished = results.filter(r => r.gameOver).length;
    const avgPotted = results.reduce((a, r) => a + r.potted, 0) / results.length;
    const foulRate = results.reduce((a, r) => a + r.fouls, 0) / results.reduce((a, r) => a + r.turns, 0);
    console.log(`# partidas: ${results.length}, terminadas: ${finished}, bolas encaçapadas/partida: ${avgPotted.toFixed(1)}, taxa de faltas: ${(foulRate * 100).toFixed(0)}%`);
    assert.ok(avgPotted >= 3, 'a IA quase não encaçapa bolas');
    assert.ok(foulRate < 0.5, 'taxa de faltas da IA muito alta');
});
