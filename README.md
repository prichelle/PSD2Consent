# PSD2 Consent Flow Demo

A demonstration web server implementing a PSD2 payment authorization consent flow with OAuth integration.

## Overview

This server provides a two-page consent flow for PSD2 payment authorization:

1. **Login Page** - User authentication
2. **Consent Page** - Payment authorization with intent-id generation

## Features

- ✅ OAuth redirect handling from API Connect
- ✅ User authentication interface
- ✅ Intent-ID generation (UUID v4)
- ✅ Payment authorization consent screen
- ✅ Secure parameter passing between pages
- ✅ Redirect back to OAuth provider with credentials

## Installation

```bash
npm install
```

## Usage

### Start the server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000` by default.

## API Endpoints

### GET /login

**Description:** Login page - First step of the consent flow

**Query Parameters:**
- `original-url` (required) - The OAuth authorization URL to redirect back to
- `state_nonce` (optional) - OAuth state parameter for CSRF protection
- `app-name` (optional) - Name of the application requesting authorization

**Example:**
```
http://localhost:3000/login?original-url=https://example.com/oauth/authorize?response_type=code&state_nonce=abc123&app-name=MyPaymentApp
```

### GET /consent

**Description:** Payment authorization page - Second step of the consent flow

**Query Parameters:**
- `username` (required) - User's username from login
- `password` (required) - User's password from login
- `original-url` (required) - The OAuth authorization URL to redirect back to
- `state_nonce` (optional) - OAuth state parameter
- `app-name` (optional) - Name of the requesting application

**Note:** This endpoint is typically accessed automatically after login, not directly.

### POST /store-authorization

**Description:** Internal endpoint to store authorization credentials

**Request Body:**
```json
{
  "username": "user123",
  "confirmation": "12345678-1234-4abc-8abc-123456789abc"
}
```

**Response:**
```json
{
  "success": true
}
```

**Note:** This endpoint is called automatically by the consent page when user authorizes payment.

### GET /auth

**Description:** Basic Authentication verification endpoint

**Authentication:** Basic Auth (username:confirmation)
- Username: The username from the login page
- Password: The confirmation (intent-id) generated during authorization

**Headers:**
```
Authorization: Basic base64(username:confirmation)
```

**Success Response (200):**

Response Headers:
```
API-OAUTH-METADATA-FOR-PAYLOAD: <consent-id>
API-OAUTH-METADATA-FOR-ACCESSTOKEN: <consent-id>
```

Response Body:
```json
{
  "success": true,
  "message": "Authentication successful",
  "username": "user123",
  "consentId": "12345678-1234-4abc-8abc-123456789abc",
  "authenticated": true,
  "timestamp": "2026-03-10T18:00:00.000Z"
}
```

**Error Response (401):**
```json
{
  "success": false,
  "error": "Invalid credentials",
  "message": "User not found or not authorized"
}
```

**Example Usage:**
```bash
# Using curl with verbose output to see headers
curl -v -u username:intent-id http://localhost:3000/auth

# Or with explicit Authorization header
curl -v -H "Authorization: Basic dXNlcm5hbWU6aW50ZW50LWlk" http://localhost:3000/auth

# Extract specific header
curl -s -D - -u username:intent-id http://localhost:3000/auth | grep "API-OAUTH-METADATA"
```

**Response Headers Explanation:**
- `API-OAUTH-METADATA-FOR-PAYLOAD`: Contains the consent ID for payload metadata
- `API-OAUTH-METADATA-FOR-ACCESSTOKEN`: Contains the consent ID for access token metadata
- Both headers contain the same value: the confirmation/intent-id used for authentication

### GET /

**Description:** Server information and documentation page

### GET /health

**Description:** Health check endpoint

**Response:**
```json
{
  "status": "healthy",
  "service": "PSD2 Consent Flow",
  "timestamp": "2026-03-10T16:00:00.000Z"
}
```

## Flow Description

1. **Initial Redirect**: User is redirected from API Connect OAuth provider to `/login` endpoint with parameters:
   ```
   http://localhost:3000/login?original-url=<OAuth_URL>&state_nonce=<State>&app-name=<App_Name>
   ```

2. **User Login**: User enters their username and password on the login page

3. **Consent Page**: User is redirected to `/consent` page where:
   - A unique intent-id (UUID) is generated
   - Payment authorization details are displayed
   - User can review and authorize the payment

4. **Authorization**: When user clicks "Authorize Payment":
   - System stores the username and confirmation (intent-id) on the server
   - System redirects back to the `original-url`
   - Adds `username` and `confirmation` (intent-id) as URL parameters
   - Final URL structure:
     ```
     https://gateway.com/oauth/authorize?response_type=code&redirect_uri=...&username=<username>&confirmation=<intent-id>
     ```

5. **Authentication Verification**: After authorization, the credentials can be verified:
   - Use the `/auth` endpoint with Basic Authentication
   - Username: the username from login
   - Password: the confirmation (intent-id) from authorization
   - Returns authentication status and user information

6. **Cancellation**: If user clicks "Cancel":
   - Redirects back with error parameters
   - `error=access_denied&error_description=User cancelled authorization`

## Example Complete Flow

### Step 1: Incoming Request
```
http://localhost:3000/login?original-url=https://example.com/org/catalog/api/oauth/authorize?response_type=code%26redirect_uri=https://example.com/redirect%26scope=/api%26client_id=5af57a4a-6db9-4141-ad08-5709432af66e&state_nonce=HoIbRG+6bZtqlB7LDkq4gjlD3SHKglCbnYdHs/bMz2Y=&app-name=PaymentApp
```

### Step 2: User Login
User enters:
- Username: `spoon`
- Password: `password123`

### Step 3: Consent Page
- Intent-ID generated: `12345678-1234-4abc-8abc-123456789abc`
- User reviews and authorizes

### Step 4: Redirect Back
```
https://example.com/org/catalog/api/oauth/authorize?response_type=code&redirect_uri=https://example.com/redirect&scope=/api&client_id=5af57a4a-6db9-4141-ad08-5709432af66e&state_nonce=HoIbRG+6bZtqlB7LDkq4gjlD3SHKglCbnYdHs/bMz2Y=&username=spoon&confirmation=12345678-1234-4abc-8abc-123456789abc
```

## Configuration

### Port Configuration

Set the `PORT` environment variable to change the server port:

```bash
PORT=8080 npm start
```

## Testing

### Testing the /auth Endpoint

A test script is provided to demonstrate the `/auth` endpoint functionality:

```bash
./test-auth.sh
```

This script will:
1. Test authentication without credentials (should fail with 401)
2. Test authentication with invalid credentials (should fail with 401)
3. Store valid authorization credentials
4. Test authentication with valid credentials (should succeed with 200)
5. Test authentication using explicit Authorization header

### Manual Testing with curl

```bash
# 1. Store authorization
curl -X POST http://localhost:3000/store-authorization \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","confirmation":"12345678-1234-4abc-8abc-123456789abc"}'

# 2. Authenticate with Basic Auth
curl -u testuser:12345678-1234-4abc-8abc-123456789abc http://localhost:3000/auth

# 3. Or with explicit Authorization header
curl -H "Authorization: Basic dGVzdHVzZXI6MTIzNDU2NzgtMTIzNC00YWJjLThhYmMtMTIzNDU2Nzg5YWJj" \
  http://localhost:3000/auth
```

## Architecture Notes

### Cross-Client Authentication

The `/auth` endpoint is designed to be called by **different clients** than the one that performed the authorization:

1. **User's Browser**: Completes the login and authorization flow
2. **Server Storage**: Credentials (username + intent-id) are stored server-side in memory
3. **Any Client**: Can authenticate by providing the username and intent-id via Basic Auth

**Example Scenario:**
- User authorizes payment in their browser → credentials stored on server
- Backend API service calls `/auth` endpoint with Basic Auth → gets verified
- Mobile app calls `/auth` endpoint with Basic Auth → gets verified
- Third-party service calls `/auth` endpoint with Basic Auth → gets verified

This is **stateless authentication** - no cookies or sessions required for the `/auth` endpoint.

## Security Notes

⚠️ **This is a demo application**. In production:

- Use HTTPS for all communications (especially for Basic Auth)
- Store credentials in a proper database (Redis, PostgreSQL, MongoDB, etc.) instead of in-memory
- Implement credential expiration and cleanup (TTL)
- Validate and sanitize all user inputs
- Implement rate limiting on the `/auth` endpoint
- Add proper logging and monitoring
- Follow PSD2 Strong Customer Authentication (SCA) requirements
- Consider using JWT tokens instead of storing credentials
- Implement IP whitelisting for the `/auth` endpoint if possible
- Never store actual passwords - the confirmation/intent-id acts as a temporary token

## Technologies Used

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **HTML/CSS/JavaScript** - Frontend

## License

ISC

## Support

For issues or questions, please refer to the project documentation or contact the development team.