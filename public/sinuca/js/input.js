const Input = (() => {
    let isDragging = false;
    let aimAngle = 0;
    let force = 0;
    let onShootCb = null;
    let onPlaceCueCb = null;
    let mode = 'AIM'; 
    const canvas = document.getElementById('pool-canvas');
    let mouse = { x: 0, y: 0 };
    let aimStart = { x: 0, y: 0 };

    function updateMouse(e) {
        const rect = canvas.getBoundingClientRect();
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;
        mouse.x = (clientX - rect.left) * (canvas.width / rect.width);
        mouse.y = (clientY - rect.top) * (canvas.height / rect.height);
    }

    function handleMove(e) {
        if(e.touches) e.preventDefault();
        updateMouse(e);
        if (mode === 'AIM' && isDragging) {
            let dx = aimStart.x - mouse.x;
            let dy = aimStart.y - mouse.y;
            aimAngle = Math.atan2(dy, dx);
            force = Math.min(Math.hypot(dx, dy) * 0.2, 30);
        } else if (mode === 'AIM' && !isDragging && Game.isMyTurn() && !Game.isMoving()) {
             let cue = Game.getCueBall();
             if (cue) aimAngle = Math.atan2(mouse.y - cue.y, mouse.x - cue.x);
        }
    }

    function handleDown(e) {
        if(e.touches) e.preventDefault();
        updateMouse(e);
        if (!Game.isMyTurn() || Game.isMoving()) return;
        if (mode === 'PLACE') {
            if (onPlaceCueCb) onPlaceCueCb(mouse.x, mouse.y);
            return;
        }
        isDragging = true;
        aimStart = { x: mouse.x, y: mouse.y };
        force = 0;
    }

    function handleUp(e) {
        if(e.touches) e.preventDefault();
        if (!isDragging) return;
        isDragging = false;
        if (mode === 'AIM' && force > 2 && onShootCb) {
            onShootCb(aimAngle, force * 50);
        }
        force = 0;
    }

    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mousedown', handleDown);
    canvas.addEventListener('mouseup', handleUp);
    canvas.addEventListener('touchmove', handleMove, {passive: false});
    canvas.addEventListener('touchstart', handleDown, {passive: false});
    canvas.addEventListener('touchend', handleUp, {passive: false});

    return {
        init: (onShoot, onPlace) => { onShootCb = onShoot; onPlaceCueCb = onPlace; },
        setMode: m => mode = m,
        getAim: () => ({ angle: aimAngle, force: force })
    };
})();
