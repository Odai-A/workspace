#!/usr/bin/env python3
"""
Environment Variables Test Script

This script checks if all the required environment variables for the
multi-tenant Stripe subscription project are properly set.
"""

import os
import sys
from dotenv import load_dotenv
import requests
import stripe

# Load environment variables from .env
load_dotenv(verbose=True)

print("=== Environment Variables Check ===\n")

# Required variables and their descriptions
required_vars = {
    # Supabase
    "SUPABASE_URL": "Supabase project URL",
    "SUPABASE_KEY": "Supabase anon key",
    "SUPABASE_SERVICE_KEY": "Supabase service role key",
    
    # Stripe 
    "STRIPE_API_KEY": "Stripe secret API key",
    "STRIPE_PUBLISHABLE_KEY": "Stripe publishable key",
    "STRIPE_WEBHOOK_SECRET": "Stripe webhook signing secret",
    
    # Stripe Price IDs
    "STRIPE_STARTER_PLAN_PRICE_ID": "Stripe price ID for starter plan",
    "STRIPE_PRO_PLAN_PRICE_ID": "Stripe price ID for pro plan",
    "STRIPE_ENTERPRISE_PLAN_PRICE_ID": "Stripe price ID for enterprise plan",
    
    # Frontend URL
    "FRONTEND_BASE_URL": "Base URL for the frontend application",
}

# Optional variables
optional_vars = {
    "DATABASE_URL": "Database connection string (if using SQLAlchemy)",
    "FLASK_DEBUG": "Flask debug mode (default: True)",
    "FLASK_RUN_PORT": "Flask run port (default: 5000)",
    "SECRET_KEY": "Flask secret key (auto-generated if not set)"
}

# Check required variables
missing_vars = []
warnings = []

for var, description in required_vars.items():
    value = os.environ.get(var)
    if not value:
        missing_vars.append(f"{var} ({description})")
        print(f"❌ {var}: Not set")
    else:
        # Mask sensitive information
        if "KEY" in var or "SECRET" in var:
            masked_value = value[:4] + "*" * (len(value) - 8) + value[-4:]
            print(f"✅ {var}: {masked_value}")
        else:
            print(f"✅ {var}: {value}")
        
        # Check for placeholder values but allow test price IDs
        test_price_ids = ["price_50", "price_100", "price_250"]
        if (("your_" in value.lower() or "example" in value.lower()) and 
            not (var.endswith("_PRICE_ID") and value in test_price_ids)):
            warnings.append(f"{var} appears to contain a placeholder value.")

# Stripe validation
if os.environ.get("STRIPE_API_KEY"):
    print("\n=== Testing Stripe API Connection ===")
    stripe.api_key = os.environ.get("STRIPE_API_KEY")
    
    try:
        stripe.Account.retrieve()
        print("✅ Stripe API Connection: Successful")
        
        # Test price IDs
        for price_var in ["STRIPE_STARTER_PLAN_PRICE_ID", 
                          "STRIPE_PRO_PLAN_PRICE_ID", 
                          "STRIPE_ENTERPRISE_PLAN_PRICE_ID"]:
            price_id = os.environ.get(price_var)
            if price_id:
                try:
                    price = stripe.Price.retrieve(price_id)
                    print(f"✅ {price_var}: Valid (Product: {price.product}, " + 
                          f"Amount: {price.unit_amount/100} {price.currency}/{'month' if price.recurring.interval == 'month' else price.recurring.interval})")
                except stripe.error.InvalidRequestError:
                    print(f"❌ {price_var}: Invalid price ID - not found in Stripe")
                    warnings.append(f"{price_var} is not a valid Stripe price ID.")
    except Exception as e:
        print(f"❌ Stripe API Connection: Failed - {str(e)}")
        warnings.append("Stripe API connection failed.")

# Summary
print("\n=== Results ===")

if missing_vars:
    print(f"\n❌ Missing {len(missing_vars)} required variables:")
    for var in missing_vars:
        print(f"  - {var}")
        
if warnings:
    print(f"\n⚠️ {len(warnings)} Warnings:")
    for warning in warnings:
        print(f"  - {warning}")
        
if not missing_vars and not warnings:
    print("\n✅ All environment variables are properly configured!")
else:
    print("\n🔧 Please fix the issues above before running the application.")
    
    # Create .env example if it doesn't exist
    if not os.path.exists(".env.example"):
        print("\nCreating .env.example file to help you set up the variables...")
        with open(".env.example", "w") as f:
            f.write("# Supabase Configuration\n")
            f.write("SUPABASE_URL=https://yourproject.supabase.co\n")
            f.write("SUPABASE_KEY=your_supabase_anon_key\n")
            f.write("SUPABASE_SERVICE_KEY=your_supabase_service_role_key\n\n")
            
            f.write("# Flask Configuration\n")
            f.write("FLASK_DEBUG=True\n")
            f.write("FLASK_RUN_PORT=5000\n")
            f.write("SECRET_KEY=your_flask_secret_key\n")
            f.write("FRONTEND_BASE_URL=http://localhost:5173\n\n")
            
            f.write("# Stripe Configuration\n")
            f.write("STRIPE_API_KEY=sk_test_your_stripe_api_key\n")
            f.write("STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key\n")
            f.write("STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret\n\n")
            
            f.write("# Stripe Price IDs\n")
            f.write("STRIPE_STARTER_PLAN_PRICE_ID=price_your_starter_plan_id\n")
            f.write("STRIPE_PRO_PLAN_PRICE_ID=price_your_pro_plan_id\n")
            f.write("STRIPE_ENTERPRISE_PLAN_PRICE_ID=price_your_enterprise_plan_id\n\n")
            
            f.write("# Optional Database URL\n")
            f.write("# DATABASE_URL=your_database_connection_string\n")
        
        print("✅ Created .env.example - copy it to .env and fill in your values.")
        print("   See stripe_setup_guide.md for detailed instructions.")

sys.exit(0 if not missing_vars else 1) 