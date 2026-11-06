// Testes do Campo Minado Naval: regras puras + partida completa via Socket.io.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { io } = require('socket.io-client');
const R = require('../public/campominado/js/rules.js');

const FLEET = [
    { type: 'porta-avioes', row: 0, col: 0, horizontal: true },  // A1..E1
    { type: 'cruzador', row: 2, col: 0, horizontal: false },     // A3..A5
    { type: 'submarino', row: 9, col: 8, horizontal: true }      // I10..J10
];

test('3 embarcações de tamanhos diferentes', () => {
    assert.equal(R.SHIPS.length, 3);
    assert.equal(new Set(R.SHIPS.map(s => s.size)).size, 3);
    assert.equal(R.SIZE, 10);
});

test('validação da frota', () => {
    assert.ok(R.validateFleet(FLEET).ok);
    assert.equal(R.validateFleet(FLEET.slice(0, 2)).ok, false);
    assert.equal(R.validateFleet([FLEET[0], FLEET[0], FLEET[2]]).ok, false, 'tipo repetido');
    assert.equal(R.validateFleet([{ ...FLEET[0], col: 6 }, FLEET[1], FLEET[2]]).ok, false, 'fora do tabuleiro');
    assert.equal(R.validateFleet([FLEET[0], { ...FLEET[1], row: 0, col: 2 }, FLEET[2]]).ok, false, 'sobreposição');
    for (let i = 0; i < 200; i++) assert.ok(R.validateFleet(R.randomFleet()).ok);
});

test('tiros: água com dica, acerto, afundado e fim de jogo', () => {
    const board = R.createBoard(R.validateFleet(FLEET).fleet);
    const miss = R.fire(board, 1, 1); // B2: vizinhos A1,B1,C1 + A3 = 4
    assert.equal(miss.result, 'miss');
    assert.equal(miss.adjacent, 4);
    assert.equal(R.fire(board, 1, 1).ok, false, 'tiro repetido');
    assert.equal(R.fire(board, 10, 0).ok, false, 'fora do tabuleiro');
    assert.equal(R.fire(board, 9, 8).result, 'hit');
    const sunk = R.fire(board, 9, 9);
    assert.equal(sunk.result, 'sunk');
    assert.equal(sunk.ship.type, 'submarino');
    assert.equal(sunk.gameOver, false);
    for (let c = 0; c < 5; c++) R.fire(board, 0, c);
    for (let r = 2; r < 4; r++) R.fire(board, r, 0);
    assert.equal(R.fire(board, 4, 0).gameOver, true);
});

test('partida completa entre 2 clientes pelo servidor', async (t) => {
    const PORT = 3900 + Math.floor(Math.random() * 90);
    const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT }, stdio: 'pipe' });
    t.after(() => srv.kill());
    await new Promise((resolve, reject) => {
        srv.stdout.on('data', d => { if (String(d).includes('localhost')) resolve(); });
        srv.on('exit', code => reject(new Error('servidor saiu: ' + code)));
    });

    const url = `http://localhost:${PORT}/campominado`;
    const a = io(url, { forceNew: true, transports: ['websocket'] });
    const b = io(url, { forceNew: true, transports: ['websocket'] });
    t.after(() => { a.close(); b.close(); });
    const once = (s, ev) => new Promise(res => s.once(ev, res));

    await Promise.all([once(a, 'placementStart'), once(b, 'placementStart')]);

    // Frota inválida é rejeitada
    const rejected = once(a, 'placementRejected');
    a.emit('placeShips', FLEET.slice(0, 1));
    await rejected;

    const start = Promise.all([once(a, 'battleStart'), once(b, 'battleStart')]);
    a.emit('placeShips', FLEET);
    b.emit('placeShips', FLEET);
    const [{ turn }] = await start;
    const players = { [a.id]: a, [b.id]: b };
    let shooter = players[turn];
    assert.ok(shooter);

    // Quem não está na vez é ignorado: o primeiro jogador erra (passa a vez), o segundo afunda tudo.
    const other = shooter === a ? b : a;
    other.emit('fire', { row: 0, col: 0 }); // ignorado

    let res = once(a, 'shotResult');
    shooter.emit('fire', { row: 5, col: 5 });
    let shot = await res;
    assert.equal(shot.result, 'miss');
    assert.equal(shot.nextTurn, other.id);

    const targets = FLEET.flatMap(f => R.shipCells(f.row, f.col, f.horizontal, R.SHIPS.find(s => s.type === f.type).size));
    const over = once(a, 'gameOver');
    for (const [row, col] of targets) {
        res = once(a, 'shotResult');
        other.emit('fire', { row, col });
        shot = await res;
        assert.notEqual(shot.result, 'miss');
        assert.equal(shot.nextTurn, other.id, 'acerto mantém a vez');
    }
    const result = await over;
    assert.equal(result.winner, other.id);
    assert.equal(Object.keys(result.fleets).length, 2);

    // Revanche volta para o posicionamento
    const again = Promise.all([once(a, 'placementStart'), once(b, 'placementStart')]);
    a.emit('requestRematch');
    b.emit('requestRematch');
    await again;
});
