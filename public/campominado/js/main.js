// Cliente do Campo Minado Naval
(() => {
    const R = window.NavalRules;
    const SIZE = R.SIZE;
    const COLS = 'ABCDEFGHIJ';
    const key = (r, c) => r * SIZE + c;
    const coord = (r, c) => `${COLS[c]}${r + 1}`;
    const $ = id => document.getElementById(id);

    const socket = io('/campominado');

    const state = {
        phase: 'connecting',     // connecting | waiting | placement | battle | over
        placements: {},          // type -> { type, row, col, horizontal }
        selected: R.SHIPS[0].type,
        horizontal: true,
        hover: null,             // [row, col] no tabuleiro de posicionamento
        submitted: false,
        opponentReady: false,
        myTurn: false,
        incoming: new Map(),     // tiros do oponente em mim: key -> 'miss' | 'hit'
        outgoing: new Map(),     // meus tiros: key -> { result, adjacent }
        enemySunk: new Map(),    // type -> cells
        mySunk: new Set(),       // types afundados da minha frota
        revealed: null,          // frota inimiga revelada no fim
        last: null               // { board: 'enemy'|'me', key }
    };

    // ---------- Construção dos tabuleiros ----------
    function buildBoard(el, handlers = {}) {
        el.innerHTML = '';
        el.appendChild(Object.assign(document.createElement('div'), { className: 'label' }));
        for (let c = 0; c < SIZE; c++) {
            el.appendChild(Object.assign(document.createElement('div'), { className: 'label', textContent: COLS[c] }));
        }
        const cells = [];
        for (let r = 0; r < SIZE; r++) {
            el.appendChild(Object.assign(document.createElement('div'), { className: 'label', textContent: r + 1 }));
            for (let c = 0; c < SIZE; c++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.title = coord(r, c);
                if (handlers.click) cell.addEventListener('click', () => handlers.click(r, c));
                if (handlers.enter) cell.addEventListener('mouseenter', () => handlers.enter(r, c));
                cell.addEventListener('contextmenu', e => { if (handlers.context) { e.preventDefault(); handlers.context(r, c); } });
                el.appendChild(cell);
                cells.push(cell);
            }
        }
        if (handlers.leave) el.addEventListener('mouseleave', handlers.leave);
        return cells;
    }

    const placementCells = buildBoard($('placement-board'), {
        click: onPlacementClick,
        enter: (r, c) => { state.hover = [r, c]; renderPlacement(); },
        leave: () => { state.hover = null; renderPlacement(); },
        context: () => toggleOrientation()
    });
    const enemyCells = buildBoard($('enemy-board'), { click: onEnemyClick });
    const myCells = buildBoard($('my-board'));

    function shipColorVar(type) { return `var(--ship-${type})`; }

    // ---------- Fase de posicionamento ----------
    function occupiedMap(exceptType) {
        const map = new Map();
        for (const p of Object.values(state.placements)) {
            if (p.type === exceptType) continue;
            const def = R.SHIPS.find(s => s.type === p.type);
            R.shipCells(p.row, p.col, p.horizontal, def.size).forEach(([r, c]) => map.set(key(r, c), p.type));
        }
        return map;
    }

    function previewCells() {
        if (!state.hover || !state.selected || state.submitted) return null;
        const def = R.SHIPS.find(s => s.type === state.selected);
        const cells = R.shipCells(state.hover[0], state.hover[1], state.horizontal, def.size);
        const occ = occupiedMap(state.selected);
        const valid = cells.every(([r, c]) => R.inBounds(r, c) && !occ.has(key(r, c)));
        return { cells: cells.filter(([r, c]) => R.inBounds(r, c)), valid };
    }

    function onPlacementClick(r, c) {
        if (state.phase !== 'placement' || state.submitted) return;
        const occ = occupiedMap();
        const clickedType = occ.get(key(r, c));
        if (clickedType && clickedType !== state.selected) {
            // Remove a embarcação clicada para reposicioná-la
            delete state.placements[clickedType];
            state.selected = clickedType;
            return renderPlacement();
        }
        if (!state.selected) return;
        const preview = previewCells();
        if (!preview || !preview.valid) return;
        state.placements[state.selected] = { type: state.selected, row: r, col: c, horizontal: state.horizontal };
        const next = R.SHIPS.find(s => !state.placements[s.type]);
        state.selected = next ? next.type : null;
        renderPlacement();
    }

    function toggleOrientation() {
        state.horizontal = !state.horizontal;
        $('orientation').textContent = state.horizontal ? 'Horizontal' : 'Vertical';
        renderPlacement();
    }

    function renderShipList() {
        const ul = $('ship-list');
        ul.innerHTML = '';
        R.SHIPS.forEach(s => {
            const li = document.createElement('li');
            if (state.selected === s.type) li.classList.add('selected');
            if (state.placements[s.type]) li.classList.add('placed');
            const blocks = Array.from({ length: s.size }, () => `<i style="background:${shipColorVar(s.type)}"></i>`).join('');
            li.innerHTML = `<span>${s.name} (${s.size})</span><span class="ship-blocks">${blocks}</span>`;
            li.addEventListener('click', () => {
                if (state.submitted) return;
                delete state.placements[s.type];
                state.selected = s.type;
                renderPlacement();
            });
            ul.appendChild(li);
        });
    }

    function renderPlacement() {
        const occ = occupiedMap();
        const preview = previewCells();
        const previewKeys = new Set(preview ? preview.cells.map(([r, c]) => key(r, c)) : []);
        placementCells.forEach((cell, i) => {
            cell.className = 'cell';
            if (occ.has(i)) cell.classList.add(`ship-${occ.get(i)}`);
            if (previewKeys.has(i)) cell.classList.add(preview.valid ? 'preview' : 'preview-invalid');
        });
        renderShipList();
        const complete = R.SHIPS.every(s => state.placements[s.type]);
        $('confirm-btn').disabled = !complete || state.submitted;
        ['rotate-btn', 'random-btn', 'clear-btn'].forEach(id => { $(id).disabled = state.submitted; });
    }

    $('rotate-btn').addEventListener('click', toggleOrientation);
    document.addEventListener('keydown', e => { if ((e.key === 'r' || e.key === 'R') && state.phase === 'placement') toggleOrientation(); });
    $('random-btn').addEventListener('click', () => {
        state.placements = {};
        R.randomFleet().forEach(p => { state.placements[p.type] = p; });
        state.selected = null;
        renderPlacement();
    });
    $('clear-btn').addEventListener('click', () => {
        state.placements = {};
        state.selected = R.SHIPS[0].type;
        renderPlacement();
    });
    $('confirm-btn').addEventListener('click', () => {
        const fleet = R.SHIPS.map(s => state.placements[s.type]);
        const check = R.validateFleet(fleet);
        if (!check.ok) return setStatus(check.reason, 'error');
        socket.emit('placeShips', fleet);
    });

    // ---------- Fase de batalha ----------
    function onEnemyClick(r, c) {
        if (state.phase !== 'battle' || !state.myTurn || state.outgoing.has(key(r, c))) return;
        state.myTurn = false; // evita duplo clique até a resposta do servidor
        socket.emit('fire', { row: r, col: c });
    }

    function renderBattle() {
        const enemyShipAt = new Map();
        for (const [type, cells] of state.enemySunk) cells.forEach(([r, c]) => enemyShipAt.set(key(r, c), type));
        const revealedAt = new Map();
        if (state.revealed) state.revealed.forEach(s => s.cells.forEach(([r, c]) => revealedAt.set(key(r, c), s.type)));

        enemyCells.forEach((cell, i) => {
            cell.className = 'cell';
            cell.textContent = '';
            const shot = state.outgoing.get(i);
            if (shot) {
                cell.classList.add('shot');
                if (enemyShipAt.has(i)) cell.classList.add('sunk');
                else if (shot.result === 'miss') {
                    cell.classList.add('miss', `n${shot.adjacent}`);
                    cell.textContent = shot.adjacent;
                } else cell.classList.add('hit');
            } else if (revealedAt.has(i)) {
                cell.classList.add(`ship-${revealedAt.get(i)}`, 'reveal');
            }
            if (state.last && state.last.board === 'enemy' && state.last.key === i) cell.classList.add('last');
        });
        $('enemy-board').classList.toggle('clickable', state.phase === 'battle' && state.myTurn);

        const myShipAt = occupiedMap();
        myCells.forEach((cell, i) => {
            cell.className = 'cell';
            const type = myShipAt.get(i);
            const shot = state.incoming.get(i);
            if (type) cell.classList.add(`ship-${type}`);
            if (shot === 'hit') cell.classList.add('ship-hit');
            if (shot === 'miss') cell.classList.add('miss');
            if (state.last && state.last.board === 'me' && state.last.key === i) cell.classList.add('last');
        });

        renderFleetStatus($('enemy-fleet'), type => state.enemySunk.has(type));
        renderFleetStatus($('my-fleet'), type => state.mySunk.has(type));
    }

    function renderFleetStatus(ul, isSunk) {
        ul.innerHTML = R.SHIPS.map(s =>
            `<li class="${isSunk(s.type) ? 'sunk' : ''}" style="border-left:4px solid ${shipColorVar(s.type)}">${s.name} (${s.size})</li>`
        ).join('');
    }

    function log(text, who) {
        const li = document.createElement('li');
        li.textContent = text;
        if (who) li.className = who;
        $('log').prepend(li);
    }

    // ---------- UI geral ----------
    function setStatus(text, kind) {
        const el = $('status');
        el.textContent = text;
        el.className = 'status' + (kind ? ' ' + kind : '');
    }

    function showPanel(name) {
        $('placement-panel').classList.toggle('hidden', name !== 'placement');
        $('battle-panel').classList.toggle('hidden', name !== 'battle');
    }

    function turnStatus() {
        if (state.myTurn) setStatus('🎯 Sua vez! Escolha uma casa no mar inimigo.', 'my-turn');
        else setStatus('⏳ Vez do oponente...');
    }

    function resetForPlacement() {
        Object.assign(state, {
            phase: 'placement', placements: {}, selected: R.SHIPS[0].type, submitted: false, opponentReady: false,
            myTurn: false, incoming: new Map(), outgoing: new Map(), enemySunk: new Map(), mySunk: new Set(),
            revealed: null, last: null
        });
        $('log').innerHTML = '';
        $('overlay').classList.add('hidden');
        $('after-game').classList.add('hidden');
        $('rematch-btn').disabled = false;
        $('rematch-inline-btn').disabled = false;
        showPanel('placement');
        renderPlacement();
    }

    function requestRematch() {
        socket.emit('requestRematch');
        $('rematch-btn').disabled = true;
        $('rematch-inline-btn').disabled = true;
        setStatus('Revanche pedida. Aguardando o oponente aceitar...');
    }
    $('rematch-btn').addEventListener('click', requestRematch);
    $('rematch-inline-btn').addEventListener('click', requestRematch);
    $('view-boards-btn').addEventListener('click', () => {
        $('overlay').classList.add('hidden');
        $('after-game').classList.remove('hidden');
    });

    // ---------- Eventos do servidor ----------
    socket.on('connect', () => setStatus('Conectado. Procurando oponente...'));
    socket.on('waitingForOpponent', () => {
        state.phase = 'waiting';
        setStatus('⌛ Aguardando um oponente se conectar... (abra esta página em outra aba ou aparelho)');
    });

    socket.on('placementStart', () => {
        resetForPlacement();
        setStatus('Oponente encontrado! Posicione suas 3 embarcações e confirme.');
    });

    socket.on('placementRejected', ({ reason }) => setStatus('❌ ' + reason, 'error'));
    socket.on('placementAccepted', () => {
        state.submitted = true;
        state.hover = null;
        renderPlacement();
        setStatus(state.opponentReady ? 'Iniciando batalha...' : '✔ Frota confirmada! Aguardando o oponente posicionar a dele...');
    });
    socket.on('opponentReady', () => {
        state.opponentReady = true;
        if (!state.submitted) setStatus('O oponente já posicionou a frota. Sua vez de confirmar!');
    });

    socket.on('battleStart', ({ turn }) => {
        state.phase = 'battle';
        state.myTurn = turn === socket.id;
        showPanel('battle');
        log(state.myTurn ? 'A batalha começou! Você atira primeiro.' : 'A batalha começou! O oponente atira primeiro.');
        turnStatus();
        renderBattle();
    });

    socket.on('shotResult', ({ shooter, row, col, result, adjacent, ship, nextTurn }) => {
        const mine = shooter === socket.id;
        const k = key(row, col);
        if (mine) {
            state.outgoing.set(k, { result, adjacent });
            if (result === 'sunk') state.enemySunk.set(ship.type, ship.cells);
            state.last = { board: 'enemy', key: k };
        } else {
            state.incoming.set(k, result === 'miss' ? 'miss' : 'hit');
            if (result === 'sunk') state.mySunk.add(ship.type);
            state.last = { board: 'me', key: k };
        }

        const who = mine ? 'Você' : 'Oponente';
        let text = `${who} atirou em ${coord(row, col)}: `;
        if (result === 'miss') text += mine ? `água (${adjacent} parte(s) de navio por perto).` : 'água.';
        else if (result === 'hit') text += 'ACERTOU! Atira de novo.';
        else text += `AFUNDOU o ${ship.name}! Atira de novo.`;
        log(text, mine ? 'me' : 'them');

        state.myTurn = nextTurn === socket.id;
        turnStatus();
        renderBattle();
    });

    socket.on('shotRejected', ({ reason }) => {
        state.myTurn = true;
        setStatus('❌ ' + reason, 'error');
        renderBattle();
    });

    socket.on('gameOver', ({ winner, fleets }) => {
        state.phase = 'over';
        state.myTurn = false;
        const opponentId = Object.keys(fleets).find(id => id !== socket.id);
        state.revealed = fleets[opponentId];
        const won = winner === socket.id;
        $('result-message').textContent = won ? '🏆 Você venceu!' : '💥 Você perdeu!';
        $('overlay').classList.remove('hidden');
        setStatus(won ? 'Vitória! Toda a frota inimiga foi afundada.' : 'Derrota! Sua frota foi afundada.');
        log(won ? 'Fim de jogo: você venceu!' : 'Fim de jogo: o oponente venceu.');
        renderBattle();
    });

    socket.on('opponentWantsRematch', () => {
        if (state.phase === 'over') setStatus('🔁 O oponente quer revanche! Clique em "Pedir revanche" para aceitar.');
    });

    socket.on('opponentDisconnected', (msg) => {
        state.phase = 'over';
        state.myTurn = false;
        $('overlay').classList.add('hidden');
        setStatus(`🚪 ${msg} Recarregue a página para procurar outro oponente.`, 'error');
        renderBattle();
    });

    socket.on('disconnect', () => setStatus('Conexão com o servidor perdida. Recarregue a página.', 'error'));

    renderPlacement();
})();
