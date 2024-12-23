const StompJs = require('@stomp/stompjs');
const testConfig = require('./tests/testConfig.js');

const stompClient = new StompJs.Client({
    brokerURL: 'ws://localhost:8080/game'
});

stompClient.onConnect = (frame) => {
    console.log('Connected: ' + frame);
};

stompClient.onWebSocketError = (error) => {
    console.error('Error with websocket', error);
};

stompClient.onStompError = (frame) => {
    console.error('Broker reported error: ' + frame.headers['message']);
    console.error('Additional details: ' + frame.body);
};

function connect() {
    stompClient.activate();
    console.log("Connected");
}

function disconnect() {
    stompClient.deactivate();
    console.log("Disconnected");
}

function subscribeToGame(gameId) {
    console.log("Started listening for events in game " + gameId);
    stompClient.subscribe('/topic/game/' + gameId, (event) => {
        showEvent(JSON.parse(event.body));
    });
    stompClient.subscribe('/user/queue/game', (event) => {
        console.log("Received private event.");
        showEvent(JSON.parse(event.body));
    });
}

async function createGame() {
    const url = "http://localhost:8080/game/create";
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(testConfig.gameData)
        });
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        const gameId = await response.text();
        console.log("Game created with ID: " + gameId);
        return gameId;
    } catch (error) {
        console.error(error.message);
    }
}

async function joinGame(gameId, team) {
    const url = `http://localhost:8080/game/${gameId}/join`;
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                team: team,
                joinGameCode: null
            })
        });
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        console.log(`Joined game ${gameId} as team ${team}`);
    } catch (error) {
        console.error(error.message);
    }
}

async function logIn(username, password) {
    const url = "http://localhost:8080/auth/login";
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        console.log(`Logged in as ${username}`);
    } catch (error) {
        console.error(error.message);
    }
}

async function register(username, email, password) {
    const url = "http://localhost:8080/auth/register";
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: username,
                email: email,
                password: password
            })
        });
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        console.log(`Registered user ${username}`);
    } catch (error) {
        console.error(error.message);
    }
}

async function simulateGameFlow() {
    const { ownerData, user1, user2, user3 } = testConfig;

    const users = [ownerData, user1, user2, user3];

    // Register and login each user
    for (const user of users) {
        await register(user.username, user.email, user.password);
        await logIn(user.username, user.password);
    }

    // Connect to WebSocket
    connect();

    // Owner creates the game
    const gameId = await createGame();

    // Subscribe all users to the game
    users.forEach(() => subscribeToGame(gameId));

    // Users join the game
    await joinGame(gameId, "RED"); // User 1
    await joinGame(gameId, "BLUE"); // User 2
    await joinGame(gameId, "BLUE"); // User 3

    console.log("Game flow simulation complete.");
}

simulateGameFlow();

function showEvent(message) {
    console.log("Event: ", message);
}