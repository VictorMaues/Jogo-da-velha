const Render = (() => {
    const canvas = document.getElementById('pool-canvas');
    const ctx = canvas.getContext('2d');

    function drawTable() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#0a0a0a';
        const POCKETS = [
            {x: 0, y: 0}, {x: Shared.TABLE_W/2, y: -10}, {x: Shared.TABLE_W, y: 0},
            {x: 0, y: Shared.TABLE_H}, {x: Shared.TABLE_W/2, y: Shared.TABLE_H+10}, {x: Shared.TABLE_W, y: Shared.TABLE_H}
        ];
        POCKETS.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, Shared.POCKET_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.beginPath();
        ctx.moveTo(200, 0); ctx.lineTo(200, Shared.TABLE_H);
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

    function drawAim(cueBall, angle, force) {
        ctx.beginPath();
        ctx.moveTo(cueBall.x, cueBall.y);
        ctx.lineTo(cueBall.x + Math.cos(angle) * 1000, cueBall.y + Math.sin(angle) * 1000);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.setLineDash([5, 5]); ctx.lineWidth = 1; ctx.stroke();
        ctx.setLineDash([]);

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
    }

    return { drawTable, drawBalls, drawAim, canvas };
})();
