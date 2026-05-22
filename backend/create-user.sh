#!/bin/bash

echo "🌱 Creating test user via API..."
echo ""

curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "agent@test.com",
    "password": "Password123456!",
    "first_name": "Test",
    "last_name": "Agent"
  }'

echo ""
echo ""
echo "✅ If you see success above, use these credentials to login:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Email: agent@test.com"
echo "Password: Password123456!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
