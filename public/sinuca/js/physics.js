const Physics = (() => {
    const DT = 1 / 120;
    const FRICTION = 300; 
    const RESTITUTION = 0.95;
    const CUSHION_RESTITUTION = 0.8;
    const MIN_VELOCITY = 5;

    const POCKETS = [
        {x: 0, y: 0}, {x: Shared.TABLE_W/2, y: -10}, {x: Shared.TABLE_W, y: 0},
        {x: 0, y: Shared.TABLE_H}, {x: Shared.TABLE_W/2, y: Shared.TABLE_H+10}, {x: Shared.TABLE_W, y: Shared.TABLE_H}
    ];

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

    function step(balls, events) {
        let moving = false;
        balls.forEach(b => {
            if (!b.active) return;
            let speed = Math.hypot(b.vx, b.vy);
            if (speed > 0) {
                moving = true;
                let drop = FRICTION * DT;
                let newSpeed = Math.max(0, speed - drop);
                if (newSpeed < MIN_VELOCITY) newSpeed = 0;
                
                b.vx = speed > 0 ? (b.vx / speed) * newSpeed : 0;
                b.vy = speed > 0 ? (b.vy / speed) * newSpeed : 0;

                b.x += b.vx * DT;
                b.y += b.vy * DT;

                let r = Shared.BALL_RADIUS;
                let hitCushion = false;
                if (b.x < r) { b.x = r; b.vx *= -CUSHION_RESTITUTION; hitCushion = true; }
                if (b.x > Shared.TABLE_W - r) { b.x = Shared.TABLE_W - r; b.vx *= -CUSHION_RESTITUTION; hitCushion = true; }
                if (b.y < r) { b.y = r; b.vy *= -CUSHION_RESTITUTION; hitCushion = true; }
                if (b.y > Shared.TABLE_H - r) { b.y = Shared.TABLE_H - r; b.vy *= -CUSHION_RESTITUTION; hitCushion = true; }

                if (hitCushion && events.firstHit !== null) events.touchedCushion = true;

                for (let p of POCKETS) {
                    if (Math.hypot(b.x - p.x, b.y - p.y) < Shared.POCKET_RADIUS) {
                        b.active = false;
                        if (b.id === 0) events.cuePotted = true;
                        else events.potted.push(b.id);
                    }
                }
            }
        });

        for (let i = 0; i < balls.length; i++) {
            if (!balls[i].active) continue;
            for (let j = i + 1; j < balls.length; j++) {
                if (!balls[j].active) continue;
                let b1 = balls[i]; let b2 = balls[j];
                let dx = b2.x - b1.x; let dy = b2.y - b1.y;
                let dist = Math.hypot(dx, dy);
                let minDist = Shared.BALL_RADIUS * 2;

                if (dist < minDist) {
                    if (events.firstHit === null && (b1.id === 0 || b2.id === 0)) {
                        events.firstHit = b1.id === 0 ? b2.id : b1.id;
                    }
                    let overlap = minDist - dist;
                    let nx = dx / dist; let ny = dy / dist;

                    b1.x -= nx * (overlap / 2); b1.y -= ny * (overlap / 2);
                    b2.x += nx * (overlap / 2); b2.y += ny * (overlap / 2);

                    let kx = b1.vx - b2.vx; let ky = b1.vy - b2.vy;
                    let p = 2 * (nx * kx + ny * ky) / 2;

                    b1.vx -= p * nx * RESTITUTION; b1.vy -= p * ny * RESTITUTION;
                    b2.vx += p * nx * RESTITUTION; b2.vy += p * ny * RESTITUTION;
                }
            }
        }
        return moving;
    }

    return { Ball, createRack, step, DT };
})();
