// Testes da sinuca: regras (árbitro), física determinística e fluxo multiplayer autoritativo.
// Rodar: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');

const Shared = require('../public/sinuca/js/shared.js');
const Physics = require('../public/sinuca/js/physics.js');
const Rules = require('../public/sinuca/js/rules.js');

const ev = (o) => Object.assign(Physics.createEvents(), o);
const afterBreak = () => { const s = Rules.createInitialState('A', 'B'); s.isBreak = false; s.ballInHand = false; return s; };
const assigned = (aGroup) => {
    const s = afterBreak();
    s.groupsAssigned = true;
    s.playerGroups.A = aGroup;
    s.playerGroups.B = aGroup === 'SOLID' ? 'STRIPE' : 'SOLID';
    return s;
};

// ---------- Árbitro ----------

test('estouro com bola encaçapada NÃO define grupos (mesa aberta) e mantém o turno', () => {
    const s = Rules.createInitialState('A', 'B');
    Rules.processShot(s, ev({ firstHit: 1, potted: [3], pottedPockets: { 3: 0 }, touchedCushion: true }), null);
    assert.equal(s.groupsAssigned, false);
    assert.equal(s.playerGroups.A, null);
    assert.equal(s.turnIndex, 0);
    assert.equal(s.isBreak, false);
    assert.equal(s.ballInHand, false);
});

test('grupos só são definidos na primeira tacada legal APÓS o estouro', () => {
    const s = afterBreak();
    Rules.processShot(s, ev({ firstHit: 10, potted: [10], pottedPockets: { 10: 2 }, touchedCushion: true }), null);
    assert.equal(s.groupsAssigned, true);
    assert.equal(s.playerGroups.A, 'STRIPE');
    assert.equal(s.playerGroups.B, 'SOLID');
    assert.equal(s.turnIndex, 0);
});

test('falta com bola encaçapada na mesa aberta não define grupos', () => {
    const s = afterBreak();
    Rules.processShot(s, ev({ firstHit: 2, cuePotted: true, potted: [2], pottedPockets: { 2: 0 } }), null);
    assert.equal(s.groupsAssigned, false);
    assert.equal(s.ballInHand, true);
    assert.equal(s.turnIndex, 1);
});

test('tocar primeiro na bola do adversário é falta e dá bola na mão', () => {
    const s = assigned('SOLID');
    Rules.processShot(s, ev({ firstHit: 12, touchedCushion: true }), null);
    assert.match(s.foulMessage, /errada/);
    assert.equal(s.ballInHand, true);
    assert.equal(s.turnIndex, 1);
});

test('não tocar em nenhuma bola e não tocar tabela são faltas', () => {
    let s = assigned('SOLID');
    Rules.processShot(s, ev({}), null);
    assert.match(s.foulMessage, /Não tocou/);
    s = assigned('SOLID');
    Rules.processShot(s, ev({ firstHit: 1 }), null);
    assert.match(s.foulMessage, /tabela/);
    assert.equal(s.ballInHand, true);
});

test('encaçapar bola própria mantém o turno; errar passa o turno sem bola na mão', () => {
    let s = assigned('SOLID');
    Rules.processShot(s, ev({ firstHit: 1, potted: [1], pottedPockets: { 1: 0 }, touchedCushion: true }), null);
    assert.equal(s.turnIndex, 0);
    s = assigned('SOLID');
    Rules.processShot(s, ev({ firstHit: 1, touchedCushion: true }), null);
    assert.equal(s.turnIndex, 1);
    assert.equal(s.ballInHand, false);
});

test('bola 8 antes da hora = derrota imediata', () => {
    const s = assigned('SOLID');
    Rules.processShot(s, ev({ firstHit: 8, potted: [8], pottedPockets: { 8: 0 }, touchedCushion: true }), 0);
    assert.equal(s.isGameOver, true);
    assert.equal(s.winner, 'B');
});

function clearedState() {
    const s = assigned('SOLID');
    s.ballsOnTable = [0, 8, 9, 10, 11];   // A (lisas) limpou o grupo
    return s;
}

test('bola 8 na caçapa cantada após limpar o grupo = vitória', () => {
    const s = clearedState();
    assert.equal(Rules.mustCallPocket(s, 'A'), true);
    Rules.processShot(s, ev({ firstHit: 8, potted: [8], pottedPockets: { 8: 2 }, touchedCushion: true }), 2);
    assert.equal(s.isGameOver, true);
    assert.equal(s.winner, 'A');
});

test('bola 8 em outra caçapa que a cantada = derrota imediata', () => {
    const s = clearedState();
    Rules.processShot(s, ev({ firstHit: 8, potted: [8], pottedPockets: { 8: 5 }, touchedCushion: true }), 2);
    assert.equal(s.winner, 'B');
    assert.match(s.foulMessage, /cantada/);
});

test('bola 8 com falta (branca encaçapada) = derrota imediata', () => {
    const s = clearedState();
    Rules.processShot(s, ev({ firstHit: 8, cuePotted: true, potted: [8], pottedPockets: { 8: 2 } }), 2);
    assert.equal(s.winner, 'B');
});

test('bola 8 junto com a última bola do grupo na mesma tacada = derrota (antes da hora)', () => {
    const s = assigned('SOLID');
    s.ballsOnTable = [0, 7, 8, 9];
    Rules.processShot(s, ev({ firstHit: 7, potted: [7, 8], pottedPockets: { 7: 0, 8: 0 }, touchedCushion: true }), 0);
    assert.equal(s.winner, 'B');
});

test('8 encaçapada no estouro volta para a mesa (sem derrota)', () => {
    const s = Rules.createInitialState('A', 'B');
    Rules.processShot(s, ev({ firstHit: 1, potted: [8], pottedPockets: { 8: 1 }, touchedCushion: true }), null);
    assert.equal(s.isGameOver, false);
    assert.deepEqual(s.respot, [8]);
    assert.ok(s.ballsOnTable.includes(8));
});

test('validateShot exige caçapa cantada na bola 8 e limita a força', () => {
    const s = clearedState();
    const cue = { id: 0, active: true };
    assert.equal(Rules.validateShot(s, 'A', { angle: 0, force: 500, calledPocket: null }, cue).ok, false);
    assert.equal(Rules.validateShot(s, 'A', { angle: 0, force: 500, calledPocket: 3 }, cue).ok, true);
    assert.equal(Rules.validateShot(s, 'A', { angle: 0, force: 99999, calledPocket: 3 }, cue).ok, false);
    assert.equal(Rules.validateShot(s, 'B', { angle: 0, force: 500, calledPocket: 3 }, cue).ok, false);
    assert.equal(Rules.validateShot(s, 'A', { angle: NaN, force: 500, calledPocket: 3 }, cue).ok, false);
});

test('bola na mão: distância mínima, caçapas e linha de saída no estouro', () => {
    const balls = Physics.createRack();
    assert.equal(Rules.isValidCuePlacement(100, 200, balls, {}), true);
    assert.equal(Rules.isValidCuePlacement(550, 200, balls, {}), false);                       // sobre a bola 1
    assert.equal(Rules.isValidCuePlacement(5, 5, balls, {}), false);                           // dentro da caçapa/tabela
    assert.equal(Rules.isValidCuePlacement(300, 200, balls, { maxX: Shared.HEADSTRING_X }), false);
    assert.equal(Rules.isValidCuePlacement(150, 200, balls, { maxX: Shared.HEADSTRING_X }), true);
});

// ---------- Física ----------

test('física é determinística e chega ao repouso absoluto', () => {
    const run = () => {
        const balls = Physics.createRack();
        balls[0].vx = Shared.MAX_SHOT_FORCE; balls[0].vy = 20;
        const events = Physics.createEvents();
        const steps = Physics.simulate(balls, events);
        return { balls: balls.map(b => [b.id, b.x, b.y, b.active, b.vx, b.vy]), events, steps };
    };
    const a = run(), b = run();
    assert.deepEqual(a, b);
    assert.ok(a.steps > 10 && a.steps < 120 * 90);
    assert.notEqual(a.events.firstHit, null);
    assert.ok(a.balls.every(x => x[4] === 0 && x[5] === 0));
});

test('registra caçapa de cada bola encaçapada (pottedPockets) e branca encaçapada', () => {
    const o = new Physics.Ball(3, 60, 60); o.vx = -300; o.vy = -300;
    const c = new Physics.Ball(0, 700, 300); c.vx = 300; c.vy = 300;
    const events = Physics.createEvents();
    Physics.simulate([c, o], events);
    assert.deepEqual(events.potted, [3]);
    assert.equal(events.pottedPockets[3], 0);
    assert.equal(events.cuePotted, true);
});

test('bola 8 encaçapada no estouro é recolocada em local livre', () => {
    const balls = Physics.createRack();
    const eight = balls.find(b => b.id === 8);
    eight.active = false;
    Physics.respotBall(balls, 8);
    assert.equal(eight.active, true);
    for (const o of balls) {
        if (o === eight || !o.active) continue;
        assert.ok(Math.hypot(o.x - eight.x, o.y - eight.y) >= 2 * Shared.BALL_RADIUS - 1e-6);
    }
});

// ---------- Multiplayer (servidor autoritativo) ----------

test('servidor valida e simula a tacada; cliente reproduz o mesmo resultado', async (t) => {
    const { io } = require('socket.io-client');
    const PORT = 3911;
    const server = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }
    });
    t.after(() => server.kill());
    await new Promise((resolve, reject) => {
        server.stdout.on('data', d => { if (String(d).includes('Servidor rodando')) resolve(); });
        server.on('exit', c => reject(new Error('server exit ' + c)));
        setTimeout(() => reject(new Error('timeout ao iniciar servidor')), 10000);
    });

    const url = `http://localhost:${PORT}/sinuca`;
    const c1 = io(url, { forceNew: true }), c2 = io(url, { forceNew: true });
    t.after(() => { c1.close(); c2.close(); });
    const once = (sock, evt, ms = 40000) => new Promise((res, rej) => {
        const t0 = setTimeout(() => rej(new Error('timeout ' + evt)), ms);
        sock.once(evt, d => { clearTimeout(t0); res(d); });
    });

    const readyP = once(c1, 'gameReady');
    const ready = await readyP;
    assert.equal(ready.balls.length, 16);
    const shooter = ready.p1 === c1.id ? c1 : c2;
    const other = shooter === c1 ? c2 : c1;

    // Quem não é da vez é recusado; força absurda é recusada
    let rej = once(other, 'shotRejected');
    other.emit('playerShot', { angle: 0, force: 500 });
    assert.match((await rej).reason, /turno/);

    // Estouro: posição fora da linha de saída é recusada
    rej = once(shooter, 'shotRejected');
    shooter.emit('placeCue', { x: 400, y: 200 });
    assert.match((await rej).reason, /Posição inválida/);

    const placed = once(shooter, 'cuePlaced');
    shooter.emit('placeCue', { x: 150, y: 200 });
    await placed;

    rej = once(shooter, 'shotRejected');
    shooter.emit('playerShot', { angle: 0, force: 99999 });
    assert.match((await rej).reason, /Força/);

    const syncP = once(shooter, 'syncState');
    const ballSyncP = once(other, 'ballSync');
    shooter.emit('playerShot', { angle: 0.01, force: 1500, calledPocket: null });
    const bs = await ballSyncP;
    const sync = await syncP;

    // Reproduz no "cliente" com a velocidade enviada pelo servidor
    const balls = Physics.createRack();
    const cue = balls[0]; cue.x = 150; cue.y = 200; cue.vx = bs.vx; cue.vy = bs.vy;
    Physics.simulate(balls, Physics.createEvents());
    const local = balls.map(b => ({ id: b.id, x: b.x, y: b.y, active: b.active }));
    assert.deepEqual(sync.balls, local);
    assert.equal(sync.state.isBreak, false);
});
