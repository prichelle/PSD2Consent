const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from views directory
// In-memory store for authorized credentials (username -> confirmation/intent-id)
// This is server-side storage, NOT client sessions
// Different clients can authenticate by providing username:confirmation via Basic Auth
// In production, use a proper database (Redis, PostgreSQL, etc.)
const authorizedSessions = new Map();

// In-memory store for consent data
// consentId -> { data, status, createdAt }
const consentStore = new Map();

app.use(express.static('views'));

/**
 * Login Page Route (First Page)
 * Receives redirect from API Connect OAuth provider
 * Expected query parameters:
 * - original-url: The OAuth authorization URL to redirect back to
 * - state_nonce: The state parameter for OAuth flow
 * - app-name: The name of the application requesting authorization
 */
app.get('/login', (req, res) => {
    const { 'original-url': originalUrl, state_nonce, 'app-name': appName } = req.query;
    
    // Log incoming request for debugging
    console.log('Login page accessed:');
    console.log('  Original URL:', originalUrl);
    console.log('  State Nonce:', state_nonce);
    console.log('  App Name:', appName);
    
    // Validate required parameters
    if (!originalUrl) {
        return res.status(400).send(`
            <html>
                <head>
                    <title>Error - Missing Parameters</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: #f5f5f5;
                        }
                        .error-box {
                            background: white;
                            padding: 40px;
                            border-radius: 8px;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                            max-width: 500px;
                        }
                        h1 { color: #d32f2f; }
                        p { color: #666; line-height: 1.6; }
                    </style>
                </head>
                <body>
                    <div class="error-box">
                        <h1>⚠️ Missing Required Parameters</h1>
                        <p>The <strong>original-url</strong> parameter is required to proceed with the PSD2 consent flow.</p>
                        <p>Please ensure the redirect URL includes all required parameters.</p>
                    </div>
                </body>
            </html>
        `);
    }
    
    // Serve the login page
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

/**
 * Consent/Authorization Page Route (Second Page)
 * Displays payment authorization details and generates intent-id
 * Expected query parameters:
 * - username: User's username from login page
 * - password: User's password from login page
 * - original-url: The OAuth authorization URL to redirect back to
 * - state_nonce: The state parameter for OAuth flow
 * - app-name: The name of the application requesting authorization
 */
app.get('/consent', (req, res) => {
    const { username, password, 'original-url': originalUrl, state_nonce, 'app-name': appName } = req.query;
    
    // Log consent page access for debugging
    console.log('Consent page accessed:');
    console.log('  Username:', username);
    console.log('  Original URL:', originalUrl);
    console.log('  State Nonce:', state_nonce);
    console.log('  App Name:', appName);
    
    // Validate required parameters
    if (!username || !originalUrl) {
        return res.status(400).send(`
            <html>
                <head>
                    <title>Error - Missing Parameters</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: #f5f5f5;
                        }
                        .error-box {
                            background: white;
                            padding: 40px;
                            border-radius: 8px;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                            max-width: 500px;
                        }
                        h1 { color: #d32f2f; }
                        p { color: #666; line-height: 1.6; }
                        a { color: #667eea; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="error-box">
                        <h1>⚠️ Invalid Session</h1>
                        <p>Required authentication parameters are missing.</p>
                        <p><a href="/login?original-url=${encodeURIComponent(originalUrl || '')}&state_nonce=${encodeURIComponent(state_nonce || '')}&app-name=${encodeURIComponent(appName || '')}">← Return to Login</a></p>
                    </div>
                </body>
            </html>
        `);
    }
    
    // Serve the consent page
    res.sendFile(path.join(__dirname, 'views', 'consent.html'));
});

/**
 * Create Consent Endpoint
 * POST /createconsent
 * Creates a new consent with payment initiation data
 * Stores the data with status "awaitingauthorization"
 * Returns a randomly generated consentId
 */
app.post('/createconsent', (req, res) => {
    console.log('\n' + '='.repeat(80));
    console.log('📝 CREATE CONSENT REQUEST');
    console.log('='.repeat(80));
    console.log('Timestamp:', new Date().toISOString());
    console.log('\n📦 Request Body:');
    console.log(JSON.stringify(req.body, null, 2));
    
    // Validate request body
    if (!req.body || !req.body.Data || !req.body.Data.Initiation) {
        console.log('\n❌ VALIDATION FAILED: Missing required fields');
        console.log('='.repeat(80) + '\n');
        return res.status(400).json({
            error: 'Bad Request',
            message: 'Missing required fields: Data.Initiation'
        });
    }
    
    const { Data } = req.body;
    const { Initiation } = Data;
    
    // Validate required fields in Initiation
    if (!Initiation.InstructionIdentification || 
        !Initiation.EndToEndIdentification || 
        !Initiation.InstructedAmount || 
        !Initiation.CreditorAccount) {
        console.log('\n❌ VALIDATION FAILED: Missing required Initiation fields');
        console.log('='.repeat(80) + '\n');
        return res.status(400).json({
            error: 'Bad Request',
            message: 'Missing required Initiation fields'
        });
    }
    
    // Generate random consentId (UUID v4 format)
    const consentId = 'consent-' + 
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    
    // Store consent data
    const consentData = {
        consentId: consentId,
        data: req.body,
        status: 'awaitingauthorization',
        createdAt: new Date().toISOString()
    };
    
    consentStore.set(consentId, consentData);
    
    console.log('\n✅ CONSENT CREATED SUCCESSFULLY');
    console.log('  Consent ID:', consentId);
    console.log('  Status:', consentData.status);
    console.log('  Created At:', consentData.createdAt);
    console.log('  Amount:', Initiation.InstructedAmount.Amount, Initiation.InstructedAmount.Currency);
    console.log('  Creditor:', Initiation.CreditorAccount.Name);
    console.log('  Total Consents in Store:', consentStore.size);
    console.log('='.repeat(80) + '\n');
    
    // Return 201 Created with consentId
    res.status(201).json({
        consentId: consentId,
        status: consentData.status,
        createdAt: consentData.createdAt
    });
});

/**
 * Get Consent Endpoint
 * GET /consent/:consentId
 * Retrieves consent data by consentId
 */
app.get('/consent/:consentId', (req, res) => {
    const { consentId } = req.params;
    
    console.log('\n' + '='.repeat(80));
    console.log('🔍 GET CONSENT REQUEST');
    console.log('='.repeat(80));
    console.log('Timestamp:', new Date().toISOString());
    console.log('Consent ID:', consentId);
    
    const consentData = consentStore.get(consentId);
    
    if (!consentData) {
        console.log('\n❌ CONSENT NOT FOUND');
        console.log('='.repeat(80) + '\n');
        return res.status(404).json({
            error: 'Not Found',
            message: 'Consent not found'
        });
    }
    
    console.log('\n✅ CONSENT FOUND');
    console.log('  Status:', consentData.status);
    console.log('  Created At:', consentData.createdAt);
    console.log('='.repeat(80) + '\n');
    
    res.json(consentData);
});

/**
 * Update Consent Authorization Endpoint
 * PUT /consent/:consentId/authorize
 * Updates consent status to "authorized" and stores username/confirmation
 */
app.put('/consent/:consentId/authorize', (req, res) => {
    const { consentId } = req.params;
    const { username, confirmation } = req.body;
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ AUTHORIZE CONSENT REQUEST');
    console.log('='.repeat(80));
    console.log('Timestamp:', new Date().toISOString());
    console.log('Consent ID:', consentId);
    console.log('Username:', username);
    console.log('Confirmation:', confirmation ? '***' + confirmation.slice(-8) : '(empty)');
    
    // Validate request body
    if (!username || !confirmation) {
        console.log('\n❌ VALIDATION FAILED: Missing username or confirmation');
        console.log('='.repeat(80) + '\n');
        return res.status(400).json({
            error: 'Bad Request',
            message: 'Missing username or confirmation'
        });
    }
    
    // Get consent data
    const consentData = consentStore.get(consentId);
    
    if (!consentData) {
        console.log('\n❌ CONSENT NOT FOUND');
        console.log('='.repeat(80) + '\n');
        return res.status(404).json({
            error: 'Not Found',
            message: 'Consent not found'
        });
    }
    
    // Update consent status and add username/confirmation
    consentData.status = 'authorized';
    consentData.username = username;
    consentData.confirmation = confirmation;
    consentData.authorizedAt = new Date().toISOString();
    
    // Update in store
    consentStore.set(consentId, consentData);
    
    console.log('\n✅ CONSENT AUTHORIZED SUCCESSFULLY');
    console.log('  Consent ID:', consentId);
    console.log('  Status:', consentData.status);
    console.log('  Username:', username);
    console.log('  Authorized At:', consentData.authorizedAt);
    console.log('='.repeat(80) + '\n');
    
    res.json({
        success: true,
        consentId: consentId,
        status: consentData.status,
        authorizedAt: consentData.authorizedAt
    });
});

/**
 * Store Authorization Endpoint
 * Called by the consent page to store the username and confirmation (intent-id)
 * This allows the /auth endpoint to verify credentials later
 */
app.post('/store-authorization', (req, res) => {
    const { username, confirmation } = req.body;
    
    if (!username || !confirmation) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing username or confirmation' 
        });
    }
    
    // Store the authorization in memory
    authorizedSessions.set(username, confirmation);
    
    console.log('Authorization stored:');
    console.log('  Username:', username);
    console.log('  Confirmation:', confirmation);
    
    res.json({ success: true });
});

/**
 * Basic Authentication Endpoint
 * Verifies credentials using Basic Authentication
 * Username: the username from login
 * Password: the confirmation (intent-id) from authorization
 */
app.get('/auth', (req, res) => {
    // Build curl command equivalent
    const host = req.get('host');
    const protocol = req.protocol;
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;
    
    let curlCommand = `curl -X ${req.method}`;
    
    // Add headers
    Object.keys(req.headers).forEach(header => {
        // Skip some headers that curl adds automatically
        if (!['host', 'connection', 'content-length'].includes(header.toLowerCase())) {
            curlCommand += ` \\\n  -H "${header}: ${req.headers[header]}"`;
        }
    });
    
    // Add body if present
    if (req.body && Object.keys(req.body).length > 0) {
        curlCommand += ` \\\n  -d '${JSON.stringify(req.body)}'`;
    }
    
    // Add URL
    curlCommand += ` \\\n  "${fullUrl}"`;
    
    // Log entire HTTP request in curl format
    console.log('\n' + '='.repeat(80));
    console.log('🔍 /auth ENDPOINT - INCOMING REQUEST');
    console.log('='.repeat(80));
    console.log('Timestamp:', new Date().toISOString());
    
    console.log('\n📋 CURL COMMAND EQUIVALENT:');
    console.log(curlCommand);
    
    console.log('\n📋 REQUEST DETAILS:');
    console.log('  Method:', req.method);
    console.log('  URL:', req.url);
    console.log('  Protocol:', req.protocol);
    console.log('  HTTP Version:', req.httpVersion);
    console.log('  Host:', req.get('host'));
    console.log('  IP Address:', req.ip);
    console.log('  Original URL:', req.originalUrl);
    console.log('  Base URL:', req.baseUrl);
    console.log('  Path:', req.path);
    
    console.log('\n📨 HEADERS:');
    Object.keys(req.headers).forEach(header => {
        console.log(`  ${header}: ${req.headers[header]}`);
    });
    
    console.log('\n🔐 QUERY PARAMETERS:');
    if (Object.keys(req.query).length > 0) {
        console.log(JSON.stringify(req.query, null, 2));
    } else {
        console.log('  (none)');
    }
    
    console.log('\n📦 BODY:');
    if (req.body && Object.keys(req.body).length > 0) {
        console.log(JSON.stringify(req.body, null, 2));
    } else {
        console.log('  (empty)');
    }
    
    // Extract Basic Auth credentials
    const authHeader = req.headers.authorization;
    
    console.log('\n🔑 AUTHENTICATION:');
    console.log('  Authorization Header:', authHeader || '(missing)');
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        console.log('  Result: ❌ Missing or invalid Authorization header');
        console.log('='.repeat(80) + '\n');
        res.setHeader('WWW-Authenticate', 'Basic realm="PSD2 Authentication"');
        return res.status(401).json({
            success: false,
            error: 'Missing or invalid Authorization header',
            message: 'Please provide Basic Authentication credentials'
        });
    }
    
    // Decode Base64 credentials
    const base64Credentials = authHeader.split(' ')[1];
    console.log('  Base64 Credentials:', base64Credentials);
    
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    console.log('  Decoded Credentials:', credentials);
    
    const [username, password] = credentials.split(':');
    console.log('  Username:', username);
    console.log('  Password (confirmation):', password ? '***' + password.slice(-4) : '(empty)');
    
    // Verify credentials
    console.log('\n🔍 CREDENTIAL VERIFICATION:');
    console.log('  Stored Sessions Count:', authorizedSessions.size);
    console.log('  Looking up username:', username);
    
    const storedConfirmation = authorizedSessions.get(username);
    console.log('  Stored Confirmation:', storedConfirmation ? '***' + storedConfirmation.slice(-4) : '(not found)');
    
    if (!storedConfirmation) {
        console.log('\n❌ AUTHENTICATION FAILED: User not found or not authorized');
        console.log('  Available usernames:', Array.from(authorizedSessions.keys()).join(', ') || '(none)');
        console.log('='.repeat(80) + '\n');
        res.setHeader('WWW-Authenticate', 'Basic realm="PSD2 Authentication"');
        return res.status(401).json({
            success: false,
            error: 'Invalid credentials',
            message: 'User not found or not authorized'
        });
    }
    
    console.log('  Comparing passwords:');
    console.log('    Provided: ***' + (password ? password.slice(-4) : '(empty)'));
    console.log('    Expected: ***' + storedConfirmation.slice(-4));
    console.log('    Match:', storedConfirmation === password);
    
    if (storedConfirmation !== password) {
        console.log('\n❌ AUTHENTICATION FAILED: Invalid confirmation/intent-id');
        console.log('='.repeat(80) + '\n');
        res.setHeader('WWW-Authenticate', 'Basic realm="PSD2 Authentication"');
        return res.status(401).json({
            success: false,
            error: 'Invalid credentials',
            message: 'Invalid confirmation code'
        });
    }
    
    console.log('\n✅ AUTHENTICATION SUCCESSFUL');
    console.log('  Username:', username);
    console.log('  Consent ID:', password);
    console.log('  Authenticated at:', new Date().toISOString());
    
    // Get x-requested-scope from request headers
    const requestedScope = req.headers['x-requested-scope'] || '';
    const selectedScope = requestedScope ? `${requestedScope} ${password}` : password;
    
    console.log('  Requested Scope:', requestedScope || '(none)');
    console.log('  Selected Scope:', selectedScope);
    
    // Set custom response headers with consent ID
    res.setHeader('X-API-OAUTH-METADATA-FOR-PAYLOAD', password);
    res.setHeader('X-API-OAUTH-METADATA-FOR-ACCESSTOKEN', password);
    res.setHeader('x-selected-scope', selectedScope);
    
    console.log('\n📤 RESPONSE HEADERS:');
    console.log('  X-API-OAUTH-METADATA-FOR-PAYLOAD:', password);
    console.log('  X-API-OAUTH-METADATA-FOR-ACCESSTOKEN:', password);
    console.log('  x-selected-scope:', selectedScope);
    console.log('='.repeat(80) + '\n');
    
    // Authentication successful
    res.json({
        success: true,
        message: 'Authentication successful',
        username: username,
        consentId: password,
        authenticated: true,
        timestamp: new Date().toISOString()
    });
});

/**
 * Store Overview Endpoint
 * Shows what's currently stored in the authorization store and consent store
 * No authentication required - public endpoint
 */
app.get('/store-overview', (req, res) => {
    console.log('Store overview accessed at:', new Date().toISOString());
    
    // Get all stored authorizations
    const sessions = Array.from(authorizedSessions.entries()).map(([username, confirmation]) => ({
        username: username,
        consentId: confirmation,
        consentIdPreview: '***' + confirmation.slice(-8)
    }));
    
    // Get all stored consents
    const consents = Array.from(consentStore.entries()).map(([consentId, consentData]) => ({
        consentId: consentId,
        status: consentData.status,
        createdAt: consentData.createdAt,
        authorizedAt: consentData.authorizedAt || null,
        username: consentData.username || '-',
        confirmation: consentData.confirmation || '-',
        amount: consentData.data.Data.Initiation.InstructedAmount.Amount,
        currency: consentData.data.Data.Initiation.InstructedAmount.Currency,
        creditorName: consentData.data.Data.Initiation.CreditorAccount.Name,
        creditorAccount: consentData.data.Data.Initiation.CreditorAccount.Identification,
        reference: consentData.data.Data.Initiation.RemittanceInformation?.Reference ||
                   consentData.data.Data.Initiation.RemittanceInformation?.Unstructured || '-'
    }));
    
    // Generate consents HTML
    const consentsHTML = consents.length > 0 ? `
        <div class="bx--data-table-container">
            <table class="bx--data-table">
                <thead>
                    <tr>
                        <th class="bx--table-header">#</th>
                        <th class="bx--table-header">Consent ID</th>
                        <th class="bx--table-header">Status</th>
                        <th class="bx--table-header">Username</th>
                        <th class="bx--table-header">Confirmation</th>
                        <th class="bx--table-header">Amount</th>
                        <th class="bx--table-header">Creditor</th>
                        <th class="bx--table-header">Reference</th>
                        <th class="bx--table-header">Created At</th>
                    </tr>
                </thead>
                <tbody>
                    ${consents.map((consent, index) => {
                        const statusClass = consent.status === 'authorized' ? 'status-authorized' : 'status-pending';
                        return `
                        <tr>
                            <td class="bx--table-cell">${index + 1}</td>
                            <td class="bx--table-cell consent-id">${consent.consentId}</td>
                            <td class="bx--table-cell"><span class="status-badge ${statusClass}">${consent.status}</span></td>
                            <td class="bx--table-cell">${consent.username}</td>
                            <td class="bx--table-cell consent-id">${consent.confirmation === '-' ? '-' : '***' + consent.confirmation.slice(-8)}</td>
                            <td class="bx--table-cell"><strong>${consent.amount} ${consent.currency}</strong></td>
                            <td class="bx--table-cell">${consent.creditorName}</td>
                            <td class="bx--table-cell">${consent.reference}</td>
                            <td class="bx--table-cell timestamp">${new Date(consent.createdAt).toLocaleString()}</td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>
    ` : `
        <div class="empty-state">
            <div class="empty-state-icon">📄</div>
            <h3>No Consents Created Yet</h3>
            <p>Use the POST /createconsent endpoint to create payment consents.</p>
        </div>
    `;
    
    // Generate sessions HTML
    const sessionsHTML = sessions.length > 0 ? `
        <div class="bx--data-table-container">
            <table class="bx--data-table">
                <thead>
                    <tr>
                        <th class="bx--table-header">#</th>
                        <th class="bx--table-header">Username</th>
                        <th class="bx--table-header">Password (Consent ID)</th>
                        <th class="bx--table-header">Auth Credentials</th>
                    </tr>
                </thead>
                <tbody>
                    ${sessions.map((session, index) => `
                        <tr>
                            <td class="bx--table-cell">${index + 1}</td>
                            <td class="bx--table-cell"><strong>${session.username}</strong></td>
                            <td class="bx--table-cell consent-id">${session.consentId}</td>
                            <td class="bx--table-cell consent-id">
                                <strong>Username:</strong> ${session.username}<br>
                                <strong>Password:</strong> ${session.consentId}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="info-notification">
                <div class="bx--inline-notification bx--inline-notification--info" role="alert">
                    <div class="bx--inline-notification__details">
                        <div class="bx--inline-notification__text-wrapper">
                            <p class="bx--inline-notification__title">ℹ️ Authentication Info</p>
                            <p class="bx--inline-notification__subtitle">
                                Use these credentials for Basic Authentication on the <code>/auth</code> endpoint.<br>
                                <strong>Username:</strong> The username from the table<br>
                                <strong>Password:</strong> The Consent ID (intent-id) from the table
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ` : `
        <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <h3>No Authorizations Yet</h3>
            <p>The authorization store is currently empty.</p>
            <p>Complete the consent flow to add authorizations.</p>
        </div>
    `;
    
    // Read the HTML template and inject data
    const fs = require('fs');
    let html = fs.readFileSync(path.join(__dirname, 'views', 'store-overview.html'), 'utf8');
    
    // Inject the data into the template
    html = html.replace('<div class="value" id="sessionsCount">0</div>', `<div class="value" id="sessionsCount">${sessions.length}</div>`);
    html = html.replace('<div class="value" id="consentsCount">0</div>', `<div class="value" id="consentsCount">${consents.length}</div>`);
    html = html.replace('<div id="consentsSection"></div>', `<div id="consentsSection">${consentsHTML}</div>`);
    html = html.replace('<div id="sessionsSection"></div>', `<div id="sessionsSection">${sessionsHTML}</div>`);
    html = html.replace('<p class="timestamp" id="lastUpdated">Last updated: Loading...</p>', `<p class="timestamp" id="lastUpdated">Last updated: ${new Date().toISOString()}</p>`);
    
    // Add auto-refresh script
    html = html.replace('</body>', `
        <script>
            // Auto-refresh every 30 seconds
            setTimeout(() => {
                location.reload();
            }, 30000);
        </script>
    </body>`);
    
    res.send(html);
});


/**
 * Root route - provides information about the service
 */
app.get('/', (req, res) => {
    const fs = require('fs');
    let html = fs.readFileSync(path.join(__dirname, 'views', 'home.html'), 'utf8');
    
    // Replace PORT placeholder
    html = html.replace(/\{\{PORT\}\}/g, PORT);
    
    res.send(html);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'PSD2 Consent Flow',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    const fs = require('fs');
    const html = fs.readFileSync(path.join(__dirname, 'views', '404.html'), 'utf8');
    res.status(404).send(html);
});

// Start server
app.listen(PORT, '0.0.0.0' , () => {
    console.log('='.repeat(60));
    console.log('🚀 PSD2 Consent Flow Server Started');
    console.log('='.repeat(60));
    console.log(`📍 Server running at: http://localhost:${PORT}`);
    console.log(`🔐 Login endpoint: http://localhost:${PORT}/login`);
    console.log(`💳 Consent endpoint: http://localhost:${PORT}/consent`);
    console.log(`🔑 Auth endpoint: http://localhost:${PORT}/auth`);
    console.log(`💾 Store auth: http://localhost:${PORT}/store-authorization`);
    console.log(`📊 Store overview: http://localhost:${PORT}/store-overview`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
    console.log('='.repeat(60));
    console.log('Press Ctrl+C to stop the server');
    console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n🛑 SIGINT received, shutting down gracefully...');
    process.exit(0);
});

// Made with Bob
