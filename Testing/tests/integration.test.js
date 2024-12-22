const supertest = require('supertest');
const WebSocket = require('ws');
const config = require('./testConfig'); // Import configuration

const app = config.appUrl;
let wsClients = []; // Array to hold WebSocket clients
let sessionCookies = {}; 
// Store session cookies for each user this is what lets the server know who performs which action

// Users configuration
const users = [
    {
        username: 'owner',
        email: 'owner@example.com',
        password: 'password123'
    },
    {
        username: 'player1',
        email: 'player1@example.com',
        password: 'password1123'
    },
    {
        username: 'player2',
        email: 'player2@example.com',
        password: 'password2123'
    },
    {
        username: 'player3',
        email: 'player3@example.com',
        password: 'password3123'
    }
];

const setPassword = null;

describe('Backend Application Integration Tests with Multiple Users', () => {
    beforeAll((done) => {
        let connectedCount = 0;

        // Initialize WebSocket connections for all users
        users.forEach((user, index) => {
            const wsClient = new WebSocket(config.wsUrl);
            wsClient.on('open', () => {
                console.log(`WebSocket connected for ${user.username}`);
                connectedCount += 1;
                if (connectedCount === users.length) done();
            });
            wsClient.on('error', (error) => {
                console.error(`WebSocket error for ${user.username}:`, error);
                done(error);
            });
            wsClients.push(wsClient);
        });
    });

    afterAll(() => {
        // Cleanup WebSocket connections
        wsClients.forEach((wsClient) => {
            if (wsClient.readyState === WebSocket.OPEN) {
                wsClient.close();
            }
        });
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

            // Save session cookies for each user (Spring Security uses JSESSIONID for session management)
            const cookies = response.headers['set-cookie'];
            sessionCookies[user.username] = cookies; // Store the cookies for each user
        }
    });

    let gameId;

    test('Owner creates the game', async () => {
        const response = await supertest(app)
            .post('/game/create')
            .send({ gameType: 'MARAFFA', joinGameCode: setPassword })
            .set('Content-Type', 'application/json')
            .set('Cookie', sessionCookies.owner); // Use owner's session cookie for authentication

        expect(response.status).toBe(200); // Ensure game creation is successful
        gameId = BigInt(response.text); // Store the game ID for further use
        console.log('Game created:', response.body);
    });

    test('Player 1 joins the game', async () => {
        const response = await supertest(app)
            .post(`/game/${gameId}/join`)
            .send({ team: 'RED', joinGameCode: setPassword })
            .set('Content-Type', 'application/json')
            .set('Cookie', sessionCookies.player1); // Use player1's session cookie for authentication

        // Use an assertion to handle the result of the test
        expect(response.status).toBe(200); // Ensure player 1 joins successfully
        console.log('Player 1 joined the game');
    });

    test('Player 2 joins the game', async () => {
        const response = await supertest(app)
            .post(`/game/${gameId}/join`)
            .send({ team: 'BLUE', joinGameCode: setPassword })
            .set('Content-Type', 'application/json')
            .set('Cookie', sessionCookies.player2); // Use player2's session cookie for authentication

        expect(response.status).toBe(200); // Ensure player 2 joins successfully
        console.log('Player 2 joined the game');
    });

    test('Player 3 joins the game', async () => {
        const response = await supertest(app)
            .post(`/game/${gameId}/join`)
            .send({ team: 'BLUE', joinGameCode: setPassword })
            .set('Content-Type', 'application/json')
            .set('Cookie', sessionCookies.player3); // Use player3's session cookie for authentication

        expect(response.status).toBe(200); // Ensure player 3 joins successfully
        console.log('Player 3 joined the game');
    });

    test('Owner starts the game', (done) => {
        const ownerWsClient = wsClients[0]; // Owner is the first client

        ownerWsClient.send(
            JSON.stringify({
                destination: `/app/game/${gameId}/start`,
            })
        );

        done();
    });
});