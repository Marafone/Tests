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

        // Clear log files for each user before each test
        users.forEach(user => {
            const userLogFilePath = `./logs/${user.username}_websocket_messages.log`;
            if (fs.existsSync(userLogFilePath)) {
                fs.writeFileSync(userLogFilePath, '', { flag: 'w' }); // Clear existing log file
            }
        });

        // Initialize STOMP clients for all users
        const connectedPromises = users.map((user) => {
            return new Promise((resolve, reject) => {
                const stompClient = new Client({
                    brokerURL: config.wsUrl,
                    connectHeaders: {
                        "Cookie": sessionCookies[user.username], // Include JSESSIONID cookie
                    },
                    reconnectDelay: 20000,
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

            // Extract JSESSIONID from Set-Cookie header
            const cookies = response.headers['set-cookie'];
            const jsessionId = cookies.find((cookie) => cookie.startsWith('JSESSIONID='));
            if (jsessionId) {
                sessionCookies[user.username] = jsessionId.split(';')[0]; // Save JSESSIONID
            }

            // Log the cookies to a file
            logCookies(user.username, cookies);
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

            // Set up STOMP client with session cookie for authentication
            stompClient.connectHeaders = {
                "Cookie": sessionCookies[user.username]     // Use session cookies
            };

            // Subscribe to public game topic
            stompClient.subscribe(`/topic/game/${gameId}`, (message) => {
                logMessage(user.username, 'Public', message.body);
            });

            // Subscribe to private user queue
            stompClient.subscribe(`/user/queue/game`, (message) => {
                logMessage(user.username, 'Private', message.body);
            });
        }

        const joinPromises = []; // To track each player's join

        // Join players and track their join status
        joinPromises.push(
            supertest(app)
                .post(`/game/${gameId}/join`)
                .send({ team: 'RED', joinGameCode: null })
                .set('Content-Type', 'application/json')
                .set('Cookie', sessionCookies.player1) // Use player1's session cookie
                .then((response) => {
                    expect(response.status).toBe(200); // Player 1 joins successfully
                    console.log('Player 1 joined the game');
                })
        );

        joinPromises.push(
            supertest(app)
                .post(`/game/${gameId}/join`)
                .send({ team: 'BLUE', joinGameCode: null })
                .set('Content-Type', 'application/json')
                .set('Cookie', sessionCookies.player2) // Use player2's session cookie
                .then((response) => {
                    expect(response.status).toBe(200); // Player 2 joins successfully
                    console.log('Player 2 joined the game');
                })
        );

        joinPromises.push(
            supertest(app)
                .post(`/game/${gameId}/join`)
                .send({ team: 'BLUE', joinGameCode: null })
                .set('Content-Type', 'application/json')
                .set('Cookie', sessionCookies.player3) // Use player3's session cookie
                .then((response) => {
                    expect(response.status).toBe(200); // Player 3 joins successfully
                    console.log('Player 3 joined the game');
                })
        );

        // Wait for all players to join before starting the game
        await Promise.all(joinPromises); // Ensures all players have joined the game
    });

    test('Owner starts the game and users listen to events', async () => {

        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 10 seconds Allow 2 seconds for messages to be received

        // Trigger the start of the game
        stompClients[0].publish({
            destination: `/app/game/${gameId}/start`
        });

        // Allow enough time for messages to propagate
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 10 seconds Allow 2 seconds for messages to be received

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


// Log cookies to user-specific files
function logCookies(username, cookies) {
    const logDirectory = './cookies';
    const userCookieLogFile = `${logDirectory}/${username}_cookies.log`;

    // Ensure the log directory exists
    if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory);
    }

    // Format the cookies for better readability
    const logEntry = {
        timestamp: new Date().toISOString(),
        username: username,
        cookies: cookies,
    };

    const logJson = JSON.stringify(logEntry, null, 2);

    // Write the log entry to the user's specific cookie log file
    fs.writeFileSync(userCookieLogFile, logJson + '\n', { flag: 'a', encoding: 'utf8' });

    console.log(`Cookies logged for ${username}:`, logJson);
}