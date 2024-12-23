const supertest = require('supertest');
const { Client } = require('@stomp/stompjs');
const config = require('./testConfig'); // Import configuration
const fs = require('fs'); // Import the filesystem module

const app = config.appUrl;
const logFilePath = './websocket_messages.log'; // File to store messages
let stompClients = []; // Array to hold STOMP clients
let sessionCookies = {}; // Store session cookies for each user
let gameId;

// Ensure the log file is empty or create it if it doesn't exist
fs.writeFileSync(logFilePath, '', { flag: 'w' });

// Users configuration
const users = [
    { username: 'owner', email: 'owner@example.com', password: 'password123' },
    { username: 'player1', email: 'player1@example.com', password: 'password1123' },
    { username: 'player2', email: 'player2@example.com', password: 'password2123' },
    { username: 'player3', email: 'player3@example.com', password: 'password3123' },
];

const setPassword = null;

describe('Backend Application Integration Tests with Multiple Users', () => {
    beforeAll(async () => {
        // Initialize STOMP clients for all users
        const connectedPromises = users.map((user) => {
            return new Promise((resolve, reject) => {
                const stompClient = new Client({
                    brokerURL: config.wsUrl,
                    reconnectDelay: 10000,
                    debug: (str) => console.log(`STOMP Debug (${user.username}): ${str}`),
                    onConnect: () => {
                        console.log(`STOMP connected for ${user.username}`);
                        resolve();
                    },
                    onStompError: (frame) => {
                        console.error(`STOMP error for ${user.username}:`, frame);
                        reject(new Error(frame.headers['message']));
                    },
                });

                stompClient.activate();
                stompClients.push(stompClient);
            });
        });

        await Promise.all(connectedPromises); // Wait for all STOMP clients to connect
    });

    afterAll(async () => {
        // Cleanup STOMP connections
        await Promise.all(stompClients.map((client) => new Promise((resolve) => {
            client.onDisconnect = resolve;
            client.deactivate();
        })));
    });

    test('Register all users', async () => {
        for (const user of users) {
            const response = await supertest(app)
                .post('/auth/register')
                .send(user)
                .set('Content-Type', 'application/json');

            expect(response.status).toBe(201); // Ensure registration is successful
            console.log(`Registered ${user.username}:`, response.body);
        }
    });

    test('Login all users and save session cookies', async () => {
        for (const user of users) {
            const response = await supertest(app)
                .post('/auth/login')
                .send({ username: user.username, password: user.password })
                .set('Content-Type', 'application/json');

            expect(response.status).toBe(200); // Ensure login is successful
            console.log(`Logged in ${user.username}:`, response.body);

            const cookies = response.headers['set-cookie'];
            sessionCookies[user.username] = cookies; // Store session cookies for each user
        }
    });

    test('Owner creates the game', async () => {
        const response = await supertest(app)
            .post('/game/create')
            .send({ gameType: 'MARAFFA', joinGameCode: setPassword })
            .set('Content-Type', 'application/json')
            .set('Cookie', sessionCookies.owner); // Use owner's session cookie for authentication

        expect(response.status).toBe(200); // Ensure game creation is successful
        gameId = BigInt(response.text); // Parse and store the game ID
        console.log('Game created:', gameId);
    });

    test('All players join the game sequentially', async () => {

        // Subscribe to events before players join
        for (let i = 0; i < stompClients.length; i++) {
            const stompClient = stompClients[i];
            const user = users[i];

            // Subscribe to public game topic
            stompClient.subscribe(`/topic/game/${gameId}`, (message) => {
                logMessage(user.username, 'Public', message.body);
            });

            // Subscribe to private user queue
            stompClient.subscribe(`/user/queue/game`, (message) => {
                logMessage(user.username, 'Private', message.body);
            });
        }

        const response1 = await supertest(app)
            .post(`/game/${gameId}/join`)
            .send({ team: 'RED', joinGameCode: null })
            .set('Content-Type', 'application/json')
            .set('Cookie', sessionCookies.player1); // Use player1's session cookie

        expect(response1.status).toBe(200); // Player 1 joins successfully
        console.log('Player 1 joined the game');

        // Player 2 joins
        const response2 = await supertest(app)
            .post(`/game/${gameId}/join`)
            .send({ team: 'BLUE', joinGameCode: null })
            .set('Content-Type', 'application/json')
            .set('Cookie', sessionCookies.player2); // Use player2's session cookie

        expect(response2.status).toBe(200); // Player 2 joins successfully
        console.log('Player 2 joined the game');

        // Player 3 joins
        const response3 = await supertest(app)
            .post(`/game/${gameId}/join`)
            .send({ team: 'BLUE', joinGameCode: null })
            .set('Content-Type', 'application/json')
            .set('Cookie', sessionCookies.player3); // Use player3's session cookie

        expect(response3.status).toBe(200); // Player 3 joins successfully
        console.log('Player 3 joined the game');

    });

    test('Owner starts the game and users listen to events', async () => {

        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 10 seconds Allow 2 seconds for messages to be received

        // Trigger the start of the game
        stompClients[0].publish({
            destination: `/app/game/${gameId}/start`,
            body: null
        });

        // Allow enough time for messages to propagate
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 10 seconds Allow 2 seconds for messages to be received

        // Optionally, you can add a console log to indicate this stage of the test
        console.log('Game started, waiting for messages...');
    }, 15000);

    test('First round has started', async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
    });
});

// Helper function for logging messages to user-specific files in JSON format
function logMessage(username, type, message) {
    // Debugging: log the raw message to console
    console.log(`Raw message received from ${username}:`, message);

    let parsedMessage;

    // Try to parse the message if it is JSON
    try {
        parsedMessage = JSON.parse(message);
    } catch (error) {
        // If parsing fails, keep the message as it is (raw string)
        parsedMessage = message;
        console.warn(`Failed to parse message for ${username}:`, message);
    }

    // Create a log entry object
    const logEntry = {
        timestamp: new Date().toISOString(),
        username: username,
        type: type,
        message: parsedMessage, // Store the parsed message (either JSON or raw)
    };

    // Convert the log entry object to a JSON string for proper logging
    const logJson = JSON.stringify(logEntry, null, 2); // Pretty-print with 2 spaces indentation

    // Define a file path based on the user's name
    const userLogFilePath = `./logs/${username}_websocket_messages.log`;

    // Ensure the log directory exists
    if (!fs.existsSync('./logs')) {
        fs.mkdirSync('./logs');
    }

    // Print the log entry to the console
    console.log(`Logging message for ${username}:`, logJson);

    // Write the log entry to the user's specific log file
    fs.appendFileSync(userLogFilePath, logJson + '\n', 'utf8');
}