const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
    
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PSD2 - Authorization Store Overview</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                
                .container {
                    max-width: 1000px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    padding: 40px;
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #f0f0f0;
                }
                
                .header h1 {
                    color: #333;
                    font-size: 32px;
                    margin-bottom: 10px;
                }
                
                .header p {
                    color: #666;
                    font-size: 16px;
                }
                
                .stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                .stat-card {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
                    border-radius: 8px;
                    text-align: center;
                }
                
                .stat-card h3 {
                    font-size: 14px;
                    font-weight: 500;
                    margin-bottom: 10px;
                    opacity: 0.9;
                }
                
                .stat-card .value {
                    font-size: 36px;
                    font-weight: 700;
                }
                
                .table-container {
                    overflow-x: auto;
                    margin-bottom: 20px;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    background: white;
                }
                
                thead {
                    background: #f8f9fa;
                }
                
                th {
                    padding: 15px;
                    text-align: left;
                    font-weight: 600;
                    color: #333;
                    border-bottom: 2px solid #e0e0e0;
                }
                
                td {
                    padding: 15px;
                    border-bottom: 1px solid #f0f0f0;
                    color: #666;
                }
                
                tr:hover {
                    background: #f8f9fa;
                }
                
                .consent-id {
                    font-family: 'Courier New', monospace;
                    font-size: 13px;
                    color: #667eea;
                }
                
                .empty-state {
                    text-align: center;
                    padding: 60px 20px;
                    color: #999;
                }
                
                .empty-state-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                }
                
                .empty-state h3 {
                    font-size: 24px;
                    color: #666;
                    margin-bottom: 10px;
                }
                
                .empty-state p {
                    font-size: 16px;
                }
                
                .actions {
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                    margin-top: 30px;
                }
                
                .btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-block;
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                
                .btn-primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                
                .btn-secondary {
                    background: #f0f0f0;
                    color: #333;
                }
                
                .btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                }
                
                .refresh-info {
                    text-align: center;
                    color: #999;
                    font-size: 14px;
                    margin-top: 20px;
                }
                
                .timestamp {
                    color: #999;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>💾 Authorization Store Overview</h1>
                    <p>Current stored authorizations and consent IDs</p>
                </div>
                
                <div class="stats">
                    <div class="stat-card">
                        <h3>Total Authorizations</h3>
                        <div class="value">${sessions.length}</div>
                    </div>
                    <div class="stat-card">
                        <h3>Total Consents</h3>
                        <div class="value">${consents.length}</div>
                    </div>
                    <div class="stat-card">
                        <h3>Server Status</h3>
                        <div class="value">🟢</div>
                    </div>
                </div>
                
                <h2 style="color: #333; font-size: 24px; margin: 30px 0 20px 0; padding-bottom: 10px; border-bottom: 2px solid #f0f0f0;">💳 Created Consents</h2>
                
                ${consents.length > 0 ? `
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Consent ID</th>
                                    <th>Status</th>
                                    <th>Username</th>
                                    <th>Confirmation</th>
                                    <th>Amount</th>
                                    <th>Creditor</th>
                                    <th>Reference</th>
                                    <th>Created At</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${consents.map((consent, index) => {
                                    const statusColor = consent.status === 'authorized' ? '#d4edda' : '#fff3cd';
                                    const statusTextColor = consent.status === 'authorized' ? '#155724' : '#856404';
                                    return `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td class="consent-id">${consent.consentId}</td>
                                        <td><span style="background: ${statusColor}; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; color: ${statusTextColor};">${consent.status}</span></td>
                                        <td>${consent.username}</td>
                                        <td class="consent-id" style="font-size: 11px;">${consent.confirmation === '-' ? '-' : '***' + consent.confirmation.slice(-8)}</td>
                                        <td><strong>${consent.amount} ${consent.currency}</strong></td>
                                        <td>${consent.creditorName}</td>
                                        <td>${consent.reference}</td>
                                        <td class="timestamp">${new Date(consent.createdAt).toLocaleString()}</td>
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
                `}
                
                <h2 style="color: #333; font-size: 24px; margin: 30px 0 20px 0; padding-bottom: 10px; border-bottom: 2px solid #f0f0f0;">🔐 Authorized Sessions</h2>
                
                ${sessions.length > 0 ? `
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Username</th>
                                    <th>Password (Consent ID)</th>
                                    <th>Auth Credentials</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sessions.map((session, index) => `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td><strong>${session.username}</strong></td>
                                        <td class="consent-id">${session.consentId}</td>
                                        <td class="consent-id">
                                            <strong>Username:</strong> ${session.username}<br>
                                            <strong>Password:</strong> ${session.consentId}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                            <strong>ℹ️ Authentication Info:</strong>
                            <p style="margin: 10px 0 0 0; color: #856404; font-size: 14px;">
                                Use these credentials for Basic Authentication on the <code>/auth</code> endpoint.<br>
                                <strong>Username:</strong> The username from the table<br>
                                <strong>Password:</strong> The Consent ID (intent-id) from the table
                            </p>
                        </div>
                    </div>
                ` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">📭</div>
                        <h3>No Authorizations Yet</h3>
                        <p>The authorization store is currently empty.</p>
                        <p>Complete the consent flow to add authorizations.</p>
                    </div>
                `}
                
                <div class="actions">
                    <a href="/" class="btn btn-secondary">← Back to Home</a>
                    <button onclick="location.reload()" class="btn btn-primary">🔄 Refresh</button>
                </div>
                
                <div class="refresh-info">
                    <p class="timestamp">Last updated: ${new Date().toISOString()}</p>
                    <p>This page auto-refreshes when you reload it</p>
                </div>
            </div>
            
            <script>
                // Auto-refresh every 30 seconds
                setTimeout(() => {
                    location.reload();
                }, 30000);
            </script>
        </body>
        </html>
    `);
});


/**
 * Root route - provides information about the service
 */
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>PSD2 Consent Flow Server</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        max-width: 800px;
                        margin: 50px auto;
                        padding: 20px;
                        background: #f5f5f5;
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 12px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    h1 { color: #333; }
                    h2 { color: #667eea; margin-top: 30px; }
                    code {
                        background: #f4f4f4;
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-family: 'Courier New', monospace;
                    }
                    pre {
                        background: #f4f4f4;
                        padding: 15px;
                        border-radius: 6px;
                        overflow-x: auto;
                    }
                    .endpoint {
                        background: #e8f5e9;
                        padding: 10px;
                        border-left: 4px solid #4caf50;
                        margin: 10px 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🔐 PSD2 Consent Flow Server</h1>
                    <p>This server implements a demo PSD2 payment authorization consent flow with OAuth integration.</p>
                    
                    <h2>Available Endpoints</h2>
                    
                    <div class="endpoint">
                        <strong>GET /login</strong>
                        <p>Login page - First step of the consent flow</p>
                        <p><strong>Query Parameters:</strong></p>
                        <ul>
                            <li><code>original-url</code> - OAuth authorization URL to redirect back to (required)</li>
                            <li><code>state_nonce</code> - OAuth state parameter</li>
                            <li><code>app-name</code> - Name of the requesting application</li>
                        </ul>
                    </div>
                    
                    <div class="endpoint">
                        <strong>GET /consent</strong>
                        <p>Payment authorization page - Second step of the consent flow</p>
                        <p>Generates an intent-id and displays payment authorization details</p>
                    </div>
                    
                    <div class="endpoint">
                        <strong>GET /store-overview</strong>
                        <p>View all stored authorizations and consent IDs</p>
                        <p><strong>No authentication required</strong></p>
                        <p><a href="/store-overview" style="color: #667eea;">→ View Store Overview</a></p>
                    </div>
                    
                    <h2>Example Usage</h2>
                    <pre>http://localhost:${PORT}/login?original-url=https://example.com/oauth/authorize?response_type=code&state_nonce=abc123&app-name=MyApp</pre>
                    
                    <h2>Flow Description</h2>
                    <ol>
                        <li>User is redirected from API Connect to <code>/login</code></li>
                        <li>User enters credentials on the login page</li>
                        <li>User is redirected to <code>/consent</code> page</li>
                        <li>System generates a unique intent-id (UUID)</li>
                        <li>User reviews and authorizes the payment</li>
                        <li>User is redirected back to the original-url with username and confirmation (intent-id) parameters</li>
                    </ol>
                    
                    <p style="margin-top: 30px; color: #666; font-size: 14px;">
                        Server running on port ${PORT}
                    </p>
                </div>
            </body>
        </html>
    `);
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
    res.status(404).send(`
        <html>
            <head>
                <title>404 - Not Found</title>
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
                        text-align: center;
                    }
                    h1 { color: #d32f2f; }
                    a { color: #667eea; text-decoration: none; }
                </style>
            </head>
            <body>
                <div class="error-box">
                    <h1>404 - Page Not Found</h1>
                    <p>The requested page does not exist.</p>
                    <p><a href="/">← Return to Home</a></p>
                </div>
            </body>
        </html>
    `);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {

    console.log('='.repeat(60));
    console.log('🚀 PSD2 Consent Flow Server Started');
    console.log('='.repeat(60));
    console.log(`📍 Server running on 0.0.0.0:${PORT} (inside container)`);
    console.log(`🔐 Login endpoint: /login`);
    console.log(`💳 Consent endpoint: /consent`);
    console.log(`🔑 Auth endpoint: /auth`);
    console.log(`💾 Store auth: /store-authorization`);
    console.log(`📊 Store overview: /store-overview`);
    console.log(`❤️  Health check: /health`);
    console.log('='.repeat(60));
    console.log('Press Ctrl+C to stop the server');
    console.log('='.repeat(60));
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
