const Physics = (() => {
    // Passo "visível" para o main.js (fixed timestep). Internamente é subdividido.
    const DT = 1 / 120;
    const SUBSTEPS = 4;               // sub-passos por DT -> 1/480 s cada
    const SOLVER_ITERATIONS = 6;      // iterações do solver de contatos por sub-passo
    const SUB_DT = DT / SUBSTEPS;
    const CONTACT_EPS = 1e-3;         // tolerância para considerar "em contato"

    const FRICTION = 300; 
    const RESTITUTION = 0.95;
    const CUSHION_RESTITUTION = 0.8;
    const MIN_VELOCITY = 5;

    const POCKETS = Shared.POCKETS;

    class Ball {
        constructor(id, x, y) {
            this.id = id; this.x = x; this.y = y;
            this.vx = 0; this.vy = 0; this.active = true;
        }
    }

    function createRack() {
        let balls = [];
        balls.push(new Ball(0, 200, 200));
        const startX = 550, startY = 200, r = Shared.BALL_RADIUS;
        const rowSpacing = r * Math.sqrt(3);
        const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 13, 5, 14, 6, 15, 7];
        let idx = 0;
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col <= row; col++) {
                let bx = startX + row * rowSpacing;
                let by = startY - (row * r) + (col * r * 2);
                balls.push(new Ball(order[idx++], bx, by));
            }
        }
        return balls;
    }

    // ---------- Mesa ----------

    // Mantém o centro da bola dentro da área jogável (somente posição).
    function clampToTable(b) {
        const r = Shared.BALL_RADIUS;
        if (b.x < r) b.x = r;
        else if (b.x > Shared.TABLE_W - r) b.x = Shared.TABLE_W - r;
        if (b.y < r) b.y = r;
        else if (b.y > Shared.TABLE_H - r) b.y = Shared.TABLE_H - r;
    }

    // Reflete a velocidade apenas se a bola estiver indo CONTRA a tabela.
    function bounceOffCushions(b, events) {
        const r = Shared.BALL_RADIUS;
        const maxX = Shared.TABLE_W - r, maxY = Shared.TABLE_H - r;
        let hit = false;

        if (b.x < r)         { b.x = r;    if (b.vx < 0) b.vx = -b.vx * CUSHION_RESTITUTION; hit = true; }
        else if (b.x > maxX) { b.x = maxX; if (b.vx > 0) b.vx = -b.vx * CUSHION_RESTITUTION; hit = true; }
        if (b.y < r)         { b.y = r;    if (b.vy < 0) b.vy = -b.vy * CUSHION_RESTITUTION; hit = true; }
        else if (b.y > maxY) { b.y = maxY; if (b.vy > 0) b.vy = -b.vy * CUSHION_RESTITUTION; hit = true; }

        if (hit && events.firstHit !== null) events.touchedCushion = true;
    }

    function checkPockets(balls, events) {
        for (const b of balls) {
            if (!b.active) continue;
            for (const p of POCKETS) {
                if (Math.hypot(b.x - p.x, b.y - p.y) < Shared.POCKET_RADIUS) {
                    b.active = false;
                    b.vx = 0; b.vy = 0;
                    if (b.id === 0) events.cuePotted = true;
                    else events.potted.push(b.id);
                    break;
                }
            }
        }
    }

    // ---------- Integração ----------

    function integrateBall(b, events) {
        const speed = Math.hypot(b.vx, b.vy);
        if (speed === 0) return;

        let newSpeed = Math.max(0, speed - FRICTION * SUB_DT);
        if (newSpeed < MIN_VELOCITY) newSpeed = 0;
        const k = newSpeed / speed;
        b.vx *= k; b.vy *= k;

        b.x += b.vx * SUB_DT;
        b.y += b.vy * SUB_DT;

        bounceOffCushions(b, events);
    }

    // ---------- Solver de contatos bola-bola ----------

    // Uma varredura (Gauss-Seidel) sobre todos os pares.
    // Retorna true se algum par foi corrigido/impulsionado (precisa de nova iteração).
    function solveBallPairs(balls, events) {
        const minDist = Shared.BALL_RADIUS * 2;
        const contactDist = minDist + CONTACT_EPS;
        let changed = false;

        for (let i = 0; i < balls.length; i++) {
            const b1 = balls[i];
            if (!b1.active) continue;
            for (let j = i + 1; j < balls.length; j++) {
                const b2 = balls[j];
                if (!b2.active) continue;

                let dx = b2.x - b1.x, dy = b2.y - b1.y;
                const d2 = dx * dx + dy * dy;
                if (d2 >= contactDist * contactDist) continue;

                let dist = Math.sqrt(d2);
                let nx, ny;
                if (dist < 1e-9) { nx = 1; ny = 0; dist = 0; }   // bolas exatamente no mesmo ponto
                else { nx = dx / dist; ny = dy / dist; }

                // 1) Correção posicional: separa por completo (massas iguais -> metade para cada)
                if (dist < minDist) {
                    const push = (minDist - dist) * 0.5;
                    b1.x -= nx * push; b1.y -= ny * push;
                    b2.x += nx * push; b2.y += ny * push;
                    changed = true;
                }

                // 2) Impulso: somente se estiverem se APROXIMANDO ao longo da normal
                const vn = (b1.vx - b2.vx) * nx + (b1.vy - b2.vy) * ny;
                if (vn > 0) {
                    if (events.firstHit === null && (b1.id === 0 || b2.id === 0)) {
                        events.firstHit = b1.id === 0 ? b2.id : b1.id;
                    }
                    // j = (1 + e) * vn / (1/m1 + 1/m2), com m1 = m2 = 1
                    const jImp = (1 + RESTITUTION) * vn * 0.5;
                    b1.vx -= jImp * nx; b1.vy -= jImp * ny;
                    b2.vx += jImp * nx; b2.vy += jImp * ny;
                    changed = true;
                }
            }
        }
        return changed;
    }

    // Avança DT segundos (SUBSTEPS sub-passos). Retorna true se ainda houver movimento.
    function step(balls, events) {
        for (let s = 0; s < SUBSTEPS; s++) {
            for (const b of balls) {
                if (b.active) integrateBall(b, events);
            }

            for (let it = 0; it < SOLVER_ITERATIONS; it++) {
                const changed = solveBallPairs(balls, events);
                for (const b of balls) { if (b.active) clampToTable(b); }
                if (!changed) break;   // convergiu
            }

            checkPockets(balls, events);
        }

        for (const b of balls) {
            if (b.active && (b.vx !== 0 || b.vy !== 0)) return true;
        }
        return false;
    }

    // ---------- Raycast / Swept Circle para a mira ----------

    // Varre um círculo (raio BALL_RADIUS) a partir de `origin` na direção (dx, dy).
    // Retorna { type: 'ball' | 'cushion', t, ghost, ... } ou null.
    function castCircle(balls, origin, dx, dy, ignoreId) {
        const r = Shared.BALL_RADIUS;
        const minDist = 2 * r;

        const len = Math.hypot(dx, dy);
        if (len < 1e-9) return null;
        dx /= len; dy /= len;

        // Colisão com bolas: resolve |o + t*d - p|^2 = (2r)^2  ->  t^2 + 2(f·d)t + (f·f - 4r^2) = 0
        let tBall = Infinity, hitBall = null;
        for (const b of balls) {
            if (!b.active || b.id === ignoreId) continue;
            const fx = origin.x - b.x, fy = origin.y - b.y;
            const bq = fx * dx + fy * dy;                 // f·d
            const c = fx * fx + fy * fy - minDist * minDist;
            if (c > 0 && bq >= 0) continue;               // afastando-se, nunca encosta
            const disc = bq * bq - c;
            if (disc < 0) continue;                       // raio passa longe
            let t = -bq - Math.sqrt(disc);                // menor raiz = primeiro contato
            if (t < 0) { if (c > 0) continue; t = 0; }    // já sobreposta -> contato imediato
            if (t < tBall) { tBall = t; hitBall = b; }
        }

        // Colisão com tabelas: o centro da branca fica confinado a [r, W-r] x [r, H-r]
        const tx = dx > 0 ? (Shared.TABLE_W - r - origin.x) / dx : (dx < 0 ? (r - origin.x) / dx : Infinity);
        const ty = dy > 0 ? (Shared.TABLE_H - r - origin.y) / dy : (dy < 0 ? (r - origin.y) / dy : Infinity);
        const tWall = Math.max(0, Math.min(tx, ty));

        if (hitBall && tBall <= tWall) {
            const ghost = { x: origin.x + dx * tBall, y: origin.y + dy * tBall };

            // Normal de impacto: da bola fantasma (centro da branca no contato) até o alvo
            const nx = (hitBall.x - ghost.x) / minDist;
            const ny = (hitBall.y - ghost.y) / minDist;

            const dot = Math.max(0, Math.min(1, dx * nx + dy * ny));   // cos(ângulo de corte)
            // Branca: componente tangencial de d (regra dos 90° para massas iguais, sem atrito/spin)
            const tanX = dx - dot * nx, tanY = dy - dot * ny;
            const tanLen = Math.hypot(tanX, tanY);

            return {
                type: 'ball',
                t: tBall,
                ghost,
                target: hitBall,
                targetDir: { x: nx, y: ny },
                targetFrac: dot,                  // fração da velocidade transferida ao alvo
                cueDir: tanLen > 1e-6 ? { x: tanX / tanLen, y: tanY / tanLen } : null,
                cueFrac: tanLen                   // = sen(ângulo de corte)
            };
        }

        if (tWall === Infinity) return null;
        return {
            type: 'cushion',
            t: tWall,
            ghost: { x: origin.x + dx * tWall, y: origin.y + dy * tWall }
        };
    }

    return { Ball, createRack, step, castCircle, DT, RESTITUTION };
})();
