// tests/testConfig.js
module.exports = {
    appUrl: 'http://localhost:8080',
    wsUrl: 'ws://localhost:8080/game',

    ownerData: {
        username: 'owner',
        email: 'owner@example.com',
        password: 'owner123',
    },
    user1: {
        username: 'user1',
        email: 'user1@example.com',
        password: 'user1',
    },
    user2: {
        username: 'user2',
        email: 'user2@example.com',
        password: 'user2',
    },
    user3: {
        username: 'user3',
        email: 'user3@example.com',
        password: 'user3',
    },

    gameData: {
        gameType: 'MARAFFA',
        joinGameCode: null,
        gameId: 'sample-game-id',
    },
};