# PSD2 Consent Datastore Structure

## Consent Store (Map)

The `consentStore` is a JavaScript Map where:
- **Key**: `consentId` (string)
- **Value**: Consent object with the following structure

### Consent Object Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONSENT DATASTORE                                  │
│                         (JavaScript Map Object)                              │
└─────────────────────────────────────────────────────────────────────────────┘

Key: consentId (string)
Example: "consent-62f606cd-3704-43a3-a9f8-b3c3102eb659"

Value: Consent Object
┌─────────────────────────────────────────────────────────────────────────────┐
│ Field Name       │ Type     │ Description                    │ Example       │
├──────────────────┼──────────┼────────────────────────────────┼───────────────┤
│ consentId        │ string   │ Unique consent identifier      │ consent-xxx   │
│                  │          │ (UUID v4 format with prefix)   │               │
├──────────────────┼──────────┼────────────────────────────────┼───────────────┤
│ status           │ string   │ Consent status                 │ awaiting...   │
│                  │          │ - "awaitingauthorization"      │ OR            │
│                  │          │ - "authorized"                 │ authorized    │
├──────────────────┼──────────┼────────────────────────────────┼───────────────┤
│ createdAt        │ string   │ ISO 8601 timestamp when        │ 2026-03-11... │
│                  │          │ consent was created            │               │
├──────────────────┼──────────┼────────────────────────────────┼───────────────┤
│ username         │ string   │ Username who authorized        │ alice         │
│                  │ (optional)│ (added after authorization)   │               │
├──────────────────┼──────────┼────────────────────────────────┼───────────────┤
│ confirmation     │ string   │ Confirmation ID (same as       │ consent-xxx   │
│                  │ (optional)│ consentId, used for Basic Auth)│               │
├──────────────────┼──────────┼────────────────────────────────┼───────────────┤
│ authorizedAt     │ string   │ ISO 8601 timestamp when        │ 2026-03-11... │
│                  │ (optional)│ consent was authorized         │               │
├──────────────────┼──────────┼────────────────────────────────┼───────────────┤
│ data             │ object   │ Full payment initiation data   │ See below ↓   │
│                  │          │ (original request body)        │               │
└──────────────────┴──────────┴────────────────────────────────┴───────────────┘
```

### Data Object Structure (Nested)

```
data: {
  Data: {
    Initiation: {
      InstructionIdentification: string,    // e.g., "PAYREF-20260311-001"
      EndToEndIdentification: string,       // e.g., "E2E-20260311-001"
      InstructedAmount: {
        Amount: string,                     // e.g., "150.00"
        Currency: string                    // e.g., "GBP"
      },
      CreditorAccount: {
        SchemeName: string,                 // e.g., "UK.OBIE.SortCodeAccountNumber"
        Identification: string,             // e.g., "08080021325698"
        Name: string                        // e.g., "ACME Ltd"
      },
      RemittanceInformation: {
        Unstructured: string (optional),    // e.g., "Invoice 12345"
        Reference: string (optional)        // e.g., "INV-12345"
      }
    }
  }
}
```

## Complete Example

### Before Authorization (Initial State)

```javascript
consentStore.set("consent-62f606cd-3704-43a3-a9f8-b3c3102eb659", {
  consentId: "consent-62f606cd-3704-43a3-a9f8-b3c3102eb659",
  status: "awaitingauthorization",
  createdAt: "2026-03-11T08:43:06.277Z",
  data: {
    Data: {
      Initiation: {
        InstructionIdentification: "FINAL-TEST",
        EndToEndIdentification: "E2E-FINAL",
        InstructedAmount: {
          Amount: "500.00",
          Currency: "EUR"
        },
        CreditorAccount: {
          SchemeName: "UK.OBIE.SortCodeAccountNumber",
          Identification: "11223344556677",
          Name: "Final Test Merchant"
        },
        RemittanceInformation: {
          Reference: "FINAL-REF"
        }
      }
    }
  }
});
```

### After Authorization (Updated State)

```javascript
consentStore.set("consent-62f606cd-3704-43a3-a9f8-b3c3102eb659", {
  consentId: "consent-62f606cd-3704-43a3-a9f8-b3c3102eb659",
  status: "authorized",                                          // ← UPDATED
  createdAt: "2026-03-11T08:43:06.277Z",
  username: "alice",                                             // ← ADDED
  confirmation: "consent-62f606cd-3704-43a3-a9f8-b3c3102eb659", // ← ADDED
  authorizedAt: "2026-03-11T08:46:01.692Z",                     // ← ADDED
  data: {
    Data: {
      Initiation: {
        InstructionIdentification: "FINAL-TEST",
        EndToEndIdentification: "E2E-FINAL",
        InstructedAmount: {
          Amount: "500.00",
          Currency: "EUR"
        },
        CreditorAccount: {
          SchemeName: "UK.OBIE.SortCodeAccountNumber",
          Identification: "11223344556677",
          Name: "Final Test Merchant"
        },
        RemittanceInformation: {
          Reference: "FINAL-REF"
        }
      }
    }
  }
});
```

## Visual Table Representation

```
╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                    CONSENT STORE TABLE                                                                  ║
╠═══════════╤═══════════════════╤══════════╤═══════════╤═══════════════╤═══════════╤═══════════════╤═══════════════╤═══════════════════╣
║ ConsentID │ Status            │ Username │ Confirm.  │ Amount        │ Currency  │ Creditor      │ Created At    │ Authorized At     ║
╠═══════════╪═══════════════════╪══════════╪═══════════╪═══════════════╪═══════════╪═══════════════╪═══════════════╪═══════════════════╣
║ consent-  │ awaiting...       │ -        │ -         │ 150.00        │ GBP       │ ACME Ltd      │ 2026-03-11... │ -                 ║
║ abc123... │                   │          │           │               │           │               │ 08:30:11      │                   ║
╠═══════════╪═══════════════════╪══════════╪═══════════╪═══════════════╪═══════════╪═══════════════╪═══════════════╪═══════════════════╣
║ consent-  │ authorized        │ alice    │ consent-  │ 500.00        │ EUR       │ Final Test    │ 2026-03-11... │ 2026-03-11...     ║
║ 62f606... │ ✅                │          │ 62f606... │               │           │ Merchant      │ 08:43:06      │ 08:46:01          ║
╠═══════════╪═══════════════════╪══════════╪═══════════╪═══════════════╪═══════════╪═══════════════╪═══════════════╪═══════════════════╣
║ consent-  │ authorized        │ bob      │ consent-  │ 250.50        │ EUR       │ Tech Solutions│ 2026-03-11... │ 2026-03-11...     ║
║ 73f701... │ ✅                │          │ 73f701... │               │           │ Inc           │ 08:33:03      │ 08:35:22          ║
╚═══════════╧═══════════════════╧══════════╧═══════════╧═══════════════╧═══════════╧═══════════════╧═══════════════╧═══════════════════╝
```

## Field Usage

### For Basic Authentication (/auth endpoint)
- **Username**: `username` field
- **Password**: `confirmation` field (which equals `consentId`)

### Status Lifecycle
1. **Created**: `status = "awaitingauthorization"`
   - Fields: `consentId`, `status`, `createdAt`, `data`
   
2. **Authorized**: `status = "authorized"`
   - Additional fields: `username`, `confirmation`, `authorizedAt`

## Storage Implementation

```javascript
// In-memory Map (server.js)
const consentStore = new Map();

// Create consent
consentStore.set(consentId, consentObject);

// Retrieve consent
const consent = consentStore.get(consentId);

// Update consent (authorization)
const consent = consentStore.get(consentId);
consent.status = "authorized";
consent.username = "alice";
consent.confirmation = consentId;
consent.authorizedAt = new Date().toISOString();
consentStore.set(consentId, consent);
```

## Notes

- ⚠️ **In-Memory Storage**: Data is lost when server restarts
- 🔄 **Production**: Replace with persistent database (PostgreSQL, MongoDB, Redis)
- 🔐 **Security**: Confirmation field contains the full consentId for Basic Auth
- 📊 **Indexing**: Consider indexing by username for faster lookups in production