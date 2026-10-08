const Network = (() => {
    let socket = null;

    function init(callbacks) {
        socket = io('/sinuca');
        socket.on('roomAssigned', data => callbacks.onRoom(data.roomId));
        socket.on('gameReady', callbacks.onGameReady);
        socket.on('turnChange', callbacks.onTurnChange);
        socket.on('ballSync', callbacks.onBallSync);
        socket.on('syncState', callbacks.onSyncState);
        socket.on('gameOver', callbacks.onGameOver);
        socket.on('opponentDisconnected', callbacks.onOpponentDisconnect);
        socket.on('spectatorAssigned', callbacks.onSpectator);
    }

    return {
        init,
        getId: () => socket ? socket.id : null,
        sendShot: (angle, force) => socket.emit('playerShot', { angle, force }),
        sendSimulationResult: (events, finalBalls) => socket.emit('simulationResult', { events, finalBalls }),
        requestRematch: () => socket.emit('requestRematch'),
        disconnect: () => { if(socket) socket.disconnect(); }
    };
})();
