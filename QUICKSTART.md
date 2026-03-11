# Quick Start Guide

## Installation

```bash
npm install
```

## Start the Server

```bash
npm start
```

The server will start on http://localhost:3000

## Available Endpoints

Once the server is running, you can access:

- **Home**: http://localhost:3000
- **Login**: http://localhost:3000/login
- **Consent**: http://localhost:3000/consent
- **Auth**: http://localhost:3000/auth
- **Health**: http://localhost:3000/health

## Testing the /auth Endpoint

### Step 1: Store Authorization

```bash
curl -X POST http://localhost:3000/store-authorization \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","confirmation":"12345678-1234-4abc-8abc-123456789abc"}'
```

Expected response:
```json
{"success":true}
```

### Step 2: Authenticate

```bash
curl -u testuser:12345678-1234-4abc-8abc-123456789abc http://localhost:3000/auth
```

Expected response:
```json
{
  "success": true,
  "message": "Authentication successful",
  "username": "testuser",
  "authenticated": true,
  "timestamp": "2026-03-10T18:00:00.000Z"
}
```

### Step 3: Test Invalid Credentials

```bash
curl -u wronguser:wrongpass http://localhost:3000/auth
```

Expected response (401):
```json
{
  "success": false,
  "error": "Invalid credentials",
  "message": "User not found or not authorized"
}
```

## Using the Test Script

Run the automated test script:

```bash
./test-auth.sh
```

This will test all scenarios including:
- No credentials (401)
- Invalid credentials (401)
- Store authorization
- Valid credentials (200)
- Explicit Authorization header (200)

## Troubleshooting

### 404 Error on /auth

If you get a 404 error, make sure:
1. The server is running (`npm start`)
2. You're using the correct URL: `http://localhost:3000/auth`
3. Check the server console for any startup errors

### Server Won't Start

If you see errors when starting:
1. Make sure Node.js is installed: `node --version`
2. Install dependencies: `npm install`
3. Check if port 3000 is available: `lsof -i :3000` (macOS/Linux)
4. Try a different port: `PORT=8080 npm start`

### TypeScript Errors in VS Code

The TypeScript errors shown in VS Code are false positives. The JavaScript code is valid and will run correctly. You can ignore these editor warnings.

## Complete Flow Example

### 1. User Authorization Flow (Browser)

```
http://localhost:3000/login?original-url=https://example.com/oauth&state_nonce=abc123&app-name=TestApp
↓
User enters credentials
↓
http://localhost:3000/consent
↓
User clicks "Authorize Payment"
↓
Credentials stored on server
↓
Redirect to: https://example.com/oauth?username=user&confirmation=intent-id
```

### 2. Backend Verification (Any Client)

```bash
# Backend service verifies the credentials
curl -u user:intent-id http://localhost:3000/auth

# Returns authentication status
{
  "success": true,
  "username": "user",
  "authenticated": true
}
```

## Notes

- The server uses in-memory storage (Map) for demo purposes
- In production, use a proper database (Redis, PostgreSQL, etc.)
- Always use HTTPS in production for Basic Authentication
- Implement credential expiration and cleanup in production