#!/usr/bin/env python3
"""Quick test to verify Stripe configuration is being read from .env"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Check Stripe configuration
stripe_api_key = os.environ.get('STRIPE_API_KEY')
stripe_webhook_secret = os.environ.get('STRIPE_WEBHOOK_SECRET')
stripe_publishable_key = os.environ.get('STRIPE_PUBLISHABLE_KEY')

print("=" * 60)
print("STRIPE CONFIGURATION CHECK")
print("=" * 60)
print(f"STRIPE_API_KEY: {'✅ SET' if stripe_api_key else '❌ MISSING'}")
if stripe_api_key:
    print(f"  Value: {stripe_api_key[:20]}...{stripe_api_key[-10:]} (length: {len(stripe_api_key)})")
    print(f"  Starts with sk_test_: {stripe_api_key.startswith('sk_test_')}")
else:
    print("  ⚠️  Key is missing or empty!")

print(f"\nSTRIPE_WEBHOOK_SECRET: {'✅ SET' if stripe_webhook_secret else '❌ MISSING'}")
if stripe_webhook_secret:
    print(f"  Value: {stripe_webhook_secret[:20]}...{stripe_webhook_secret[-10:]} (length: {len(stripe_webhook_secret)})")
    print(f"  Starts with whsec_: {stripe_webhook_secret.startswith('whsec_')}")
else:
    print("  ⚠️  Secret is missing or empty!")

print(f"\nSTRIPE_PUBLISHABLE_KEY: {'✅ SET' if stripe_publishable_key else '❌ MISSING'}")
if stripe_publishable_key:
    print(f"  Value: {stripe_publishable_key[:20]}...{stripe_publishable_key[-10:]} (length: {len(stripe_publishable_key)})")
    print(f"  Starts with pk_test_: {stripe_publishable_key.startswith('pk_test_')}")
else:
    print("  ⚠️  Key is missing or empty!")

print("\n" + "=" * 60)
if stripe_api_key and stripe_webhook_secret:
    print("✅ Stripe configuration looks good!")
    print("   If you're still getting errors, make sure:")
    print("   1. Backend server was restarted after adding keys")
    print("   2. No extra spaces or quotes in .env file")
    print("   3. Keys are on single lines (no line breaks)")
else:
    print("❌ Stripe configuration is incomplete!")
    print("   Please add the missing keys to your .env file")
print("=" * 60)

