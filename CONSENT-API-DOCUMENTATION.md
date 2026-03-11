# PSD2 Consent API Documentation

## Overview

This document describes the new consent creation flow implemented in the PSD2 Consent Flow Server.

## New Flow

Instead of the consent page generating the consentId, the flow now works as follows:

1. **Create Consent**: Call the `/createconsent` endpoint to create a consent with payment details
2. **Store Consent**: The server stores the consent data with status "awaitingauthorization"
3. **Generate ConsentId**: Server returns a randomly generated consentId
4. **Display Consent**: The consent page fetches and displays the payment details using the consentId

## API Endpoints

### POST /createconsent

Creates a new payment consent with the provided initiation data.

**Request:**
```http
POST /createconsent HTTP/1.1
Content-Type: application/json

{
  "Data": {
    "Initiation": {
      "InstructionIdentification": "PAYREF-20260311-001",
      "EndToEndIdentification": "E2E-20260311-001",
      "InstructedAmount": {
        "Amount": "150.00",
        "Currency": "GBP"
      },
      "CreditorAccount": {
        "SchemeName": "UK.OBIE.SortCodeAccountNumber",
        "Identification": "08080021325698",
        "Name": "ACME Ltd"
      },
      "RemittanceInformation": {
        "Unstructured": "Invoice 12345",
        "Reference": "INV-12345"
      }
    }
  }
}
```

**Response (201 Created):**
```json
{
  "consentId": "consent-ce57e66a-34e6-47d3-886d-3bd4bca736c1",
  "status": "awaitingauthorization",
  "createdAt": "2026-03-11T08:30:11.241Z"
}
```

**Validation:**
- Returns 400 Bad Request if required fields are missing
- Required fields:
  - `Data.Initiation.InstructionIdentification`
  - `Data.Initiation.EndToEndIdentification`
  - `Data.Initiation.InstructedAmount`
  - `Data.Initiation.CreditorAccount`

### GET /consent/:consentId

Retrieves consent data by consentId.

**Request:**
```http
GET /consent/consent-ce57e66a-34e6-47d3-886d-3bd4bca736c1 HTTP/1.1
```

**Response (200 OK):**
```json
{
  "consentId": "consent-ce57e66a-34e6-47d3-886d-3bd4bca736c1",
  "data": {
    "Data": {
      "Initiation": {
        "InstructionIdentification": "PAYREF-20260311-001",
        "EndToEndIdentification": "E2E-20260311-001",
        "InstructedAmount": {
          "Amount": "150.00",
          "Currency": "GBP"
        },
        "CreditorAccount": {
          "SchemeName": "UK.OBIE.SortCodeAccountNumber",
          "Identification": "08080021325698",
          "Name": "ACME Ltd"
        },
        "RemittanceInformation": {
          "Unstructured": "Invoice 12345",
          "Reference": "INV-12345"
        }
      }
    }
  },
  "status": "awaitingauthorization",
  "createdAt": "2026-03-11T08:30:11.241Z"
}
```

**Error Response (404 Not Found):**
```json
{
  "error": "Not Found",
  "message": "Consent not found"
}
```

### GET /store-overview

Displays an overview of all stored consents and authorized sessions.

**Features:**
- Shows all created consents with payment details
- Shows all authorized sessions
- Displays consent status, amount, creditor information
- Auto-refreshes every 30 seconds

**Access:**
```
http://localhost:3000/store-overview
```

## Data Storage

### Consent Store

The server maintains an in-memory Map called `consentStore` that stores:

```javascript
{
  consentId: {
    consentId: "consent-xxx",
    data: { /* original request body */ },
    status: "awaitingauthorization",
    createdAt: "2026-03-11T08:30:11.241Z"
  }
}
```

### Authorization Store

The existing `authorizedSessions` Map stores username-to-consentId mappings for authentication.

## Updated Consent Page

The consent page (`/consent`) now:

1. Accepts a `consentId` query parameter
2. Fetches consent data from `/consent/:consentId`
3. Displays payment details including:
   - Amount and currency
   - Creditor name and account
   - Payment reference
   - Instruction ID
   - Consent status

**Example URL:**
```
http://localhost:3000/consent?consentId=consent-xxx&username=testuser&original-url=http://example.com/callback
```

## Testing

Run the test script to verify the implementation:

```bash
./test-createconsent.sh
```

**Test Coverage:**
- ✅ Create consent with valid data (201 Created)
- ✅ Retrieve consent by ID (200 OK)
- ✅ Verify status is "awaitingauthorization"
- ✅ Validate missing required fields (400 Bad Request)

## Example Usage

### 1. Create a Consent

```bash
curl -X POST http://localhost:3000/createconsent \
  -H "Content-Type: application/json" \
  -d '{
    "Data": {
      "Initiation": {
        "InstructionIdentification": "PAYREF-20260311-001",
        "EndToEndIdentification": "E2E-20260311-001",
        "InstructedAmount": {
          "Amount": "150.00",
          "Currency": "GBP"
        },
        "CreditorAccount": {
          "SchemeName": "UK.OBIE.SortCodeAccountNumber",
          "Identification": "08080021325698",
          "Name": "ACME Ltd"
        },
        "RemittanceInformation": {
          "Reference": "INV-12345"
        }
      }
    }
  }'
```

### 2. View Consent in Browser

Navigate to:
```
http://localhost:3000/consent?consentId=<returned-consent-id>&username=testuser&original-url=http://example.com/callback
```

### 3. View All Consents

Navigate to:
```
http://localhost:3000/store-overview
```

## ConsentId Format

ConsentIds are generated in UUID v4 format with a "consent-" prefix:

```
consent-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
```

Example: `consent-ce57e66a-34e6-47d3-886d-3bd4bca736c1`

## Status Values

Currently supported status:
- `awaitingauthorization` - Initial status when consent is created

## Production Considerations

⚠️ **Important**: This implementation uses in-memory storage. For production:

1. Replace `consentStore` Map with a persistent database (PostgreSQL, MongoDB, Redis)
2. Add consent expiration logic
3. Implement consent status updates (authorized, rejected, expired)
4. Add authentication/authorization for the `/createconsent` endpoint
5. Implement audit logging
6. Add rate limiting
7. Implement proper error handling and validation
8. Add HTTPS/TLS support
9. Implement data encryption for sensitive information
10. Add monitoring and alerting

## Changes Summary

### Files Modified

1. **server.js**
   - Added `consentStore` Map for storing consent data
   - Added `POST /createconsent` endpoint
   - Added `GET /consent/:consentId` endpoint
   - Updated `/store-overview` to display created consents
   - Updated existing `/consent` GET route to remain compatible

2. **views/consent.html**
   - Updated to fetch consent data from API
   - Added loading and error states
   - Displays payment details from fetched consent data
   - Accepts `consentId` query parameter

3. **test-createconsent.sh** (new file)
   - Comprehensive test script for the new endpoints
   - Tests consent creation, retrieval, and validation

## Migration Notes

The existing consent flow still works for backward compatibility. The `/consent` GET route serves the HTML page, while the new `/consent/:consentId` route returns JSON data.