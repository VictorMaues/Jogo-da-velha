// Regras do Campo Minado Naval (isomórfico: usado pelo servidor, pelos testes e pelo navegador).
// O tabuleiro é 10x10. Cada jogador posiciona 3 embarcações de tamanhos diferentes.
// Ao atirar na água, o jogador recebe uma "dica de campo minado": quantas casas de
// embarcação existem nas 8 casas vizinhas ao tiro.
(function (exports) {
    const SIZE = 10;

    const SHIPS = [
        { type: 'porta-avioes', name: 'Porta-aviões', size: 5 },
        { type: 'cruzador', name: 'Cruzador', size: 3 },
        { type: 'submarino', name: 'Submarino', size: 2 }
    ];

    function inBounds(row, col) {
        return Number.isInteger(row) && Number.isInteger(col) &&
            row >= 0 && row < SIZE && col >= 0 && col < SIZE;
    }

    function shipCells(row, col, horizontal, size) {
        const cells = [];
        for (let i = 0; i < size; i++) {
            cells.push(horizontal ? [row, col + i] : [row + i, col]);
        }
        return cells;
    }

    // Valida a frota enviada pelo cliente: [{ type, row, col, horizontal }, ...]
    // Exige exatamente uma embarcação de cada tipo, dentro do tabuleiro e sem sobreposição.
    function validateFleet(placements) {
        if (!Array.isArray(placements) || placements.length !== SHIPS.length) {
            return { ok: false, reason: `Posicione exatamente ${SHIPS.length} embarcações.` };
        }
        const occupied = new Set();
        const seen = new Set();
        const fleet = [];

        for (const p of placements) {
            const def = SHIPS.find(s => s && p && s.type === p.type);
            if (!def) return { ok: false, reason: 'Tipo de embarcação inválido.' };
            if (seen.has(def.type)) return { ok: false, reason: `${def.name} repetido.` };
            seen.add(def.type);

            const row = Number(p.row), col = Number(p.col);
            const horizontal = !!p.horizontal;
            const cells = shipCells(row, col, horizontal, def.size);
            for (const [r, c] of cells) {
                if (!inBounds(r, c)) return { ok: false, reason: `${def.name} fora do tabuleiro.` };
                const key = r * SIZE + c;
                if (occupied.has(key)) return { ok: false, reason: 'Embarcações sobrepostas.' };
                occupied.add(key);
            }
            fleet.push({ type: def.type, name: def.name, size: def.size, row, col, horizontal, cells });
        }
        return { ok: true, fleet };
    }

    // Cria o tabuleiro de um jogador a partir de uma frota já validada.
    function createBoard(fleet) {
        const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null)); // índice da embarcação
        fleet.forEach((ship, idx) => ship.cells.forEach(([r, c]) => { grid[r][c] = idx; }));
        return {
            fleet: fleet.map(s => ({ ...s, hits: 0 })),
            grid,
            shots: Array.from({ length: SIZE }, () => Array(SIZE).fill(false))
        };
    }

    function countAdjacent(board, row, col) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (!dr && !dc) continue;
                const r = row + dr, c = col + dc;
                if (inBounds(r, c) && board.grid[r][c] !== null) n++;
            }
        }
        return n;
    }

    function isFleetDestroyed(board) {
        return board.fleet.every(s => s.hits >= s.size);
    }

    // Dispara contra o tabuleiro. Retorna { ok, result: 'miss'|'hit'|'sunk', adjacent?, ship?, gameOver }
    function fire(board, row, col) {
        if (!inBounds(row, col)) return { ok: false, reason: 'Tiro fora do tabuleiro.' };
        if (board.shots[row][col]) return { ok: false, reason: 'Você já atirou nessa casa.' };
        board.shots[row][col] = true;

        const idx = board.grid[row][col];
        if (idx === null) {
            return { ok: true, result: 'miss', adjacent: countAdjacent(board, row, col), gameOver: false };
        }
        const ship = board.fleet[idx];
        ship.hits++;
        const sunk = ship.hits >= ship.size;
        return {
            ok: true,
            result: sunk ? 'sunk' : 'hit',
            ship: sunk ? { type: ship.type, name: ship.name, cells: ship.cells } : { type: ship.type, name: ship.name },
            gameOver: sunk && isFleetDestroyed(board)
        };
    }

    // Gera uma frota aleatória válida (botão "Aleatório" e testes).
    function randomFleet(rng = Math.random) {
        for (;;) {
            const placements = SHIPS.map(s => {
                const horizontal = rng() < 0.5;
                const maxRow = horizontal ? SIZE : SIZE - s.size + 1;
                const maxCol = horizontal ? SIZE - s.size + 1 : SIZE;
                return { type: s.type, row: Math.floor(rng() * maxRow), col: Math.floor(rng() * maxCol), horizontal };
            });
            if (validateFleet(placements).ok) return placements;
        }
    }

    Object.assign(exports, { SIZE, SHIPS, inBounds, shipCells, validateFleet, createBoard, countAdjacent, isFleetDestroyed, fire, randomFleet });
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.NavalRules = {}));
