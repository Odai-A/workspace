import os
import requests
import json
import base64
from datetime import datetime, timezone, timedelta
from flask import Flask, request, render_template, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
import stripe
from supabase import create_client, Client
import logging # For better logging
from facebook_service import (
    get_facebook_oauth_url, exchange_code_for_token, get_user_pages,
    get_page_access_token, create_catalog_product, upload_photo_to_page,
    create_page_post, encrypt_token, decrypt_token, verify_token
)

# Very verbose debug to see what's happening
print("Current directory:", os.getcwd())
print("Env file exists:", os.path.exists('.env'))
print("Loading dotenv...")
load_dotenv(verbose=True)  # This will print debug info
print("Loaded environment variables:")
print("SUPABASE_URL:", os.environ.get('SUPABASE_URL'))
print("SUPABASE_KEY:", os.environ.get('SUPABASE_KEY'))
print("SUPABASE_SERVICE_KEY:", os.environ.get('SUPABASE_SERVICE_KEY'))

# Load environment variables from .env file
load_dotenv()

# Configure logging - ensure it outputs to console
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Output to console/terminal
    ]
)
logger = logging.getLogger(__name__)
logger.info("=" * 60)
logger.info("LOGGING CONFIGURED - All logs will appear in terminal")
logger.info("=" * 60)

app = Flask(__name__)

# Enable CORS - configure for production
# In production, set ALLOWED_ORIGINS environment variable (comma-separated)
# Example: ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
# Also supports FRONTEND_BASE_URL for convenience
allowed_origins_str = os.environ.get('ALLOWED_ORIGINS', '*')
frontend_base_url = os.environ.get('FRONTEND_BASE_URL', '')

# Build list of allowed origins
if allowed_origins_str == '*':
    allowed_origins = ['*']
else:
    allowed_origins = [origin.strip() for origin in allowed_origins_str.split(',') if origin.strip()]
    # Add FRONTEND_BASE_URL if it's set and not already in the list
    if frontend_base_url and frontend_base_url not in allowed_origins:
        allowed_origins.append(frontend_base_url.rstrip('/'))

if allowed_origins == ['*']:
    # Development: allow all origins with explicit CORS configuration
    CORS(app, resources={
        r"/api/*": {
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
            "supports_credentials": False
        }
    })
    logger.info("CORS configured for development: allowing all origins for /api/* routes")
else:
    # Production: allow specific origins
    CORS(app, resources={
        r"/api/*": {
            "origins": allowed_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
            "supports_credentials": False
        }
    })
    logger.info(f"CORS configured for origins: {', '.join(allowed_origins)}")

# eBay API Configuration
EBAY_CLIENT_ID = os.getenv('EBAY_CLIENT_ID')
EBAY_CLIENT_SECRET = os.getenv('EBAY_CLIENT_SECRET')
EBAY_SANDBOX = os.getenv('EBAY_SANDBOX', 'true').lower() == 'true'
EBAY_REDIRECT_URI = os.getenv('EBAY_REDIRECT_URI')

# Shopify API Configuration
SHOPIFY_SHOP_DOMAIN = os.getenv('SHOPIFY_SHOP_DOMAIN')  # e.g., 'your-shop.myshopify.com'
SHOPIFY_ACCESS_TOKEN = os.getenv('SHOPIFY_ACCESS_TOKEN')

# --- Flask App Configuration ---
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(24))

# --- Database Configuration (SQLAlchemy - For non-tenant or legacy tables if any) ---
# If all your data (products, scan_history, tenants) is now in Supabase and managed
# via the Supabase client + RLS, you might not need SQLAlchemy for these specific tables.
# Keep this section if you have other tables managed by Flask-SQLAlchemy.
# Ensure DATABASE_URL in your .env points to your Supabase Postgres instance if using.
DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL:
    app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {"pool_pre_ping": True}
    db = SQLAlchemy(app)
else:
    logger.warning("DATABASE_URL not found in .env, SQLAlchemy not initialized for a primary DB.")
    db = None # Explicitly set to None if not configured

# --- Stripe Configuration ---
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')
STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY')  # For frontend if needed there

# Load Price IDs from environment variables
STRIPE_STARTER_PLAN_PRICE_ID = os.environ.get('STRIPE_STARTER_PLAN_PRICE_ID')
STRIPE_PRO_PLAN_PRICE_ID = os.environ.get('STRIPE_PRO_PLAN_PRICE_ID')
STRIPE_ENTERPRISE_PLAN_PRICE_ID = os.environ.get('STRIPE_ENTERPRISE_PLAN_PRICE_ID')

# New pricing plan IDs (Base subscription prices)
STRIPE_BASIC_PLAN_PRICE_ID = os.environ.get('STRIPE_BASIC_PLAN_PRICE_ID')
STRIPE_ENTREPRENEUR_PLAN_PRICE_ID = os.environ.get('STRIPE_ENTREPRENEUR_PLAN_PRICE_ID')

# Usage-based price IDs for metered billing (overages)
STRIPE_BASIC_USAGE_PRICE_ID = os.environ.get('STRIPE_BASIC_USAGE_PRICE_ID')
STRIPE_PRO_USAGE_PRICE_ID = os.environ.get('STRIPE_PRO_USAGE_PRICE_ID')
STRIPE_ENTREPRENEUR_USAGE_PRICE_ID = os.environ.get('STRIPE_ENTREPRENEUR_USAGE_PRICE_ID')

# --- Free Trial / Plan Configuration ---
# Number of free scans allowed per tenant before requiring upgrade
FREE_TRIAL_SCAN_LIMIT = int(os.environ.get('FREE_TRIAL_SCAN_LIMIT', '50'))

# --- Creator/CEO Configuration ---
# Only the creator of the software can have CEO role
# Set this to your email address or user ID in the .env file
CREATOR_EMAIL = os.environ.get('CREATOR_EMAIL', '').strip().lower()
CREATOR_USER_ID = os.environ.get('CREATOR_USER_ID', '').strip()

PLAN_CONFIG = {
    'basic': {
        'name': 'Basic',
        'monthly_price': 150.00,
        'included_scans': 1000,
        'overage_rate': 0.11,
        'max_users': 1,  # Basic plan allows 1 user
        'base_price_id': STRIPE_BASIC_PLAN_PRICE_ID,
        'usage_price_id': STRIPE_BASIC_USAGE_PRICE_ID,
    },
    'pro': {
        'name': 'Pro',
        'monthly_price': 300.00,
        'included_scans': 5000,
        'overage_rate': 0.11,
        'max_users': 3,  # Pro plan allows 3 users
        'base_price_id': STRIPE_PRO_PLAN_PRICE_ID,
        'usage_price_id': STRIPE_PRO_USAGE_PRICE_ID,
    },
    'entrepreneur': {
        'name': 'Entrepreneur',
        'monthly_price': 500.00,
        'included_scans': 20000,
        'overage_rate': 0.11,
        'max_users': 5,  # Entrepreneur plan allows 5 users
        'base_price_id': STRIPE_ENTREPRENEUR_PLAN_PRICE_ID,
        'usage_price_id': STRIPE_ENTREPRENEUR_USAGE_PRICE_ID,
    },
}

def get_plan_config_by_price_id(price_id):
    """Get plan configuration by base price ID"""
    for plan_id, config in PLAN_CONFIG.items():
        if config['base_price_id'] == price_id:
            return plan_id, config
    return None, None

def get_tenant_plan_and_limit(tenant_id):
    """
    Get the current subscription plan and user limit for a tenant.
    Returns (plan_id, plan_config, max_users) or (None, None, None) if no active subscription.
    """
    try:
        if not tenant_id or not stripe.api_key:
            return None, None, None
        
        subscription_info = get_tenant_subscription_info(tenant_id)
        if not subscription_info:
            return None, None, None
        
        subscription = subscription_info.get('subscription')
        if not subscription:
            return None, None, None
        
        # Check if subscription is active
        status = subscription_info.get('status') or getattr(subscription, 'status', None)
        if status not in ['active', 'trialing', 'past_due']:
            return None, None, None
        
        # Determine plan type from subscription items
        plan_id = None
        for item in subscription.items.data:
            price_id = item.price.id
            found_plan_id, _ = get_plan_config_by_price_id(price_id)
            if found_plan_id:
                plan_id = found_plan_id
                break
        
        if not plan_id:
            return None, None, None
        
        plan_config = PLAN_CONFIG[plan_id]
        max_users = plan_config.get('max_users', 0)
        
        return plan_id, plan_config, max_users
    except Exception as e:
        logger.error(f"Error getting tenant plan for {tenant_id}: {e}")
        return None, None, None

def count_tenant_users(tenant_id):
    """
    Count the number of users in a tenant by checking all users' app_metadata.
    This ensures we count all users, including those who haven't scanned anything yet.
    """
    try:
        if not tenant_id or not supabase_admin:
            return 0
        
        # Count by checking all users in users table and verifying their tenant_id
        try:
            users_res = supabase_admin.from_('users').select('id').execute()
            tenant_user_count = 0
            if users_res.data:
                for user_record in users_res.data:
                    user_id = user_record.get('id')
                    if user_id:
                        try:
                            user_res = supabase_admin.auth.admin.get_user_by_id(user_id)
                            if user_res and hasattr(user_res, 'user'):
                                user = user_res.user
                                app_meta = getattr(user, 'app_metadata', getattr(user, 'raw_app_meta_data', {}))
                                if app_meta and app_meta.get('tenant_id') == tenant_id:
                                    tenant_user_count += 1
                        except Exception as e:
                            logger.debug(f"Error checking user {user_id} tenant_id: {e}")
                            continue
            return tenant_user_count
        except Exception as e:
            logger.warning(f"Error counting users from users table: {e}")
            return 0
    except Exception as e:
        logger.error(f"Error counting users for tenant {tenant_id}: {e}")
        return 0


def tenant_has_paid_subscription(tenant_id):
    """
    Returns True if the tenant has an active Stripe subscription.
    If no subscription is found or Stripe is not configured, returns False.
    """
    try:
        if not tenant_id:
            return False
        if not stripe.api_key:
            logger.warning("Stripe API key not configured; treating tenant as not subscribed.")
            return False

        subscription_info = get_tenant_subscription_info(tenant_id)
        if not subscription_info:
            return False

        # Prefer stored status, fall back to live subscription object
        status = subscription_info.get('status')
        if not status:
            subscription = subscription_info.get('subscription')
            status = getattr(subscription, 'status', None) if subscription else None

        return status in ['active', 'trialing', 'past_due']
    except Exception as e:
        logger.error(f"Error checking paid subscription for tenant {tenant_id}: {e}")
        return False

def get_trial_start_date(tenant_id, user_id):
    """
    Get the trial start date for a tenant or user.
    For tenants: returns tenant.created_at (when the tenant was created)
    For users without tenant: returns a default date (e.g., 30 days ago) or user creation date
    This ensures we only count scans from when the trial actually started, excluding old test scans.
    Always returns a datetime object with timezone info.
    """
    from datetime import timedelta
    default_date = datetime.now(timezone.utc) - timedelta(days=30)
    
    try:
        if tenant_id and supabase_admin:
            try:
                # Get tenant creation date
                tenant_res = supabase_admin.from_('tenants').select('created_at').eq('id', tenant_id).limit(1).execute()
                if tenant_res.data and len(tenant_res.data) > 0:
                    tenant_created = tenant_res.data[0].get('created_at')
                    if tenant_created:
                        # Parse the date string if it's a string
                        if isinstance(tenant_created, str):
                            # Try parsing ISO format first
                            try:
                                # Handle different ISO formats
                                date_str = tenant_created.replace('Z', '+00:00')
                                parsed_date = datetime.fromisoformat(date_str)
                                # Ensure it has timezone info
                                if parsed_date.tzinfo is None:
                                    parsed_date = parsed_date.replace(tzinfo=timezone.utc)
                                return parsed_date
                            except Exception as parse_error:
                                logger.warning(f"Failed to parse tenant created_at '{tenant_created}': {parse_error}")
                                return default_date
                        # If it's already a datetime object, ensure it has timezone
                        elif isinstance(tenant_created, datetime):
                            if tenant_created.tzinfo is None:
                                return tenant_created.replace(tzinfo=timezone.utc)
                            return tenant_created
                        else:
                            # Try to convert to string and parse
                            try:
                                date_str = str(tenant_created).replace('Z', '+00:00')
                                parsed_date = datetime.fromisoformat(date_str)
                                if parsed_date.tzinfo is None:
                                    parsed_date = parsed_date.replace(tzinfo=timezone.utc)
                                return parsed_date
                            except Exception as parse_error:
                                logger.warning(f"Failed to convert and parse tenant created_at: {parse_error}")
                                return default_date
            except Exception as db_error:
                logger.warning(f"Database error getting tenant {tenant_id} created_at: {db_error}")
                return default_date
        
        # Fallback: if no tenant or tenant not found, use a reasonable default
        # Only count scans from the last 30 days to exclude old test scans
        return default_date
    except Exception as e:
        logger.error(f"Unexpected error getting trial start date for tenant {tenant_id}, user {user_id}: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Default: only count scans from last 30 days
        return default_date

def log_scan_to_history(user_id, tenant_id, code, asin, supabase_client):
    """
    Log a scan to scan_history, but only if this user hasn't already scanned this exact code.
    Returns True if the scan was logged (new scan), False if it was a duplicate.
    """
    import sys
    logger.info(f"{'='*60}")
    logger.info(f"🔍 LOG_SCAN_TO_HISTORY CALLED")
    logger.info(f"   user_id: {user_id}")
    logger.info(f"   tenant_id: {tenant_id}")
    logger.info(f"   code: {code}")
    logger.info(f"   supabase_client: {supabase_client is not None}")
    logger.info(f"{'='*60}")
    
    print(f"\n{'='*60}", flush=True)
    print(f"🔍 LOG_SCAN_TO_HISTORY CALLED", flush=True)
    print(f"   user_id: {user_id}", flush=True)
    print(f"   tenant_id: {tenant_id}", flush=True)
    print(f"   code: {code}", flush=True)
    print(f"   supabase_client: {supabase_client is not None}", flush=True)
    print(f"{'='*60}\n", flush=True)
    sys.stdout.flush()
    
    if not supabase_client:
        error_msg = f"❌❌❌ Cannot log scan: supabase_client is None"
        logger.error(error_msg)
        print(error_msg, flush=True)
        return False
    
    if not user_id:
        error_msg = f"❌❌❌ Cannot log scan: user_id is None or empty (user_id={user_id})"
        logger.error(error_msg)
        print(error_msg, flush=True)
        return False
    
    try:
        # Check if this user has already scanned this exact code
        logger.info(f"🔍 Checking for duplicate scan: user_id={user_id}, code={code}, tenant_id={tenant_id}")
        print(f"🔍 Checking duplicates: user_id={user_id}, code={code}, tenant_id={tenant_id}")
        
        # Build query to check for existing scan
        # Use scanned_code column (this is the actual column name in scan_history table)
        query = supabase_client.from_('scan_history').select('id, user_id, scanned_code, tenant_id').eq('user_id', user_id).eq('scanned_code', code)
        if tenant_id:
            query = query.eq('tenant_id', tenant_id)
            print(f"   Query: user_id={user_id} AND scanned_code={code} AND tenant_id={tenant_id}")
        else:
            # If no tenant_id, check for null tenant_id to avoid duplicates
            query = query.is_('tenant_id', 'null')
            print(f"   Query: user_id={user_id} AND scanned_code={code} AND tenant_id IS NULL")
        
        existing = query.limit(1).execute()
        print(f"   Duplicate check result: {existing.data if hasattr(existing, 'data') else 'No data'}")
        
        # If already scanned, don't count it again
        if existing.data and len(existing.data) > 0:
            logger.info(f"⏭️ Skipping duplicate scan: user {user_id} already scanned code {code} (found {len(existing.data)} existing record(s))")
            print(f"⏭️ DUPLICATE SCAN - NOT COUNTING: code={code}")
            print(f"   Existing record: {existing.data[0]}")
            return False
        else:
            logger.info(f"✅ New scan detected: user {user_id}, code {code} (no duplicates found)")
            print(f"✅ NEW SCAN - WILL COUNT: code={code}")
        
        # This is a new scan - log it
        # Note: scan_history table uses 'scanned_code' column, not 'code' or 'fnsku'
        # The table does NOT have 'asin' column - only: scanned_code, scanned_at, user_id, tenant_id, etc.
        scan_insert = {
            'user_id': user_id,
            'scanned_code': code,
            'scanned_at': datetime.now(timezone.utc).isoformat()
        }
        if tenant_id:
            scan_insert['tenant_id'] = tenant_id
        
        print(f"📝 Inserting scan: {scan_insert}")
        result = supabase_client.table('scan_history').insert(scan_insert).execute()
        
        logger.info(f"✅ Logged new scan to scan_history: user {user_id}, code {code}, tenant_id={tenant_id}")
        logger.info(f"   Insert result: {result.data if hasattr(result, 'data') else 'No data'}")
        print(f"✅✅✅ SCAN LOGGED: user={user_id}, code={code}, tenant={tenant_id}")
        print(f"   Insert result: {result.data if hasattr(result, 'data') else 'No data'}")
        
        # Small delay to ensure database commit completes before counting
        import time
        time.sleep(0.3)  # 300ms delay to allow DB commit to complete
        
        return True
    except Exception as e:
        logger.error(f"❌ Failed to log scan to scan_history: {e}")
        import traceback
        logger.error(f"   Traceback: {traceback.format_exc()}")
        print(f"❌❌❌ SCAN LOG FAILED: {e}")
        print(f"   Traceback: {traceback.format_exc()}")
        return False

if not STRIPE_API_KEY or not STRIPE_WEBHOOK_SECRET:
    logger.error("Stripe API Key or Webhook Secret not found in .env. Stripe integration will fail.")
    logger.error(f"STRIPE_API_KEY: {'SET' if STRIPE_API_KEY else 'MISSING'} (length: {len(STRIPE_API_KEY) if STRIPE_API_KEY else 0})")
    logger.error(f"STRIPE_WEBHOOK_SECRET: {'SET' if STRIPE_WEBHOOK_SECRET else 'MISSING'} (length: {len(STRIPE_WEBHOOK_SECRET) if STRIPE_WEBHOOK_SECRET else 0})")
else:
    logger.info("✅ Stripe API Key and Webhook Secret found in .env")
if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY
    logger.info(f"✅ Stripe API key configured (starts with: {STRIPE_API_KEY[:10]}...)")
else:
    logger.error("❌ STRIPE_API_KEY is empty or None - Stripe will not work!")

# --- Supabase Configuration ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_KEY") # Anon key for RLS-protected access
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") # Service role key for admin operations

if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_KEY:
    logger.error("❌ CRITICAL: Supabase URL or Keys not found in .env. Supabase integration will fail.")
    logger.error(f"   SUPABASE_URL: {'SET' if SUPABASE_URL else 'MISSING'}")
    logger.error(f"   SUPABASE_ANON_KEY: {'SET' if SUPABASE_ANON_KEY else 'MISSING'}")
    logger.error(f"   SUPABASE_SERVICE_KEY: {'SET' if SUPABASE_SERVICE_KEY else 'MISSING'}")
    supabase: Client = None
    supabase_admin: Client = None
else:
    # Client for RLS-protected access (typically using user's JWT)
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    # Client for admin operations (bypasses RLS)
    supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    logger.info("✅ Supabase clients initialized")
    
    # Test connection to api_lookup_cache table
    try:
        test_result = supabase_admin.table('api_lookup_cache').select('id').limit(1).execute()
        logger.info(f"✅ Supabase api_lookup_cache table is accessible")
    except Exception as test_error:
        logger.error(f"❌ CRITICAL: Cannot access api_lookup_cache table: {test_error}")
        logger.error("   Check table exists and service key has proper permissions")

# --- Data Models & Access ---
# For multi-tenancy with Supabase RLS, it's generally recommended to manage
# tenant-specific data (like manifest_data, scan_history, tenants)
# directly through the Supabase Python client within your Flask routes.
# This ensures RLS policies are naturally enforced.

# If you had SQLAlchemy models for 'products' (now 'manifest_data') or 'scan_history',
# you would typically comment them out or adapt them significantly.
# For this example, we'll assume direct Supabase client usage for these tables.

# Example of old SQLAlchemy model (now likely unused for this table):
# class Product(db.Model):
#     __tablename__ = 'manifest_data' # If you were mapping to the new table name
#     id = db.Column(db.Integer, primary_key=True) # Or UUID if primary key changed
#     tenant_id = db.Column(db.GUID) # This would have been added
#     # ... other fields
#     # lpn = db.Column(db.Text) # Now "X-Z ASIN"


# --- Helper Function to Get User and Tenant IDs from JWT ---
def get_ids_from_request():
    user_id = None
    tenant_id = None
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        try:
            if not supabase:
                logger.error("Supabase client not initialized. Cannot get user from token.")
                return None, None
            user_response = supabase.auth.get_user(token)
            if user_response and hasattr(user_response, 'user') and user_response.user:
                user = user_response.user
                user_id = user.id
                # Supabase client might store app_metadata under raw_app_meta_data or app_metadata
                app_meta = getattr(user, 'app_metadata', getattr(user, 'raw_app_meta_data', {}))
                if app_meta and 'tenant_id' in app_meta:
                    tenant_id = app_meta['tenant_id']
                else:
                    logger.warning(f"tenant_id not found in app_metadata for user {user_id}")
            else:
                logger.warning(f"No user object in Supabase get_user response. Token: {token[:10]}...")

        except Exception as e:
            logger.error(f"Error getting user/tenant_id from token: {e}")
    else:
        logger.debug("No Authorization Bearer token found in request headers.")
    return user_id, tenant_id

def get_user_role(user_id):
    """
    Get the user's role from app_metadata or users table.
    Returns the role string ('employee', 'manager', 'admin', 'ceo') or None.
    """
    if not user_id or not supabase_admin:
        return None
    
    try:
        # First try to get from auth.users app_metadata
        user_response = supabase_admin.auth.admin.get_user_by_id(user_id)
        if user_response and hasattr(user_response, 'user'):
            user = user_response.user
            app_meta = getattr(user, 'app_metadata', getattr(user, 'raw_app_meta_data', {}))
            if app_meta and 'role' in app_meta:
                return app_meta['role']
            # Also check user_metadata
            user_meta = getattr(user, 'user_metadata', getattr(user, 'raw_user_meta_data', {}))
            if user_meta and 'role' in user_meta:
                return user_meta['role']
        
        # Fallback: check users table
        user_res = supabase_admin.from_('users').select('role').eq('id', user_id).maybe_single().execute()
        if user_res.data and 'role' in user_res.data:
            return user_res.data['role']
    except Exception as e:
        logger.error(f"Error getting user role for {user_id}: {e}")
    
    return None

def is_ceo_or_admin(user_id):
    """
    Check if the user has CEO or admin role.
    CEO and admin accounts have unlimited scanning without pricing restrictions.
    """
    if not user_id:
        return False
    
    role = get_user_role(user_id)
    is_ceo_admin = role in ['ceo', 'admin']
    
    # Log for debugging
    if is_ceo_admin:
        logger.info(f"✅ CEO/Admin detected: user_id={user_id}, role={role}")
    else:
        logger.debug(f"Regular user: user_id={user_id}, role={role}")
    
    return is_ceo_admin

def is_creator(user_id):
    """
    Check if the user is the creator of the software.
    Only the creator can have or grant CEO role.
    """
    if not user_id:
        return False
    
    # Check by user ID if configured
    if CREATOR_USER_ID and user_id == CREATOR_USER_ID:
        return True
    
    # Check by email if configured
    if CREATOR_EMAIL and supabase_admin:
        try:
            user_response = supabase_admin.auth.admin.get_user_by_id(user_id)
            if user_response and hasattr(user_response, 'user'):
                user = user_response.user
                user_email = getattr(user, 'email', '').strip().lower()
                if user_email == CREATOR_EMAIL:
                    return True
        except Exception as e:
            logger.error(f"Error checking creator status: {e}")
    
    return False

# --- Helper Function to Validate Stripe Price ID ---
def validate_price_id(price_id):
    """Validate that a price ID exists in Stripe before attempting to create a checkout session."""
    if not price_id:
        return False, "Price ID is required"
    
    if not stripe.api_key:
        return False, "Stripe API is not configured"
    
    try:
        # Try to retrieve the price from Stripe to confirm it exists
        stripe.Price.retrieve(price_id)
        return True, None
    except stripe.error.InvalidRequestError as e:
        logger.error(f"Invalid Stripe price ID: {price_id}. Error: {str(e)}")
        return False, f"Invalid price ID: {str(e)}"
    except Exception as e:
        logger.error(f"Error validating Stripe price: {str(e)}")
        return False, f"Error validating price: {str(e)}"

# --- Root/Index Route ---
@app.route('/health', methods=['GET'])
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint to verify backend is running"""
    # Get all registered routes for debugging
    routes = []
    for rule in app.url_map.iter_rules():
        if str(rule).startswith('/api/'):  # Only show API routes
            routes.append({
                'endpoint': rule.endpoint,
                'methods': list(rule.methods - {'HEAD', 'OPTIONS'}),
                'path': str(rule)
            })
    
    return jsonify({
        "status": "healthy",
        "service": "backend",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "api_routes": routes,
        "supabase_configured": supabase_admin is not None,
        "cors_origins": allowed_origins if 'allowed_origins' in globals() else "unknown"
    }), 200

@app.route('/')
def index():
    # Redirect to a frontend page or a marketing page
    # For now, let's assume your React app handles the main UI
    # You might want to redirect to your React app's URL if it's separate
    return "Welcome to the Inventory System API. Please use the frontend application."

# --- NEW SIGNUP & BILLING ROUTES ---
@app.route('/api/signup/', methods=['POST'])
def signup_tenant():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    tenant_name = data.get('tenant_name', 'New Tenant')
    price_id = data.get('price_id') # e.g., STRIPE_STARTER_PLAN_PRICE_ID from .env

    if not all([email, password, price_id]):
        return jsonify({"error": "Email, password, and price_id are required"}), 400
    
    if not supabase_admin:
        return jsonify({"error": "Supabase admin client not configured."}), 500
    if not stripe.api_key:
        return jsonify({"error": "Stripe not configured."}), 500

    new_tenant_id = None
    stripe_customer_id_created = None
    supabase_auth_user_id = None

    try:
        # 1. Create Supabase Auth User first (without tenant_id in app_metadata yet)
        # This allows them to log in even if Stripe checkout is abandoned.
        # tenant_id and role will be added to app_metadata by the webhook after successful payment.
        auth_user_response = supabase_admin.auth.sign_up({
            "email": email,
            "password": password,
            "options": {
                "data": { # This goes into raw_user_meta_data
                    "custom_tenant_name_on_signup": tenant_name,
                }
            }
        })

        if hasattr(auth_user_response, 'user') and auth_user_response.user:
            supabase_auth_user_id = auth_user_response.user.id
            logger.info(f"Supabase auth user created: {supabase_auth_user_id} for email {email}")
        elif hasattr(auth_user_response, 'error') and auth_user_response.error:
            # Handle user already exists - potentially link to existing user or guide to login
            if 'user already registered' in str(auth_user_response.error.message).lower():
                logger.warning(f"User {email} already registered. Attempting to retrieve existing user.")
                # Try to get the existing user to use their ID for Stripe metadata
                # This part needs careful handling if you want to allow existing users to create new tenants/subscriptions
                existing_user_res = supabase_admin.auth.admin.list_users(email=email)
                if existing_user_res and existing_user_res.users:
                    supabase_auth_user_id = existing_user_res.users[0].id
                    logger.info(f"Found existing Supabase auth user: {supabase_auth_user_id} for email {email}")
                else:
                    logger.error(f"User {email} reported as already registered, but could not retrieve their ID.")
                    return jsonify({"error": "User already registered, but failed to retrieve details. Please try logging in."}), 409
            else:
                raise Exception(f"Failed to create Supabase auth user: {auth_user_response.error.message}")
        else:
            raise Exception("Unknown error creating Supabase auth user.")


        # 2. Create a new Tenant record
        tenant_res = supabase_admin.table('tenants').insert({"name": tenant_name}).execute()
        if not tenant_res.data or not tenant_res.data[0]:
            raise Exception(f"Failed to create tenant in database: {tenant_res.error.message if tenant_res.error else 'No data returned'}")
        new_tenant = tenant_res.data[0]
        new_tenant_id = new_tenant['id']
        logger.info(f"Tenant record created in DB: {new_tenant_id} for name {tenant_name}")

        # 3. Create a Stripe Customer
        stripe_customer = stripe.Customer.create(
            email=email,
            name=tenant_name,
            metadata={
                'tenant_id': new_tenant_id,
                'supabase_user_id': supabase_auth_user_id
            }
        )
        stripe_customer_id_created = stripe_customer.id
        logger.info(f"Stripe customer created: {stripe_customer_id_created} for tenant {new_tenant_id}")

        # Update tenant record with stripe_customer_id
        supabase_admin.table('tenants').update({'stripe_customer_id': stripe_customer.id})\
            .eq('id', new_tenant_id).execute()

        # 4. Create Stripe Checkout Session
        # Ensure frontend_url is configured or fallback
        frontend_url = os.environ.get('FRONTEND_BASE_URL', request.host_url.rstrip('/')) 
        
        checkout_session = stripe.checkout.Session.create(
            customer=stripe_customer.id,
            payment_method_types=['card'],
            line_items=[{'price': price_id, 'quantity': 1}],
            mode='subscription',
            success_url=f"{frontend_url}/checkout-success?session_id={{CHECKOUT_SESSION_ID}}", # Redirect to frontend
            cancel_url=f"{frontend_url}/checkout-cancel", # Redirect to frontend
            metadata={ # Crucial for webhook
                'tenant_id': new_tenant_id,
                'supabase_user_id': supabase_auth_user_id
            }
        )
        logger.info(f"Stripe checkout session created for customer {stripe_customer_id_created}")
        return jsonify({'checkout_url': checkout_session.url})

    except Exception as e:
        logger.error(f"Signup error for email {email}: {str(e)}")
        # Attempt rollback/cleanup if partial creation occurred
        if new_tenant_id and not stripe_customer_id_created: # Tenant DB record created but Stripe customer failed
            try:
                supabase_admin.table('tenants').delete().eq('id', new_tenant_id).execute()
                logger.info(f"Rolled back tenant DB record {new_tenant_id}")
            except Exception as db_err:
                logger.error(f"Error rolling back tenant DB record {new_tenant_id}: {db_err}")
        if stripe_customer_id_created: # Stripe customer was created
             # If tenant creation or checkout session failed after Stripe customer creation
            logger.warning(f"Stripe customer {stripe_customer_id_created} was created but signup failed. Manual cleanup might be needed or link on next attempt.")
        # If Supabase auth user was created but process failed, they exist without a tenant.
        # They might try to sign up again, or log in. This needs a strategy.
        return jsonify({"error": f"An error occurred during signup: {str(e)}"}), 500


@app.route('/api/create-checkout-session/', methods=['POST'])
def create_checkout_session():
    data = request.get_json()
    price_id = data.get('price_id')
    user_id, tenant_id = get_ids_from_request()

    # Print what we received for debugging
    print(f"Create checkout session: price_id={price_id}, user_id={user_id}, tenant_id={tenant_id}")

    if not user_id:
        return jsonify({"error": "User not authenticated"}), 401
    if not price_id:
        return jsonify({"error": "Price ID is required"}), 400
    
    # Validate the price ID
    is_valid, error_message = validate_price_id(price_id)
    if not is_valid:
        return jsonify({"error": error_message}), 400
        
    # IMPORTANT: For new users (no tenant_id), we'll create a tenant first
    if not tenant_id:
        print("No existing tenant_id found - this appears to be a new user subscription")
        # This is a new user signing up for their first subscription
        # Let's create a tenant for them
        try:
            # Get user details for tenant name
            user_response = None
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
                if supabase:
                    user_response = supabase.auth.get_user(token)
            
            # Use email as tenant name if available, otherwise use a placeholder
            tenant_name = "New Tenant"
            if user_response and user_response.user and user_response.user.email:
                tenant_name = f"{user_response.user.email}'s Organization"
            
            # 1. Create a new Tenant record
            tenant_res = supabase_admin.table('tenants').insert({"name": tenant_name}).execute()
            if not tenant_res.data:
                raise Exception(f"Failed to create tenant: {tenant_res.error.message if tenant_res.error else 'No data returned'}")
            
            new_tenant = tenant_res.data[0]
            new_tenant_id = new_tenant['id']
            print(f"Created new tenant with ID: {new_tenant_id}")
            
            # 2. Create a Stripe Customer
            stripe_customer = stripe.Customer.create(
                email=user_response.user.email if user_response and user_response.user else None,
                name=tenant_name,
                metadata={'tenant_id': new_tenant_id, 'supabase_user_id': user_id}
            )
            
            # Update tenant with stripe_customer_id
            supabase_admin.table('tenants').update({'stripe_customer_id': stripe_customer.id})\
                .eq('id', new_tenant_id).execute()
            
            # Use the newly created tenant/customer for checkout
            tenant_id = new_tenant_id
            stripe_customer_id = stripe_customer.id
            
        except Exception as e:
            print(f"Error creating tenant for new user: {str(e)}")
            return jsonify({"error": f"Could not set up your account: {str(e)}"}), 500
    else:
        # Existing user with tenant_id, get their Stripe customer ID
        try:
            tenant_res = supabase_admin.table('tenants').select('stripe_customer_id').eq('id', tenant_id).single().execute()
            if not tenant_res.data or not tenant_res.data.get('stripe_customer_id'):
                print(f"Stripe customer ID not found for tenant {tenant_id}")
                return jsonify({"error": "Stripe customer information not found for your account."}), 404
            
            stripe_customer_id = tenant_res.data['stripe_customer_id']
        except Exception as e:
            print(f"Error fetching tenant {tenant_id}: {str(e)}")
            return jsonify({"error": f"An error occurred: {str(e)}"}), 500
    
    if not supabase_admin or not stripe.api_key:
        return jsonify({"error": "Server configuration error."}), 500

    try:
        # Get the frontend URL for success/cancel redirects
        frontend_url = os.environ.get('FRONTEND_BASE_URL', request.host_url.rstrip('/'))
        
        # Determine plan and get usage price ID
        plan_id, plan_config = get_plan_config_by_price_id(price_id)
        usage_price_id = plan_config.get('usage_price_id') if plan_config else None
        
        # Create line items - base subscription + usage-based (if configured)
        line_items = [{'price': price_id, 'quantity': 1}]
        subscription_items = [{'price': price_id}]
        
        # Add usage price if configured (for metered billing)
        if usage_price_id:
            line_items.append({'price': usage_price_id, 'quantity': 0})  # Start at 0 usage
            subscription_items.append({'price': usage_price_id})
            logger.info(f"Adding usage price {usage_price_id} to subscription for plan {plan_id}")
        
        # Create the checkout session
        checkout_session_params = {
            'customer': stripe_customer_id,
            'payment_method_types': ['card'],
            'line_items': line_items,
            'mode': 'subscription',
            'success_url': f"{frontend_url}/checkout-success?session_id={{CHECKOUT_SESSION_ID}}",
            'cancel_url': f"{frontend_url}/checkout-cancel",
            'metadata': {
                'tenant_id': str(tenant_id), 
                'supabase_user_id': user_id,
                'plan_id': plan_id or 'unknown'
            }
        }
        
        # Add subscription_data if usage price is configured
        if usage_price_id:
            checkout_session_params['subscription_data'] = {
                'items': subscription_items,
                'metadata': {
                    'tenant_id': str(tenant_id),
                    'plan_id': plan_id or 'unknown'
                }
            }
        
        checkout_session = stripe.checkout.Session.create(**checkout_session_params)
        
        print(f"Created checkout session: {checkout_session.id}")
        return jsonify({'checkout_url': checkout_session.url})
    except Exception as e:
        print(f"Error creating checkout session: {str(e)}")
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

# Frontend should handle these redirects and display appropriate messages.
# These backend routes are mainly for Stripe to redirect to if direct server-side handling was needed.
@app.route('/checkout-success/') # Example, not directly used if frontend handles it
def checkout_success_server_redirect():
    flash('Subscription successful! Your account is being set up.', 'success')
    frontend_dashboard_url = os.environ.get('FRONTEND_BASE_URL', 'http://localhost:5174') + "/dashboard?payment=success"
    return redirect(frontend_dashboard_url)

@app.route('/checkout-cancel/') # Example, not directly used
def checkout_cancel_server_redirect():
    flash('Subscription process canceled.', 'warning')
    frontend_pricing_url = os.environ.get('FRONTEND_BASE_URL', 'http://localhost:5174') + "/pricing?payment=cancelled"
    return redirect(frontend_pricing_url)


@app.route('/api/stripe/webhook/', methods=['POST'])
def stripe_webhook():
    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')
    event = None

    if not STRIPE_WEBHOOK_SECRET:
        logger.error("Stripe webhook secret not configured.")
        return jsonify({'error': 'Webhook secret not configured'}), 500

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        logger.warning("Stripe webhook: Invalid payload.")
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError:
        logger.warning("Stripe webhook: Invalid signature.")
        return jsonify({'error': 'Invalid signature'}), 400

    event_type = event['type']
    event_data = event['data']['object']
    logger.info(f"Received Stripe webhook: {event_type}")

    try:
        if event_type == 'checkout.session.completed':
            session = event_data
            tenant_id = session.get('metadata', {}).get('tenant_id')
            supabase_user_id = session.get('metadata', {}).get('supabase_user_id')
            stripe_customer_id = session.get('customer')
            stripe_subscription_id = session.get('subscription')

            if not all([tenant_id, supabase_user_id, stripe_customer_id, stripe_subscription_id]):
                logger.error(f"Webhook checkout.session.completed: Missing metadata. Tenant: {tenant_id}, User: {supabase_user_id}, Sub: {stripe_subscription_id}")
                return jsonify({'error': 'Missing crucial metadata in session'}), 400

            # Update Tenant record
            supabase_admin.table('tenants').update({
                'stripe_subscription_id': stripe_subscription_id,
                'stripe_customer_id': stripe_customer_id, # Should match if signup flow was correct
                'subscription_status': 'active' # Or 'trialing' if applicable from Stripe object
            }).eq('id', tenant_id).execute()
            logger.info(f"Tenant {tenant_id} updated with subscription {stripe_subscription_id}, status active.")
            # Update Supabase Auth user's app_metadata
            update_user_res = supabase_admin.auth.admin.update_user_by_id(
                supabase_user_id,
                {'app_metadata': {'tenant_id': tenant_id, 'roles': ['admin']}} # First user is admin
            )
            if hasattr(update_user_res, 'error') and update_user_res.error: # Check for error
                logger.error(f"Webhook: Failed to update user {supabase_user_id} app_metadata: {update_user_res.error.message}")
            else:
                logger.info(f"User {supabase_user_id} app_metadata updated with tenant_id {tenant_id} and admin role.")

        elif event_type == 'invoice.payment_succeeded':
            invoice = event_data
            stripe_subscription_id = invoice.get('subscription')
            if stripe_subscription_id:
                supabase_admin.table('tenants').update({'subscription_status': 'active'})\
                    .eq('stripe_subscription_id', stripe_subscription_id).execute()
                logger.info(f"Subscription {stripe_subscription_id} marked active on invoice.payment_succeeded.")

        elif event_type == 'invoice.payment_failed':
            invoice = event_data
            stripe_subscription_id = invoice.get('subscription')
            if stripe_subscription_id:
                # Determine appropriate status, e.g., 'past_due' or 'unpaid'
                status_to_set = 'past_due' 
                supabase_admin.table('tenants').update({'subscription_status': status_to_set})\
                    .eq('stripe_subscription_id', stripe_subscription_id).execute()
                logger.info(f"Subscription {stripe_subscription_id} status set to {status_to_set} on invoice.payment_failed.")

        elif event_type == 'customer.subscription.updated':
            subscription = event_data
            stripe_subscription_id = subscription.id
            new_status = subscription.status # e.g., active, past_due, trialing, canceled
            # Consider mapping Stripe status to your internal status names if they differ
            supabase_admin.table('tenants').update({'subscription_status': new_status})\
                .eq('stripe_subscription_id', stripe_subscription_id).execute()
            logger.info(f"Subscription {stripe_subscription_id} status updated to {new_status}.")
            
            # If subscription is canceled and has a cancel_at_period_end, status might still be 'active'
            # Stripe sends 'customer.subscription.deleted' when it's truly gone.
            if subscription.cancel_at_period_end and new_status == 'active':
                 logger.info(f"Subscription {stripe_subscription_id} is set to cancel at period end but currently active.")
            elif new_status == 'canceled':
                 logger.info(f"Subscription {stripe_subscription_id} has been canceled.")


        elif event_type == 'customer.subscription.deleted': # Handles cancellations
            subscription = event_data
            stripe_subscription_id = subscription.id
            supabase_admin.table('tenants').update({'subscription_status': 'canceled'})\
                .eq('stripe_subscription_id', stripe_subscription_id).execute()
            logger.info(f"Subscription {stripe_subscription_id} marked as canceled on customer.subscription.deleted.")
        else:
            logger.info(f"Unhandled Stripe event type: {event_type}")

    except Exception as e:
        logger.error(f"Error processing Stripe webhook event {event_type}: {str(e)}")
        return jsonify({'error': 'Webhook processing error'}), 500 # Be cautious with 500s to Stripe

    return jsonify({'status': 'received'}), 200


@app.route('/api/subscription-status', methods=['GET', 'OPTIONS'])
def get_subscription_status():
    """Get the current user's subscription status"""
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        user_id, tenant_id = get_ids_from_request()
        
        if not tenant_id:
            return jsonify({
                'subscription_status': 'incomplete',
                'has_active_subscription': False
            }), 200
        
        # Get tenant subscription status
        if not supabase_admin:
            return jsonify({'error': 'Server configuration error.'}), 500
        
        tenant_res = supabase_admin.table('tenants').select(
            'subscription_status, stripe_subscription_id, stripe_customer_id'
        ).eq('id', tenant_id).single().execute()
        
        if hasattr(tenant_res, 'error') and tenant_res.error:
            logger.error(f"Error fetching tenant {tenant_id} status: {tenant_res.error.message}")
            return jsonify({
                'subscription_status': 'incomplete',
                'has_active_subscription': False
            }), 200
        
        subscription_status = tenant_res.data.get('subscription_status', 'incomplete') if tenant_res.data else 'incomplete'
        has_active_subscription = subscription_status in ['active', 'trialing']
        
        return jsonify({
            'subscription_status': subscription_status,
            'has_active_subscription': has_active_subscription,
            'stripe_subscription_id': tenant_res.data.get('stripe_subscription_id') if tenant_res.data else None,
            'stripe_customer_id': tenant_res.data.get('stripe_customer_id') if tenant_res.data else None
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting subscription status: {str(e)}")
        return jsonify({
            'subscription_status': 'incomplete',
            'has_active_subscription': False,
            'error': str(e)
        }), 200

@app.route('/api/create-customer-portal-session/', methods=['POST'])
def customer_portal():
    user_id, tenant_id = get_ids_from_request()
    if not tenant_id: # Relies on JWT having tenant_id
        return jsonify({'error': 'User or tenant information not found or not linked.'}), 403
    
    if not supabase_admin or not stripe.api_key:
        return jsonify({"error": "Server configuration error."}), 500

    try:
        tenant_res = supabase_admin.table('tenants').select('stripe_customer_id').eq('id', tenant_id).single().execute()
        if not tenant_res.data or not tenant_res.data.get('stripe_customer_id'):
            logger.warning(f"Stripe customer ID not found for tenant_id {tenant_id} when creating portal session.")
            return jsonify({'error': 'Stripe customer information not found for your account.'}), 404
        
        stripe_customer_id = tenant_res.data['stripe_customer_id']
        frontend_settings_url = os.environ.get('FRONTEND_BASE_URL', request.host_url.rstrip('/')) + "/settings" # Adjust to your frontend route

        portal_session = stripe.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url=frontend_settings_url,
        )
        return jsonify({'portal_url': portal_session.url})
    except Exception as e:
        logger.error(f"Error creating customer portal session for tenant {tenant_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500

# --- EXAMPLE MODIFIED DATA ROUTE: INVENTORY ---
@app.route('/inventory') # Assuming this returns JSON for a React frontend
def inventory_list():
    user_id, tenant_id = get_ids_from_request()

    if not tenant_id:
        logger.warning("Access to /inventory denied: No tenant_id found in JWT.")
        return jsonify({"error": "Access denied. No valid tenant association."}), 403

    # Check tenant subscription status using admin client (bypasses RLS for this check)
    if not supabase_admin: return jsonify({"error": "Server configuration error."}), 500
    tenant_q = supabase_admin.table('tenants').select('subscription_status').eq('id', tenant_id).single().execute()
    
    if hasattr(tenant_q, 'error') and tenant_q.error:
        logger.error(f"Error fetching tenant {tenant_id} status: {tenant_q.error.message}")
        return jsonify({"error": "Could not verify tenant status."}), 500

    if not tenant_q.data or tenant_q.data['subscription_status'] not in ['active', 'trialing']:
        logger.warning(f"Access to /inventory denied for tenant {tenant_id}: Subscription status is '{tenant_q.data.get('subscription_status', 'unknown') if tenant_q.data else 'not found'}'")
        return jsonify({"error": "Access denied. Subscription is not active or trialing."}), 403
    
    # --- Proceed with data fetching using the RLS-aware 'supabase' client ---
    # RLS policies on Supabase will automatically filter by the tenant_id from the user's JWT.
    if not supabase: return jsonify({"error": "Server configuration error."}), 500
    
    search_query_param = request.args.get('search_query', '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = 25 
    offset = (page - 1) * per_page

    try:
        query = supabase.table('manifest_data').select('*', count='exact') # RLS is applied here

        if search_query_param:
            # Example: searching in 'title' (if exists) or "X-Z ASIN"
            # Supabase `or` filter for ilike: "column1.ilike.%value%,column2.ilike.%value%"
            # Adjust column names based on your 'manifest_data' table
            search_filter_parts = []
            if "title" in supabase.table('manifest_data').columns: # Hypothetical title column
                 search_filter_parts.append(f"title.ilike.%{search_query_param}%")
            search_filter_parts.append(f"\"X-Z ASIN\".ilike.%{search_query_param}%") # Product identifier
            # Add other searchable columns if needed:
            # search_filter_parts.append(f"fnsku.ilike.%{search_query_param}%")
            # search_filter_parts.append(f"asin.ilike.%{search_query_param}%")
            if search_filter_parts:
                query = query.or_(",".join(search_filter_parts))
        
        query = query.order('id', desc=True).range(offset, offset + per_page - 1) # Example order by 'id'
        
        response = query.execute()

        if hasattr(response, 'error') and response.error:
            raise Exception(response.error.message)

        items_on_page = response.data
        total_items = response.count
        
        return jsonify({
            "items": items_on_page,
            "total_items": total_items,
            "page": page,
            "per_page": per_page,
            "total_pages": (total_items + per_page - 1) // per_page if total_items else 0,
            "search_query": search_query_param
        })

    except Exception as e:
        logger.error(f"Error fetching inventory for tenant {tenant_id}: {e}")
        return jsonify({"error": f"Error fetching inventory: {str(e)}"}), 500

# --- Other existing routes (upload_csv, search, scan_barcode, dashboard, history) ---
# You will need to refactor these routes similar to the /inventory example:
# 1. Call `get_ids_from_request()` to get `user_id` and `tenant_id`.
# 2. Implement authorization checks (is user authenticated? is tenant_id present? is subscription active?).
# 3. Use the RLS-aware `supabase` client for all data interactions with tenant-specific tables.
#    The RLS policies on your Supabase tables will handle the data isolation.
#
# OLD HTML TEMPLATE ROUTE - COMMENTED OUT (React frontend uses /api/import/batch instead)
# The /api/import/batch endpoint handles CSV imports properly with tenant_id
# @app.route('/upload', methods=['GET', 'POST'])
# def upload_csv():
#     user_id, tenant_id = get_ids_from_request()
#     if not tenant_id:
#         if request.method == 'POST':
#             return jsonify({"error": "Access denied. Tenant not identified."}), 403
#         else:
#             return render_template('upload.html', error_message="Access Denied. Please log in.")
#     if request.method == 'POST':
#         if 'csvfile' not in request.files:
#             return jsonify({"error": "No file part in request"}), 400
#         file = request.files['csvfile']
#         if file.filename == '':
#             return jsonify({"error": "No file selected"}), 400
#         if file and file.filename.endswith('.csv'):
#             try:
#                 logger.info(f"CSV upload attempt by tenant {tenant_id}. Use /api/import/batch instead.")
#                 return jsonify({"message": "Please use /api/import/batch endpoint for CSV imports."}), 200
#             except Exception as e:
#                 logger.error(f"Error processing CSV for tenant {tenant_id}: {e}")
#                 return jsonify({"error": f"Error processing CSV: {str(e)}"}), 500
#         else:
#             return jsonify({"error": "Invalid file type. Must be CSV."}), 400
#     return render_template('upload.html')

# ============================================================================
# HELPER FUNCTIONS FOR CSV IMPORT
# ============================================================================

def normalize_identifiers(fnsku=None, asin=None, lpn=None, upc=None):
    """
    Normalize identifiers:
    - Trim whitespace
    - Uppercase fnsku, asin, lpn
    - Fix UPC scientific formats ("12345.0" -> "12345")
    """
    def normalize(value):
        if not value:
            return None
        value = str(value).strip()
        if not value:
            return None
        return value
    
    def normalize_upc(value):
        if not value:
            return None
        value = str(value).strip()
        if not value:
            return None
        # Fix scientific notation (e.g., "12345.0" -> "12345")
        if '.' in value:
            try:
                float_val = float(value)
                if float_val.is_integer():
                    value = str(int(float_val))
            except ValueError:
                pass
        return value
    
    normalized = {
        'fnsku': normalize(fnsku).upper() if fnsku else None,
        'asin': normalize(asin).upper() if asin else None,
        'lpn': normalize(lpn).upper() if lpn else None,
        'upc': normalize_upc(upc) if upc else None
    }
    
    return normalized

def validate_row(fnsku=None, asin=None, lpn=None):
    """
    Validate row: Return False if ALL identifiers are missing.
    At least one of fnsku, asin, or lpn must be present.
    """
    fnsku_valid = fnsku and str(fnsku).strip()
    asin_valid = asin and str(asin).strip()
    lpn_valid = lpn and str(lpn).strip()
    
    # Row is valid if at least one identifier exists
    return bool(fnsku_valid or asin_valid or lpn_valid)

def find_product_in_all_tables(fnsku=None, asin=None, supabase_client=None):
    """
    Check all three tables for a product:
    1. products table
    2. api_lookup_cache table
    
    Returns (product_data, source) where source is 'products', 'api_lookup_cache', or None
    """
    if not supabase_client:
        return None, None
    
    # Step 1: Check products table
    try:
        query = supabase_client.table('products').select('*')
        conditions = []
        if fnsku:
            conditions.append(f"fnsku.eq.{fnsku}")
        if asin:
            conditions.append(f"asin.eq.{asin}")
        
        if conditions:
            result = query.or_(','.join(conditions)).maybe_single().execute()
            if result and result.data:
                return result.data, 'products'
    except Exception as e:
        logger.warning(f"Error checking products table: {str(e)}")
    
    # Step 2: Check api_lookup_cache table
    try:
        query = supabase_client.table('api_lookup_cache').select('*')
        if fnsku:
            result = query.eq('fnsku', fnsku).maybe_single().execute()
            if result and result.data:
                return result.data, 'api_lookup_cache'
        if asin:
            result = query.eq('asin', asin).maybe_single().execute()
            if result and result.data:
                return result.data, 'api_lookup_cache'
    except Exception as e:
        logger.warning(f"Error checking api_lookup_cache table: {str(e)}")
    
    return None, None

def find_manifest_item_by_lpn(lpn, supabase_client=None):
    """
    Find manifest item by LPN in manifest_data table.
    Returns (item_data, product_data) or (None, None)
    """
    if not supabase_client or not lpn:
        return None, None
    
    try:
        # Get manifest item from manifest_data table (LPN is stored in "X-Z ASIN" column)
        result = supabase_client.table('manifest_data').select('*').eq('X-Z ASIN', lpn).maybe_single().execute()
        if result and result.data:
            item_data = result.data
            # Try to get product data from products table if we have fnsku/asin
            product_data = None
            fnsku = item_data.get('Fn Sku')
            asin = item_data.get('B00 Asin')
            if fnsku or asin:
                product_data, _ = find_product_in_all_tables(fnsku=fnsku, asin=asin, supabase_client=supabase_client)
            return item_data, product_data
    except Exception as e:
        logger.warning(f"Error finding manifest item by LPN: {str(e)}")
    
    return None, None

@app.route('/api/import/batch', methods=['POST', 'OPTIONS'])
def batch_import():
    """
    CSV batch import using 3-layer architecture:
    1. products table - Unique product catalog (ON CONFLICT DO NOTHING)
    2. manifest_data table - Physical items (ON CONFLICT DO NOTHING)
    3. api_lookup_cache - Preserved for backward compatibility
    
    Rules:
    - Never fail on duplicates (skip silently)
    - Never break a batch
    - Skip bad rows silently
    """
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        user_id, tenant_id = get_ids_from_request()
        
        if not user_id:
            return jsonify({
                "success": False,
                "error": "unauthorized",
                "message": "User authentication required"
            }), 401
        
        if not supabase_admin:
            return jsonify({
                "success": False,
                "error": "database_error",
                "message": "Database not available"
            }), 500
        
        data = request.get_json()
        if not data:
            return jsonify({
                "success": False,
                "error": "invalid_request",
                "message": "Request body is required"
            }), 400
        
        items = data.get('items', [])
        if not items or not isinstance(items, list):
            return jsonify({
                "success": False,
                "error": "invalid_request",
                "message": "Request must contain 'items' array"
            }), 400
        
        batch_number = data.get('batch', 0)
        csv_headers = data.get('headers', [])
        
        # CSV column mapping - handle both raw CSV rows and pre-normalized data from frontend
        def get_value(row, key):
            """Get value from row, trying various case variations and field names"""
            # Direct key match
            if key in row:
                return row[key]
            # Try lowercase
            if key.lower() in row:
                return row[key.lower()]
            # Try uppercase
            if key.upper() in row:
                return row[key.upper()]
            # Try title case
            if key.title() in row:
                return row[key.title()]
            # Try common variations
            variations = {
                'fnsku': ['fnsku', 'fn_sku', 'fn-sku', 'sku'],
                'asin': ['asin', 'b00_asin', 'b00-asin'],
                'lpn': ['lpn', 'x-z_asin', 'x-z-asin', 'xz_asin'],
                'upc': ['upc', 'barcode', 'ean', 'gtin'],
                'product_name': ['product_name', 'name', 'title', 'description', 'item_name', 'item_desc'],
                'price': ['price', 'retail', 'msrp', 'cost', 'unit_price'],
                'category': ['category', 'type', 'department'],
                'quantity': ['quantity', 'qty', 'units', 'count'],
                'brand': ['brand', 'manufacturer', 'vendor']
            }
            if key in variations:
                for var in variations[key]:
                    if var in row:
                        return row[var]
            return None
        
        # Process each row
        products_to_insert = []
        manifest_data_to_insert = []
        skipped_count = 0
        processed_count = 0
        
        for idx, csv_row in enumerate(items):
            try:
                # Extract values - frontend may send pre-normalized data or raw CSV rows
                # Check if data is already normalized (has clean field names)
                raw_fnsku = get_value(csv_row, 'fnsku')
                raw_asin = get_value(csv_row, 'asin')
                raw_lpn = get_value(csv_row, 'lpn')
                raw_upc = get_value(csv_row, 'upc')
                raw_product_name = get_value(csv_row, 'product_name') or get_value(csv_row, 'name') or get_value(csv_row, 'description')
                raw_price = get_value(csv_row, 'price')
                raw_category = get_value(csv_row, 'category')
                raw_brand = get_value(csv_row, 'brand')
                raw_quantity = get_value(csv_row, 'quantity')
                
                # Normalize identifiers
                normalized = normalize_identifiers(
                    fnsku=raw_fnsku,
                    asin=raw_asin,
                    lpn=raw_lpn,
                    upc=raw_upc
                )
                
                fnsku = normalized['fnsku']
                asin = normalized['asin']
                lpn = normalized['lpn']
                upc = normalized['upc']
                
                # Validate row (must have at least one identifier)
                if not validate_row(fnsku=fnsku, asin=asin, lpn=lpn):
                    skipped_count += 1
                    continue  # Skip silently
                
                processed_count += 1
                
                # Prepare product data (if we have fnsku or asin)
                if fnsku or asin:
                    # IMPORTANT: All objects must have the same keys for bulk insert
                    # Keep all keys even if None (PostgREST requirement)
                    # Clean price: convert to string if numeric, handle None
                    price_str = None
                    if raw_price is not None:
                        if isinstance(raw_price, (int, float)):
                            price_str = str(raw_price)
                        else:
                            try:
                                price_str = str(float(raw_price))
                            except (ValueError, TypeError):
                                price_str = None
                    
                    product_data = {
                        'fnsku': fnsku,
                        'asin': asin,
                        'upc': upc,
                        'title': raw_product_name,
                        'brand': raw_brand,  # Use brand from CSV if available
                        'category': raw_category,
                        'image': None,  # Always include, even if None
                        'price': price_str
                    }
                    # Only include tenant_id if it exists (column may not exist in DB yet)
                    if tenant_id:
                        product_data['tenant_id'] = tenant_id
                    products_to_insert.append(product_data)
                
                # Prepare manifest_data row (if we have lpn)
                if lpn:
                    # Map to manifest_data table columns
                    # IMPORTANT: All objects must have the same keys for bulk insert
                    # Clean price: convert to string if numeric, handle None
                    msrp_str = None
                    if raw_price is not None:
                        if isinstance(raw_price, (int, float)):
                            msrp_str = str(raw_price)
                        else:
                            try:
                                msrp_str = str(float(raw_price))
                            except (ValueError, TypeError):
                                msrp_str = None
                    
                    manifest_row = {
                        'X-Z ASIN': lpn,  # LPN goes in "X-Z ASIN" column
                        'Fn Sku': fnsku,
                        'B00 Asin': asin,
                        'Description': raw_product_name,
                        'MSRP': msrp_str,
                        'Category': raw_category,
                        'UPC': upc,
                        'user_id': user_id  # Required for RLS
                    }
                    # Only include tenant_id if it exists
                    if tenant_id:
                        manifest_row['tenant_id'] = tenant_id
                    manifest_data_to_insert.append(manifest_row)
                
            except Exception as e:
                # Skip row on error (don't break batch)
                logger.warning(f"Error processing row {idx} in batch {batch_number}: {str(e)}")
                skipped_count += 1
                continue
        
        logger.info(f"📦 Batch {batch_number}: Processing {len(items)} items, {processed_count} valid, {skipped_count} skipped")
        logger.info(f"📦 Batch {batch_number}: {len(products_to_insert)} products, {len(manifest_data_to_insert)} manifest_data rows to insert")
        
        # Insert products (ON CONFLICT DO NOTHING) - BULK INSERT via PostgREST
        products_inserted = 0
        if products_to_insert:
            try:
                # Deduplicate products by (fnsku, asin, tenant_id) before inserting
                unique_products = {}
                for product in products_to_insert:
                    key = (product.get('fnsku'), product.get('asin'), product.get('tenant_id'))
                    if key not in unique_products:
                        unique_products[key] = product
                
                products_to_insert = list(unique_products.values())
                logger.info(f"📦 Batch {batch_number}: Deduplicated to {len(products_to_insert)} unique products")
                
                # Bulk insert using PostgREST API with ON CONFLICT DO NOTHING
                supabase_url = os.environ.get("SUPABASE_URL")
                service_key = os.environ.get("SUPABASE_SERVICE_KEY")
                
                if supabase_url and service_key:
                    url = f"{supabase_url}/rest/v1/products"
                    headers = {
                        "apikey": service_key,
                        "Authorization": f"Bearer {service_key}",
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal"  # Return minimal response, handle conflicts gracefully
                    }
                    
                    # Bulk insert all products at once
                    try:
                        response = requests.post(
                            url,
                            headers=headers,
                            json=products_to_insert,  # Send array
                            timeout=30
                        )
                        logger.info(f"📤 Batch {batch_number}: Products insert response: {response.status_code}")
                        
                        if response.status_code in [200, 201]:
                            # With resolution=ignore, PostgREST may return empty array or no data
                            # Check Content-Range header or response body
                            try:
                                inserted_data = response.json()
                                if isinstance(inserted_data, list):
                                    products_inserted = len(inserted_data)
                                    logger.info(f"📊 Batch {batch_number}: Response contains {products_inserted} products")
                                else:
                                    # No data returned (all duplicates or resolution=ignore behavior)
                                    # Estimate based on Content-Range header if available
                                    content_range = response.headers.get('Content-Range', '')
                                    if content_range:
                                        # Format: "0-999/1000" means 1000 items processed
                                        try:
                                            total = int(content_range.split('/')[1])
                                            products_inserted = total
                                        except:
                                            products_inserted = len(products_to_insert)  # Estimate
                                    else:
                                        # Assume all were processed (duplicates skipped silently)
                                        products_inserted = len(products_to_insert)
                                    logger.info(f"📊 Batch {batch_number}: Estimated {products_inserted} products processed")
                            except Exception as parse_error:
                                logger.warning(f"⚠️ Batch {batch_number}: Could not parse products response: {str(parse_error)}")
                                # Assume success if status is 200/201
                                products_inserted = len(products_to_insert)
                            logger.info(f"✅ Batch {batch_number}: Processed {products_inserted} products")
                        elif response.status_code == 409:
                            # Conflict - duplicates detected (items already exist)
                            # This is actually fine - it means the data is already in the database
                            # With unique constraints on fnsku/asin, 409 means all items are duplicates
                            # We'll treat this as success since the data already exists
                            try:
                                inserted_data = response.json()
                                if isinstance(inserted_data, list) and len(inserted_data) > 0:
                                    products_inserted = len(inserted_data)
                                    logger.info(f"📊 Batch {batch_number}: {products_inserted} products inserted despite conflicts")
                                else:
                                    # 409 with no data means all items were duplicates (already exist)
                                    # This is actually fine - count as processed
                                    products_inserted = len(products_to_insert)
                                    logger.info(f"✅ Batch {batch_number}: All {products_inserted} products already exist (duplicates skipped)")
                            except:
                                # Can't parse response, but 409 with unique constraints means duplicates
                                # Count as successfully processed (they already exist)
                                products_inserted = len(products_to_insert)
                                logger.info(f"✅ Batch {batch_number}: All {products_inserted} products already exist (duplicates)")
                        else:
                            error_text = response.text[:500] if response.text else "No error message"
                            logger.error(f"❌ Batch {batch_number}: Products insert failed ({response.status_code}): {error_text}")
                            products_inserted = 0
                    except Exception as bulk_error:
                        logger.error(f"❌ Batch {batch_number}: Bulk products insert error: {str(bulk_error)}")
                        import traceback
                        logger.error(f"Traceback: {traceback.format_exc()}")
                        products_inserted = 0
                else:
                    logger.error(f"❌ Batch {batch_number}: Missing Supabase credentials")
            except Exception as e:
                logger.error(f"Error in products bulk insert: {str(e)}")
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Insert manifest_data (ON CONFLICT DO NOTHING) - BULK INSERT via PostgREST
        manifest_data_inserted = 0
        if manifest_data_to_insert:
            try:
                # Bulk insert using PostgREST API with ON CONFLICT DO NOTHING
                supabase_url = os.environ.get("SUPABASE_URL")
                service_key = os.environ.get("SUPABASE_SERVICE_KEY")
                
                if supabase_url and service_key:
                    url = f"{supabase_url}/rest/v1/manifest_data"
                    headers = {
                        "apikey": service_key,
                        "Authorization": f"Bearer {service_key}",
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal"  # Return minimal response, handle conflicts gracefully
                    }
                    
                    # Bulk insert all manifest_data rows at once
                    try:
                        response = requests.post(
                            url,
                            headers=headers,
                            json=manifest_data_to_insert,  # Send array
                            timeout=30
                        )
                        logger.info(f"📤 Batch {batch_number}: Manifest_data insert response: {response.status_code}")
                        
                        if response.status_code in [200, 201]:
                            # With resolution=ignore, PostgREST may return empty array or no data
                            try:
                                inserted_data = response.json()
                                if isinstance(inserted_data, list):
                                    manifest_data_inserted = len(inserted_data)
                                    logger.info(f"📊 Batch {batch_number}: Response contains {manifest_data_inserted} manifest_data rows")
                                else:
                                    # No data returned (all duplicates or resolution=ignore behavior)
                                    content_range = response.headers.get('Content-Range', '')
                                    if content_range:
                                        try:
                                            total = int(content_range.split('/')[1])
                                            manifest_data_inserted = total
                                        except:
                                            manifest_data_inserted = len(manifest_data_to_insert)
                                    else:
                                        manifest_data_inserted = len(manifest_data_to_insert)
                                    logger.info(f"📊 Batch {batch_number}: Estimated {manifest_data_inserted} manifest_data rows processed")
                            except Exception as parse_error:
                                logger.warning(f"⚠️ Batch {batch_number}: Could not parse manifest_data response: {str(parse_error)}")
                                manifest_data_inserted = len(manifest_data_to_insert)
                            logger.info(f"✅ Batch {batch_number}: Processed {manifest_data_inserted} manifest_data rows")
                        elif response.status_code == 409:
                            # Conflict - duplicates detected (items already exist)
                            # This is actually fine - it means the data is already in the database
                            try:
                                inserted_data = response.json()
                                if isinstance(inserted_data, list) and len(inserted_data) > 0:
                                    manifest_data_inserted = len(inserted_data)
                                    logger.info(f"📊 Batch {batch_number}: {manifest_data_inserted} manifest_data rows inserted despite conflicts")
                                else:
                                    # 409 with no data means all items were duplicates (already exist)
                                    # This is actually fine - count as processed
                                    manifest_data_inserted = len(manifest_data_to_insert)
                                    logger.info(f"✅ Batch {batch_number}: All {manifest_data_inserted} manifest_data rows already exist (duplicates skipped)")
                            except:
                                # Can't parse response, but 409 means duplicates
                                # Count as successfully processed (they already exist)
                                manifest_data_inserted = len(manifest_data_to_insert)
                                logger.info(f"✅ Batch {batch_number}: All {manifest_data_inserted} manifest_data rows already exist (duplicates)")
                            manifest_data_inserted = 0
                        else:
                            error_text = response.text[:500] if response.text else "No error message"
                            logger.error(f"❌ Batch {batch_number}: Manifest_data insert failed ({response.status_code}): {error_text}")
                            manifest_data_inserted = 0
                    except Exception as bulk_error:
                        logger.error(f"❌ Batch {batch_number}: Bulk manifest_data insert error: {str(bulk_error)}")
                        import traceback
                        logger.error(f"Traceback: {traceback.format_exc()}")
                        manifest_data_inserted = 0
                else:
                    logger.error(f"❌ Batch {batch_number}: Missing Supabase credentials")
            except Exception as e:
                logger.error(f"Error in manifest_data bulk insert: {str(e)}")
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Calculate success count (frontend expects 'success' and 'failed')
        success_count = products_inserted + manifest_data_inserted
        failed_count = skipped_count
        
        logger.info(f"✅ Batch {batch_number} complete: {success_count} inserted, {failed_count} skipped")
        
        # Return success summary (matching frontend expectations)
        return jsonify({
            "success": True,
            "processed": len(items),
            "success": success_count,  # Frontend expects this
            "failed": failed_count,    # Frontend expects this
            "products_inserted": products_inserted,
            "manifest_items_inserted": manifest_data_inserted,  # Keep name for frontend compatibility
            "skipped": skipped_count,
            "batch": batch_number
        }), 200
        
    except Exception as e:
        logger.error(f"Error in batch_import: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": str(e)
        }), 500

# OLD HTML TEMPLATE ROUTES - COMMENTED OUT (React frontend handles routing)
# These routes conflict with React Router and are no longer used
# @app.route('/search', methods=['GET'])
# def search():
#     query = request.args.get('query', '').strip()
#     product = None
#     search_performed = bool(query)
#     if query:
#         product = Product.query.filter(
#             (Product.lpn == query) |
#             (Product.asin == query) |
#             (Product.fnsku == query)
#         ).first()
#         if product:
#             try:
#                 history_entry = ScanHistory(product_id=product.id)
#                 db.session.add(history_entry)
#                 db.session.commit()
#             except Exception as e:
#                 db.session.rollback()
#                 print(f"Error logging scan history: {e}")
#     return render_template('search.html', product=product, search_performed=search_performed)

# @app.route('/inventory')
# def inventory():
#     search_query = request.args.get('search_query', '').strip()
#     page = request.args.get('page', 1, type=int)
#     per_page = 25
#     query = Product.query
#     if search_query:
#         search_term = f"%{search_query}%"
#         query = query.filter(
#             Product.lpn.ilike(search_term) |
#             Product.title.ilike(search_term) |
#             Product.asin.ilike(search_term) |
#             Product.fnsku.ilike(search_term)
#         )
#     pagination = query.order_by(Product.title).paginate(page=page, per_page=per_page, error_out=False)
#     products_on_page = pagination.items
#     return render_template('inventory.html', 
#                            products=products_on_page, 
#                            pagination=pagination, 
#                            search_query=search_query)

# @app.route('/scan')
# def scan_barcode():
#     return render_template('scan.html')

# @app.route('/external-scan')
# def external_scan():
#     return render_template('external_scan.html')

@app.route('/api/external-lookup', methods=['POST'])
def external_lookup():
    """Lookup product data from external API using FNSKU - with Supabase caching to avoid duplicate charges"""
    try:
        data = request.get_json()
        fnsku = data.get('fnsku', '').strip().upper()  # Convert to uppercase
        
        if not fnsku:
            return jsonify({
                "success": False,
                "message": "FNSKU is required"
            }), 400
        
        # STEP 1: Check Supabase api_lookup_cache FIRST (no API charge)
        if supabase_admin:
            try:
                # Try to find by FNSKU
                cache_result = supabase_admin.table('api_lookup_cache').select('*').eq('fnsku', fnsku).maybe_single().execute()
                
                if cache_result and hasattr(cache_result, 'data') and cache_result.data:
                    logger.info(f"✅ Found FNSKU {fnsku} in Supabase cache - NO API CHARGE!")
                    cached = cache_result.data
                    
                    # Update last_accessed and lookup_count
                    now = datetime.now(timezone.utc).isoformat()
                    current_count = cached.get('lookup_count') or 0
                    supabase_admin.table('api_lookup_cache').update({
                        'last_accessed': now,
                        'lookup_count': current_count + 1,
                        'updated_at': now
                    }).eq('id', cached['id']).execute()
                    
                    # Log scan to history (even if cached, it counts toward trial limit)
                    # But only count unique scans per user
                    # Note: This endpoint might not have user_id, so check first
                    user_id_from_req, tenant_id_from_req = get_ids_from_request()
                    if user_id_from_req:
                        log_scan_to_history(user_id_from_req, tenant_id_from_req, fnsku, cached.get('asin', ''), supabase_admin)
                    
                    # Extract images from cached data
                    all_images = []
                    try:
                        image_url_data = cached.get('image_url', '')
                        if image_url_data:
                            parsed = json.loads(image_url_data) if isinstance(image_url_data, str) else image_url_data
                            if isinstance(parsed, list):
                                all_images = parsed
                            else:
                                all_images = [image_url_data] if image_url_data else []
                    except:
                        all_images = [cached.get('image_url')] if cached.get('image_url') else []
                    
                    # Extract videos from rainforest_raw_data if available
                    videos = []
                    videos_count = 0
                    if cached.get('rainforest_raw_data'):
                        try:
                            raw_data = cached.get('rainforest_raw_data')
                            if isinstance(raw_data, str):
                                raw_data = json.loads(raw_data)
                            if raw_data and raw_data.get('product'):
                                product = raw_data.get('product')
                                if product.get('videos_additional') and isinstance(product.get('videos_additional'), list):
                                    videos = product.get('videos_additional', [])
                                    videos_count = product.get('videos_count', len(videos))
                        except Exception as video_error:
                            logger.warning(f"Could not extract videos from cache: {video_error}")
                    
                    # Check if cache has complete product data (Rainforest data)
                    cached_asin = cached.get('asin') or ''
                    has_rainforest_data = cached.get('rainforest_raw_data') is not None
                    product_name = cached.get('product_name') or ''
                    
                    # Check if product_name is a placeholder (incomplete data)
                    is_placeholder = (
                        not product_name or 
                        product_name == f"Product {fnsku}" or 
                        product_name.startswith("Amazon Product (ASIN:") or
                        product_name.startswith("FNSKU:") or
                        len(product_name) < 10  # Too short to be a real product name
                    )
                    
                    # Check if we have essential product data
                    has_price = cached.get('price') and float(cached.get('price') or 0) > 0
                    has_image = cached.get('image_url') and len(str(cached.get('image_url', ''))) > 0
                    has_complete_data = not is_placeholder and has_price and (has_image or has_rainforest_data)
                    
                    logger.info(f"📊 Cache completeness check for {fnsku}: ASIN={cached_asin}, has_rainforest={has_rainforest_data}, is_placeholder={is_placeholder}, has_price={has_price}, has_image={has_image}, complete={has_complete_data}")
                    
                    # If we have ASIN but incomplete data, fetch from Rainforest API to enrich
                    if cached_asin and len(cached_asin) >= 10 and RAINFOREST_API_KEY and not has_complete_data:
                        logger.info(f"📦 Cache has ASIN {cached_asin} but incomplete data - fetching from Rainforest API to enrich...")
                        try:
                            rainforest_response = requests.get(
                                'https://api.rainforestapi.com/request',
                                params={
                                    'api_key': RAINFOREST_API_KEY,
                                    'type': 'product',
                                    'amazon_domain': 'amazon.com',
                                    'asin': cached_asin
                                },
                                timeout=15
                            )
                            
                            if rainforest_response.status_code == 200:
                                response_json = rainforest_response.json()
                                if response_json.get('product'):
                                    product = response_json['product']
                                    
                                    # Collect all images
                                    all_images_rainforest = []
                                    main_image = product.get('main_image', {}).get('link')
                                    if main_image:
                                        all_images_rainforest.append(main_image)
                                    images_array = product.get('images', [])
                                    for img in images_array:
                                        img_link = img.get('link') if isinstance(img, dict) else img
                                        if img_link and img_link not in all_images_rainforest:
                                            all_images_rainforest.append(img_link)
                                    
                                    # Use Rainforest data to enrich cached response
                                    enriched_title = product.get('title', '') or cached.get('product_name', '')
                                    enriched_price = product.get('buybox_winner', {}).get('price', {}).get('value') or product.get('price', {}).get('value') or cached.get('price', 0)
                                    enriched_brand = product.get('brand', '') or ''
                                    enriched_category = product.get('category', {}).get('name', '') if isinstance(product.get('category'), dict) else (product.get('category') or cached.get('category', ''))
                                    enriched_description = product.get('description', '') or cached.get('description', '')
                                    
                                    # Use Rainforest images if available, otherwise use cached
                                    if all_images_rainforest:
                                        all_images = all_images_rainforest
                                    
                                    # Extract videos
                                    if product.get('videos_additional'):
                                        videos = product.get('videos_additional', [])
                                        videos_count = product.get('videos_count', len(videos))
                                    
                                    logger.info(f"✅ Enriched cached data with Rainforest API: title={enriched_title[:50]}, price={enriched_price}, brand={enriched_brand}")
                                    
                                    # Return enriched data
                                    product_data = {
                                        "success": True,
                                        "source": "api_cache_enriched",
                                        "asin": cached_asin,
                                        "title": enriched_title,
                                        "price": str(enriched_price) if enriched_price else '',
                                        "fnsku": fnsku,
                                        "image": all_images[0] if all_images else '',
                                        "images": all_images,
                                        "images_count": len(all_images),
                                        "videos": videos,
                                        "videos_count": videos_count,
                                        "image_url": all_images[0] if all_images else '',
                                        "description": enriched_description,
                                        "category": enriched_category,
                                        "brand": enriched_brand,
                                        "upc": cached.get('upc') or '',
                                        "amazon_url": f"https://www.amazon.com/dp/{cached_asin}",
                                        "scan_task_id": cached.get('scan_task_id') or '',
                                        "task_state": cached.get('task_state') or '',
                                        "asin_found": True,
                                        "cost_status": "charged",  # We called Rainforest API
                                        "cached": True,
                                        "message": "Found in cache, enriched with Rainforest API"
                                    }
                                    return jsonify(product_data)
                        except Exception as enrich_error:
                            logger.warning(f"⚠️ Could not enrich cache with Rainforest API: {enrich_error}")
                            # Fall through to return cached data
                    
                    # Return cached data (either complete or incomplete)
                    product_data = {
                        "success": True,
                        "source": "api_cache",
                        "asin": cached.get('asin') or '',
                        "title": cached.get('product_name') or f"Product {fnsku}",
                        "price": str(cached.get('price', 0)) if cached.get('price') else '',
                        "fnsku": fnsku,
                        "image": all_images[0] if all_images else (cached.get('image_url') or ''),
                        "images": all_images,
                        "images_count": len(all_images),
                        "videos": videos,
                        "videos_count": videos_count,
                        "image_url": all_images[0] if all_images else (cached.get('image_url') or ''),
                        "description": cached.get('description') or '',
                        "category": cached.get('category') or '',
                        "brand": '',  # Brand not in cache table
                        "upc": cached.get('upc') or '',
                        "amazon_url": f"https://www.amazon.com/dp/{cached.get('asin')}" if cached.get('asin') else '',
                        "scan_task_id": cached.get('scan_task_id') or '',
                        "task_state": cached.get('task_state') or '',
                        "asin_found": cached.get('asin_found', False),
                        "cost_status": "no_charge",
                        "cached": True,
                        "message": "Found in cache - no API charge"
                    }
                    return jsonify(product_data)
            except Exception as cache_error:
                logger.warning(f"Error checking Supabase cache: {cache_error}")
                # Continue to API call if cache check fails
        
        # STEP 2: Not in cache - proceed with external API call (will be charged)
        logger.info(f"💰 FNSKU {fnsku} not in cache - calling external API (this will be charged)")
        BASE_URL = "https://ato.fnskutoasin.com"
        API_KEY = os.environ.get('FNSKU_API_KEY')
        
        if not API_KEY:
            logger.error("FNSKU_API_KEY not found in environment variables")
            return jsonify({
                "success": False,
                "message": "FNSKU API key not configured. Please set FNSKU_API_KEY in your .env file."
            }), 500
        
        # Try to get existing scan task by barcode first
        lookup_url = f"{BASE_URL}/api/v1/ScanTask/GetByBarCode"
        
        headers = {
            'apiKey': API_KEY,
            'Content-Type': 'application/json'
        }
        
        # Try to lookup existing scan for this barcode
        params = {'BarCode': fnsku}
        response = requests.get(lookup_url, headers=headers, params=params, timeout=30)
        
        scan_data = None
        if response.status_code == 200:
            lookup_result = response.json()
            if lookup_result.get('succeeded') and lookup_result.get('data'):
                scan_data = lookup_result['data']
        
        # If no existing scan found, create a new scan task
        if not scan_data:
            add_scan_url = f"{BASE_URL}/api/v1/ScanTask/AddOrGet"
            
            payload = {
                "barCode": fnsku,
                "callbackUrl": ""  # Optional callback URL
            }
            
            response = requests.post(add_scan_url, headers=headers, json=payload, timeout=30)
            
            if response.status_code == 200:
                add_result = response.json()
                if add_result.get('succeeded') and add_result.get('data'):
                    scan_data = add_result['data']
                else:
                    return jsonify({
                        "success": False,
                        "message": f"Failed to create scan task: {add_result.get('message', 'Unknown error')}"
                    }), 400
            else:
                return jsonify({
                    "success": False,
                    "message": f"External API error: {response.status_code} - {response.text}"
                }), response.status_code
        
        # STEP 3: Process the scan data and extract all information
        if scan_data:
            asin = scan_data.get('asin', '')
            
            # Extract all available data from API response
            # Try to get image URL from various possible fields
            image_url = (scan_data.get('imageUrl') or 
                        scan_data.get('image') or 
                        scan_data.get('mainImage', {}).get('url') if isinstance(scan_data.get('mainImage'), dict) else '' or
                        scan_data.get('images', [{}])[0].get('src') if scan_data.get('images') else '' or
                        '')
            
            # Extract price from various possible fields
            price = (scan_data.get('price') or 
                    scan_data.get('listPrice') or 
                    scan_data.get('msrp') or 
                    0)
            
            # Extract product name/title
            product_name = (scan_data.get('productName') or 
                           scan_data.get('name') or 
                           scan_data.get('title') or 
                           (f"Amazon Product (ASIN: {asin})" if asin else f"Product for FNSKU: {fnsku}"))
            
            # Extract description
            description = scan_data.get('description') or product_name
            
            # Extract category
            category = (scan_data.get('category') or 
                       (scan_data.get('categories', [{}])[0].get('name') if scan_data.get('categories') else '') or
                       'External API')
            
            # Extract UPC
            upc = scan_data.get('upc') or ''
            
            product_data = {
                "success": True,
                "source": "external_api",
                "asin": asin,
                "title": product_name,
                "price": str(price) if price else '',
                "fnsku": fnsku,
                "image_url": image_url,
                "description": description,
                "category": category,
                "upc": upc,
                "amazon_url": f"https://www.amazon.com/dp/{asin}" if asin else '',
                "scan_task_id": scan_data.get('id', ''),
                "task_state": scan_data.get('taskState', ''),
                "assignment_date": scan_data.get('assignmentDate', ''),
                "asin_found": bool(asin and len(asin) >= 10),
                "raw_data": scan_data,  # Include raw response for debugging
                "cost_status": "charged",
                "message": "Found via fnskutoasin.com API (charged lookup)"
            }
            
            # STEP 4: Save ALL data to Supabase cache for future lookups (prevents future charges)
            if supabase_admin:
                try:
                    now = datetime.now(timezone.utc).isoformat()
                    
                    # Check if entry already exists
                    existing = supabase_admin.table('api_lookup_cache').select('id').eq('fnsku', fnsku).maybe_single().execute()
                    
                    cache_data = {
                        'fnsku': fnsku,
                        'asin': asin if asin else None,
                        'product_name': product_name,
                        'description': description,
                        'price': float(price) if price else 0,
                        'category': category,
                        'upc': upc if upc else None,
                        'image_url': image_url if image_url else None,
                        'source': 'fnskutoasin.com',
                        'scan_task_id': scan_data.get('id', ''),
                        'task_state': scan_data.get('taskState', ''),
                        'asin_found': bool(asin and len(asin) >= 10),
                        'last_accessed': now,
                        'updated_at': now
                    }
                    
                    if existing.data:
                        # Update existing entry - increment lookup_count
                        current_count = existing.data.get('lookup_count') or 0
                        cache_data['lookup_count'] = current_count + 1
                        supabase_admin.table('api_lookup_cache').update(cache_data).eq('id', existing.data['id']).execute()
                        logger.info(f"✅ Updated cache entry for FNSKU {fnsku} (lookup #{cache_data['lookup_count']})")
                    else:
                        # Insert new entry
                        cache_data['created_at'] = now
                        cache_data['lookup_count'] = 1
                        supabase_admin.table('api_lookup_cache').insert(cache_data).execute()
                        logger.info(f"✅ Saved new cache entry for FNSKU {fnsku} - future lookups will be FREE!")
                    
                    product_data["saved_to_cache"] = True
                    product_data["message"] = "Found via fnskutoasin.com API (charged lookup) - saved to cache for future use"
                except Exception as save_error:
                    logger.error(f"❌ Failed to save to Supabase cache: {save_error}")
                    product_data["saved_to_cache"] = False
                    # Don't fail the request if cache save fails
            
            return jsonify(product_data)
        else:
            return jsonify({
                "success": False,
                "message": "No data returned from external API"
            }), 404
            
    except requests.exceptions.Timeout:
        return jsonify({
            "success": False,
            "message": "External API request timed out"
        }), 408
    except requests.exceptions.RequestException as e:
        return jsonify({
            "success": False,
            "message": f"External API request failed: {str(e)}"
        }), 500
    except Exception as e:
        logger.error(f"Error in external_lookup: {str(e)}")
        return jsonify({
            "success": False,
            "message": f"Error performing external lookup: {str(e)}"
        }), 500

# ===== NEW UNIFIED SCAN ENDPOINT =====

def detect_code_type(code):
    """Detect the type of barcode (UPC, EAN, ASIN, or FNSKU)"""
    clean_code = code.strip().upper()
    
    # UPC: 12 digits
    if clean_code.isdigit() and len(clean_code) == 12:
        return 'UPC'
    
    # EAN: 13 digits
    if clean_code.isdigit() and len(clean_code) == 13:
        return 'EAN'
    
    # ASIN: Starts with B0 and is 10 characters
    if (clean_code.startswith('B0') and len(clean_code) == 10) or \
       (clean_code.startswith('B') and len(clean_code) == 10 and clean_code[1:3].isdigit()):
        return 'ASIN'
    
    # Default to FNSKU
    return 'FNSKU'

def lookup_upc(upc_code):
    """
    Lookup UPC code using free UPCitemdb API (100 requests/day free)
    Returns product data or None if not found
    """
    try:
        # UPCitemdb free API - no API key needed for basic usage
        url = f"https://api.upcitemdb.com/prod/trial/lookup"
        params = {'upc': upc_code}
        
        logger.info(f"🔍 Looking up UPC {upc_code} via UPCitemdb API (free)")
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('code') == 'OK' and data.get('items') and len(data['items']) > 0:
                item = data['items'][0]
                logger.info(f"✅ Found UPC {upc_code} in UPCitemdb")
                
                # Map UPCitemdb response to our format
                return {
                    'upc': upc_code,
                    'title': item.get('title', ''),
                    'brand': item.get('brand', ''),
                    'description': item.get('description', ''),
                    'category': item.get('category', ''),
                    'images': item.get('images', []),
                    'ean': item.get('ean', ''),
                    'model': item.get('model', ''),
                    'color': item.get('color', ''),
                    'size': item.get('size', ''),
                    'dimension': item.get('dimension', ''),
                    'weight': item.get('weight', ''),
                    'currency': item.get('currency', 'USD'),
                    'lowest_recorded_price': item.get('lowest_recorded_price', 0),
                    'highest_recorded_price': item.get('highest_recorded_price', 0),
                    'offers': item.get('offers', [])
                }
            else:
                logger.info(f"❌ UPC {upc_code} not found in UPCitemdb")
                return None
        else:
            logger.warning(f"⚠️ UPCitemdb API returned status {response.status_code}")
            return None
    except Exception as e:
        logger.error(f"❌ Error looking up UPC {upc_code}: {e}")
        return None

@app.route('/api/scan-count', methods=['GET'])
def get_scan_count():
    """
    Get the current scan count for the authenticated user/tenant.
    Returns scan count and limit for free trial users, or unlimited for paid subscribers.
    """
    try:
        user_id, tenant_id = get_ids_from_request()
        
        if not user_id:
            return jsonify({
                "success": False,
                "error": "unauthorized",
                "message": "User authentication required"
            }), 401
        
        if not supabase_admin:
            return jsonify({
                "success": False,
                "error": "database_error",
                "message": "Database not available"
            }), 500
        
        # Check if user is CEO/admin (unlimited scanning)
        is_ceo_admin = is_ceo_or_admin(user_id)
        user_role = get_user_role(user_id) if user_id else None
        
        # Log CEO/admin status for debugging
        logger.info(f"👤 Scan-count: user_id={user_id}, role={user_role}, is_ceo_admin={is_ceo_admin}")
        
        # CEO accounts completely bypass ALL pricing and trial restrictions
        # Note: Creator check is only for upgrading TO CEO, not for using CEO privileges
        
        # Check if tenant has paid subscription
        is_paid = tenant_has_paid_subscription(tenant_id) if tenant_id else False
        
        # CEO/admin accounts and paid accounts have unlimited scanning
        has_unlimited = is_ceo_admin or is_paid
        
        # Get trial start date to exclude old test scans (only for non-CEO/admin, non-paid users)
        trial_start_date = get_trial_start_date(tenant_id, user_id) if not has_unlimited else None
        
        # Count scans (only after trial start date for free trial users)
        if tenant_id:
            query = supabase_admin.from_('scan_history').select('*', count='exact') \
                .eq('tenant_id', tenant_id)
            # Only count scans after trial start date (excludes old test scans)
            if trial_start_date:
                query = query.gte('scanned_at', trial_start_date.isoformat())
            scan_res = query.execute()
        else:
            query = supabase_admin.from_('scan_history').select('*', count='exact') \
                .eq('user_id', user_id)
            # Only count scans after trial start date (excludes old test scans)
            if trial_start_date:
                query = query.gte('scanned_at', trial_start_date.isoformat())
            scan_res = query.execute()
        
        used_scans = getattr(scan_res, 'count', None)
        if used_scans is None:
            used_scans = len(scan_res.data) if getattr(scan_res, 'data', None) else 0
        
        return jsonify({
            "success": True,
            "used_scans": used_scans,
            "limit": None if has_unlimited else FREE_TRIAL_SCAN_LIMIT,
            "is_paid": is_paid,
            "is_ceo_admin": is_ceo_admin,
            "remaining": None if has_unlimited else max(0, FREE_TRIAL_SCAN_LIMIT - used_scans)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting scan count: {e}")
        return jsonify({
            "success": False,
            "error": "internal_error",
            "message": str(e)
        }), 500

def lookup_product_for_scan(code, code_type, supabase_client=None):
    """
    Lookup product using the 3-layer architecture:
    1. manifest_data (by LPN in "X-Z ASIN" column)
    2. products (by FNSKU/ASIN)
    3. api_lookup_cache (by FNSKU/ASIN)
    
    Returns (product_data, manifest_item_data, source) where source is:
    - 'manifest_data' - Found in manifest_data
    - 'products' - Found in products
    - 'api_lookup_cache' - Found in api_lookup_cache
    - None - Not found
    """
    if not supabase_client:
        return None, None, None
    
    # Normalize code based on type
    code_upper = str(code).strip().upper() if code else None
    
    # Step 1: Check manifest_data by LPN (if code_type is LPN or unknown)
    if code_type == 'LPN' or (code_type not in ['ASIN', 'FNSKU', 'SKU', 'UPC']):
        # Try as LPN (stored in "X-Z ASIN" column in manifest_data)
        item_data, product_data = find_manifest_item_by_lpn(code_upper, supabase_client)
        if item_data:
            # If we have product data, use it
            if product_data:
                return product_data, item_data, 'manifest_data'
            # Otherwise, try to get product by fnsku/asin from item
            fnsku = item_data.get('Fn Sku')
            asin = item_data.get('B00 Asin')
            if fnsku or asin:
                product_data, source = find_product_in_all_tables(
                    fnsku=fnsku,
                    asin=asin,
                    supabase_client=supabase_client
                )
                if product_data:
                    return product_data, item_data, 'manifest_data'
            # Return item data even without product
            return None, item_data, 'manifest_data'
    
    # Step 2: Check products and api_lookup_cache (by FNSKU or ASIN)
    fnsku = code_upper if code_type in ['FNSKU', 'SKU'] else None
    asin = code_upper if code_type == 'ASIN' else None
    
    # If we don't have fnsku/asin from code_type, try to detect
    if not fnsku and not asin:
        # Try as FNSKU first (usually longer)
        if len(code_upper) > 10:
            fnsku = code_upper
        # Try as ASIN (usually 10 chars)
        elif len(code_upper) == 10:
            asin = code_upper
    
    if fnsku or asin:
        product_data, source = find_product_in_all_tables(
            fnsku=fnsku,
            asin=asin,
            supabase_client=supabase_client
        )
        if product_data:
            if source == 'products':
                return product_data, None, 'products'
            elif source == 'api_lookup_cache':
                return product_data, None, 'api_lookup_cache'
    
    return None, None, None

@app.route('/api/scan', methods=['POST'])
def scan_product():
    """
    Unified scan endpoint that handles FNSKU, UPC, EAN → ASIN → Rainforest API → Cache → Response
    Frontend makes ONE request and gets complete product data back.
    """
    try:
        data = request.get_json()
        code = data.get('code', '').strip().upper()  # Convert to uppercase

        # Prefer authenticated user/tenant from JWT; fall back to body user_id if provided
        user_id_from_token, tenant_id = get_ids_from_request()
        user_id_from_body = (data.get('user_id') or '').strip()
        user_id = user_id_from_token or user_id_from_body

        # Detect code type
        code_type = detect_code_type(code)
        
        # Use both print and logger to ensure visibility
        print("\n" + "=" * 60)
        print(f"🔍 SCAN REQUEST RECEIVED")
        print(f"   Code: {code}")
        print(f"   Type: {code_type}")
        print(f"   UserID: {user_id}")
        print(f"   TenantID: {tenant_id}")
        print(f"   Supabase admin client: {supabase_admin is not None}")
        print("=" * 60)
        
        logger.info(f"🔍 ========== SCAN REQUEST RECEIVED ==========")
        logger.info(f"   Code: {code}")
        logger.info(f"   Type: {code_type}")
        logger.info(f"   UserID: {user_id}")
        logger.info(f"   TenantID: {tenant_id}")
        logger.info(f"   Supabase admin client: {supabase_admin is not None}")
        if supabase_admin:
            logger.info(f"   ✅ Supabase is READY for saving to api_lookup_cache")
            print(f"✅ Supabase is READY for saving to api_lookup_cache")
        else:
            logger.error(f"   ❌ Supabase is NOT READY - save will FAIL")
            print(f"❌ Supabase is NOT READY - save will FAIL")
        
        if not code:
            return jsonify({
                "success": False,
                "error": "Invalid code",
                "message": "Code is required"
            }), 400

        if not user_id:
            return jsonify({
                "success": False,
                "error": "unauthorized",
                "message": "User is required to scan products"
            }), 401

        # Get API keys from environment (needed for ASIN, UPC, and FNSKU handling)
        FNSKU_API_KEY = os.environ.get('FNSKU_API_KEY')
        RAINFOREST_API_KEY = os.environ.get('RAINFOREST_API_KEY')

        # --- Free trial enforcement (per tenant, fallback per user) ---
        # CEO and admin accounts bypass all limits and pricing restrictions
        # Check CEO/admin status FIRST before any trial checks
        is_ceo_admin = False
        user_role = None
        
        # ALWAYS check CEO status first, even if supabase_admin is None (we'll try anyway)
        try:
            if user_id:
                user_role = get_user_role(user_id) if supabase_admin else None
                is_ceo_admin = is_ceo_or_admin(user_id) if supabase_admin else False
                
                # Log CEO/admin status for debugging
                logger.info(f"👤 User role check: user_id={user_id}, role={user_role}, is_ceo_admin={is_ceo_admin}")
                print(f"👤 User role check: user_id={user_id}, role={user_role}, is_ceo_admin={is_ceo_admin}")
                
                # CEO accounts completely bypass ALL pricing and trial restrictions
                # Note: Creator check is only for upgrading TO CEO, not for using CEO privileges
                if is_ceo_admin:
                    logger.info(f"✅✅✅ CEO/Admin account detected - BYPASSING ALL TRIAL LIMITS AND PRICING RESTRICTIONS")
                    print(f"✅✅✅ CEO/Admin account - UNLIMITED SCANNING - NO TRIAL CHECKS - SKIPPING ALL PRICING CHECKS")
        except Exception as role_error:
            logger.error(f"Error checking user role: {role_error}")
            print(f"❌ Error checking user role: {role_error}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
        
        # If CEO/admin, completely skip all trial/pricing checks
        if is_ceo_admin:
            logger.info(f"🚀 CEO/Admin account - proceeding with scan without any trial/pricing checks")
            print(f"🚀 CEO/Admin account - proceeding with scan without any trial/pricing checks")
        elif supabase_admin:
            try:
                # Treat tenants without an active subscription as on the free trial
                is_paid = tenant_has_paid_subscription(tenant_id) if tenant_id else False

                # Only check trial limits for non-CEO, non-paid accounts
                if not is_paid:
                    # Get trial start date to exclude old test scans
                    trial_start_date = get_trial_start_date(tenant_id, user_id)
                    
                    # If we have a tenant, count by tenant; otherwise, fall back to user-based counting
                    if tenant_id:
                        logger.info(f"Checking free trial usage for tenant {tenant_id} (trial started: {trial_start_date})")
                        query = supabase_admin.from_('scan_history').select('*', count='exact') \
                            .eq('tenant_id', tenant_id)
                        # Only count scans after trial start date (excludes old test scans)
                        if trial_start_date:
                            query = query.gte('scanned_at', trial_start_date.isoformat())
                        scan_res = query.execute()
                    else:
                        logger.info(f"Checking free trial usage for user {user_id} (no tenant_id, trial started: {trial_start_date})")
                        query = supabase_admin.from_('scan_history').select('*', count='exact') \
                            .eq('user_id', user_id)
                        # Only count scans after trial start date (excludes old test scans)
                        if trial_start_date:
                            query = query.gte('scanned_at', trial_start_date.isoformat())
                        scan_res = query.execute()

                    used_scans = getattr(scan_res, 'count', None)
                    if used_scans is None:
                        used_scans = len(scan_res.data) if getattr(scan_res, 'data', None) else 0

                    logger.info(f"Free trial usage: used_scans={used_scans}, limit={FREE_TRIAL_SCAN_LIMIT}, "
                                f"tenant_id={tenant_id}, user_id={user_id}")

                    if used_scans >= FREE_TRIAL_SCAN_LIMIT:
                        # Block further scans until upgrade
                        return jsonify({
                            "success": False,
                            "error": "trial_limit_reached",
                            "message": f"Your free trial of {FREE_TRIAL_SCAN_LIMIT} scans has been used. "
                                       "Please upgrade to continue scanning.",
                            "used_scans": used_scans,
                            "limit": FREE_TRIAL_SCAN_LIMIT,
                            "tenant_id": tenant_id,
                            "user_id": user_id
                        }), 402  # 402 Payment Required
            except Exception as trial_error:
                logger.error(f"Error enforcing free trial limit: {trial_error}")
                # Fail closed: better to block than incur unexpected costs
                return jsonify({
                    "success": False,
                    "error": "trial_check_failed",
                    "message": "Unable to verify trial usage. Please contact support or try again later."
                }), 500
        
        # Handle ASIN codes directly with Rainforest API
        if code_type == 'ASIN':
            logger.info(f"📦 Detected ASIN code - checking 3-layer architecture")
            asin = code
            
            # NEW: Use 3-layer lookup (manifest_items → products → api_lookup_cache → API)
            product_data, manifest_item_data, source = lookup_product_for_scan(
                code=code,
                code_type='ASIN',
                supabase_client=supabase_admin
            )
            
            # If found in any table, return it
            if product_data or manifest_item_data:
                # Format response based on source
                if source == 'manifest_data' and manifest_item_data:
                    # Return manifest_data row with product data
                    response_data = {
                        "success": True,
                        "asin": asin,
                        "title": product_data.get('title') if product_data else manifest_item_data.get('Description', ''),
                        "price": str(product_data.get('price', '')) if product_data else str(manifest_item_data.get('MSRP', '')),
                        "lpn": manifest_item_data.get('X-Z ASIN', ''),
                        "source": "manifest_data",
                        "cost_status": "no_charge",
                        "cached": True
                    }
                    # Add scan count and return
                    # ... (scan count logic would go here)
                    logger.info(f"✅ Returning manifest_data for ASIN {asin}")
                    return jsonify(response_data)
                elif source in ['products', 'api_lookup_cache']:
                    # Return product data
                    cached = product_data
                    # Format similar to existing cache response
                    response_data = {
                        "success": True,
                        "asin": asin,
                        "title": cached.get('title') or cached.get('product_name', ''),
                        "price": str(cached.get('price', 0)) if cached.get('price') else '',
                        "source": source,
                        "cost_status": "no_charge",
                        "cached": True
                    }
                    logger.info(f"✅ Returning {source} data for ASIN {asin}")
                    return jsonify(response_data)
            
            # Not found in any table - check cache for backward compatibility
            if supabase_admin:
                try:
                    cache_result = supabase_admin.table('api_lookup_cache').select('*').eq('asin', asin).maybe_single().execute()
                    
                    if cache_result and hasattr(cache_result, 'data') and cache_result.data:
                        cached = cache_result.data
                        from datetime import timedelta
                        now = datetime.now(timezone.utc)
                        cached_date = datetime.fromisoformat(cached.get('updated_at', cached.get('created_at', now.isoformat())))
                        age_days = (now - cached_date).days
                        
                        # Update access tracking
                        current_count = cached.get('lookup_count') or 0
                        supabase_admin.table('api_lookup_cache').update({
                            'last_accessed': now.isoformat(),
                            'lookup_count': current_count + 1
                        }).eq('id', cached['id']).execute()
                        
                        # Check if cache has complete product data
                        product_name = cached.get('product_name') or ''
                        is_placeholder = (
                            not product_name or 
                            product_name.startswith("Amazon Product (ASIN:") or
                            product_name.startswith("FNSKU:") or
                            len(product_name) < 10
                        )
                        has_price = cached.get('price') and float(cached.get('price') or 0) > 0
                        has_image = cached.get('image_url') and len(str(cached.get('image_url', ''))) > 0
                        has_rainforest_data = cached.get('rainforest_raw_data') is not None
                        has_complete_data = not is_placeholder and has_price and (has_image or has_rainforest_data)
                        
                        logger.info(f"📊 ASIN cache completeness: is_placeholder={is_placeholder}, has_price={has_price}, has_image={has_image}, complete={has_complete_data}")
                        
                        # If cache is fresh and complete, return it
                        if age_days < 30 and has_complete_data:
                            # Extract images
                            all_images = []
                            try:
                                image_url_data = cached.get('image_url', '')
                                if image_url_data:
                                    parsed = json.loads(image_url_data) if isinstance(image_url_data, str) else image_url_data
                                    if isinstance(parsed, list):
                                        all_images = parsed
                                    else:
                                        all_images = [image_url_data] if image_url_data else []
                            except:
                                all_images = [cached.get('image_url')] if cached.get('image_url') else []
                            
                            # Extract videos
                            videos = []
                            videos_count = 0
                            if cached.get('rainforest_raw_data'):
                                try:
                                    raw_data = cached.get('rainforest_raw_data')
                                    if isinstance(raw_data, str):
                                        raw_data = json.loads(raw_data)
                                    if raw_data and raw_data.get('product'):
                                        product = raw_data.get('product')
                                        if product.get('videos_additional') and isinstance(product.get('videos_additional'), list):
                                            videos = product.get('videos_additional', [])
                                            videos_count = product.get('videos_count', len(videos))
                                except Exception as video_error:
                                    logger.warning(f"Could not extract videos from cache: {video_error}")
                            
                            # Log scan to history
                            scan_was_logged = log_scan_to_history(user_id, tenant_id, asin, asin, supabase_admin)
                            
                            # Get scan count
                            scan_count_data = None
                            if supabase_admin and user_id:
                                try:
                                    is_paid = tenant_has_paid_subscription(tenant_id) if tenant_id else False
                                    if not is_paid and not is_ceo_admin:
                                        trial_start_date = get_trial_start_date(tenant_id, user_id)
                                        if tenant_id:
                                            query = supabase_admin.from_('scan_history').select('*', count='exact').eq('tenant_id', tenant_id)
                                            if trial_start_date:
                                                query = query.gte('scanned_at', trial_start_date.isoformat())
                                            scan_res = query.execute()
                                        else:
                                            query = supabase_admin.from_('scan_history').select('*', count='exact').eq('user_id', user_id)
                                            if trial_start_date:
                                                query = query.gte('scanned_at', trial_start_date.isoformat())
                                            scan_res = query.execute()
                                        
                                        used_scans = getattr(scan_res, 'count', None) or len(scan_res.data) if getattr(scan_res, 'data', None) else 0
                                        scan_count_data = {
                                            'used': used_scans,
                                            'limit': None if is_ceo_admin or is_paid else FREE_TRIAL_SCAN_LIMIT,
                                            'remaining': None if is_ceo_admin or is_paid else max(0, FREE_TRIAL_SCAN_LIMIT - used_scans),
                                            'is_paid': is_paid,
                                            'is_ceo_admin': is_ceo_admin
                                        }
                                    else:
                                        scan_count_data = {
                                            'used': 0,
                                            'limit': None,
                                            'remaining': None,
                                            'is_paid': is_paid,
                                            'is_ceo_admin': is_ceo_admin
                                        }
                                except Exception as count_error:
                                    logger.error(f"Error getting scan count: {count_error}")
                            
                            response_data = {
                                "success": True,
                                "asin": asin,
                                "title": cached.get('product_name', ''),
                                "price": str(cached.get('price', 0)) if cached.get('price') else '',
                                "image": all_images[0] if all_images else (cached.get('image_url') or ''),
                                "images": all_images,
                                "images_count": len(all_images),
                                "videos": videos,
                                "videos_count": videos_count,
                                "brand": cached.get('brand', ''),
                                "category": cached.get('category', ''),
                                "description": cached.get('description', ''),
                                "upc": cached.get('upc', ''),
                                "fnsku": cached.get('fnsku', ''),
                                "amazon_url": f"https://www.amazon.com/dp/{asin}",
                                "source": "cache",
                                "cost_status": "no_charge",
                                "cached": True,
                                "raw": cached
                            }
                            if scan_count_data:
                                response_data['scan_count'] = scan_count_data
                            
                            logger.info(f"✅ Returning cached ASIN data: {asin}")
                            return jsonify(response_data)
                        # If cache is incomplete, fetch fresh data below
                except Exception as cache_error:
                    logger.error(f"Error checking ASIN cache: {cache_error}")
            
            # Not in cache or incomplete - fetch from Rainforest API
            if not RAINFOREST_API_KEY:
                return jsonify({
                    "success": False,
                    "error": "api_key_missing",
                    "message": "Rainforest API key not configured"
                }), 500
            
            logger.info(f"💰 ASIN {asin} not in cache or incomplete - calling Rainforest API (will be charged)")
            
            try:
                rainforest_response = requests.get(
                    'https://api.rainforestapi.com/request',
                    params={
                        'api_key': RAINFOREST_API_KEY,
                        'type': 'product',
                        'amazon_domain': 'amazon.com',
                        'asin': asin
                    },
                    timeout=15
                )
                
                if rainforest_response.status_code == 200:
                    response_json = rainforest_response.json()
                    if response_json.get('product'):
                        product = response_json['product']
                        
                        # Collect all images
                        all_images = []
                        main_image = product.get('main_image', {}).get('link')
                        if main_image:
                            all_images.append(main_image)
                        images_array = product.get('images', [])
                        for img in images_array:
                            img_link = img.get('link') if isinstance(img, dict) else img
                            if img_link and img_link not in all_images:
                                all_images.append(img_link)
                        
                        # Extract product data
                        title = product.get('title', '')
                        price_obj = product.get('buybox_winner', {}).get('price', {}) or product.get('price', {})
                        price = price_obj.get('value') if isinstance(price_obj, dict) else price_obj
                        brand = product.get('brand', '')
                        category_obj = product.get('category', {})
                        category = category_obj.get('name') if isinstance(category_obj, dict) else (category_obj or '')
                        description = product.get('description', '')
                        
                        # Extract videos
                        videos = product.get('videos_additional', []) or []
                        videos_count = product.get('videos_count', len(videos))
                        
                        # Extract UPC if available
                        upc = ''
                        if product.get('upc'):
                            upc = str(product.get('upc'))
                        elif product.get('upcs') and len(product.get('upcs', [])) > 0:
                            upc = str(product.get('upcs')[0])
                        
                        # Log scan to history
                        scan_was_logged = log_scan_to_history(user_id, tenant_id, asin, asin, supabase_admin)
                        
                        # Get scan count
                        scan_count_data = None
                        if supabase_admin and user_id:
                            try:
                                is_paid = tenant_has_paid_subscription(tenant_id) if tenant_id else False
                                if not is_paid and not is_ceo_admin:
                                    trial_start_date = get_trial_start_date(tenant_id, user_id)
                                    if tenant_id:
                                        query = supabase_admin.from_('scan_history').select('*', count='exact').eq('tenant_id', tenant_id)
                                        if trial_start_date:
                                            query = query.gte('scanned_at', trial_start_date.isoformat())
                                        scan_res = query.execute()
                                    else:
                                        query = supabase_admin.from_('scan_history').select('*', count='exact').eq('user_id', user_id)
                                        if trial_start_date:
                                            query = query.gte('scanned_at', trial_start_date.isoformat())
                                        scan_res = query.execute()
                                    
                                    used_scans = getattr(scan_res, 'count', None) or len(scan_res.data) if getattr(scan_res, 'data', None) else 0
                                    scan_count_data = {
                                        'used': used_scans,
                                        'limit': None if is_ceo_admin or is_paid else FREE_TRIAL_SCAN_LIMIT,
                                        'remaining': None if is_ceo_admin or is_paid else max(0, FREE_TRIAL_SCAN_LIMIT - used_scans),
                                        'is_paid': is_paid,
                                        'is_ceo_admin': is_ceo_admin
                                    }
                                else:
                                    scan_count_data = {
                                        'used': 0,
                                        'limit': None,
                                        'remaining': None,
                                        'is_paid': is_paid,
                                        'is_ceo_admin': is_ceo_admin
                                    }
                            except Exception as count_error:
                                logger.error(f"Error getting scan count: {count_error}")
                        
                        # Save to BOTH products and api_lookup_cache (ON CONFLICT DO NOTHING)
                        if supabase_admin:
                            try:
                                now = datetime.now(timezone.utc).isoformat()
                                
                                # Save to products table (ON CONFLICT DO NOTHING)
                                product_data = {
                                    'asin': asin,
                                    'title': title,
                                    'brand': brand,
                                    'category': category,
                                    'image': all_images[0] if all_images else None,
                                    'price': str(price) if price else None,
                                    'upc': upc if upc else None,
                                    'tenant_id': tenant_id  # Add tenant_id for multi-tenancy
                                }
                                product_data = {k: v for k, v in product_data.items() if v is not None}
                                
                                try:
                                    supabase_url = os.environ.get("SUPABASE_URL")
                                    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
                                    if supabase_url and service_key:
                                        url = f"{supabase_url}/rest/v1/products"
                                        headers = {
                                            "apikey": service_key,
                                            "Authorization": f"Bearer {service_key}",
                                            "Content-Type": "application/json",
                                            "Prefer": "resolution=ignore"  # ON CONFLICT DO NOTHING
                                        }
                                        requests.post(url, headers=headers, json=product_data, timeout=10)
                                        logger.info(f"✅ Saved to products table: ASIN {asin}, tenant_id: {tenant_id}")
                                except Exception as product_save_error:
                                    logger.warning(f"Error saving to products table: {str(product_save_error)}")
                                
                                # Save to api_lookup_cache (preserve old data)
                                cache_data = {
                                    'asin': asin,
                                    'product_name': title,
                                    'price': price if price else None,
                                    'brand': brand,
                                    'category': category,
                                    'description': description,
                                    'upc': upc if upc else None,
                                    'image_url': json.dumps(all_images) if all_images else None,
                                    'rainforest_raw_data': json.dumps(response_json),
                                    'last_accessed': now,
                                    'lookup_count': 1,
                                    'updated_at': now
                                }
                                
                                # Check if entry already exists
                                existing = supabase_admin.table('api_lookup_cache').select('id').eq('asin', asin).maybe_single().execute()
                                
                                if existing and existing.data:
                                    supabase_admin.table('api_lookup_cache').update(cache_data).eq('id', existing.data['id']).execute()
                                    logger.info(f"✅ Updated api_lookup_cache entry for ASIN {asin}")
                                else:
                                    cache_data['created_at'] = now
                                    supabase_admin.table('api_lookup_cache').insert(cache_data).execute()
                                    logger.info(f"✅ Saved new api_lookup_cache entry for ASIN {asin}")
                            except Exception as cache_save_error:
                                logger.error(f"Error saving ASIN to cache: {cache_save_error}")
                        
                        response_data = {
                            "success": True,
                            "asin": asin,
                            "title": title,
                            "price": str(price) if price else '',
                            "image": all_images[0] if all_images else '',
                            "images": all_images,
                            "images_count": len(all_images),
                            "videos": videos,
                            "videos_count": videos_count,
                            "brand": brand,
                            "category": category,
                            "description": description,
                            "upc": upc,
                            "fnsku": '',
                            "amazon_url": f"https://www.amazon.com/dp/{asin}",
                            "source": "rainforest_api",
                            "cost_status": "charged",
                            "cached": False
                        }
                        if scan_count_data:
                            response_data['scan_count'] = scan_count_data
                        
                        logger.info(f"✅ Successfully fetched ASIN {asin} from Rainforest API")
                        return jsonify(response_data)
                    else:
                        return jsonify({
                            "success": False,
                            "error": "product_not_found",
                            "message": f"Product with ASIN {asin} not found on Amazon"
                        }), 404
                else:
                    logger.error(f"Rainforest API error: {rainforest_response.status_code}")
                    return jsonify({
                        "success": False,
                        "error": "api_error",
                        "message": f"Rainforest API returned status {rainforest_response.status_code}"
                    }), 500
            except Exception as rainforest_error:
                logger.error(f"Error calling Rainforest API for ASIN {asin}: {rainforest_error}")
                return jsonify({
                    "success": False,
                    "error": "api_error",
                    "message": f"Failed to fetch product data: {str(rainforest_error)}"
                }), 500
        
        # Handle UPC codes with free UPCitemdb API
        if code_type == 'UPC':
            logger.info(f"📦 Detected UPC code - using free UPCitemdb API")
            
            # Check cache first (by UPC)
            if supabase_admin:
                try:
                    cache_result = supabase_admin.table('api_lookup_cache').select('*').eq('upc', code).maybe_single().execute()
                    
                    if cache_result and hasattr(cache_result, 'data') and cache_result.data:
                        cached = cache_result.data
                        from datetime import timedelta
                        now = datetime.now(timezone.utc)
                        cached_date = datetime.fromisoformat(cached.get('updated_at', cached.get('created_at', now.isoformat())))
                        age_days = (now - cached_date).days
                        
                        # Update access tracking
                        current_count = cached.get('lookup_count') or 0
                        supabase_admin.table('api_lookup_cache').update({
                            'last_accessed': now.isoformat(),
                            'lookup_count': current_count + 1
                        }).eq('id', cached['id']).execute()
                        
                        # If cache is fresh (<30 days), return immediately
                        if age_days < 30:
                            # Try to get fresh Amazon price if we have ASIN and Rainforest API key
                            cached_price = cached.get('price', 0) or 0
                            price_source = 'cache'
                            cached_asin = cached.get('asin', '')
                            
                            # If we have ASIN in cache, try to get current Amazon price
                            if cached_asin and len(cached_asin) >= 10 and RAINFOREST_API_KEY:
                                try:
                                    logger.info(f"🔍 Cached UPC has ASIN {cached_asin}, fetching current Amazon price...")
                                    rainforest_response = requests.get(
                                        'https://api.rainforestapi.com/request',
                                        params={
                                            'api_key': RAINFOREST_API_KEY,
                                            'type': 'product',
                                            'amazon_domain': 'amazon.com',
                                            'asin': cached_asin
                                        },
                                        timeout=10
                                    )
                                    
                                    if rainforest_response.status_code == 200:
                                        rainforest_json = rainforest_response.json()
                                        if rainforest_json.get('product'):
                                            product = rainforest_json['product']
                                            buybox_price = product.get('buybox_winner', {}).get('price', {})
                                            if buybox_price:
                                                amazon_price = buybox_price.get('value')
                                                if amazon_price:
                                                    cached_price = amazon_price
                                                    price_source = 'amazon_rainforest'
                                                    logger.info(f"✅ Updated price from Amazon: ${cached_price}")
                                except Exception as rainforest_error:
                                    logger.warning(f"⚠️ Could not fetch Amazon price for cached UPC: {rainforest_error}")
                            
                            # Log scan to history (even if cached, it counts toward trial limit)
                            # But only count unique scans per user
                            print(f"\n🔵🔵🔵 ABOUT TO CALL log_scan_to_history (UPC)")
                            print(f"   user_id: {user_id}")
                            print(f"   tenant_id: {tenant_id}")
                            print(f"   code: {code}")
                            print(f"   supabase_admin: {supabase_admin is not None}")
                            logger.info(f"🔵 Calling log_scan_to_history (UPC): user_id={user_id}, tenant_id={tenant_id}, code={code}")
                            scan_was_logged = log_scan_to_history(user_id, tenant_id, code, cached_asin, supabase_admin)
                            print(f"🔵🔵🔵 log_scan_to_history RETURNED (UPC): {scan_was_logged}")
                            logger.info(f"🔵 log_scan_to_history returned (UPC): {scan_was_logged}")
                            
                            # Get updated scan count for response (always calculate, not just if logged)
                            scan_count_data = None
                            if supabase_admin and user_id:
                                try:
                                    is_paid = tenant_has_paid_subscription(tenant_id) if tenant_id else False
                                    if not is_paid:
                                        # Retry count query up to 5 times if scan was just logged (to account for DB commit delay)
                                        used_scans = 0
                                        max_retries = 5 if scan_was_logged else 1
                                        print(f"\n📊 CALCULATING SCAN COUNT (UPC cached, was_logged={scan_was_logged}, max_retries={max_retries})")
                                        print(f"   user_id: {user_id}")
                                        print(f"   tenant_id: {tenant_id}")
                                        
                                        # Get trial start date to exclude old test scans
                                        try:
                                            trial_start_date = get_trial_start_date(tenant_id, user_id)
                                            print(f"   Trial start date: {trial_start_date}")
                                        except Exception as trial_date_error:
                                            logger.error(f"Error getting trial start date: {trial_date_error}")
                                            print(f"   ❌ Trial date error: {trial_date_error}, using fallback")
                                            # Use fallback: count all scans (better than failing)
                                            from datetime import timedelta
                                            trial_start_date = datetime.now(timezone.utc) - timedelta(days=30)
                                        
                                        for attempt in range(max_retries):
                                            print(f"   Attempt {attempt + 1}/{max_retries}...")
                                            try:
                                                if tenant_id:
                                                    print(f"   Query: tenant_id={tenant_id}, trial_start={trial_start_date}")
                                                    query = supabase_admin.from_('scan_history').select('*', count='exact') \
                                                        .eq('tenant_id', tenant_id)
                                                    # Only count scans after trial start date (excludes old test scans)
                                                    if trial_start_date:
                                                        query = query.gte('scanned_at', trial_start_date.isoformat())
                                                    scan_res = query.execute()
                                                else:
                                                    # Match the insert logic: if no tenant_id, count by user_id only
                                                    print(f"   Query: user_id={user_id} (no tenant_id), trial_start={trial_start_date}")
                                                    query = supabase_admin.from_('scan_history').select('*', count='exact') \
                                                        .eq('user_id', user_id)
                                                    # Only count scans after trial start date (excludes old test scans)
                                                    if trial_start_date:
                                                        query = query.gte('scanned_at', trial_start_date.isoformat())
                                                    scan_res = query.execute()
                                                
                                                used_scans = getattr(scan_res, 'count', None)
                                                if used_scans is None:
                                                    used_scans = len(scan_res.data) if getattr(scan_res, 'data', None) else 0
                                                
                                                print(f"   Count result: {used_scans} scans found")
                                                if hasattr(scan_res, 'data') and scan_res.data:
                                                    print(f"   Sample records: {scan_res.data[:3]}")
                                                
                                                # If scan was logged and count is still 0, wait a bit and retry
                                                if scan_was_logged and used_scans == 0 and attempt < max_retries - 1:
                                                    import time
                                                    wait_time = 0.3 * (attempt + 1)  # Increasing wait time
                                                    print(f"   ⏳ Waiting {wait_time}s before retry...")
                                                    time.sleep(wait_time)
                                                    logger.info(f"   Retry {attempt + 1}/{max_retries}: count was 0, retrying...")
                                                else:
                                                    break
                                            except Exception as query_error:
                                                logger.error(f"Error in scan count query attempt {attempt + 1}: {query_error}")
                                                print(f"   ❌ Query error on attempt {attempt + 1}: {query_error}")
                                                import traceback
                                                logger.error(f"   Traceback: {traceback.format_exc()}")
                                                if attempt == max_retries - 1:
                                                    # Last attempt failed, use fallback
                                                    used_scans = 0
                                                    break
                                                else:
                                                    import time
                                                    time.sleep(0.3 * (attempt + 1))
                                                    continue
                                        
                                        logger.info(f"📊 UPC cached scan count: used={used_scans}, was_logged={scan_was_logged}")
                                        print(f"📊📊📊 FINAL SCAN COUNT (UPC): {used_scans}/{FREE_TRIAL_SCAN_LIMIT} (was_logged={scan_was_logged})")
                                        scan_count_data = {
                                            'used': used_scans,
                                            'limit': FREE_TRIAL_SCAN_LIMIT,
                                            'remaining': max(0, FREE_TRIAL_SCAN_LIMIT - used_scans),
                                            'is_paid': False
                                        }
                                    else:
                                        scan_count_data = {
                                            'used': 0,
                                            'limit': None,
                                            'remaining': None,
                                            'is_paid': True
                                        }
                                except Exception as count_error:
                                    logger.error(f"❌ Failed to get scan count for cached UPC response: {count_error}")
                            
                            response_data = {
                                "success": True,
                                "fnsku": cached.get('fnsku', ''),
                                "asin": cached_asin,
                                "title": cached.get('product_name', ''),
                                "price": str(cached_price) if cached_price else '',
                                "image": cached.get('image_url', ''),
                                "brand": cached.get('brand', ''),
                                "category": cached.get('category', ''),
                                "description": cached.get('description', ''),
                                "upc": cached.get('upc', code),
                                "amazon_url": f"https://www.amazon.com/dp/{cached_asin}" if cached_asin else '',
                                "source": "cache",
                                "price_source": price_source,  # Indicate where price came from
                                "cost_status": "no_charge",
                                "cached": True,
                                "code_type": "UPC",
                                "raw": cached
                            }
                            # Always include scan_count, even if calculation failed (use fallback)
                            if scan_count_data:
                                response_data['scan_count'] = scan_count_data
                            else:
                                # Fallback: return basic count info even if calculation failed
                                logger.warning(f"⚠️ Scan count calculation failed for UPC, using fallback")
                                response_data['scan_count'] = {
                                    'used': 0,
                                    'limit': FREE_TRIAL_SCAN_LIMIT,
                                    'remaining': FREE_TRIAL_SCAN_LIMIT,
                                    'is_paid': False
                                }
                            
                            logger.info(f"✅ Returning cached UPC data for {code} (age: {age_days} days)")
                            return jsonify(response_data)
                except Exception as cache_error:
                    logger.warning(f"Error checking UPC cache: {cache_error}")
            
            # Not in cache - lookup via UPCitemdb
            upc_data = lookup_upc(code)
            
            if upc_data:
                # Get image URL (first image if available)
                image_url = ''
                if upc_data.get('images') and len(upc_data['images']) > 0:
                    image_url = upc_data['images'][0]
                
                # Try to find ASIN from UPCitemdb offers (Amazon offers often have ASINs)
                potential_asin = ''
                amazon_price = None
                price_source = 'upcitemdb'  # Track where price came from
                
                # Check offers for Amazon ASIN
                offers = upc_data.get('offers', [])
                for offer in offers:
                    if isinstance(offer, dict):
                        # Check if this is an Amazon offer
                        merchant = offer.get('merchant', '').lower()
                        if 'amazon' in merchant:
                            potential_asin = offer.get('asin', '') or offer.get('link', '').split('/dp/')[-1].split('/')[0] if '/dp/' in offer.get('link', '') else ''
                            # Try to get price from Amazon offer
                            if offer.get('price'):
                                try:
                                    amazon_price = float(offer.get('price', 0))
                                    price_source = 'amazon_offer'
                                except:
                                    pass
                
                # If we found an ASIN, try to get actual Amazon price from Rainforest API
                if potential_asin and len(potential_asin) >= 10 and RAINFOREST_API_KEY:
                    try:
                        logger.info(f"🔍 Found ASIN {potential_asin} from UPCitemdb, fetching Amazon price from Rainforest API...")
                        rainforest_response = requests.get(
                            'https://api.rainforestapi.com/request',
                            params={
                                'api_key': RAINFOREST_API_KEY,
                                'type': 'product',
                                'amazon_domain': 'amazon.com',
                                'asin': potential_asin
                            },
                            timeout=10
                        )
                        
                        if rainforest_response.status_code == 200:
                            rainforest_json = rainforest_response.json()
                            if rainforest_json.get('product'):
                                product = rainforest_json['product']
                                # Get buybox price (actual Amazon price)
                                buybox_price = product.get('buybox_winner', {}).get('price', {})
                                if buybox_price:
                                    amazon_price = buybox_price.get('value')
                                    if amazon_price:
                                        price_source = 'amazon_rainforest'
                                        logger.info(f"✅ Got Amazon price from Rainforest: ${amazon_price}")
                                # Also update ASIN if we got it from Rainforest
                                if product.get('asin'):
                                    potential_asin = product.get('asin')
                    except Exception as rainforest_error:
                        logger.warning(f"⚠️ Could not fetch Amazon price from Rainforest: {rainforest_error}")
                
                # Use Amazon price if available, otherwise fall back to UPCitemdb price
                if amazon_price:
                    price = amazon_price
                else:
                    # Get price from UPCitemdb (generic retail price)
                    price = upc_data.get('lowest_recorded_price', 0) or upc_data.get('highest_recorded_price', 0) or 0
                
                # Store the ASIN if we found one
                found_asin = potential_asin if len(potential_asin) >= 10 else ''
                
                # Log scan to history (even if not cached, it counts toward trial limit)
                scan_was_logged = False
                if supabase_admin and user_id:
                    scan_was_logged = log_scan_to_history(user_id, tenant_id, code, '', supabase_admin)
                    logger.info(f"📝 Logged UPC scan to history: {scan_was_logged}")
                
                # Save to cache
                if supabase_admin:
                    try:
                        now = datetime.now(timezone.utc).isoformat()
                        cache_data = {
                            'upc': code,
                            'fnsku': '',  # UPCs don't have FNSKUs
                            'asin': found_asin,  # ASIN found from offers or Rainforest
                            'product_name': upc_data.get('title', ''),
                            'description': upc_data.get('description', ''),
                            'price': price,
                            'category': upc_data.get('category', ''),
                            'image_url': image_url,
                            'source': 'upcitemdb',
                            'last_accessed': now,
                            'lookup_count': 1,
                            'created_at': now,
                            'updated_at': now
                        }
                        
                        # Check if exists
                        existing = supabase_admin.table('api_lookup_cache').select('id').eq('upc', code).maybe_single().execute()
                        if existing and hasattr(existing, 'data') and existing.data:
                            supabase_admin.table('api_lookup_cache').update(cache_data).eq('upc', code).execute()
                        else:
                            supabase_admin.table('api_lookup_cache').insert(cache_data).execute()
                        logger.info(f"✅ Saved UPC {code} to cache")
                    except Exception as save_error:
                        logger.warning(f"⚠️ Could not save UPC to cache: {save_error}")
                
                # Get scan count for response
                scan_count_data = None
                if supabase_admin and user_id:
                    try:
                        is_paid = tenant_has_paid_subscription(tenant_id) if tenant_id else False
                        if not is_paid:
                            # Get trial start date to exclude old test scans
                            try:
                                trial_start_date = get_trial_start_date(tenant_id, user_id)
                            except Exception as trial_date_error:
                                logger.error(f"Error getting trial start date: {trial_date_error}")
                                from datetime import timedelta
                                trial_start_date = datetime.now(timezone.utc) - timedelta(days=30)
                            
                            # Count scans
                            max_retries = 5 if scan_was_logged else 1
                            used_scans = 0
                            for attempt in range(max_retries):
                                try:
                                    if tenant_id:
                                        query = supabase_admin.from_('scan_history').select('*', count='exact') \
                                            .eq('tenant_id', tenant_id)
                                        if trial_start_date:
                                            query = query.gte('scanned_at', trial_start_date.isoformat())
                                        scan_res = query.execute()
                                    else:
                                        query = supabase_admin.from_('scan_history').select('*', count='exact') \
                                            .eq('user_id', user_id)
                                        if trial_start_date:
                                            query = query.gte('scanned_at', trial_start_date.isoformat())
                                        scan_res = query.execute()
                                    
                                    used_scans = getattr(scan_res, 'count', None)
                                    if used_scans is None:
                                        used_scans = len(scan_res.data) if getattr(scan_res, 'data', None) else 0
                                    
                                    if scan_was_logged and used_scans == 0 and attempt < max_retries - 1:
                                        import time
                                        time.sleep(0.3 * (attempt + 1))
                                        continue
                                    else:
                                        break
                                except Exception as query_error:
                                    logger.error(f"Error in scan count query: {query_error}")
                                    if attempt == max_retries - 1:
                                        used_scans = 0
                                        break
                                    import time
                                    time.sleep(0.3 * (attempt + 1))
                            
                            scan_count_data = {
                                'used': used_scans,
                                'limit': FREE_TRIAL_SCAN_LIMIT,
                                'remaining': max(0, FREE_TRIAL_SCAN_LIMIT - used_scans),
                                'is_paid': False
                            }
                        else:
                            scan_count_data = {
                                'used': 0,
                                'limit': None,
                                'remaining': None,
                                'is_paid': True
                            }
                    except Exception as count_error:
                        logger.error(f"❌ Failed to get scan count for UPC response: {count_error}")
                        scan_count_data = {
                            'used': 0,
                            'limit': FREE_TRIAL_SCAN_LIMIT,
                            'remaining': FREE_TRIAL_SCAN_LIMIT,
                            'is_paid': False
                        }
                
                response_data = {
                    "success": True,
                    "fnsku": '',
                    "asin": found_asin,
                    "title": upc_data.get('title', ''),
                    "price": str(price) if price else '',
                    "image": image_url,
                    "brand": upc_data.get('brand', ''),
                    "category": upc_data.get('category', ''),
                    "description": upc_data.get('description', ''),
                    "upc": code,
                    "amazon_url": f"https://www.amazon.com/dp/{found_asin}" if found_asin else '',
                    "source": "upcitemdb",
                    "price_source": price_source,  # Indicate where price came from
                    "cost_status": "free",
                    "cached": False,
                    "code_type": "UPC",
                    "raw": upc_data
                }
                
                # Always include scan_count
                if scan_count_data:
                    response_data['scan_count'] = scan_count_data
                else:
                    response_data['scan_count'] = {
                        'used': 0,
                        'limit': FREE_TRIAL_SCAN_LIMIT,
                        'remaining': FREE_TRIAL_SCAN_LIMIT,
                        'is_paid': False
                    }
                
                logger.info(f"✅ Returning UPC data from UPCitemdb for {code}")
                return jsonify(response_data)
            else:
                return jsonify({
                    "success": False,
                    "error": "UPC not found",
                    "message": f"UPC {code} not found in UPCitemdb database",
                    "code_type": "UPC"
                }), 404
        
        # Continue with existing FNSKU logic for non-UPC codes
        
        # API keys already retrieved above (at the start of the function)
        if not FNSKU_API_KEY:
            logger.error("FNSKU_API_KEY not found in environment variables")
            return jsonify({
                "success": False,
                "error": "Unauthorized API key",
                "message": "FNSKU API key not configured"
            }), 500
        
        # STEP 1: Check Supabase cache first (instant return if cached)
        # Check by FNSKU for FNSKU codes, by UPC for UPC codes
        if supabase_admin:
            try:
                logger.info(f"🔍 Checking cache for {code_type} code: {code}")
                if code_type == 'UPC':
                    cache_result = supabase_admin.table('api_lookup_cache').select('*').eq('upc', code).maybe_single().execute()
                    logger.info(f"   Cache query: looking for UPC={code}")
                else:
                    cache_result = supabase_admin.table('api_lookup_cache').select('*').eq('fnsku', code).maybe_single().execute()
                    logger.info(f"   Cache query: looking for FNSKU={code}")
                
                if cache_result and hasattr(cache_result, 'data') and cache_result.data:
                    logger.info(f"✅✅✅ FOUND IN CACHE! Code: {code}, ASIN: {cache_result.data.get('asin', 'N/A')}")
                    print(f"✅✅✅ FOUND IN CACHE! Code: {code}")
                    cached = cache_result.data
                    from datetime import timedelta
                    now = datetime.now(timezone.utc)
                    cached_date = datetime.fromisoformat(cached.get('updated_at', cached.get('created_at', now.isoformat())))
                    age_days = (now - cached_date).days
                    
                    # Update access tracking
                    current_count = cached.get('lookup_count') or 0
                    supabase_admin.table('api_lookup_cache').update({
                        'last_accessed': now.isoformat(),
                        'lookup_count': current_count + 1
                    }).eq('id', cached['id']).execute()
                    
                    # If cache is fresh (<30 days), return immediately (even if some fields are missing)
                    # We'll return cached data if it exists, regardless of completeness
                    if age_days < 30:
                        logger.info(f"✅ Found cached data for {code_type} {code} (age: {age_days} days)")
                        # Log scan to history (even if cached, it counts toward trial limit)
                        # But only count unique scans per user
                        print(f"\n🔵🔵🔵 ABOUT TO CALL log_scan_to_history")
                        print(f"   user_id: {user_id}")
                        print(f"   tenant_id: {tenant_id}")
                        print(f"   code: {code}")
                        print(f"   supabase_admin: {supabase_admin is not None}")
                        logger.info(f"🔵 Calling log_scan_to_history: user_id={user_id}, tenant_id={tenant_id}, code={code}")
                        scan_was_logged = log_scan_to_history(user_id, tenant_id, code, cached.get('asin', ''), supabase_admin)
                        print(f"🔵🔵🔵 log_scan_to_history RETURNED: {scan_was_logged}")
                        logger.info(f"🔵 log_scan_to_history returned: {scan_was_logged}")
                        
                        # Get updated scan count for response (always calculate, not just if logged)
                        scan_count_data = None
                        if supabase_admin and user_id:
                            try:
                                is_paid = tenant_has_paid_subscription(tenant_id) if tenant_id else False
                                if not is_paid:
                                    # Retry count query up to 5 times if scan was just logged (to account for DB commit delay)
                                    used_scans = 0
                                    max_retries = 5 if scan_was_logged else 1
                                    print(f"\n📊 CALCULATING SCAN COUNT (was_logged={scan_was_logged}, max_retries={max_retries})")
                                    print(f"   user_id: {user_id}")
                                    print(f"   tenant_id: {tenant_id}")
                                    
                                    # Get trial start date to exclude old test scans
                                    trial_start_date = get_trial_start_date(tenant_id, user_id)
                                    
                                    for attempt in range(max_retries):
                                        print(f"   Attempt {attempt + 1}/{max_retries}...")
                                        if tenant_id:
                                            print(f"   Query: tenant_id={tenant_id}, trial_start={trial_start_date}")
                                            query = supabase_admin.from_('scan_history').select('*', count='exact') \
                                                .eq('tenant_id', tenant_id)
                                            # Only count scans after trial start date (excludes old test scans)
                                            if trial_start_date:
                                                query = query.gte('scanned_at', trial_start_date.isoformat())
                                            scan_res = query.execute()
                                        else:
                                            # Match the insert logic: if no tenant_id, count by user_id only
                                            print(f"   Query: user_id={user_id} (no tenant_id), trial_start={trial_start_date}")
                                            query = supabase_admin.from_('scan_history').select('*', count='exact') \
                                                .eq('user_id', user_id)
                                            # Only count scans after trial start date (excludes old test scans)
                                            if trial_start_date:
                                                query = query.gte('scanned_at', trial_start_date.isoformat())
                                            scan_res = query.execute()
                                        
                                        used_scans = getattr(scan_res, 'count', None)
                                        if used_scans is None:
                                            used_scans = len(scan_res.data) if getattr(scan_res, 'data', None) else 0
                                        
                                        print(f"   Count result: {used_scans} scans found")
                                        if hasattr(scan_res, 'data') and scan_res.data:
                                            print(f"   Sample records: {scan_res.data[:3]}")
                                        
                                        # If scan was logged and count is still 0, wait a bit and retry
                                        if scan_was_logged and used_scans == 0 and attempt < max_retries - 1:
                                            import time
                                            wait_time = 0.3 * (attempt + 1)  # Increasing wait time
                                            print(f"   ⏳ Waiting {wait_time}s before retry...")
                                            time.sleep(wait_time)
                                            logger.info(f"   Retry {attempt + 1}/{max_retries}: count was 0, retrying...")
                                        else:
                                            break
                                    
                                    logger.info(f"📊 FNSKU cached scan count: used={used_scans}, was_logged={scan_was_logged}, limit={FREE_TRIAL_SCAN_LIMIT}")
                                    print(f"📊📊📊 FINAL SCAN COUNT: {used_scans}/{FREE_TRIAL_SCAN_LIMIT} (was_logged={scan_was_logged})")
                                    scan_count_data = {
                                        'used': used_scans,
                                        'limit': FREE_TRIAL_SCAN_LIMIT,
                                        'remaining': max(0, FREE_TRIAL_SCAN_LIMIT - used_scans),
                                        'is_paid': False
                                    }
                                else:
                                    scan_count_data = {
                                        'used': 0,
                                        'limit': None,
                                        'remaining': None,
                                        'is_paid': True
                                    }
                            except Exception as count_error:
                                logger.error(f"❌ Failed to get scan count for cached FNSKU response: {count_error}")
                        
                        # Extract images from cached data
                        all_images = []
                        try:
                            image_url_data = cached.get('image_url', '')
                            if image_url_data:
                                parsed = json.loads(image_url_data) if isinstance(image_url_data, str) else image_url_data
                                if isinstance(parsed, list):
                                    all_images = parsed
                                else:
                                    all_images = [image_url_data] if image_url_data else []
                        except:
                            all_images = [cached.get('image_url')] if cached.get('image_url') else []
                        
                        # Extract videos from rainforest_raw_data if available
                        videos = []
                        videos_count = 0
                        if cached.get('rainforest_raw_data'):
                            try:
                                raw_data = cached.get('rainforest_raw_data')
                                if isinstance(raw_data, str):
                                    raw_data = json.loads(raw_data)
                                if raw_data and raw_data.get('product'):
                                    product = raw_data.get('product')
                                    if product.get('videos_additional') and isinstance(product.get('videos_additional'), list):
                                        videos = product.get('videos_additional', [])
                                        videos_count = product.get('videos_count', len(videos))
                            except Exception as video_error:
                                logger.warning(f"Could not extract videos from cache: {video_error}")
                        
                        # Check if cache has complete product data (Rainforest data)
                        cached_asin = cached.get('asin') or ''
                        has_rainforest_data = cached.get('rainforest_raw_data') is not None
                        product_name = cached.get('product_name') or ''
                        
                        # Check if product_name is a placeholder (incomplete data)
                        is_placeholder = (
                            not product_name or 
                            product_name == f"Product {code}" or 
                            product_name.startswith("Amazon Product (ASIN:") or
                            product_name.startswith("FNSKU:") or
                            len(product_name) < 10  # Too short to be a real product name
                        )
                        
                        # Check if we have essential product data
                        has_price = cached.get('price') and float(cached.get('price') or 0) > 0
                        has_image = cached.get('image_url') and len(str(cached.get('image_url', ''))) > 0
                        has_complete_data = not is_placeholder and has_price and (has_image or has_rainforest_data)
                        
                        logger.info(f"📊 Cache completeness check for {code}: ASIN={cached_asin}, has_rainforest={has_rainforest_data}, is_placeholder={is_placeholder}, has_price={has_price}, has_image={has_image}, complete={has_complete_data}")
                        
                        # If we have ASIN but incomplete data, fetch from Rainforest API to enrich
                        if cached_asin and len(cached_asin) >= 10 and RAINFOREST_API_KEY and not has_complete_data:
                            logger.info(f"📦 Cache has ASIN {cached_asin} but incomplete data - fetching from Rainforest API to enrich...")
                            try:
                                rainforest_response = requests.get(
                                    'https://api.rainforestapi.com/request',
                                    params={
                                        'api_key': RAINFOREST_API_KEY,
                                        'type': 'product',
                                        'amazon_domain': 'amazon.com',
                                        'asin': cached_asin
                                    },
                                    timeout=15
                                )
                                
                                if rainforest_response.status_code == 200:
                                    response_json = rainforest_response.json()
                                    if response_json.get('product'):
                                        product = response_json['product']
                                        
                                        # Collect all images
                                        all_images_rainforest = []
                                        main_image = product.get('main_image', {}).get('link')
                                        if main_image:
                                            all_images_rainforest.append(main_image)
                                        images_array = product.get('images', [])
                                        for img in images_array:
                                            img_link = img.get('link') if isinstance(img, dict) else img
                                            if img_link and img_link not in all_images_rainforest:
                                                all_images_rainforest.append(img_link)
                                        
                                        # Use Rainforest data to enrich cached response
                                        enriched_title = product.get('title', '') or cached.get('product_name', '')
                                        enriched_price = product.get('buybox_winner', {}).get('price', {}).get('value') or product.get('price', {}).get('value') or cached.get('price', 0)
                                        enriched_brand = product.get('brand', '') or ''
                                        enriched_category = product.get('category', {}).get('name', '') if isinstance(product.get('category'), dict) else (product.get('category') or cached.get('category', ''))
                                        enriched_description = product.get('description', '') or cached.get('description', '')
                                        
                                        # Use Rainforest images if available, otherwise use cached
                                        if all_images_rainforest:
                                            all_images = all_images_rainforest
                                        
                                        # Extract videos
                                        if product.get('videos_additional'):
                                            videos = product.get('videos_additional', [])
                                            videos_count = product.get('videos_count', len(videos))
                                        
                                        logger.info(f"✅ Enriched cached data with Rainforest API: title={enriched_title[:50]}, price={enriched_price}, brand={enriched_brand}")
                                        
                                        # Build enriched response
                                        response_data = {
                                            "success": True,
                                            "fnsku": cached.get('fnsku', code),
                                            "asin": cached_asin,
                                            "title": enriched_title,
                                            "price": str(enriched_price) if enriched_price else '',
                                            "image": all_images[0] if all_images else '',
                                            "images": all_images,
                                            "images_count": len(all_images),
                                            "videos": videos,
                                            "videos_count": videos_count,
                                            "brand": enriched_brand,
                                            "category": enriched_category,
                                            "description": enriched_description,
                                            "upc": cached.get('upc', ''),
                                            "amazon_url": f"https://www.amazon.com/dp/{cached_asin}",
                                            "source": "cache_enriched",
                                            "cost_status": "charged",  # We called Rainforest API
                                            "cached": True,
                                            "raw": cached
                                        }
                                        
                                        # Add scan_count if available
                                        if scan_count_data:
                                            response_data['scan_count'] = scan_count_data
                                        
                                        logger.info(f"✅ Returning enriched cached data for {code_type} {code}")
                                        return jsonify(response_data)
                            except Exception as enrich_error:
                                logger.warning(f"⚠️ Could not enrich cache with Rainforest API: {enrich_error}")
                                # Fall through to return cached data
                        
                        response_data = {
                            "success": True,
                            "fnsku": cached.get('fnsku', code),
                            "asin": cached.get('asin', ''),
                            "title": cached.get('product_name', ''),
                            "price": str(cached.get('price', 0)) if cached.get('price') else '',
                            "image": all_images[0] if all_images else (cached.get('image_url') or ''),
                            "images": all_images,
                            "images_count": len(all_images),
                            "videos": videos,
                            "videos_count": videos_count,
                            "brand": cached.get('brand', ''),
                            "category": cached.get('category', ''),
                            "description": cached.get('description', ''),
                            "upc": cached.get('upc', ''),
                            "amazon_url": f"https://www.amazon.com/dp/{cached.get('asin')}" if cached.get('asin') else '',
                            "source": "cache",
                            "cost_status": "no_charge",
                            "cached": True,
                            "raw": cached
                        }
                        # Always include scan_count, even if calculation failed (use fallback)
                        if scan_count_data:
                            response_data['scan_count'] = scan_count_data
                            logger.info(f"✅ Scan count included in response: {scan_count_data}")
                            print(f"✅✅✅ SCAN COUNT IN RESPONSE: {scan_count_data.get('used', 'N/A')}/{scan_count_data.get('limit', 'N/A')}")
                        else:
                            # Fallback: return basic count info even if calculation failed
                            logger.warning(f"⚠️ Scan count calculation failed, using fallback")
                            response_data['scan_count'] = {
                                'used': 0,
                                'limit': FREE_TRIAL_SCAN_LIMIT,
                                'remaining': FREE_TRIAL_SCAN_LIMIT,
                                'is_paid': False
                            }
                        
                        logger.info(f"✅ Returning cached data for {code_type} {code} (age: {age_days} days)")
                        logger.info(f"   Response includes scan_count: {response_data.get('scan_count', 'MISSING')}")
                        print(f"✅ Returning cached data - NO API CHARGE")
                        print(f"📊 Final scan_count in response: {response_data.get('scan_count', {})}")
                        return jsonify(response_data)
                else:
                    logger.info(f"❌ NOT FOUND IN CACHE: {code_type} {code}")
                    print(f"❌ NOT FOUND IN CACHE: {code}")
            except Exception as cache_error:
                logger.error(f"❌ Error checking cache: {cache_error}")
                import traceback
                logger.error(f"   Traceback: {traceback.format_exc()}")
                print(f"❌ Cache check error: {cache_error}")
        
        # STEP 2: Not in cache or cache is stale - call FNSKU API with polling
        logger.info(f"💰 {code_type} {code} not in cache - calling API (will be charged)")
        print(f"💰💰💰 CALLING EXTERNAL API - THIS WILL BE CHARGED")
        BASE_URL = "https://ato.fnskutoasin.com"
        headers = {
            'api-key': FNSKU_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        
        # Try to get existing scan task first
        lookup_url = f"{BASE_URL}/api/v1/ScanTask/GetByBarCode"
        scan_data = None
        asin = None
        
        try:
            response = requests.get(lookup_url, headers=headers, params={'BarCode': code}, timeout=30)
            if response.status_code == 200:
                lookup_result = response.json()
                if lookup_result.get('succeeded') and lookup_result.get('data'):
                    scan_data = lookup_result['data']
                    # Check if ASIN is already available in existing scan task
                    potential_asin = scan_data.get('asin') or scan_data.get('ASIN') or scan_data.get('Asin') or ''
                    if potential_asin:
                        asin = str(potential_asin).strip()
                        if asin and len(asin) >= 10:
                            logger.info(f"✅ Found existing scan task with ASIN already available: {asin}")
                        else:
                            asin = None
                    if not asin:
                        logger.info(f"✅ Found existing scan task for FNSKU {code}, but ASIN not yet available")
        except Exception as e:
            logger.warning(f"GetByBarCode failed: {e}")
        
        # If no existing scan, create one
        if not scan_data:
            add_scan_url = f"{BASE_URL}/api/v1/ScanTask/AddOrGet"
            payload = {"barCode": code, "callbackUrl": ""}
            
            try:
                response = requests.post(add_scan_url, headers=headers, json=payload, timeout=30)
                if response.status_code == 200:
                    add_result = response.json()
                    if add_result.get('succeeded') and add_result.get('data'):
                        scan_data = add_result['data']
                        logger.info(f"✅ Created scan task {scan_data.get('id')} for FNSKU {code}")
                        # Check if ASIN is already available in the response
                        potential_asin = scan_data.get('asin') or scan_data.get('ASIN') or scan_data.get('Asin') or ''
                        if potential_asin:
                            initial_asin = str(potential_asin).strip()
                            if initial_asin and len(initial_asin) >= 10:
                                asin = initial_asin
                                logger.info(f"🎉 ASIN found immediately in AddOrGet response: {asin}")
            except Exception as e:
                logger.error(f"AddOrGet failed: {e}")
                return jsonify({
                    "success": False,
                    "error": "FNSKU API timeout",
                    "message": f"Failed to create scan task: {str(e)}"
                }), 500
        
        if not scan_data:
            logger.error(f"❌ Failed to get or create scan task for FNSKU {code}")
            return jsonify({
                "success": False,
                "error": "Product not found",
                "message": "Could not create or retrieve scan task. Please try again."
            }), 404
        
        # STEP 3: Poll for ASIN (up to 30 attempts, 2 second intervals = 60 seconds max)
        # Only overwrite asin if we don't already have it from existing scan task
        if not asin or len(asin) < 10:
            potential_asin = scan_data.get('asin') or scan_data.get('ASIN') or scan_data.get('Asin') or ''
            if potential_asin:
                asin = str(potential_asin).strip()
        
        task_id = scan_data.get('id') if scan_data else None
        max_polls = 15  # Reduced to 15 polls = 30 seconds max to avoid timeout
        poll_interval = 2000  # 2 seconds
        retry_add_or_get_after = 2
        
        # If ASIN not available, poll for it
        if not asin or len(asin) < 10:
            logger.info(f"⏳ ASIN not immediately available. Polling for task {task_id} (max {max_polls} attempts, ~{max_polls * 2}s)...")
            import time
            task_state = 0  # Initialize task_state before polling loop
            
            for attempt in range(1, max_polls + 1):
                # Retry AddOrGet after 2 polls to trigger processing
                if attempt == retry_add_or_get_after:
                    logger.info(f"🔄 Retrying AddOrGet to trigger processing (attempt {attempt})...")
                    try:
                        retry_response = requests.post(add_scan_url, headers=headers, json=payload, timeout=30)
                        if retry_response.status_code == 200:
                            retry_result = retry_response.json()
                            if retry_result.get('succeeded') and retry_result.get('data'):
                                scan_data = retry_result['data']
                                # Get ASIN properly
                                potential_asin = scan_data.get('asin') or scan_data.get('ASIN') or scan_data.get('Asin') or ''
                                if potential_asin:
                                    asin = str(potential_asin).strip()
                                else:
                                    asin = ''
                                # Check if ASIN is valid (at least 10 characters, usually starts with B)
                                if asin and len(asin) >= 10:
                                    logger.info(f"🎉 ASIN found after retry: {asin}")
                                    break
                    except Exception as e:
                        logger.warning(f"Retry AddOrGet failed: {e}")
                
                # Poll for ASIN - check immediately on first attempt, then wait between polls
                # Only wait if this isn't the first attempt and we haven't just done a retry
                if attempt > 1 and attempt != retry_add_or_get_after + 1:
                    # Wait before polling (except first attempt and right after retry)
                    if attempt == 2:
                        time.sleep(1)  # Short initial wait
                    else:
                        time.sleep(poll_interval / 1000)  # 2 seconds between polls
                
                try:
                    poll_response = requests.get(lookup_url, headers=headers, params={'BarCode': code}, timeout=5)  # Reduced timeout
                    if poll_response.status_code == 200:
                        poll_result = poll_response.json()
                        if poll_result.get('succeeded') and poll_result.get('data'):
                            scan_data = poll_result['data']
                            # Get ASIN - check multiple possible fields and handle None/empty
                            potential_asin = scan_data.get('asin') or scan_data.get('ASIN') or scan_data.get('Asin') or ''
                            if potential_asin:
                                asin = str(potential_asin).strip()
                            else:
                                asin = ''
                            
                            task_state = scan_data.get('taskState') or scan_data.get('task_state', 0)
                            
                            # Log what we found (every attempt for debugging)
                            logger.info(f"📊 Poll {attempt}/{max_polls}: ASIN='{asin}' (len={len(asin)}), State={task_state}")
                            
                            # Check if ASIN is valid (at least 10 characters, usually starts with B)
                            if asin and len(asin) >= 10:
                                logger.info(f"🎉🎉🎉 ASIN FOUND after {attempt} polls: '{asin}' - BREAKING POLLING LOOP NOW!")
                                break  # Exit polling loop immediately - this should work!
                            
                            # If task completed/failed but no ASIN, stop
                            if task_state in [2, 3] or scan_data.get('finishedOn'):
                                if not asin or len(asin) < 10:
                                    logger.warning(f"⚠️ Task {task_state} completed but no ASIN found. Stopping.")
                                    break
                            
                            if attempt % 3 == 0:  # Log every 3 attempts
                                logger.info(f"📊 Polling progress: Attempt {attempt}/{max_polls}, State: {task_state}, ASIN: '{asin or 'not found'}'")
                except Exception as poll_error:
                    logger.warning(f"Poll attempt {attempt} failed: {poll_error}")
                    # Don't slow down - keep trying fast
                
                # Double-check ASIN after each iteration (in case it was set in retry)
                if asin and isinstance(asin, str) and len(asin.strip()) >= 10:
                    logger.info(f"✅ ASIN confirmed available: {asin} - exiting polling immediately")
                    break
                
                # Early exit if we've been polling for a while and task seems stuck
                if attempt >= 10 and task_state == 0:  # Still pending after 10 attempts
                    logger.warning(f"⚠️ Task still pending after {attempt} attempts. May need more time.")
                    # Continue polling but log warning
            
            # After polling loop, verify we have ASIN
            if not asin or not isinstance(asin, str) or len(asin.strip()) < 10:
                logger.warning(f"⚠️ Polling completed but no valid ASIN found. ASIN value: '{asin}'")
                # Try one final lookup to see if ASIN is now available
                try:
                    final_response = requests.get(lookup_url, headers=headers, params={'BarCode': code}, timeout=10)
                    if final_response.status_code == 200:
                        final_result = final_response.json()
                        if final_result.get('succeeded') and final_result.get('data'):
                            final_scan_data = final_result['data']
                            potential_asin = final_scan_data.get('asin') or final_scan_data.get('ASIN') or final_scan_data.get('Asin') or ''
                            if potential_asin:
                                final_asin = str(potential_asin).strip()
                                if final_asin and len(final_asin) >= 10:
                                    asin = final_asin
                                    logger.info(f"🎉 ASIN found in final check: {asin}")
                except Exception as e:
                    logger.warning(f"Final ASIN check failed: {e}")
        
        # Final ASIN validation
        if not asin or not isinstance(asin, str) or len(asin.strip()) < 10:
            logger.warning(f"⚠️ No valid ASIN found after polling. Returning partial data - user can retry.")
            # Return partial response so user can see progress and retry
            return jsonify({
                "success": True,  # Still success so frontend can show partial data
                "fnsku": code,
                "asin": "",
                "title": scan_data.get('productName') or scan_data.get('name') or f"FNSKU: {code}",
                "price": "",
                "image": scan_data.get('imageUrl') or scan_data.get('image') or '',
                "brand": "",
                "category": "External API",
                "message": "ASIN is still being processed. Please scan again in a few moments.",
                "processing": True
            }), 200
        
        # STEP 4: If we have ASIN, fetch from Rainforest API
        rainforest_data = None
        logger.info(f"🔍 Checking Rainforest API conditions - ASIN: '{asin}' (len={len(asin) if asin else 0}), API Key: {'SET' if RAINFOREST_API_KEY else 'MISSING'}")
        
        if asin and len(asin) >= 10:
            if not RAINFOREST_API_KEY:
                logger.warning("⚠️ RAINFOREST_API_KEY not set - skipping Rainforest API call")
            else:
                logger.info(f"📦 Fetching product data from Rainforest API for ASIN {asin}...")
                try:
                    # Request product data from Rainforest API
                    # The API returns all available images by default
                    rainforest_response = requests.get(
                        'https://api.rainforestapi.com/request',
                        params={
                            'api_key': RAINFOREST_API_KEY,
                            'type': 'product',
                            'amazon_domain': 'amazon.com',
                            'asin': asin
                        },
                        timeout=15
                    )
                    
                    logger.info(f"📡 Rainforest API response status: {rainforest_response.status_code}")
                    
                    if rainforest_response.status_code == 200:
                        response_json = rainforest_response.json()
                        logger.info(f"📦 Rainforest API response keys: {list(response_json.keys())}")
                        logger.info(f"📦 Response includes: request_info, request_parameters, request_metadata, product, brand_store, newer_model, similar_to_consider")
                        
                        # SAVE COMPLETE RAINFOREST API RESPONSE - You're paying for ALL this data!
                        # Store the ENTIRE response_json - EVERYTHING from the API
                        # This includes: request_info, request_parameters, request_metadata, product (all fields), 
                        # brand_store, newer_model, similar_to_consider, and any other data
                        rainforest_full_response = response_json
                        response_size_bytes = len(json.dumps(response_json))
                        logger.info(f"💾 Complete response size: {response_size_bytes:,} bytes - Storing EVERYTHING for future data sales")
                        
                        if response_json.get('product'):
                            product = response_json['product']
                            logger.info(f"✅ Product found in Rainforest response. Title: {product.get('title', 'N/A')[:50]}...")
                            
                            # Collect ALL images from Rainforest API
                            all_images = []
                            
                            # Add main_image if it exists
                            main_image_link = product.get('main_image', {}).get('link')
                            if main_image_link:
                                all_images.append(main_image_link)
                            
                            # Add all images from images array
                            images_array = product.get('images', [])
                            if images_array:
                                for img in images_array:
                                    img_link = img.get('link') if isinstance(img, dict) else img
                                    if img_link and img_link not in all_images:  # Avoid duplicates
                                        all_images.append(img_link)
                            
                            # Fallback: if no images collected, try images_flat
                            if not all_images and product.get('images_flat'):
                                images_flat = product.get('images_flat', '')
                                if images_flat:
                                    flat_images = [url.strip() for url in images_flat.split(',') if url.strip()]
                                    all_images.extend(flat_images)
                            
                            # Log image count for debugging
                            logger.info(f"📸 Collected {len(all_images)} images from Rainforest API for ASIN {asin}")
                            
                            # If we only got one image, log a warning (might need to re-fetch)
                            if len(all_images) == 1:
                                logger.warning(f"⚠️ Only 1 image found for ASIN {asin}. Product may have more images available.")
                            
                            # Primary image (first one) for backward compatibility
                            primary_image = all_images[0] if all_images else ''
                            
                            # Extract videos from product data
                            videos_additional = product.get('videos_additional', [])
                            videos_count = product.get('videos_count', len(videos_additional))
                            
                            # Extract commonly used fields for quick access
                            rainforest_data = {
                                'title': product.get('title', ''),
                                'image': primary_image,  # Primary image for backward compatibility
                                'images': all_images,  # ALL images as array
                                'images_count': len(all_images),
                                'videos': videos_additional,  # ALL videos as array
                                'videos_count': videos_count,
                                'price': product.get('buybox_winner', {}).get('price', {}).get('value') or product.get('price', {}).get('value'),
                                'rating': product.get('rating'),
                                'reviews_count': product.get('reviews_total'),
                                'brand': product.get('brand', ''),
                                'category': product.get('category', {}).get('name', '') if isinstance(product.get('category'), dict) else '',
                                'description': product.get('description', ''),
                                # Store the FULL response for access to everything
                                'full_response': rainforest_full_response  # Complete response with all data
                            }
                            
                            if videos_count > 0:
                                logger.info(f"🎥 Found {videos_count} videos for ASIN {asin}")
                            logger.info(f"✅ Rainforest API data retrieved for ASIN {asin}: title={rainforest_data.get('title', '')[:50]}, price={rainforest_data.get('price')}, brand={rainforest_data.get('brand')}, images_count={rainforest_data.get('images_count', 0)}")
                            logger.info(f"💾 Storing complete Rainforest API response ({len(str(rainforest_full_response))} chars) - includes request_info, product, brand_store, newer_model, similar_to_consider, etc.")
                            
                            # Verify all expected keys are in the response
                            expected_keys = ['request_info', 'request_parameters', 'request_metadata', 'product', 'brand_store']
                            missing_keys = [key for key in expected_keys if key not in rainforest_full_response]
                            if missing_keys:
                                logger.warning(f"⚠️ Missing keys in response: {missing_keys}")
                            else:
                                logger.info(f"✅ All expected keys present in response")
                            
                            # Log presence of optional keys
                            optional_keys = ['newer_model', 'similar_to_consider']
                            for key in optional_keys:
                                if key in rainforest_full_response:
                                    logger.info(f"✅ {key} present in response")
                                else:
                                    logger.info(f"ℹ️ {key} not present in response (may not be available for this product)")
                        else:
                            logger.warning(f"⚠️ Rainforest API response does not contain 'product' key. Response: {str(response_json)[:200]}")
                            # Even if no product, save the complete response anyway
                            rainforest_full_response = response_json
                            rainforest_data = {
                                'full_response': rainforest_full_response
                            }
                    else:
                        logger.error(f"❌ Rainforest API returned status {rainforest_response.status_code}. Response: {rainforest_response.text[:200]}")
                except requests.exceptions.Timeout:
                    logger.error("❌ Rainforest API timeout after 15 seconds")
                except Exception as rf_error:
                    logger.error(f"❌ Rainforest API error: {type(rf_error).__name__}: {str(rf_error)}")
                    import traceback
                    logger.error(f"Traceback: {traceback.format_exc()}")
        else:
            logger.warning(f"⚠️ Cannot call Rainforest API - ASIN invalid: '{asin}' (len={len(asin) if asin else 0})")
        
        # STEP 5: Build response data
        # Safety check: ensure scan_data exists
        if not scan_data:
            logger.error(f"❌ scan_data is None when building response for FNSKU {code}")
            return jsonify({
                "success": False,
                "error": "Internal server error",
                "message": "Failed to retrieve scan task data. Please try again."
            }), 500
        
        logger.info(f"📊 Building response - Rainforest data available: {rainforest_data is not None}, ASIN: {asin}")
        if rainforest_data:
            logger.info(f"📊 Rainforest data: title={rainforest_data.get('title', '')[:50]}, price={rainforest_data.get('price')}, brand={rainforest_data.get('brand')}, category={rainforest_data.get('category')}")
        
        # Safely access scan_data with fallbacks
        product_name = (rainforest_data.get('title') if rainforest_data else '') or (scan_data.get('productName') if scan_data else '') or (scan_data.get('name') if scan_data else '') or (f"Amazon Product (ASIN: {asin})" if asin else f"FNSKU: {code}")
        
        # Collect ALL images from Rainforest API
        all_images = []
        if rainforest_data and rainforest_data.get('images'):
            all_images = rainforest_data.get('images', [])
        elif rainforest_data and rainforest_data.get('image'):
            all_images = [rainforest_data.get('image')]
        elif scan_data and scan_data.get('imageUrl'):
            all_images = [scan_data.get('imageUrl')]
        elif scan_data and scan_data.get('image'):
            all_images = [scan_data.get('image')]
        
        # Primary image for backward compatibility (first image)
        image_url = all_images[0] if all_images else ''
        
        # Store all images as JSON string for database
        image_url_json = json.dumps(all_images) if all_images else None
        
        price = (rainforest_data.get('price') if rainforest_data else None) or (scan_data.get('price') if scan_data else None) or (scan_data.get('listPrice') if scan_data else None) or 0
        description = (rainforest_data.get('description') if rainforest_data else '') or (scan_data.get('description') if scan_data else '') or product_name
        category = (rainforest_data.get('category') if rainforest_data else '') or (scan_data.get('category') if scan_data else '') or 'External API'
        brand = (rainforest_data.get('brand') if rainforest_data else '') or (scan_data.get('brand') if scan_data else '') or ''
        
        # Extract videos from rainforest_data if available
        videos = []
        videos_count = 0
        if rainforest_data and rainforest_data.get('videos'):
            videos = rainforest_data.get('videos', [])
            videos_count = rainforest_data.get('videos_count', len(videos))
        
        logger.info(f"📊 Final response data: title={product_name[:50]}, price={price}, brand={brand}, category={category}, images_count={len(all_images)}, videos_count={videos_count}, primary_image={image_url[:50] if image_url else 'none'}")
        
        response_data = {
            "success": True,
            "fnsku": code,
            "asin": asin,
            "title": product_name,
            "price": str(price) if price else '',
            "image": image_url,  # Primary image for backward compatibility
            "images": all_images,  # ALL images array
            "images_count": len(all_images),
            "videos": videos,  # ALL videos array
            "videos_count": videos_count,
            "brand": brand,
            "category": category,
            "description": description,
            "upc": scan_data.get('upc', '') if scan_data else '',
            "amazon_url": f"https://www.amazon.com/dp/{asin}" if asin else '',
            "source": "api",
            "cost_status": "charged",
            "cached": False,
            "saved_to_cache": False,  # Initialize - will be updated after save attempt
            "raw": {
                "scan_data": scan_data,
                "rainforest_data": rainforest_data
            }
        }
        
        # STEP 6: Save to Supabase cache for future lookups - ALWAYS SAVE IF ASIN IS VALID
        print("\n" + "=" * 60)
        print(f"💾 SAVE TO CACHE CHECK")
        print(f"   supabase_admin exists: {supabase_admin is not None}")
        print(f"   asin: '{asin}' (len={len(asin) if asin else 0})")
        print(f"   code (FNSKU): '{code}'")
        print("=" * 60)
        
        logger.info(f"💾 ========== SAVE TO CACHE CHECK ==========")
        logger.info(f"   supabase_admin exists: {supabase_admin is not None}")
        logger.info(f"   asin: '{asin}' (len={len(asin) if asin else 0})")
        logger.info(f"   code (FNSKU): '{code}'")
        
        response_data["saved_to_cache"] = False  # Default to False
        
        # FORCE SAVE - Only skip if Supabase is completely unavailable
        if not supabase_admin:
            logger.error("❌ CRITICAL: supabase_admin is None - CANNOT SAVE TO api_lookup_cache")
            logger.error("❌ Check SUPABASE_SERVICE_KEY in .env file")
            logger.error("❌ This is a CRITICAL error - data will NOT be saved!")
        elif not asin or len(asin) < 10:
            logger.warning(f"⚠️ ASIN invalid for caching: '{asin}' (len={len(asin) if asin else 0}) - need at least 10 chars")
            logger.warning(f"⚠️ Cannot save without valid ASIN")
        else:
            logger.info(f"✅ ALL CONDITIONS MET - PROCEEDING WITH SAVE TO api_lookup_cache")
            # VALID ASIN - MUST SAVE TO api_lookup_cache
            print(f"\n✅ VALID ASIN '{asin}' - ATTEMPTING TO SAVE TO api_lookup_cache...")
            logger.info(f"✅ VALID ASIN '{asin}' - ATTEMPTING TO SAVE TO api_lookup_cache...")
            try:
                now = datetime.now(timezone.utc).isoformat()
                
                print(f"💾 Step 1: Checking for existing cache entry for FNSKU {code}...")
                logger.info(f"💾 Step 1: Checking for existing cache entry for FNSKU {code}...")
                try:
                    existing = supabase_admin.table('api_lookup_cache').select('id, lookup_count').eq('fnsku', code).maybe_single().execute()
                    if existing is None:
                        print(f"⚠️ Step 1 Result: Query returned None (likely 406 error)")
                        logger.warning(f"⚠️ Step 1 Result: Query returned None (likely 406 error)")
                        existing_data = None
                    else:
                        existing_data = existing.data if hasattr(existing, 'data') else None
                        print(f"💾 Step 1 Result: existing.data = {existing_data is not None}")
                        logger.info(f"💾 Step 1 Result: existing.data = {existing_data is not None}")
                except Exception as query_error:
                    print(f"❌ Error querying cache: {type(query_error).__name__}: {str(query_error)}")
                    logger.error(f"❌ Error querying cache: {type(query_error).__name__}: {str(query_error)}")
                    existing = None
                    existing_data = None
                
                # Safely convert price to float
                try:
                    if price:
                        price_str = str(price).strip()
                        price_float = float(price_str) if price_str else 0
                    else:
                        price_float = 0
                except (ValueError, TypeError) as e:
                    logger.warning(f"⚠️ Could not convert price '{price}' to float: {e}, using 0")
                    price_float = 0
                
                # Prepare cache data - ensure all required fields are present
                # NOTE: Only include columns that exist in api_lookup_cache table
                # Table columns: fnsku, asin, product_name, description, price, category, upc, image_url, source, scan_task_id, task_state, asin_found, lookup_count, last_accessed, created_at, updated_at, rainforest_raw_data
                # NOTE: 'brand' column does NOT exist in the table, so we don't include it
                # Store all images as JSON in image_url (TEXT column can store JSON)
                # Use JSON array of all images, fallback to primary image as string for backward compatibility
                image_url_to_save = image_url_json if image_url_json else (image_url[:500] if image_url else None)
                
                # Save COMPLETE Rainforest API response - you're paying for ALL this data!
                # Store EVERYTHING: request_info, request_parameters, request_metadata, product (all fields),
                # brand_store, newer_model, similar_to_consider, and ANY OTHER data in the response
                # NO FILTERING - save the ENTIRE response_json exactly as received
                rainforest_raw_data_to_save = None
                if rainforest_data and rainforest_data.get('full_response'):
                    # Store the COMPLETE response as JSONB (Supabase accepts dict for JSONB)
                    # This is the ENTIRE response_json from Rainforest API - NOTHING is filtered out
                    # We save EVERY key-value pair exactly as received from the API
                    rainforest_raw_data_to_save = rainforest_data.get('full_response')
                    response_size = len(json.dumps(rainforest_raw_data_to_save))
                    
                    # Log what keys are being saved
                    saved_keys = list(rainforest_raw_data_to_save.keys()) if isinstance(rainforest_raw_data_to_save, dict) else []
                    logger.info(f"💾 Saving COMPLETE Rainforest API response ({response_size:,} bytes)")
                    logger.info(f"💾 Response contains {len(saved_keys)} top-level keys: {', '.join(saved_keys)}")
                    logger.info(f"💾 Includes: request_info (credits, overage), request_parameters, request_metadata")
                    logger.info(f"💾 Includes: product (ALL fields: title, images, price, rating, reviews, brand, category, description, keywords, specifications, feature_bullets, videos, dimensions, weight, color, manufacturer, model_number, whats_in_the_box, variants, top_reviews, a_plus_content, etc.)")
                    logger.info(f"💾 Includes: brand_store, newer_model (if available), similar_to_consider (if available)")
                    logger.info(f"💾 Stored in rainforest_raw_data column - COMPLETE response for future data sales/analysis")
                    logger.info(f"💾 NO DATA IS FILTERED - Everything from the API response is saved")
                
                cache_data = {
                    'fnsku': code,  # REQUIRED
                    'asin': asin,  # REQUIRED
                    'product_name': (product_name[:500] if product_name else f"Product {code}") or f"Product {code}",  # Ensure not None
                    'description': (description[:2000] if description else product_name) or '',  # Can be empty
                    'price': price_float,
                    'category': (category[:200] if category else 'External API') or 'External API',
                    'image_url': image_url_to_save,  # JSON array of all images, or single image URL
                    'upc': scan_data.get('upc') if (scan_data and scan_data.get('upc')) else None,
                    'source': 'rainforest_api' if rainforest_data else 'fnskutoasin.com',
                    'scan_task_id': str(task_id) if task_id else None,
                    'task_state': str(scan_data.get('taskState', '')) if (scan_data and scan_data.get('taskState')) else None,
                    'asin_found': True,
                    'last_accessed': now,
                    'updated_at': now,
                    'rainforest_raw_data': rainforest_raw_data_to_save  # COMPLETE Rainforest API response as JSON
                    # 'brand' column does NOT exist in api_lookup_cache table - removed
                }
                
                print(f"💾 Step 2: Cache data prepared - fnsku={cache_data['fnsku']}, asin={cache_data['asin']}, price={cache_data['price']}, has_image={bool(cache_data['image_url'])}")
                logger.info(f"💾 Step 2: Cache data prepared - fnsku={cache_data['fnsku']}, asin={cache_data['asin']}, price={cache_data['price']}, has_image={bool(cache_data['image_url'])}")
                
                # Check if we have existing data
                if existing_data:
                    print(f"💾 Step 3: UPDATING existing cache entry (id: {existing_data['id']})")
                    logger.info(f"💾 Step 3: UPDATING existing cache entry (id: {existing_data['id']})")
                    current_count = existing_data.get('lookup_count') or 0
                    cache_data['lookup_count'] = current_count + 1
                    print(f"💾 Step 4: Executing UPDATE query...")
                    logger.info(f"💾 Step 4: Executing UPDATE query...")
                    result = supabase_admin.table('api_lookup_cache').update(cache_data).eq('id', existing_data['id']).execute()
                    if result and hasattr(result, 'data') and result.data:
                        print(f"✅✅✅ SUCCESS: Updated cache for FNSKU {code} - ID: {existing_data['id']}, ASIN: {asin}")
                        print(f"✅ Update result: {result.data}")
                        logger.info(f"✅✅✅ SUCCESS: Updated cache for FNSKU {code} - ID: {existing_data['id']}, ASIN: {asin}")
                        logger.info(f"✅ Update result: {result.data}")
                    else:
                        print(f"⚠️ Update executed but no data returned - may have succeeded")
                        logger.warning(f"⚠️ Update executed but no data returned - may have succeeded")
                    response_data["saved_to_cache"] = True
                else:
                    print(f"💾 Step 3: CREATING new cache entry for FNSKU {code}")
                    logger.info(f"💾 Step 3: CREATING new cache entry for FNSKU {code}")
                    cache_data['created_at'] = now
                    cache_data['lookup_count'] = 1
                    print(f"💾 Step 4: Executing INSERT query...")
                    logger.info(f"💾 Step 4: Executing INSERT query...")
                    result = supabase_admin.table('api_lookup_cache').insert(cache_data).execute()
                    if result and hasattr(result, 'data') and result.data:
                        print(f"✅✅✅ SUCCESS: Saved new cache entry for FNSKU {code} - ASIN: {asin}")
                        print(f"✅ Insert result: {result.data}")
                        logger.info(f"✅✅✅ SUCCESS: Saved new cache entry for FNSKU {code} - ASIN: {asin}")
                        logger.info(f"✅ Insert result: {result.data}")
                    else:
                        print(f"⚠️ Insert executed but no data returned - may have succeeded anyway")
                        logger.warning(f"⚠️ Insert executed but no data returned - may have succeeded anyway")
                        # Still mark as saved since the query executed without error
                    response_data["saved_to_cache"] = True
                
                print(f"✅✅✅ SAVE COMPLETE - saved_to_cache set to: {response_data['saved_to_cache']}")
                logger.info(f"✅✅✅ SAVE COMPLETE - saved_to_cache set to: {response_data['saved_to_cache']}")
                
            except Exception as save_error:
                error_msg = f"❌❌❌ CRITICAL ERROR saving to api_lookup_cache: {type(save_error).__name__}: {str(save_error)}"
                print(f"\n{error_msg}")
                import traceback
                print(f"❌ Full traceback:\n{traceback.format_exc()}\n")
                logger.error(error_msg)
                logger.error(f"❌ Full traceback:\n{traceback.format_exc()}")
                response_data["saved_to_cache"] = False
                # Don't fail the request - just log the error
        
        # Log scan event for Stripe usage tracking and local analytics
        # Also record the scan in scan_history so free trial limits and reporting work.
        # Only count unique scans per user (don't count duplicates)
        scan_was_logged = False
        if supabase_admin and user_id:
            # Use the helper function which checks for duplicates
            scan_was_logged = log_scan_to_history(user_id, tenant_id, code, asin, supabase_admin)

            try:
                # Legacy api_scan_logs for detailed billing/debug
                supabase_admin.table('api_scan_logs').insert({
                    'user_id': user_id,
                    'fnsku_scanned': code,
                    'asin_retrieved': asin,
                    'api_source': 'fnskutoasin.com',
                    'is_charged_call': True,
                    'created_at': datetime.now(timezone.utc).isoformat()
                }).execute()
            except Exception as log_error:
                logger.warning(f"Failed to log scan event in api_scan_logs: {log_error}")
        
        # Get updated scan count to include in response (for free trial display)
        # Always calculate scan count, even if scan wasn't logged (to show current count)
        if supabase_admin and user_id:
            try:
                is_paid = tenant_has_paid_subscription(tenant_id) if tenant_id else False
                if not is_paid:
                    # Count scans for free trial users
                    # Retry count query up to 5 times if scan was just logged (to account for DB commit delay)
                    used_scans = 0
                    max_retries = 5 if scan_was_logged else 1
                    print(f"\n📊 CALCULATING SCAN COUNT (non-cached, was_logged={scan_was_logged}, max_retries={max_retries})")
                    print(f"   user_id: {user_id}")
                    print(f"   tenant_id: {tenant_id}")
                    
                    # Get trial start date to exclude old test scans
                    trial_start_date = get_trial_start_date(tenant_id, user_id)
                    
                    for attempt in range(max_retries):
                        print(f"   Attempt {attempt + 1}/{max_retries}...")
                        if tenant_id:
                            print(f"   Query: tenant_id={tenant_id}, trial_start={trial_start_date}")
                            query = supabase_admin.from_('scan_history').select('*', count='exact') \
                                .eq('tenant_id', tenant_id)
                            # Only count scans after trial start date (excludes old test scans)
                            if trial_start_date:
                                query = query.gte('scanned_at', trial_start_date.isoformat())
                            scan_res = query.execute()
                        else:
                            # Match the insert logic: if no tenant_id, count by user_id only
                            print(f"   Query: user_id={user_id} (no tenant_id), trial_start={trial_start_date}")
                            query = supabase_admin.from_('scan_history').select('*', count='exact') \
                                .eq('user_id', user_id)
                            # Only count scans after trial start date (excludes old test scans)
                            if trial_start_date:
                                query = query.gte('scanned_at', trial_start_date.isoformat())
                            scan_res = query.execute()
                        
                        used_scans = getattr(scan_res, 'count', None)
                        if used_scans is None:
                            used_scans = len(scan_res.data) if getattr(scan_res, 'data', None) else 0
                        
                        print(f"   Count result: {used_scans} scans found")
                        if hasattr(scan_res, 'data') and scan_res.data:
                            print(f"   Sample records: {scan_res.data[:3]}")
                        
                        # If scan was logged and count is still 0, wait a bit and retry
                        if scan_was_logged and used_scans == 0 and attempt < max_retries - 1:
                            import time
                            wait_time = 0.3 * (attempt + 1)  # Increasing wait time
                            print(f"   ⏳ Waiting {wait_time}s before retry...")
                            time.sleep(wait_time)
                            logger.info(f"   Retry {attempt + 1}/{max_retries}: count was 0, retrying...")
                        else:
                            break
                    
                    logger.info(f"📊 Scan count calculated: used={used_scans}, limit={FREE_TRIAL_SCAN_LIMIT}, "
                               f"was_logged={scan_was_logged}, user_id={user_id}, tenant_id={tenant_id}")
                    print(f"📊📊📊 FINAL SCAN COUNT (non-cached): {used_scans}/{FREE_TRIAL_SCAN_LIMIT} (was_logged={scan_was_logged})")
                    
                    response_data['scan_count'] = {
                        'used': used_scans,
                        'limit': FREE_TRIAL_SCAN_LIMIT,
                        'remaining': max(0, FREE_TRIAL_SCAN_LIMIT - used_scans),
                        'is_paid': False
                    }
                else:
                    response_data['scan_count'] = {
                        'used': 0,
                        'limit': None,
                        'remaining': None,
                        'is_paid': True
                    }
            except Exception as count_error:
                logger.error(f"❌ Failed to get scan count for response: {count_error}")
                import traceback
                logger.error(f"   Traceback: {traceback.format_exc()}")
        
        # Log final response status
        print("\n" + "=" * 60)
        print(f"📤 FINAL RESPONSE STATUS:")
        print(f"   - saved_to_cache: {response_data.get('saved_to_cache', 'NOT SET')}")
        print(f"   - cached: {response_data.get('cached', False)}")
        print(f"   - asin: {asin}")
        print(f"   - fnsku: {code}")
        print(f"   - supabase_admin exists: {supabase_admin is not None}")
        print("=" * 60 + "\n")
        
        logger.info(f"📤 FINAL RESPONSE STATUS:")
        logger.info(f"   - saved_to_cache: {response_data.get('saved_to_cache', 'NOT SET')}")
        logger.info(f"   - cached: {response_data.get('cached', False)}")
        logger.info(f"   - asin: {asin}")
        logger.info(f"   - fnsku: {code}")
        logger.info(f"   - supabase_admin exists: {supabase_admin is not None}")
        
        # CRITICAL: If save failed but we have valid ASIN, log warning
        if asin and len(asin) >= 10 and not response_data.get('saved_to_cache'):
            error_msg = f"❌❌❌ WARNING: Valid ASIN '{asin}' but saved_to_cache is False!"
            print(f"\n{error_msg}")
            print(f"   This means the save to api_lookup_cache FAILED or was SKIPPED")
            print(f"   Check logs above for error messages\n")
            logger.error(error_msg)
            logger.error(f"   This means the save to api_lookup_cache FAILED or was SKIPPED")
            logger.error(f"   Check logs above for error messages")
        
        # Auto-post to Facebook if integration is set up (non-blocking)
        if response_data.get('success') and user_id and supabase_admin:
            try:
                # Check if user has active Facebook integration
                integration = supabase_admin.table('facebook_integrations').select('*').eq('user_id', user_id).eq('is_active', True).execute()
                
                if integration.data and len(integration.data) > 0:
                    integration_data = integration.data[0]
                    
                    # Check if page and catalog are configured
                    if integration_data.get('selected_page_id') and integration_data.get('catalog_id'):
                        # Prepare product data for Facebook posting
                        product_data = {
                            'name': response_data.get('title', ''),
                            'description': response_data.get('description', ''),
                            'price': response_data.get('price', '0.00'),
                            'image': response_data.get('image', ''),
                            'asin': response_data.get('asin', ''),
                            'fnsku': response_data.get('fnsku', ''),
                            'sku': response_data.get('upc', '')
                        }
                        
                        # Only post if we have required data
                        if product_data['name'] and (product_data['asin'] or product_data['fnsku'] or product_data['sku']):
                            # Call Facebook posting function directly (internal)
                            try:
                                result = facebook_post_product_internal(
                                    user_id,
                                    tenant_id,
                                    product_data,
                                    integration_data
                                )
                                
                                if result.get('success'):
                                    response_data['facebook_posted'] = True
                                    response_data['facebook_post_url'] = result.get('post_url')
                                    logger.info(f"✅ Auto-posted product to Facebook: {result.get('post_url')}")
                                else:
                                    logger.warning(f"⚠️ Facebook auto-post failed: {result.get('error')}")
                            except Exception as fb_error:
                                # Don't fail the scan if Facebook posting fails
                                logger.warning(f"⚠️ Error auto-posting to Facebook (non-critical): {fb_error}")
            except Exception as e:
                # Silently fail - don't affect scan response
                logger.debug(f"Facebook auto-post check failed (non-critical): {e}")
        
        return jsonify(response_data)
        
    except requests.exceptions.Timeout:
        return jsonify({
            "success": False,
            "error": "FNSKU API timeout",
            "message": "External API request timed out"
        }), 408
    except requests.exceptions.RequestException as e:
        return jsonify({
            "success": False,
            "error": "External API request failed",
            "message": str(e)
        }), 500
    except Exception as e:
        logger.error(f"Error in scan_product: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": "Internal server error",
            "message": f"Error performing scan: {str(e)}"
        }), 500

# OLD HTML TEMPLATE ROUTES - COMMENTED OUT (React frontend handles routing)
# @app.route('/dashboard')
# def dashboard():
#     total_products = Product.query.count()
#     total_scans = ScanHistory.query.count()
#     return render_template('dashboard.html', 
#                            total_products=total_products, 
#                            total_scans=total_scans)

# @app.route('/history')
# def scan_history_list():
#     history_items = ScanHistory.query.join(Product).order_by(ScanHistory.scanned_at.desc()).limit(50).all()
#     return render_template('history.html', history_items=history_items)

# ===== MARKETPLACE API ENDPOINTS =====

# eBay API Helper Functions
def get_ebay_token():
    """Get eBay OAuth token for API calls"""
    if not EBAY_CLIENT_ID or not EBAY_CLIENT_SECRET:
        raise Exception("eBay API credentials not configured")
    
    # Use sandbox or production endpoint
    token_url = "https://api.sandbox.ebay.com/identity/v1/oauth2/token" if EBAY_SANDBOX else "https://api.ebay.com/identity/v1/oauth2/token"
    
    # Encode credentials in base64
    credentials = f"{EBAY_CLIENT_ID}:{EBAY_CLIENT_SECRET}"
    encoded_credentials = base64.b64encode(credentials.encode()).decode()
    
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': f'Basic {encoded_credentials}'
    }
    
    data = {
        'grant_type': 'client_credentials',
        'scope': 'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory'
    }
    
    response = requests.post(token_url, headers=headers, data=data)
    
    if response.status_code == 200:
        return response.json().get('access_token')
    else:
        raise Exception(f"Failed to get eBay token: {response.text}")

@app.route('/api/ebay/create-listing', methods=['POST'])
def create_ebay_listing():
    """Create a new eBay listing"""
    try:
        data = request.get_json()
        
        # Get eBay access token
        token = get_ebay_token()
        
        # eBay API endpoint
        listing_url = "https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item" if EBAY_SANDBOX else "https://api.ebay.com/sell/inventory/v1/inventory_item"
        
        # Prepare eBay listing data
        ebay_data = {
            "product": {
                "title": data.get('title'),
                "description": data.get('description', ''),
                "aspects": {
                    "Brand": ["Your Brand"],
                    "Type": [data.get('category', 'Other')]
                },
                "imageUrls": data.get('images', [])
            },
            "condition": data.get('condition', 'NEW').upper(),
            "packageWeightAndSize": {
                "dimensions": {
                    "height": 5,
                    "length": 5,
                    "width": 5,
                    "unit": "INCH"
                },
                "weight": {
                    "value": 1,
                    "unit": "POUND"
                }
            },
            "availability": {
                "shipToLocationAvailability": {
                    "quantity": data.get('quantity', 1)
                }
            }
        }
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
        
        # Create inventory item first
        inventory_key = data.get('sku', f"item-{data.get('title', '').replace(' ', '-')}")
        response = requests.put(f"{listing_url}/{inventory_key}", 
                              headers=headers, 
                              json=ebay_data)
        
        if response.status_code in [200, 201]:
            # Now create the actual listing/offer
            offer_url = "https://api.sandbox.ebay.com/sell/inventory/v1/offer" if EBAY_SANDBOX else "https://api.ebay.com/sell/inventory/v1/offer"
            
            offer_data = {
                "sku": inventory_key,
                "marketplaceId": "EBAY_US",
                "format": "FIXED_PRICE",
                "pricingSummary": {
                    "price": {
                        "value": str(data.get('price', '0')),
                        "currency": "USD"
                    }
                },
                "listingDescription": data.get('description', ''),
                "categoryId": data.get('category', ''),
                "merchantLocationKey": "default_location",
                "tax": {
                    "taxType": "SALES_TAX",
                    "shippingAndHandlingTaxed": False
                }
            }
            
            offer_response = requests.post(offer_url, headers=headers, json=offer_data)
            
            if offer_response.status_code in [200, 201]:
                return jsonify({
                    "success": True,
                    "message": "eBay listing created successfully",
                    "data": offer_response.json()
                })
            else:
                return jsonify({
                    "success": False,
                    "message": f"Failed to create eBay offer: {offer_response.text}"
                }), 400
        else:
            return jsonify({
                "success": False,
                "message": f"Failed to create eBay inventory item: {response.text}"
            }), 400
            
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error creating eBay listing: {str(e)}"
        }), 500

@app.route('/api/ebay/categories', methods=['GET'])
def get_ebay_categories():
    """Get eBay categories"""
    try:
        # Return some common categories for now
        # In production, you'd call eBay's GetCategories API
        categories = [
            {"id": "58058", "name": "Cell Phones & Smartphones"},
            {"id": "31388", "name": "TV, Video & Home Audio"},
            {"id": "1249", "name": "Video Games & Consoles"},
            {"id": "11233", "name": "Clothing, Shoes & Accessories"},
            {"id": "281", "name": "Jewelry & Watches"},
            {"id": "58058", "name": "Electronics"},
        ]
        
        return jsonify(categories)
    except Exception as e:
        return jsonify([]), 500

@app.route('/api/ebay/suggest-category', methods=['POST'])
def suggest_ebay_category():
    """Suggest eBay category based on product data"""
    try:
        data = request.get_json()
        
        # Simple category suggestion logic
        # In production, you'd use eBay's category suggestion API
        title = data.get('title', '').lower()
        
        if any(word in title for word in ['phone', 'smartphone', 'mobile']):
            return jsonify({"categoryId": "58058", "categoryName": "Cell Phones & Smartphones"})
        elif any(word in title for word in ['tv', 'television', 'audio', 'speaker']):
            return jsonify({"categoryId": "31388", "categoryName": "TV, Video & Home Audio"})
        elif any(word in title for word in ['game', 'gaming', 'console']):
            return jsonify({"categoryId": "1249", "categoryName": "Video Games & Consoles"})
        else:
            return jsonify({"categoryId": "58058", "categoryName": "Electronics"})
            
    except Exception as e:
        return jsonify(None), 500

# Shopify API Endpoints
@app.route('/api/shopify/create-product', methods=['POST'])
def create_shopify_product():
    """Create a new Shopify product"""
    try:
        if not SHOPIFY_SHOP_DOMAIN or not SHOPIFY_ACCESS_TOKEN:
            return jsonify({
                "success": False,
                "message": "Shopify API credentials not configured"
            }), 400
        
        data = request.get_json()
        product_data = data.get('product', {})
        
        # Shopify API endpoint
        shopify_url = f"https://{SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/products.json"
        
        headers = {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
        }
        
        response = requests.post(shopify_url, headers=headers, json=data)
        
        if response.status_code in [200, 201]:
            return jsonify({
                "success": True,
                "message": "Shopify product created successfully",
                "data": response.json()
            })
        else:
            return jsonify({
                "success": False,
                "message": f"Failed to create Shopify product: {response.text}"
            }), 400
            
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error creating Shopify product: {str(e)}"
        }), 500

@app.route('/api/shopify/collections', methods=['GET'])
def get_shopify_collections():
    """Get Shopify collections"""
    try:
        if not SHOPIFY_SHOP_DOMAIN or not SHOPIFY_ACCESS_TOKEN:
            return jsonify([])
        
        shopify_url = f"https://{SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/collections.json"
        
        headers = {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
        }
        
        response = requests.get(shopify_url, headers=headers)
        
        if response.status_code == 200:
            collections = response.json().get('collections', [])
            return jsonify(collections)
        else:
            return jsonify([])
            
    except Exception as e:
        return jsonify([]), 500

@app.route('/api/shopify/upload-image', methods=['POST'])
def upload_shopify_image():
    """Upload image to Shopify"""
    try:
        if not SHOPIFY_SHOP_DOMAIN or not SHOPIFY_ACCESS_TOKEN:
            return jsonify({
                "success": False,
                "message": "Shopify API credentials not configured"
            }), 400
        
        # Handle file upload logic here
        # This is a placeholder - implement based on your needs
        
        return jsonify({
            "success": True,
            "message": "Image upload functionality not implemented yet",
            "image_url": "https://placeholder.com/300x300"
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error uploading image: {str(e)}"
        }), 500

# --- User Management Endpoints ---
@app.route('/api/users/limits', methods=['GET'])
def get_user_limits():
    """Get the current user count and limit for the tenant"""
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        if not tenant_id:
            return jsonify({
                'current_count': 0,
                'max_users': 0,
                'plan': None,
                'has_subscription': False
            }), 200
        
        plan_id, plan_config, max_users = get_tenant_plan_and_limit(tenant_id)
        current_count = count_tenant_users(tenant_id)
        is_paid = tenant_has_paid_subscription(tenant_id)
        
        return jsonify({
            'current_count': current_count,
            'max_users': max_users if max_users else 0,
            'plan': plan_config.get('name') if plan_config else None,
            'plan_id': plan_id,
            'has_subscription': is_paid,
            'can_add_users': is_paid and (max_users is None or current_count < max_users)
        }), 200
    except Exception as e:
        logger.error(f"Error getting user limits: {e}")
        return jsonify({
            'current_count': 0,
            'max_users': 0,
            'plan': None,
            'has_subscription': False,
            'error': str(e)
        }), 200

@app.route('/api/users', methods=['GET'])
def list_users():
    """List all users with their scan statistics"""
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401

        # Check if user is admin (you can add role checking here)
        # For now, we'll allow any authenticated user to see users in their tenant
        
        if not supabase_admin:
            return jsonify({'error': 'Admin client not configured'}), 500

        # Get all users
        try:
            response = supabase_admin.auth.admin.list_users()
            # Supabase Python client returns response with users attribute
            if hasattr(response, 'users'):
                users = response.users or []
            elif hasattr(response, 'data') and hasattr(response.data, 'users'):
                users = response.data.users or []
            else:
                # Try to access directly
                users = getattr(response, 'users', []) or []
        except Exception as list_error:
            logger.error(f"Error listing users from Supabase: {list_error}")
            return jsonify({'error': f'Failed to list users: {str(list_error)}'}), 500
        
        # Enrich each user with scan statistics
        enriched_users = []
        for auth_user in users:
            scan_count = 0
            last_scan = None
            is_actively_scanning = False

            try:
                # Get scan count (try with user_id, fallback to all scans if column doesn't exist)
                try:
                    scan_count_result = supabase_admin.from_('scan_history').select('*', count='exact').eq('user_id', auth_user.id).execute()
                    scan_count = scan_count_result.count if hasattr(scan_count_result, 'count') else (len(scan_count_result.data) if scan_count_result.data else 0)

                    # Get last scan
                    last_scan_result = supabase_admin.from_('scan_history').select('scanned_at').eq('user_id', auth_user.id).order('scanned_at', ascending=False).limit(1).execute()
                    last_scan = last_scan_result.data[0] if last_scan_result.data and len(last_scan_result.data) > 0 else None

                    # Determine active scanning status (within last 30 minutes)
                    if last_scan and last_scan.get('scanned_at'):
                        from datetime import datetime, timezone
                        last_scan_time = datetime.fromisoformat(last_scan['scanned_at'].replace('Z', '+00:00'))
                        time_diff = datetime.now(timezone.utc) - last_scan_time.replace(tzinfo=timezone.utc)
                        is_actively_scanning = time_diff.total_seconds() < 1800  # 30 minutes
                except Exception as scan_error:
                    logger.warning(f"Could not fetch scan stats for user {auth_user.id}: {scan_error}")
                    # scan_history might not have user_id column yet, or user has no scans
                    pass
            except Exception as e:
                logger.warning(f"Error processing scan stats: {e}")

            # Get role from app_metadata
            role = 'employee'
            if auth_user.app_metadata:
                role = auth_user.app_metadata.get('role', 'employee')
            elif auth_user.user_metadata:
                role = auth_user.user_metadata.get('role', 'employee')

            # Format dates
            last_login_str = None
            if auth_user.last_sign_in_at:
                if isinstance(auth_user.last_sign_in_at, str):
                    last_login_str = auth_user.last_sign_in_at
                else:
                    last_login_str = auth_user.last_sign_in_at.isoformat()

            created_at_str = None
            if auth_user.created_at:
                if isinstance(auth_user.created_at, str):
                    created_at_str = auth_user.created_at
                else:
                    created_at_str = auth_user.created_at.isoformat()

            enriched_users.append({
                'id': auth_user.id,
                'email': auth_user.email,
                'firstName': auth_user.user_metadata.get('first_name', '') if auth_user.user_metadata else '',
                'lastName': auth_user.user_metadata.get('last_name', '') if auth_user.user_metadata else '',
                'role': role,
                'status': 'Inactive' if auth_user.banned_at else ('Active' if auth_user.email_confirmed_at else 'Pending'),
                'lastLogin': last_login_str,
                'scanCount': scan_count,
                'isActivelyScanning': is_actively_scanning,
                'lastScanTime': last_scan['scanned_at'] if last_scan and last_scan.get('scanned_at') else None,
                'createdAt': created_at_str
            })

        return jsonify({'users': enriched_users}), 200

    except Exception as e:
        logger.error(f"Error listing users: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users', methods=['POST'])
def create_user():
    """Create a new user/employee"""
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401

        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        firstName = data.get('firstName', '')
        lastName = data.get('lastName', '')
        role = data.get('role', 'employee')

        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

        if not supabase_admin:
            return jsonify({'error': 'Admin client not configured'}), 500

        # Ensure admin has a tenant_id - create one if they don't
        if not tenant_id:
            logger.info(f"Admin user {user_id} doesn't have tenant_id, creating tenant...")
            try:
                # Get admin user email for tenant name
                admin_user_res = supabase_admin.auth.admin.get_user_by_id(user_id)
                admin_email = admin_user_res.user.email if hasattr(admin_user_res, 'user') else None
                tenant_name = f"{admin_email}'s Organization" if admin_email else f"Organization for {user_id[:8]}"
                
                # Create tenant
                tenant_res = supabase_admin.table('tenants').insert({"name": tenant_name}).execute()
                if not tenant_res.data or not tenant_res.data[0]:
                    raise Exception("Failed to create tenant")
                
                new_tenant_id = tenant_res.data[0]['id']
                logger.info(f"Created tenant {new_tenant_id} for admin {user_id}")
                
                # Update admin user's app_metadata with tenant_id
                supabase_admin.auth.admin.update_user_by_id(
                    user_id,
                    {'app_metadata': {'tenant_id': new_tenant_id, 'role': 'admin'}}
                )
                
                tenant_id = new_tenant_id
                logger.info(f"Updated admin user {user_id} with tenant_id {tenant_id}")
            except Exception as tenant_error:
                logger.error(f"Error creating tenant for admin: {tenant_error}")
                return jsonify({'error': f'Failed to create tenant for admin: {str(tenant_error)}'}), 500

        # Check user limit based on subscription plan
        plan_id, plan_config, max_users = get_tenant_plan_and_limit(tenant_id)
        
        if plan_id and max_users:
            # Count current users in tenant
            current_user_count = count_tenant_users(tenant_id)
            logger.info(f"Tenant {tenant_id} ({plan_id} plan): {current_user_count}/{max_users} users")
            
            if current_user_count >= max_users:
                plan_name = plan_config.get('name', plan_id.capitalize())
                return jsonify({
                    'error': f'User limit reached',
                    'message': f'Your {plan_name} plan allows up to {max_users} user(s). You currently have {current_user_count} user(s). Please upgrade your plan to add more users.',
                    'current_count': current_user_count,
                    'max_users': max_users,
                    'plan': plan_name
                }), 403
        else:
            # No active subscription - check if this is a free trial
            # For free trial, we might want to allow 1 user (the admin)
            # Or we could require a paid plan to add users
            # Let's require a paid plan to add users
            is_paid = tenant_has_paid_subscription(tenant_id)
            if not is_paid:
                return jsonify({
                    'error': 'Subscription required',
                    'message': 'A paid subscription plan is required to add users. Please subscribe to a plan first.',
                    'current_count': count_tenant_users(tenant_id),
                    'max_users': 0
                }), 403

        # Create user
        try:
            response = supabase_admin.auth.admin.create_user({
                'email': email,
                'password': password,
                'email_confirm': True,
                'user_metadata': {
                    'first_name': firstName,
                    'last_name': lastName,
                    'role': role
                },
                'app_metadata': {
                    'role': role,
                    'tenant_id': tenant_id  # Associate with tenant - all employees share same tenant
                }
            })

            # Check response structure
            user = None
            if hasattr(response, 'user'):
                user = response.user
            elif hasattr(response, 'data') and hasattr(response.data, 'user'):
                user = response.data.user
            elif hasattr(response, 'data'):
                user = response.data

            if user:
                return jsonify({'user': {
                    'id': user.id if hasattr(user, 'id') else str(user.get('id', '')),
                    'email': user.email if hasattr(user, 'email') else user.get('email', email),
                    'firstName': firstName,
                    'lastName': lastName,
                    'role': role
                }}), 201
            else:
                return jsonify({'error': 'Failed to create user - no user in response'}), 500
        except Exception as create_error:
            logger.error(f"Error creating user: {create_error}")
            return jsonify({'error': f'Failed to create user: {str(create_error)}'}), 500

    except Exception as e:
        logger.error(f"Error creating user: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<user_id>', methods=['PUT'])
def update_user(user_id):
    """Update a user"""
    try:
        current_user_id, tenant_id = get_ids_from_request()
        if not current_user_id:
            return jsonify({'error': 'Unauthorized'}), 401

        data = request.get_json()
        
        if not supabase_admin:
            return jsonify({'error': 'Admin client not configured'}), 500

        updates = {}
        
        # Update user metadata
        if 'firstName' in data or 'lastName' in data or 'role' in data:
            user_metadata = {}
            app_metadata = {}
            
            if 'firstName' in data:
                user_metadata['first_name'] = data['firstName']
            if 'lastName' in data:
                user_metadata['last_name'] = data['lastName']
            if 'role' in data:
                user_metadata['role'] = data['role']
                app_metadata['role'] = data['role']
            
            if user_metadata:
                updates['user_metadata'] = user_metadata
            if app_metadata:
                updates['app_metadata'] = app_metadata

        # Update password if provided
        if 'newPassword' in data and data['newPassword']:
            try:
                password_response = supabase_admin.auth.admin.update_user_by_id(
                    user_id,
                    {'password': data['newPassword']}
                )
                if hasattr(password_response, 'error') and password_response.error:
                    return jsonify({'error': str(password_response.error)}), 500
            except Exception as pwd_error:
                logger.error(f"Error updating password: {pwd_error}")
                return jsonify({'error': f'Failed to update password: {str(pwd_error)}'}), 500

        # Update other fields
        if updates:
            try:
                response = supabase_admin.auth.admin.update_user_by_id(user_id, updates)
                if hasattr(response, 'error') and response.error:
                    return jsonify({'error': str(response.error)}), 500
            except Exception as update_error:
                logger.error(f"Error updating user: {update_error}")
                return jsonify({'error': f'Failed to update user: {str(update_error)}'}), 500

        return jsonify({'message': 'User updated successfully'}), 200

    except Exception as e:
        logger.error(f"Error updating user: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Delete a user"""
    try:
        current_user_id, tenant_id = get_ids_from_request()
        if not current_user_id:
            return jsonify({'error': 'Unauthorized'}), 401

        if user_id == current_user_id:
            return jsonify({'error': 'You cannot delete your own account'}), 400

        if not supabase_admin:
            return jsonify({'error': 'Admin client not configured'}), 500

        try:
            response = supabase_admin.auth.admin.delete_user(user_id)
            if hasattr(response, 'error') and response.error:
                return jsonify({'error': str(response.error)}), 500

            return jsonify({'message': 'User deleted successfully'}), 200
        except Exception as delete_error:
            logger.error(f"Error deleting user: {delete_error}")
            return jsonify({'error': f'Failed to delete user: {str(delete_error)}'}), 500

    except Exception as e:
        logger.error(f"Error deleting user: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<user_id>/upgrade-to-ceo', methods=['POST'])
def upgrade_user_to_ceo(user_id):
    """
    Upgrade a user to CEO role.
    CEO accounts have unlimited scanning without pricing restrictions.
    SECURITY: Only the creator of the software can upgrade users to CEO role.
    This ensures only the creator has unlimited access.
    """
    try:
        current_user_id, tenant_id = get_ids_from_request()
        if not current_user_id:
            return jsonify({'error': 'Unauthorized'}), 401

        # SECURITY CHECK: Only the creator can upgrade to CEO
        if not is_creator(current_user_id):
            logger.warning(f"Unauthorized CEO upgrade attempt by {current_user_id} (not creator)")
            return jsonify({
                'error': 'Unauthorized',
                'message': 'Only the creator of the software can upgrade users to CEO role'
            }), 403

        # Additional check: Only allow upgrading the creator's own account or if creator is upgrading themselves
        if user_id != current_user_id and not is_creator(user_id):
            logger.warning(f"Attempt to upgrade non-creator user {user_id} to CEO by {current_user_id}")
            return jsonify({
                'error': 'Unauthorized',
                'message': 'Only the creator can have CEO role'
            }), 403

        if not supabase_admin:
            return jsonify({'error': 'Admin client not configured'}), 500

        # Verify the target user is actually the creator
        if not is_creator(user_id):
            logger.warning(f"Attempt to upgrade non-creator {user_id} to CEO")
            return jsonify({
                'error': 'Unauthorized',
                'message': 'Only the creator can have CEO role'
            }), 403

        # Update user role to CEO in both app_metadata and users table
        try:
            # Update auth.users app_metadata and user_metadata
            update_response = supabase_admin.auth.admin.update_user_by_id(
                user_id,
                {
                    'app_metadata': {'role': 'ceo'},
                    'user_metadata': {'role': 'ceo'}
                }
            )
            
            if hasattr(update_response, 'error') and update_response.error:
                return jsonify({'error': f'Failed to update user metadata: {str(update_response.error)}'}), 500

            # Also update users table
            user_update = supabase_admin.from_('users').update({'role': 'ceo'}).eq('id', user_id).execute()
            
            if hasattr(user_update, 'error') and user_update.error:
                logger.warning(f"Could not update users table for {user_id}: {user_update.error}")
                # Don't fail if users table update fails, auth metadata is more important

            logger.info(f"Creator {user_id} upgraded to CEO role by {current_user_id}")
            return jsonify({
                'message': 'User upgraded to CEO role successfully',
                'user_id': user_id,
                'role': 'ceo'
            }), 200

        except Exception as upgrade_error:
            logger.error(f"Error upgrading user to CEO: {upgrade_error}")
            return jsonify({'error': f'Failed to upgrade user: {str(upgrade_error)}'}), 500

    except Exception as e:
        logger.error(f"Error in upgrade_user_to_ceo: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/creator/check-status', methods=['GET'])
def check_creator_status():
    """
    Check if the current user is the creator.
    This helps verify that CREATOR_EMAIL or CREATOR_USER_ID is set correctly.
    """
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401

        if not supabase_admin:
            return jsonify({'error': 'Admin client not configured'}), 500

        # Get user email for verification
        user_email = None
        try:
            user_response = supabase_admin.auth.admin.get_user_by_id(user_id)
            if user_response and hasattr(user_response, 'user'):
                user = user_response.user
                user_email = getattr(user, 'email', '').strip().lower()
        except Exception as e:
            logger.error(f"Error getting user email: {e}")

        is_creator_user = is_creator(user_id)
        current_role = get_user_role(user_id)

        return jsonify({
            'is_creator': is_creator_user,
            'user_id': user_id,
            'user_email': user_email,
            'current_role': current_role,
            'creator_email_configured': bool(CREATOR_EMAIL),
            'creator_user_id_configured': bool(CREATOR_USER_ID),
            'can_upgrade_to_ceo': is_creator_user,
            'message': 'Creator status check complete'
        }), 200

    except Exception as e:
        logger.error(f"Error checking creator status: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/marketplace/pricing-suggestions', methods=['POST'])
def get_pricing_suggestions():
    """Get pricing suggestions for different marketplaces"""
    try:
        data = request.get_json()
        msrp = data.get('msrp', 0)
        
        # Simple pricing logic - in production you'd use more sophisticated algorithms
        suggestions = {
            "ebay": {
                "suggested": round(msrp * 0.85, 2) if msrp else 0,
                "min": round(msrp * 0.7, 2) if msrp else 0,
                "max": round(msrp * 0.95, 2) if msrp else 0
            },
            "shopify": {
                "suggested": msrp if msrp else 0,
                "min": round(msrp * 0.8, 2) if msrp else 0,
                "max": round(msrp * 1.2, 2) if msrp else 0
            }
        }
        
        return jsonify(suggestions)
        
    except Exception as e:
        return jsonify({
            "ebay": {"suggested": 0},
            "shopify": {"suggested": 0}
        }), 500

# --- Usage Reporting Functions for Metered Billing ---
def get_tenant_subscription_info(tenant_id):
    """Get Stripe subscription information for a tenant"""
    try:
        tenant_res = supabase_admin.table('tenants').select(
            'stripe_subscription_id, stripe_customer_id, subscription_status'
        ).eq('id', tenant_id).single().execute()
        
        if not tenant_res.data:
            return None
        
        subscription_id = tenant_res.data.get('stripe_subscription_id')
        if not subscription_id:
            return None
        
        # Get subscription from Stripe to find usage price item
        subscription = stripe.Subscription.retrieve(subscription_id)
        return {
            'subscription_id': subscription_id,
            'customer_id': tenant_res.data.get('stripe_customer_id'),
            'status': tenant_res.data.get('subscription_status'),
            'subscription': subscription
        }
    except Exception as e:
        logger.error(f"Error getting subscription info for tenant {tenant_id}: {str(e)}")
        return None

def get_usage_subscription_item(subscription):
    """Get the usage-based subscription item from a Stripe subscription"""
    try:
        # Find the subscription item with metered billing
        for item in subscription.items.data:
            price = stripe.Price.retrieve(item.price.id)
            if price.billing_scheme == 'per_unit' and price.recurring and price.recurring.usage_type == 'metered':
                return item
        return None
    except Exception as e:
        logger.error(f"Error finding usage subscription item: {str(e)}")
        return None

def calculate_monthly_scan_count(tenant_id, start_date=None, end_date=None):
    """Calculate total scans for a tenant in the current billing period"""
    try:
        # If no dates provided, use current month
        if not start_date:
            now = datetime.now(timezone.utc)
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if not end_date:
            # Next month
            if start_date.month == 12:
                end_date = start_date.replace(year=start_date.year + 1, month=1)
            else:
                end_date = start_date.replace(month=start_date.month + 1)
        
        # Count scans for this tenant in the period
        scan_res = supabase_admin.from_('scan_history').select('*', count='exact').eq(
            'tenant_id', tenant_id
        ).gte('scanned_at', start_date.isoformat()).lt('scanned_at', end_date.isoformat()).execute()
        
        return scan_res.count if hasattr(scan_res, 'count') else (len(scan_res.data) if scan_res.data else 0)
    except Exception as e:
        logger.error(f"Error calculating scan count for tenant {tenant_id}: {str(e)}")
        return 0

def report_usage_to_stripe(tenant_id, usage_quantity):
    """Report usage to Stripe for metered billing"""
    try:
        if usage_quantity <= 0:
            return True  # No usage to report
        
        subscription_info = get_tenant_subscription_info(tenant_id)
        if not subscription_info:
            logger.warning(f"No subscription found for tenant {tenant_id}")
            return False
        
        subscription = subscription_info['subscription']
        usage_item = get_usage_subscription_item(subscription)
        
        if not usage_item:
            logger.warning(f"No usage subscription item found for tenant {tenant_id}")
            return False
        
        # Report usage to Stripe
        timestamp = int(datetime.now(timezone.utc).timestamp())
        stripe.UsageRecord.create(
            subscription_item=usage_item.id,
            quantity=usage_quantity,
            timestamp=timestamp,
            action='increment'  # Add to existing usage
        )
        
        logger.info(f"Reported {usage_quantity} usage units to Stripe for tenant {tenant_id}")
        return True
    except Exception as e:
        logger.error(f"Error reporting usage to Stripe for tenant {tenant_id}: {str(e)}")
        return False

def calculate_and_report_overage(tenant_id):
    """Calculate overage for current billing period and report to Stripe"""
    try:
        subscription_info = get_tenant_subscription_info(tenant_id)
        if not subscription_info:
            return 0
        
        subscription = subscription_info['subscription']
        
        # Get current billing period
        current_period_start = datetime.fromtimestamp(subscription.current_period_start, tz=timezone.utc)
        current_period_end = datetime.fromtimestamp(subscription.current_period_end, tz=timezone.utc)
        
        # Determine plan type from subscription
        plan_id = None
        for item in subscription.items.data:
            price_id = item.price.id
            found_plan_id, _ = get_plan_config_by_price_id(price_id)
            if found_plan_id:
                plan_id = found_plan_id
                break
        
        if not plan_id:
            logger.warning(f"Could not determine plan for tenant {tenant_id}")
            return 0
        
        plan_config = PLAN_CONFIG[plan_id]
        included_scans = plan_config['included_scans']
        
        # Calculate total scans in current period
        total_scans = calculate_monthly_scan_count(tenant_id, current_period_start, current_period_end)
        
        # Calculate overage
        overage = max(0, total_scans - included_scans)
        
        if overage > 0:
            # Report overage to Stripe
            report_usage_to_stripe(tenant_id, overage)
            logger.info(f"Tenant {tenant_id}: {total_scans} scans, {overage} overage (included: {included_scans})")
        
        return overage
    except Exception as e:
        logger.error(f"Error calculating overage for tenant {tenant_id}: {str(e)}")
        return 0

@app.route('/api/report-usage/', methods=['POST'])
def report_usage_endpoint():
    """Endpoint to manually trigger usage reporting (for testing or scheduled jobs)"""
    user_id, tenant_id = get_ids_from_request()
    if not tenant_id:
        return jsonify({"error": "Tenant not found"}), 401
    
    try:
        overage = calculate_and_report_overage(tenant_id)
        return jsonify({
            "success": True,
            "overage_scans": overage,
            "message": f"Reported {overage} overage scans to Stripe"
        })
    except Exception as e:
        logger.error(f"Error in report-usage endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/contact-support', methods=['POST'])
def contact_support():
    """
    Handle contact support form submissions
    Stores messages in Supabase and logs them for admin review
    """
    try:
        data = request.get_json()
        subject = data.get('subject', '').strip()
        message_type = data.get('type', 'other')  # bug, feature, question, other
        message = data.get('message', '').strip()
        user_email = data.get('user_email', 'Unknown')
        user_id = data.get('user_id')
        user_name = data.get('user_name', user_email)
        
        if not subject or not message:
            return jsonify({
                "success": False,
                "error": "Subject and message are required"
            }), 400
        
        # Store in Supabase if available
        if supabase_admin:
            try:
                support_data = {
                    'user_id': user_id,
                    'user_email': user_email,
                    'user_name': user_name,
                    'subject': subject,
                    'type': message_type,
                    'message': message,
                    'status': 'open',
                    'created_at': datetime.now(timezone.utc).isoformat()
                }
                
                # Try to insert into support_messages table
                try:
                    result = supabase_admin.table('support_messages').insert(support_data).execute()
                    logger.info(f"✅ Support message saved to database from {user_email}")
                except Exception as db_error:
                    # Table might not exist - log but continue
                    logger.warning(f"⚠️ Could not save to support_messages table (may not exist): {db_error}")
            except Exception as e:
                logger.warning(f"⚠️ Error saving support message to database: {e}")
        
        # Log the message (always log for now, even if DB insert fails)
        logger.info("=" * 60)
        logger.info("📧 CONTACT SUPPORT MESSAGE RECEIVED")
        logger.info(f"   From: {user_name} ({user_email})")
        logger.info(f"   User ID: {user_id or 'N/A'}")
        logger.info(f"   Type: {message_type}")
        logger.info(f"   Subject: {subject}")
        logger.info(f"   Message: {message}")
        logger.info("=" * 60)
        
        return jsonify({
            "success": True,
            "message": "Your message has been received. We'll get back to you soon!"
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error processing contact support request: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# ============================================================================
# FACEBOOK INTEGRATION ROUTES
# ============================================================================

@app.route('/api/facebook/oauth/initiate', methods=['POST'])
def facebook_oauth_initiate():
    """
    Initiate Facebook OAuth flow
    Returns the OAuth URL where user should be redirected
    """
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401
        
        # Generate state parameter (can include user_id for verification)
        import secrets
        state = secrets.token_urlsafe(32)
        
        # Store state in session or database for verification (simplified here)
        # In production, store state with user_id in database with expiration
        
        oauth_url = get_facebook_oauth_url(state=state)
        
        return jsonify({
            'success': True,
            'oauth_url': oauth_url,
            'state': state  # Frontend should store this for verification
        }), 200
        
    except ValueError as e:
        # Missing configuration
        logger.error(f"Facebook OAuth configuration error: {e}")
        return jsonify({
            'error': str(e),
            'message': 'Facebook integration is not configured. Please set FACEBOOK_APP_ID and FACEBOOK_REDIRECT_URI environment variables.'
        }), 500
    except Exception as e:
        logger.error(f"Error initiating Facebook OAuth: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'error': str(e),
            'message': 'An unexpected error occurred while initiating Facebook OAuth'
        }), 500


@app.route('/api/facebook/oauth/callback', methods=['POST'])
def facebook_oauth_callback():
    """
    Handle Facebook OAuth callback
    Exchanges code for token and stores integration data
    """
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401
        
        data = request.get_json()
        code = data.get('code')
        state = data.get('state')  # Verify state matches
        
        if not code:
            return jsonify({'error': 'Authorization code required'}), 400
        
        # Exchange code for access token
        token_data = exchange_code_for_token(code)
        
        # Calculate token expiration
        expires_at = None
        if token_data.get('expires_in'):
            expires_at = (datetime.now(timezone.utc) + timedelta(seconds=token_data['expires_in'])).isoformat()
        
        # Encrypt tokens before storing
        encrypted_user_token = encrypt_token(token_data['access_token'])
        
        # Get user's Facebook Pages
        pages = get_user_pages(token_data['access_token'])
        
        # Store or update integration in database
        if not supabase_admin:
            return jsonify({'error': 'Database not available'}), 500
        
        # Check if integration already exists
        existing = supabase_admin.table('facebook_integrations').select('*').eq('user_id', user_id).execute()
        
        integration_data = {
            'user_id': user_id,
            'tenant_id': tenant_id,
            'facebook_user_id': token_data['user_id'],
            'user_access_token_encrypted': encrypted_user_token,
            'token_expires_at': expires_at,
            'is_active': True,
            'last_sync_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        
        if existing.data and len(existing.data) > 0:
            # Update existing integration
            integration_id = existing.data[0]['id']
            supabase_admin.table('facebook_integrations').update(integration_data).eq('id', integration_id).execute()
        else:
            # Create new integration
            integration_data['created_at'] = datetime.now(timezone.utc).isoformat()
            result = supabase_admin.table('facebook_integrations').insert(integration_data).execute()
            integration_id = result.data[0]['id'] if result.data else None
        
        # Store pages
        if integration_id:
            # Delete old pages
            supabase_admin.table('facebook_pages').delete().eq('integration_id', integration_id).execute()
            
            # Insert new pages
            for page in pages:
                page_data = {
                    'integration_id': integration_id,
                    'user_id': user_id,
                    'tenant_id': tenant_id,
                    'page_id': page['id'],
                    'page_name': page.get('name', ''),
                    'page_category': page.get('category', ''),
                    'page_access_token_encrypted': encrypt_token(page.get('access_token', '')),
                    'is_selected': False,
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }
                supabase_admin.table('facebook_pages').insert(page_data).execute()
        
        return jsonify({
            'success': True,
            'integration_id': integration_id,
            'pages': pages,
            'message': 'Facebook account connected successfully'
        }), 200
        
    except Exception as e:
        logger.error(f"Error in Facebook OAuth callback: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/facebook/pages', methods=['GET'])
def facebook_get_pages():
    """Get list of Facebook Pages for the authenticated user"""
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401
        
        if not supabase_admin:
            return jsonify({'error': 'Database not available'}), 500
        
        # Get integration
        integration = supabase_admin.table('facebook_integrations').select('*').eq('user_id', user_id).eq('is_active', True).execute()
        
        if not integration.data or len(integration.data) == 0:
            return jsonify({
                'success': True,
                'pages': [],
                'message': 'No Facebook integration found. Please connect your Facebook account first.'
            }), 200
        
        integration_id = integration.data[0]['id']
        
        # Get pages
        pages_result = supabase_admin.table('facebook_pages').select('*').eq('integration_id', integration_id).execute()
        
        pages = []
        for page in pages_result.data or []:
            pages.append({
                'id': page['id'],
                'page_id': page['page_id'],
                'page_name': page['page_name'],
                'page_category': page.get('page_category'),
                'is_selected': page.get('is_selected', False)
            })
        
        return jsonify({
            'success': True,
            'pages': pages
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching Facebook pages: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/facebook/pages/select', methods=['POST'])
def facebook_select_page():
    """Select a Facebook Page for posting"""
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401
        
        data = request.get_json()
        page_id = data.get('page_id')
        
        if not page_id:
            return jsonify({'error': 'Page ID required'}), 400
        
        if not supabase_admin:
            return jsonify({'error': 'Database not available'}), 500
        
        # Get integration
        integration = supabase_admin.table('facebook_integrations').select('*').eq('user_id', user_id).eq('is_active', True).execute()
        
        if not integration.data or len(integration.data) == 0:
            return jsonify({'error': 'Facebook integration not found'}), 404
        
        integration_id = integration.data[0]['id']
        
        # Get the selected page
        page_result = supabase_admin.table('facebook_pages').select('*').eq('integration_id', integration_id).eq('page_id', page_id).execute()
        
        if not page_result.data or len(page_result.data) == 0:
            return jsonify({'error': 'Page not found'}), 404
        
        page = page_result.data[0]
        page_access_token = decrypt_token(page['page_access_token_encrypted'])
        
        # Update all pages to unselected
        supabase_admin.table('facebook_pages').update({'is_selected': False}).eq('integration_id', integration_id).execute()
        
        # Set selected page
        supabase_admin.table('facebook_pages').update({
            'is_selected': True,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('id', page['id']).execute()
        
        # Update integration with selected page
        supabase_admin.table('facebook_integrations').update({
            'selected_page_id': page_id,
            'page_access_token_encrypted': encrypt_token(page_access_token),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('id', integration_id).execute()
        
        return jsonify({
            'success': True,
            'message': f'Selected page: {page["page_name"]}'
        }), 200
        
    except Exception as e:
        logger.error(f"Error selecting Facebook page: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/facebook/catalog/set', methods=['POST'])
def facebook_set_catalog():
    """Store Facebook Catalog ID for the user"""
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401
        
        data = request.get_json()
        catalog_id = data.get('catalog_id', '').strip()
        
        if not catalog_id:
            return jsonify({'error': 'Catalog ID required'}), 400
        
        if not supabase_admin:
            return jsonify({'error': 'Database not available'}), 500
        
        # Get or create integration
        integration = supabase_admin.table('facebook_integrations').select('*').eq('user_id', user_id).execute()
        
        if not integration.data or len(integration.data) == 0:
            return jsonify({'error': 'Facebook integration not found. Please connect Facebook first.'}), 404
        
        integration_id = integration.data[0]['id']
        
        # Update catalog ID
        supabase_admin.table('facebook_integrations').update({
            'catalog_id': catalog_id,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('id', integration_id).execute()
        
        return jsonify({
            'success': True,
            'message': 'Catalog ID saved successfully'
        }), 200
        
    except Exception as e:
        logger.error(f"Error setting Facebook catalog: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/facebook/integration/status', methods=['GET'])
def facebook_integration_status():
    """Get Facebook integration status for the authenticated user"""
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401
        
        if not supabase_admin:
            return jsonify({'error': 'Database not available'}), 500
        
        # Get integration
        integration = supabase_admin.table('facebook_integrations').select('*').eq('user_id', user_id).eq('is_active', True).execute()
        
        if not integration.data or len(integration.data) == 0:
            return jsonify({
                'success': True,
                'connected': False,
                'has_page': False,
                'has_catalog': False
            }), 200
        
        integration_data = integration.data[0]
        
        # Get selected page
        selected_page = None
        if integration_data.get('selected_page_id'):
            pages = supabase_admin.table('facebook_pages').select('*').eq('integration_id', integration_data['id']).eq('page_id', integration_data['selected_page_id']).execute()
            if pages.data and len(pages.data) > 0:
                selected_page = {
                    'page_id': pages.data[0]['page_id'],
                    'page_name': pages.data[0]['page_name']
                }
        
        return jsonify({
            'success': True,
            'connected': True,
            'has_page': bool(selected_page),
            'has_catalog': bool(integration_data.get('catalog_id')),
            'selected_page': selected_page,
            'catalog_id': integration_data.get('catalog_id')
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting Facebook integration status: {e}")
        return jsonify({'error': str(e)}), 500


def facebook_post_product_internal(user_id, tenant_id, product_data, integration_data=None):
    """
    Internal function to post a product to Facebook
    Can be called from scan endpoint or API route
    Returns: {'success': bool, 'post_url': str, 'error': str}
    """
    try:
        if not supabase_admin:
            return {'success': False, 'error': 'Database not available'}
        
        # Get integration if not provided
        if not integration_data:
            integration = supabase_admin.table('facebook_integrations').select('*').eq('user_id', user_id).eq('is_active', True).execute()
            if not integration.data or len(integration.data) == 0:
                return {'success': False, 'error': 'Facebook integration not found'}
            integration_data = integration.data[0]
        
        if not integration_data.get('selected_page_id'):
            return {'success': False, 'error': 'No Facebook Page selected'}
        
        if not integration_data.get('catalog_id'):
            return {'success': False, 'error': 'Facebook Catalog ID not set'}
        
        # Extract product data
        product_name = product_data.get('name') or product_data.get('title', 'Product')
        product_description = product_data.get('description') or product_name
        product_price = product_data.get('price', '0.00')
        product_image_url = product_data.get('image') or product_data.get('image_url', '')
        retailer_id = product_data.get('asin') or product_data.get('fnsku') or product_data.get('sku', '')
        
        if not retailer_id:
            return {'success': False, 'error': 'Product identifier required'}
        
        # Decrypt page access token
        page_access_token = decrypt_token(integration_data['page_access_token_encrypted'])
        page_id = integration_data['selected_page_id']
        catalog_id = integration_data['catalog_id']
        
        # Format price for Facebook (e.g., "10.99 USD")
        try:
            price_value = float(product_price)
            price_str = f"{price_value:.2f} USD"
        except (ValueError, TypeError):
            price_str = "0.00 USD"
            price_value = 0.0
        
        # Create or update catalog product
        catalog_product_data = {
            'retailer_id': retailer_id,
            'name': product_name,
            'description': product_description[:5000] if len(product_description) > 5000 else product_description,
            'price': price_str,
            'image_url': product_image_url or '',
            'availability': 'in stock',
            'condition': 'new'
        }
        
        try:
            facebook_product_id = create_catalog_product(catalog_id, page_access_token, catalog_product_data)
        except Exception as e:
            logger.error(f"Error creating Facebook catalog product: {e}")
            return {'success': False, 'error': f'Failed to create catalog product: {str(e)}'}
        
        # Store catalog product in database
        catalog_product_db_data = {
            'user_id': user_id,
            'tenant_id': tenant_id,
            'integration_id': integration_data['id'],
            'facebook_retailer_id': retailer_id,
            'facebook_catalog_product_id': facebook_product_id,
            'product_name': product_name,
            'product_description': product_description,
            'product_price': price_value,
            'product_image_url': product_image_url,
            'is_published': True,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        
        # Check if catalog product already exists
        existing_catalog = supabase_admin.table('facebook_catalog_products').select('*').eq('integration_id', integration_data['id']).eq('facebook_retailer_id', retailer_id).execute()
        
        if existing_catalog.data and len(existing_catalog.data) > 0:
            catalog_product_id = existing_catalog.data[0]['id']
            supabase_admin.table('facebook_catalog_products').update(catalog_product_db_data).eq('id', catalog_product_id).execute()
        else:
            result = supabase_admin.table('facebook_catalog_products').insert(catalog_product_db_data).execute()
            catalog_product_id = result.data[0]['id'] if result.data else None
        
        # Upload product image(s) to page
        photo_ids = []
        if product_image_url:
            try:
                photo_id = upload_photo_to_page(page_id, page_access_token, product_image_url, published=False)
                photo_ids.append(photo_id)
            except Exception as e:
                logger.warning(f"Error uploading photo to page: {e}")
        
        # Create post on page
        post_message = f"🛍️ New Product: {product_name}\n\n💰 Price: ${price_value:.2f}\n\n{product_description[:500] if len(product_description) > 500 else product_description}"
        
        try:
            post_result = create_page_post(
                page_id,
                page_access_token,
                post_message,
                photo_ids=photo_ids if photo_ids else None,
                product_id=facebook_product_id
            )
        except Exception as e:
            logger.error(f"Error creating Facebook post: {e}")
            return {'success': False, 'error': f'Failed to create post: {str(e)}'}
        
        # Store post in database
        post_db_data = {
            'user_id': user_id,
            'tenant_id': tenant_id,
            'integration_id': integration_data['id'],
            'catalog_product_id': catalog_product_id,
            'post_id': post_result['post_id'],
            'page_id': page_id,
            'post_message': post_message,
            'post_image_urls': [product_image_url] if product_image_url else [],
            'post_url': post_result['post_url'],
            'is_published': True,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        
        # Check if post already exists
        existing_post = supabase_admin.table('product_posts').select('*').eq('integration_id', integration_data['id']).eq('catalog_product_id', catalog_product_id).eq('page_id', page_id).execute()
        
        if existing_post.data and len(existing_post.data) > 0:
            supabase_admin.table('product_posts').update(post_db_data).eq('id', existing_post.data[0]['id']).execute()
        else:
            supabase_admin.table('product_posts').insert(post_db_data).execute()
        
        return {
            'success': True,
            'post_id': post_result['post_id'],
            'post_url': post_result['post_url'],
            'catalog_product_id': facebook_product_id
        }
        
    except Exception as e:
        logger.error(f"Error in facebook_post_product_internal: {e}")
        return {'success': False, 'error': str(e)}


@app.route('/api/facebook/post-product', methods=['POST'])
def facebook_post_product():
    """
    Post a scanned product to Facebook Page
    This endpoint is called after a product is scanned
    """
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401
        
        data = request.get_json()
        
        # Product data from scan
        product_data = {
            'name': data.get('name') or data.get('title', 'Product'),
            'description': data.get('description', ''),
            'price': data.get('price', '0.00'),
            'image': data.get('image') or data.get('image_url', ''),
            'asin': data.get('asin', ''),
            'fnsku': data.get('fnsku', ''),
            'sku': data.get('sku', '')
        }
        
        retailer_id = product_data['asin'] or product_data['fnsku'] or product_data['sku']
        if not retailer_id:
            return jsonify({'error': 'Product identifier (ASIN, FNSKU, or SKU) required'}), 400
        
        result = facebook_post_product_internal(user_id, tenant_id, product_data)
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'post_id': result.get('post_id'),
                'post_url': result.get('post_url'),
                'catalog_product_id': result.get('catalog_product_id'),
                'message': 'Product posted to Facebook successfully'
            }), 200
        else:
            return jsonify({'error': result.get('error', 'Failed to post product')}), 500
        
    except Exception as e:
        logger.error(f"Error posting product to Facebook: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/facebook/disconnect', methods=['POST'])
def facebook_disconnect():
    """Disconnect Facebook integration"""
    try:
        user_id, tenant_id = get_ids_from_request()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401
        
        if not supabase_admin:
            return jsonify({'error': 'Database not available'}), 500
        
        # Deactivate integration
        supabase_admin.table('facebook_integrations').update({
            'is_active': False,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('user_id', user_id).execute()
        
        return jsonify({
            'success': True,
            'message': 'Facebook integration disconnected'
        }), 200
        
    except Exception as e:
        logger.error(f"Error disconnecting Facebook: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Render uses PORT environment variable, fallback to FLASK_RUN_PORT for local dev
    port = int(os.environ.get("PORT", os.environ.get("FLASK_RUN_PORT", 5000)))
    debug_mode = os.environ.get("FLASK_DEBUG", "True").lower() == "true"
    
    # Optional: Add CORS if your React app is on a different origin (e.g., localhost:5173 vs localhost:5000)
    # from flask_cors import CORS
    # CORS(app, resources={r"/api/*": {"origins": "http://localhost:5173"}}) # Example for specific API routes

    print("=" * 60)
    print(f"STARTING FLASK BACKEND SERVER")
    print(f"Port: {port}")
    print(f"Debug Mode: {debug_mode}")
    print(f"Host: 0.0.0.0 (accessible from all interfaces)")
    print("=" * 60)
    logger.info(f"Starting Flask app on port {port} with debug mode: {debug_mode}")
    print(f"\n✅ Backend server is RUNNING - waiting for requests...")
    print(f"📡 API Endpoint: http://localhost:{port}/api/scan")
    print(f"💡 All API requests will be logged below:\n")
    app.run(debug=debug_mode, port=port, host='0.0.0.0') 
