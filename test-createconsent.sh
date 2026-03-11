#!/bin/bash

echo "=========================================="
echo "Testing /createconsent endpoint"
echo "=========================================="
echo ""

# Test 1: Create a consent
echo "Test 1: Creating a new consent..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/createconsent \
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
        "Unstructured": "Invoice 12345",
        "Reference": "INV-12345"
      }
    }
  }
}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status Code: $HTTP_CODE"
echo "Response Body:"
echo "$BODY" | jq '.'
echo ""

if [ "$HTTP_CODE" = "201" ]; then
    echo "✅ Test 1 PASSED: Consent created successfully"
    
    # Extract consentId from response
    CONSENT_ID=$(echo "$BODY" | jq -r '.consentId')
    echo "Consent ID: $CONSENT_ID"
    echo ""
    
    # Test 2: Retrieve the consent
    echo "=========================================="
    echo "Test 2: Retrieving the consent..."
    echo ""
    
    RETRIEVE_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "http://localhost:3000/consent/$CONSENT_ID")
    
    RETRIEVE_HTTP_CODE=$(echo "$RETRIEVE_RESPONSE" | tail -n1)
    RETRIEVE_BODY=$(echo "$RETRIEVE_RESPONSE" | sed '$d')
    
    echo "HTTP Status Code: $RETRIEVE_HTTP_CODE"
    echo "Response Body:"
    echo "$RETRIEVE_BODY" | jq '.'
    echo ""
    
    if [ "$RETRIEVE_HTTP_CODE" = "200" ]; then
        echo "✅ Test 2 PASSED: Consent retrieved successfully"
        
        # Verify status is awaitingauthorization
        STATUS=$(echo "$RETRIEVE_BODY" | jq -r '.status')
        if [ "$STATUS" = "awaitingauthorization" ]; then
            echo "✅ Status verification PASSED: Status is 'awaitingauthorization'"
        else
            echo "❌ Status verification FAILED: Expected 'awaitingauthorization', got '$STATUS'"
        fi
    else
        echo "❌ Test 2 FAILED: Could not retrieve consent"
    fi
    
    echo ""
    echo "=========================================="
    echo "Test 3: Access consent page with consentId"
    echo ""
    echo "You can now access the consent page at:"
    echo "http://localhost:3000/consent?consentId=$CONSENT_ID&username=testuser&original-url=http://example.com/callback"
    echo ""
    
else
    echo "❌ Test 1 FAILED: Could not create consent"
fi

echo "=========================================="
echo "Test 4: Test with missing fields"
echo ""

INVALID_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/createconsent \
  -H "Content-Type: application/json" \
  -d '{
  "Data": {
    "Initiation": {
      "InstructionIdentification": "PAYREF-20260311-002"
    }
  }
}')

INVALID_HTTP_CODE=$(echo "$INVALID_RESPONSE" | tail -n1)
INVALID_BODY=$(echo "$INVALID_RESPONSE" | sed '$d')

echo "HTTP Status Code: $INVALID_HTTP_CODE"
echo "Response Body:"
echo "$INVALID_BODY" | jq '.'
echo ""

if [ "$INVALID_HTTP_CODE" = "400" ]; then
    echo "✅ Test 4 PASSED: Validation works correctly"
else
    echo "❌ Test 4 FAILED: Expected 400 status code for invalid request"
fi

echo ""
echo "=========================================="
echo "All tests completed!"
echo "=========================================="

# Made with Bob
