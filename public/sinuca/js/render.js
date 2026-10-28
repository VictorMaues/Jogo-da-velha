const Render = (() => {
    const canvas = document.getElementById('pool-canvas');
    const ctx = canvas.getContext('2d');

    function drawTable() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#0a0a0a';
        Shared.POCKETS.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, Shared.POCKET_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.beginPath();
        ctx.moveTo(Shared.HEADSTRING_X, 0); ctx.lineTo(Shared.HEADSTRING_X, Shared.TABLE_H);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2; ctx.stroke();
    }

    function drawBalls(balls) {
        balls.forEach(b => {
            if (!b.active) return;
            
            ctx.beginPath();
            ctx.arc(b.x + 2, b.y + 2, Shared.BALL_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(b.x, b.y, Shared.BALL_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = Shared.BALL_COLORS[b.id];
            ctx.fill();

            if (Shared.BALL_STRIPED[b.id]) {
                ctx.beginPath();
                ctx.arc(b.x, b.y, Shared.BALL_RADIUS * 0.8, -Math.PI/4, Math.PI*0.75);
                ctx.lineWidth = Shared.BALL_RADIUS * 0.6;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
            }

            if (b.id !== 0) {
                ctx.beginPath();
                ctx.arc(b.x, b.y, Shared.BALL_RADIUS * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                
                ctx.fillStyle = '#000000';
                ctx.font = 'bold 10px Outfit, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(b.id, b.x, b.y + 1);
            }

            ctx.beginPath();
            ctx.arc(b.x - 3, b.y - 3, Shared.BALL_RADIUS * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fill();
        });
    }

    const GUIDE_LEN = 90;   // comprimento de referência dos vetores de saída (100% da velocidade)

    function drawLine(x1, y1, x2, y2) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    // projection: resultado de Physics.castCircle (ou null)
    function drawAim(cueBall, angle, force, projection) {
        const dirX = Math.cos(angle), dirY = Math.sin(angle);
        const R = Shared.BALL_RADIUS;

        ctx.save();

        // Trajetória da branca até o ponto de contato (ou até a tabela)
        const reach = projection ? projection.t : 1000;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.setLineDash([6, 6]); ctx.lineWidth = 1;
        drawLine(cueBall.x, cueBall.y, cueBall.x + dirX * reach, cueBall.y + dirY * reach);
        ctx.setLineDash([]);

        if (projection) {
            // Bola fantasma
            ctx.beginPath();
            ctx.arc(projection.ghost.x, projection.ghost.y, R, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 1.5; ctx.stroke();

            if (projection.type === 'ball') {
                ctx.lineCap = 'round';

                // Saída da bola alvo (ao longo da linha de centros)
                const t = projection.target, n = projection.targetDir;
                const tLen = GUIDE_LEN * projection.targetFrac;
                ctx.strokeStyle = 'rgba(241, 196, 15, 0.9)'; ctx.lineWidth = 2;
                drawLine(t.x + n.x * R, t.y + n.y * R, t.x + n.x * (R + tLen), t.y + n.y * (R + tLen));

                // Desvio da branca (tangente)
                if (projection.cueDir) {
                    const g = projection.ghost, c = projection.cueDir;
                    const cLen = GUIDE_LEN * projection.cueFrac;
                    ctx.strokeStyle = 'rgba(93, 173, 226, 0.9)'; ctx.lineWidth = 2;
                    drawLine(g.x + c.x * R, g.y + c.y * R, g.x + c.x * (R + cLen), g.y + c.y * (R + cLen));
                }
            }
        }
        ctx.restore();

        ctx.save();
        const cueDist = 20 + force * 2;
        const stickX = cueBall.x - Math.cos(angle) * cueDist;
        const stickY = cueBall.y - Math.sin(angle) * cueDist;
        const stickEndX = stickX - Math.cos(angle) * 200;
        const stickEndY = stickY - Math.sin(angle) * 200;

        ctx.beginPath();
        ctx.moveTo(stickX, stickY); ctx.lineTo(stickEndX, stickEndY);
        ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(stickX, stickY); ctx.lineTo(stickX - Math.cos(angle) * 10, stickY - Math.sin(angle) * 10);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.stroke();
        ctx.restore();
    }

    // Preview da bola branca durante "bola na mão" (verde = válido, vermelho = inválido)
    function drawCuePlacement(x, y, valid) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, Shared.BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = valid ? 'rgba(46, 204, 113, 0.35)' : 'rgba(231, 76, 60, 0.35)';
        ctx.fill();
        ctx.strokeStyle = valid ? 'rgba(46, 204, 113, 0.9)' : 'rgba(231, 76, 60, 0.9)';
        ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
    }

    // Destaca a caçapa cantada para a bola 8
    function drawCalledPocket(index) {
        const p = Shared.POCKETS[index];
        if (!p) return;
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, Shared.POCKET_RADIUS + 4 + pulse * 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(241, 196, 15, ' + (0.6 + pulse * 0.4) + ')';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(241, 196, 15, 0.18)';
        ctx.fill();
        ctx.restore();
    }

    return { drawTable, drawBalls, drawAim, drawCuePlacement, drawCalledPocket, canvas };
})();
