const AI = (() => {
    function takeTurn(state, balls, difficulty, shootCb) {
        setTimeout(() => {
            let myGroupStr = state.playerGroups[state.players[state.turnIndex]];
            let validTypes = [];
            if (!state.groupsAssigned) {
                validTypes = [Shared.BALL_TYPES.SOLID, Shared.BALL_TYPES.STRIPE];
            } else {
                validTypes = [Shared.BALL_TYPES[myGroupStr]];
            }
            
            let myBalls = balls.filter(b => b.active && b.id !== 0 && b.id !== 8 && validTypes.includes(Shared.getBallType(b.id)));
            if (myBalls.length === 0) myBalls = balls.filter(b => b.active && b.id === 8);

            let cue = balls.find(b => b.id === 0);
            if (!cue || myBalls.length === 0) {
                shootCb(Math.random() * Math.PI * 2, 500);
                return;
            }

            let target = myBalls[Math.floor(Math.random() * myBalls.length)];
            let dx = target.x - cue.x;
            let dy = target.y - cue.y;
            let angle = Math.atan2(dy, dx);
            
            let error = 0;
            if (difficulty === 'easy') error = (Math.random() - 0.5) * 0.3;
            if (difficulty === 'med') error = (Math.random() - 0.5) * 0.1;
            if (difficulty === 'hard') error = (Math.random() - 0.5) * 0.02;
            
            shootCb(angle + error, 800 + Math.random() * 400);

        }, 1500);
    }
    return { takeTurn };
})();
