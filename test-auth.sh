#!/bin/bash

# Test script for PSD2 Consent Flow /auth endpoint
# This script demonstrates how to authenticate using Basic Auth

echo "=========================================="
echo "PSD2 Consent Flow - Auth Endpoint Test"
echo "=========================================="
echo ""

# Configuration
SERVER_URL="http://localhost:3000"
USERNAME="testuser"
CONFIRMATION="12345678-1234-4abc-8abc-123456789abc"

echo "Testing /auth endpoint with Basic Authentication"
echo ""
echo "Server: $SERVER_URL"
echo "Username: $USERNAME"
echo "Confirmation (Intent-ID): $CONFIRMATION"
echo ""
echo "=========================================="
echo ""

# Test 1: Authentication without credentials (should fail)
echo "Test 1: Request without credentials (should return 401)"
echo "Command: curl -s -w '\nHTTP Status: %{http_code}\n' $SERVER_URL/auth"
echo ""
curl -s -w '\nHTTP Status: %{http_code}\n' "$SERVER_URL/auth"
echo ""
echo "=========================================="
echo ""

# Test 2: Authentication with invalid credentials (should fail)
echo "Test 2: Request with invalid credentials (should return 401)"
echo "Command: curl -s -w '\nHTTP Status: %{http_code}\n' -u wronguser:wrongpass $SERVER_URL/auth"
echo ""
curl -s -w '\nHTTP Status: %{http_code}\n' -u "wronguser:wrongpass" "$SERVER_URL/auth"
echo ""
echo "=========================================="
echo ""

# Test 3: Store authorization first
echo "Test 3: Store authorization credentials"
echo "Command: curl -s -X POST -H 'Content-Type: application/json' -d '{\"username\":\"$USERNAME\",\"confirmation\":\"$CONFIRMATION\"}' $SERVER_URL/store-authorization"
echo ""
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"confirmation\":\"$CONFIRMATION\"}" \
  "$SERVER_URL/store-authorization"
echo ""
echo ""
echo "=========================================="
echo ""

# Test 4: Authentication with valid credentials (should succeed)
echo "Test 4: Request with valid credentials (should return 200)"
echo "Command: curl -s -w '\nHTTP Status: %{http_code}\n' -u $USERNAME:$CONFIRMATION $SERVER_URL/auth"
echo ""
curl -s -w '\nHTTP Status: %{http_code}\n' -u "$USERNAME:$CONFIRMATION" "$SERVER_URL/auth"
echo ""
echo "=========================================="
echo ""

# Test 5: Using explicit Authorization header
echo "Test 5: Request with explicit Authorization header"
AUTH_HEADER=$(echo -n "$USERNAME:$CONFIRMATION" | base64)
echo "Command: curl -s -w '\nHTTP Status: %{http_code}\n' -H 'Authorization: Basic $AUTH_HEADER' $SERVER_URL/auth"
echo ""
curl -s -w '\nHTTP Status: %{http_code}\n' \
  -H "Authorization: Basic $AUTH_HEADER" \
  "$SERVER_URL/auth"
echo ""
echo "=========================================="
echo ""

# Test 6: Show response headers with verbose output
echo "Test 6: Request with verbose output to show custom headers"
echo "Command: curl -v -u $USERNAME:$CONFIRMATION $SERVER_URL/auth"
echo ""
curl -v -u "$USERNAME:$CONFIRMATION" "$SERVER_URL/auth" 2>&1 | grep -E "(API-OAUTH-METADATA|HTTP/|< )"
echo ""
echo "=========================================="
echo ""

# Test 7: Extract specific headers
echo "Test 7: Extract custom OAuth metadata headers"
echo "Command: curl -s -D - -u $USERNAME:$CONFIRMATION $SERVER_URL/auth | grep 'API-OAUTH-METADATA'"
echo ""
curl -s -D - -u "$USERNAME:$CONFIRMATION" "$SERVER_URL/auth" | grep "API-OAUTH-METADATA"
echo ""
echo "=========================================="
echo ""

echo "Tests completed!"
echo ""
echo "Note: Make sure the server is running on $SERVER_URL"
echo "Start the server with: npm start"

# Made with Bob
