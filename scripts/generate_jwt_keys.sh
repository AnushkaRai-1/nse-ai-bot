#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Generate RS256 JWT key pair for authentication
# PRD Section 10.1: Asymmetric RS256 (not symmetric HS256)
#
# Usage: ./scripts/generate_jwt_keys.sh
# Output: docker/keys/jwt_private.pem, docker/keys/jwt_public.pem
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

KEYS_DIR="$(dirname "$0")/../docker/keys"
mkdir -p "$KEYS_DIR"

echo "Generating RS256 key pair..."

# Generate 2048-bit RSA private key
openssl genrsa -out "$KEYS_DIR/jwt_private.pem" 2048

# Extract public key
openssl rsa -in "$KEYS_DIR/jwt_private.pem" -pubout -out "$KEYS_DIR/jwt_public.pem"

# Set permissions (private key read-only by owner)
chmod 600 "$KEYS_DIR/jwt_private.pem"
chmod 644 "$KEYS_DIR/jwt_public.pem"

echo "✓ Keys generated:"
echo "  Private: $KEYS_DIR/jwt_private.pem"
echo "  Public:  $KEYS_DIR/jwt_public.pem"
echo ""
echo "Add these paths to your .env:"
echo "  JWT_PRIVATE_KEY_PATH=$KEYS_DIR/jwt_private.pem"
echo "  JWT_PUBLIC_KEY_PATH=$KEYS_DIR/jwt_public.pem"
