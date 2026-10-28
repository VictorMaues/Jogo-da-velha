const AI = (() => {
    const R = Shared.BALL_RADIUS;
    const TURN_DELAY = 1200;      // "pensando"
    const SHOT_DELAY = 800;       // entre posicionar a branca e tacar

    // Erro angular máximo (±rad) e variação de potência por dificuldade
    const ANGLE_ERROR = { easy: 0.12, med: 0.04, hard: 0.008 };
    const POWER_ERROR = { easy: 0.20, med: 0.10, hard: 0.04 };

    function distToSegment(px, py, ax, ay, bx, by) {
        const abx = bx - ax, aby = by - ay;
        const len2 = abx * abx + aby * aby;
        let t = len2 === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + abx * t, cy = ay + aby * t;
        return Math.hypot(px - cx, py - cy);
    }

    // Nenhuma bola (fora `ignore`) a menos de 2R do trajeto de um círculo de raio R
    function pathClear(balls, ax, ay, bx, by, ignore) {
        for (const b of balls) {
            if (!b.active || ignore.indexOf(b.id) !== -1) continue;
            if (distToSegment(b.x, b.y, ax, ay, bx, by) < 2 * R - 0.5) return false;
        }
        return true;
    }

    // Bolas que o bot pode (e deve) tocar primeiro
    function getTargets(state, balls, playerId) {
        const active = balls.filter(b => b.active && b.id !== 0);
        if (!state.groupsAssigned) return active.filter(b => b.id !== 8);
        const type = Shared.BALL_TYPES[state.playerGroups[playerId]];
        const own = active.filter(b => b.id !== 8 && Shared.getBallType(b.id) === type);
        return own.length > 0 ? own : active.filter(b => b.id === 8);
    }

    // Melhor tacada "bola fantasma": mira a branca no ponto que empurra o alvo em direção a uma caçapa.
    function findBestShot(cue, balls, targets) {
        let best = null;
        for (const t of targets) {
            for (let pi = 0; pi < Shared.POCKETS.length; pi++) {
                const p = Shared.POCKETS[pi];
                let dx = p.x - t.x, dy = p.y - t.y;
                const tp = Math.hypot(dx, dy);
                if (tp < 1) continue;
                dx /= tp; dy /= tp;

                const gx = t.x - dx * 2 * R, gy = t.y - dy * 2 * R;   // posição da branca no contato
                if (gx < R || gx > Shared.TABLE_W - R || gy < R || gy > Shared.TABLE_H - R) continue;

                let cx = gx - cue.x, cy = gy - cue.y;
                const cd = Math.hypot(cx, cy);
                if (cd < 1e-6) continue;
                cx /= cd; cy /= cd;

                const cut = cx * dx + cy * dy;                         // cos do ângulo de corte
                if (cut < 0.3) continue;                               // corte fino demais
                if (!pathClear(balls, cue.x, cue.y, gx, gy, [0, t.id])) continue;
                if (!pathClear(balls, t.x, t.y, p.x, p.y, [0, t.id])) continue;

                const score = cut - (cd + tp) / 1500;
                if (!best || score > best.score) {
                    best = { target: t, pocket: pi, angle: Math.atan2(gy - cue.y, gx - cue.x), cut, cd, tp, score };
                }
            }
        }
        return best;
    }

    // Potência necessária: o alvo precisa percorrer `tp` após o impacto (atrito linear) + margem.
    function powerFor(best) {
        const f = Physics.FRICTION;
        const vi = Math.sqrt(2 * f * best.tp) / Math.max(best.cut, 0.3) * 1.1 + 60;
        const v0 = Math.sqrt(vi * vi + 2 * f * best.cd);
        return Math.max(350, Math.min(Shared.MAX_SHOT_FORCE, v0));
    }

    function nearestPocket(ball) {
        let bi = 0, bd = Infinity;
        Shared.POCKETS.forEach((p, i) => {
            const d = Math.hypot(p.x - ball.x, p.y - ball.y);
            if (d < bd) { bd = d; bi = i; }
        });
        return bi;
    }

    // Escolhe onde soltar a branca (bola na mão)
    function choosePlacement(state, balls, targets) {
        const options = Rules.getPlacementOptions(state);
        if (state.isBreak) {
            return { x: Shared.HEADSTRING_X - 30, y: Shared.TABLE_H / 2 + (Math.random() - 0.5) * 60 };
        }
        let best = null, fallback = null;
        for (let x = 30; x <= Shared.TABLE_W - 30; x += 20) {
            for (let y = 30; y <= Shared.TABLE_H - 30; y += 20) {
                if (!Rules.isValidCuePlacement(x, y, balls, options)) continue;
                if (!fallback) fallback = { x, y };
                const shot = findBestShot({ x, y }, balls, targets);
                if (shot && (!best || shot.score > best.score)) best = { x, y, score: shot.score };
            }
        }
        return best || fallback || { x: Shared.HEADSTRING_X, y: Shared.TABLE_H / 2 };
    }

    // Onde soltar a branca (bola na mão)
    function planPlacement(state, balls) {
        const botId = state.players[state.turnIndex];
        return choosePlacement(state, balls, getTargets(state, balls, botId));
    }

    // Planeja a tacada: { angle, force, calledPocket }
    function planShot(state, balls, difficulty) {
        const botId = state.players[state.turnIndex];
        const angleErr = ANGLE_ERROR[difficulty] || ANGLE_ERROR.med;
        const powerErr = POWER_ERROR[difficulty] || POWER_ERROR.med;
        const targets = getTargets(state, balls, botId);
        const cue = balls.find(b => b.id === 0);
        const mustCall = Rules.mustCallPocket(state, botId);
        let angle, force, calledPocket = null;

        if (state.isBreak) {
            // Estouro: bate forte na bola da frente do triângulo
            const head = balls.filter(b => b.active && b.id !== 0).sort((a, b) => a.x - b.x)[0];
            angle = Math.atan2(head.y - cue.y, head.x - cue.x);
            force = Shared.MAX_SHOT_FORCE * (difficulty === 'easy' ? 0.6 : difficulty === 'med' ? 0.8 : 1);
        } else {
            const shot = findBestShot(cue, balls, targets);
            if (shot) {
                angle = shot.angle;
                force = powerFor(shot);
                if (mustCall) calledPocket = shot.pocket;
            } else {
                // Sem tacada limpa: toca na bola mais próxima com força para a jogada chegar à tabela
                const t = targets.slice().sort((a, b) =>
                    Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y))[0] || balls.find(b => b.active && b.id !== 0);
                angle = Math.atan2(t.y - cue.y, t.x - cue.x);
                force = 800;
                if (mustCall) calledPocket = nearestPocket(t);
            }
        }

        angle += (Math.random() - 0.5) * 2 * angleErr;
        force = Math.max(150, Math.min(Shared.MAX_SHOT_FORCE, force * (1 + (Math.random() - 0.5) * 2 * powerErr)));
        return { angle, force, calledPocket };
    }

    // actions: { place(x, y), shoot(angle, force, calledPocket) }
    function takeTurn(state, balls, difficulty, actions) {
        setTimeout(() => {
            if (state.ballInHand) {
                const pos = planPlacement(state, balls);
                actions.place(pos.x, pos.y);
            }

            setTimeout(() => {
                const s = planShot(state, balls, difficulty);
                actions.shoot(s.angle, s.force, s.calledPocket);
            }, state.ballInHand ? SHOT_DELAY : 0);
        }, TURN_DELAY);
    }
    return { takeTurn, planPlacement, planShot };
})();

// Permite testar a IA no Node (sem afetar o browser)
if (typeof module !== 'undefined' && module.exports) module.exports = AI;
