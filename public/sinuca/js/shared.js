(function(exports){
    exports.TABLE_W = 800;
    exports.TABLE_H = 400;
    exports.BALL_RADIUS = 12;
    exports.POCKET_RADIUS = 25;

    exports.BALL_TYPES = { CUE: 0, SOLID: 1, STRIPE: 2, EIGHT: 8 };

    exports.getBallType = function(id) {
        if (id === 0) return exports.BALL_TYPES.CUE;
        if (id === 8) return exports.BALL_TYPES.EIGHT;
        if (id >= 1 && id <= 7) return exports.BALL_TYPES.SOLID;
        if (id >= 9 && id <= 15) return exports.BALL_TYPES.STRIPE;
        return null;
    };

    exports.BALL_COLORS = {
        0: '#ffffff', 1: '#f1c40f', 2: '#2980b9', 3: '#c0392b', 
        4: '#8e44ad', 5: '#e67e22', 6: '#27ae60', 7: '#7b241c', 
        8: '#111111', 9: '#f1c40f', 10: '#2980b9', 11: '#c0392b', 
        12: '#8e44ad', 13: '#e67e22', 14: '#27ae60', 15: '#7b241c'
    };

    exports.BALL_STRIPED = {
        0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false,
        9: true, 10: true, 11: true, 12: true, 13: true, 14: true, 15: true
    };
})(typeof exports === 'undefined' ? this['Shared'] = {} : exports);
