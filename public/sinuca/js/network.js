const Network = (() => {
    let socket = null;

    function init(callbacks) {
        socket = io('/sinuca');
        socket.on('roomAssigned', data => callbacks.onRoom(data.roomId));
        socket.on('gameReady', callbacks.onGameReady);
        socket.on('turnChange', callbacks.onTurnChange);
        socket.on('ballSync', callbacks.onBallSync);
        socket.on('cuePlaced', callbacks.onCuePlaced);
        socket.on('shotRejected', callbacks.onShotRejected);
        socket.on('syncState', callbacks.onSyncState);
        socket.on('gameOver', callbacks.onGameOver);
        socket.on('opponentDisconnected', callbacks.onOpponentDisconnect);
        socket.on('spectatorAssigned', callbacks.onSpectator);
    }

    return {
        init,
        getId: () => socket ? socket.id : null,
        // O servidor valida e simula; o cliente só envia a intenção da tacada.
        sendShot: (angle, force, calledPocket) => socket.emit('playerShot', { angle, force, calledPocket }),
        sendPlaceCue: (x, y) => socket.emit('placeCue', { x, y }),
        requestRematch: () => socket.emit('requestRematch'),
        disconnect: () => { if(socket) socket.disconnect(); }
    };
})();
