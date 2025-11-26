import os
import pandas as pd
import requests
import json
import base64
from datetime import datetime, timezone
from flask import Flask, request, render_template, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime, timezone
import stripe
from supabase import create_client, Client
import logging # For better logging

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
allowed_origins = os.environ.get('ALLOWED_ORIGINS', '*').split(',')
if allowed_origins == ['*']:
    # Development: allow all origins
    CORS(app)
else:
    # Production: allow specific origins
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

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
STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY') # For frontend if needed there

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

# --- Plan Configuration ---
PLAN_CONFIG = {
    'basic': {
        'name': 'Basic',
        'monthly_price': 150.00,
        'included_scans': 1000,
        'overage_rate': 0.11,
        'base_price_id': os.environ.get('STRIPE_BASIC_PLAN_PRICE_ID'),
        'usage_price_id': os.environ.get('STRIPE_BASIC_USAGE_PRICE_ID'),
    },
    'pro': {
        'name': 'Pro',
        'monthly_price': 300.00,
        'included_scans': 5000,
        'overage_rate': 0.11,
        'base_price_id': os.environ.get('STRIPE_PRO_PLAN_PRICE_ID'),
        'usage_price_id': os.environ.get('STRIPE_PRO_USAGE_PRICE_ID'),
    },
    'entrepreneur': {
        'name': 'Entrepreneur',
        'monthly_price': 500.00,
        'included_scans': 20000,
        'overage_rate': 0.11,
        'base_price_id': os.environ.get('STRIPE_ENTREPRENEUR_PLAN_PRICE_ID'),
        'usage_price_id': os.environ.get('STRIPE_ENTREPRENEUR_USAGE_PRICE_ID'),
    },
}

def get_plan_config_by_price_id(price_id):
    """Get plan configuration by base price ID"""
    for plan_id, config in PLAN_CONFIG.items():
        if config['base_price_id'] == price_id:
            return plan_id, config
    return None, None

# Usage-based price IDs for metered billing (overages)
STRIPE_BASIC_USAGE_PRICE_ID = os.environ.get('STRIPE_BASIC_USAGE_PRICE_ID')
STRIPE_PRO_USAGE_PRICE_ID = os.environ.get('STRIPE_PRO_USAGE_PRICE_ID')
STRIPE_ENTREPRENEUR_USAGE_PRICE_ID = os.environ.get('STRIPE_ENTREPRENEUR_USAGE_PRICE_ID')

if not STRIPE_API_KEY or not STRIPE_WEBHOOK_SECRET:
    logger.error("Stripe API Key or Webhook Secret not found in .env. Stripe integration will fail.")
if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY

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
    frontend_dashboard_url = os.environ.get('FRONTEND_BASE_URL', 'http://localhost:5173') + "/dashboard?payment=success"
    return redirect(frontend_dashboard_url)

@app.route('/checkout-cancel/') # Example, not directly used
def checkout_cancel_server_redirect():
    flash('Subscription process canceled.', 'warning')
    frontend_pricing_url = os.environ.get('FRONTEND_BASE_URL', 'http://localhost:5173') + "/pricing?payment=cancelled"
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
# Example placeholder for upload:
@app.route('/upload', methods=['GET', 'POST'])
def upload_csv():
    user_id, tenant_id = get_ids_from_request()
    if not tenant_id:
        # For GET, redirect to login/pricing. For POST, return 403.
        if request.method == 'POST':
            return jsonify({"error": "Access denied. Tenant not identified."}), 403
        else: # GET request
            # Assuming you have a frontend route for this, or redirect to login
            return render_template('upload.html', error_message="Access Denied. Please log in.")


    # TODO: Check tenant subscription status before allowing upload
    # tenant_q = supabase_admin.table('tenants').select('subscription_status').eq('id', tenant_id).single().execute()
    # if not tenant_q.data or tenant_q.data['subscription_status'] not in ['active', 'trialing']:
    #     return jsonify({"error": "Access denied. Subscription is not active."}), 403


    if request.method == 'POST':
        if 'csvfile' not in request.files:
            flash('No file part', 'danger') # flash might not be visible if frontend is pure React
            return jsonify({"error": "No file part in request"}), 400
        
        file = request.files['csvfile']
        if file.filename == '':
            flash('No selected file', 'danger')
            return jsonify({"error": "No file selected"}), 400

        if file and file.filename.endswith('.csv'):
            try:
                # Read CSV, for each row, add tenant_id before inserting
                # df = pd.read_csv(file, dtype=str, encoding='utf-8') or 'latin1'
                # items_to_insert = []
                # for _, row in df.iterrows():
                #    item = { ... map columns ... , "tenant_id": tenant_id }
                #    items_to_insert.append(item)
                # if items_to_insert:
                #    insert_res = supabase.table('manifest_data').insert(items_to_insert).execute()
                #    if insert_res.error: raise Exception(insert_res.error.message)
                # flash('CSV processed and data added for your tenant.', 'success')
                logger.info(f"CSV upload attempt by tenant {tenant_id}. Processing logic to be implemented fully.")
                return jsonify({"message": "CSV processing logic needs full implementation with tenant_id."}), 200 # Placeholder
            except Exception as e:
                logger.error(f"Error processing CSV for tenant {tenant_id}: {e}")
                # db.session.rollback() # If using SQLAlchemy transactions
                flash(f'Error processing CSV: {str(e)}', 'danger')
                return jsonify({"error": f"Error processing CSV: {str(e)}"}), 500
        else:
            flash('Invalid file type. Please upload a CSV file.', 'danger')
            return jsonify({"error": "Invalid file type. Must be CSV."}), 400

    # For GET request, render the upload form (if still using Flask templates for this)
    # Or this endpoint might be API-only, and React handles the form.
    return render_template('upload.html')

@app.route('/search', methods=['GET'])
def search():
    query = request.args.get('query', '').strip()
    product = None
    search_performed = bool(query) # True if query is not empty

    if query:
        # Search by LPN, ASIN, or FNSKU
        product = Product.query.filter(
            (Product.lpn == query) |
            (Product.asin == query) |
            (Product.fnsku == query)
        ).first()

        if product:
            # Log this successful search to history
            try:
                history_entry = ScanHistory(product_id=product.id)
                db.session.add(history_entry)
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                print(f"Error logging scan history: {e}") # Log to server console
    
    return render_template('search.html', product=product, search_performed=search_performed)

@app.route('/inventory')
def inventory():
    search_query = request.args.get('search_query', '').strip()
    page = request.args.get('page', 1, type=int) # Get current page number, default to 1
    per_page = 25  # Number of items per page

    query = Product.query

    if search_query:
        search_term = f"%{search_query}%"
        query = query.filter(
            Product.lpn.ilike(search_term) |
            Product.title.ilike(search_term) |
            Product.asin.ilike(search_term) |
            Product.fnsku.ilike(search_term)
        )
    
    # Use paginate instead of .all()
    pagination = query.order_by(Product.title).paginate(page=page, per_page=per_page, error_out=False)
    products_on_page = pagination.items
    
    return render_template('inventory.html', 
                           products=products_on_page, 
                           pagination=pagination, 
                           search_query=search_query)

@app.route('/scan')
def scan_barcode():
    return render_template('scan.html')

@app.route('/external-scan')
def external_scan():
    return render_template('external_scan.html')

@app.route('/api/external-lookup', methods=['POST'])
def external_lookup():
    """Lookup product data from external API using FNSKU - with Supabase caching to avoid duplicate charges"""
    try:
        data = request.get_json()
        fnsku = data.get('fnsku', '').strip()
        
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
                
                if cache_result.data:
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
                    
                    # Return cached data
                    product_data = {
                        "success": True,
                        "source": "api_cache",
                        "asin": cached.get('asin') or '',
                        "title": cached.get('product_name') or f"Product {fnsku}",
                        "price": str(cached.get('price', 0)) if cached.get('price') else '',
                        "fnsku": fnsku,
                        "image_url": cached.get('image_url') or '',
                        "description": cached.get('description') or '',
                        "category": cached.get('category') or '',
                        "upc": cached.get('upc') or '',
                        "amazon_url": f"https://www.amazon.com/dp/{cached.get('asin')}" if cached.get('asin') else '',
                        "scan_task_id": cached.get('scan_task_id') or '',
                        "task_state": cached.get('task_state') or '',
                        "asin_found": cached.get('asin_found', False),
                        "cost_status": "no_charge",
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

@app.route('/api/scan', methods=['POST'])
def scan_product():
    """
    Unified scan endpoint that handles FNSKU → ASIN → Rainforest API → Cache → Response
    Frontend makes ONE request and gets complete product data back.
    """
    try:
        data = request.get_json()
        code = data.get('code', '').strip()
        user_id = data.get('user_id', '').strip()
        
        # Use both print and logger to ensure visibility
        print("\n" + "=" * 60)
        print(f"🔍 SCAN REQUEST RECEIVED")
        print(f"   FNSKU: {code}")
        print(f"   UserID: {user_id}")
        print(f"   Supabase admin client: {supabase_admin is not None}")
        print("=" * 60)
        
        logger.info(f"🔍 ========== SCAN REQUEST RECEIVED ==========")
        logger.info(f"   FNSKU: {code}")
        logger.info(f"   UserID: {user_id}")
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
                "error": "Invalid FNSKU",
                "message": "Code is required"
            }), 400
        
        # Get API keys from environment
        FNSKU_API_KEY = os.environ.get('FNSKU_API_KEY')
        RAINFOREST_API_KEY = os.environ.get('RAINFOREST_API_KEY')
        
        if not FNSKU_API_KEY:
            logger.error("FNSKU_API_KEY not found in environment variables")
            return jsonify({
                "success": False,
                "error": "Unauthorized API key",
                "message": "FNSKU API key not configured"
            }), 500
        
        # STEP 1: Check Supabase cache first (instant return if cached)
        if supabase_admin:
            try:
                cache_result = supabase_admin.table('api_lookup_cache').select('*').eq('fnsku', code).maybe_single().execute()
                
                if cache_result.data:
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
                    
                    # If cache is fresh (<30 days) and has complete data, return immediately
                    if age_days < 30 and cached.get('image_url') and cached.get('product_name'):
                        logger.info(f"✅ Returning cached data for FNSKU {code} (age: {age_days} days)")
                        return jsonify({
                            "success": True,
                            "fnsku": cached.get('fnsku', code),
                            "asin": cached.get('asin', ''),
                            "title": cached.get('product_name', ''),
                            "price": str(cached.get('price', 0)) if cached.get('price') else '',
                            "image": cached.get('image_url', ''),
                            "brand": cached.get('brand', ''),
                            "category": cached.get('category', ''),
                            "description": cached.get('description', ''),
                            "upc": cached.get('upc', ''),
                            "amazon_url": f"https://www.amazon.com/dp/{cached.get('asin')}" if cached.get('asin') else '',
                            "source": "cache",
                            "cost_status": "no_charge",
                            "cached": True,
                            "raw": cached
                        })
            except Exception as cache_error:
                logger.warning(f"Error checking cache: {cache_error}")
        
        # STEP 2: Not in cache or cache is stale - call FNSKU API with polling
        logger.info(f"💰 FNSKU {code} not in cache - calling FNSKU API (will be charged)")
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
                        
                        if response_json.get('product'):
                            product = response_json['product']
                            logger.info(f"✅ Product found in Rainforest response. Title: {product.get('title', 'N/A')[:50]}...")
                            
                            rainforest_data = {
                                'title': product.get('title', ''),
                                'image': product.get('main_image', {}).get('link') or (product.get('images', [{}])[0].get('link') if product.get('images') else ''),
                                'price': product.get('buybox_winner', {}).get('price', {}).get('value') or product.get('price', {}).get('value'),
                                'rating': product.get('rating'),
                                'reviews_count': product.get('reviews_total'),
                                'brand': product.get('brand', ''),
                                'category': product.get('category', {}).get('name', '') if isinstance(product.get('category'), dict) else '',
                                'description': product.get('description', '')
                            }
                            logger.info(f"✅ Rainforest API data retrieved for ASIN {asin}: title={rainforest_data.get('title', '')[:50]}, price={rainforest_data.get('price')}, brand={rainforest_data.get('brand')}")
                        else:
                            logger.warning(f"⚠️ Rainforest API response does not contain 'product' key. Response: {str(response_json)[:200]}")
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
        image_url = (rainforest_data.get('image') if rainforest_data else '') or (scan_data.get('imageUrl') if scan_data else '') or (scan_data.get('image') if scan_data else '') or ''
        price = (rainforest_data.get('price') if rainforest_data else None) or (scan_data.get('price') if scan_data else None) or (scan_data.get('listPrice') if scan_data else None) or 0
        description = (rainforest_data.get('description') if rainforest_data else '') or (scan_data.get('description') if scan_data else '') or product_name
        category = (rainforest_data.get('category') if rainforest_data else '') or (scan_data.get('category') if scan_data else '') or 'External API'
        brand = (rainforest_data.get('brand') if rainforest_data else '') or (scan_data.get('brand') if scan_data else '') or ''
        
        logger.info(f"📊 Final response data: title={product_name[:50]}, price={price}, brand={brand}, category={category}, image={image_url[:50] if image_url else 'none'}")
        
        response_data = {
            "success": True,
            "fnsku": code,
            "asin": asin,
            "title": product_name,
            "price": str(price) if price else '',
            "image": image_url,
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
                # Table columns: fnsku, asin, product_name, description, price, category, upc, image_url, source, scan_task_id, task_state, asin_found, lookup_count, last_accessed, created_at, updated_at
                # NOTE: 'brand' column does NOT exist in the table, so we don't include it
                cache_data = {
                    'fnsku': code,  # REQUIRED
                    'asin': asin,  # REQUIRED
                    'product_name': (product_name[:500] if product_name else f"Product {code}") or f"Product {code}",  # Ensure not None
                    'description': (description[:2000] if description else product_name) or '',  # Can be empty
                    'price': price_float,
                    'category': (category[:200] if category else 'External API') or 'External API',
                    'image_url': image_url[:500] if image_url else None,
                    'upc': scan_data.get('upc') if (scan_data and scan_data.get('upc')) else None,
                    'source': 'rainforest_api' if rainforest_data else 'fnskutoasin.com',
                    'scan_task_id': str(task_id) if task_id else None,
                    'task_state': str(scan_data.get('taskState', '')) if (scan_data and scan_data.get('taskState')) else None,
                    'asin_found': True,
                    'last_accessed': now,
                    'updated_at': now
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
        
        # Log scan event for Stripe usage tracking (if user_id provided)
        if user_id and supabase_admin:
            try:
                supabase_admin.table('api_scan_logs').insert({
                    'user_id': user_id,
                    'fnsku_scanned': code,
                    'asin_retrieved': asin,
                    'api_source': 'fnskutoasin.com',
                    'is_charged_call': True,
                    'created_at': datetime.now(timezone.utc).isoformat()
                }).execute()
            except Exception as log_error:
                logger.warning(f"Failed to log scan event: {log_error}")
        
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

@app.route('/dashboard')
def dashboard():
    total_products = Product.query.count()
    total_scans = ScanHistory.query.count()
    # You could add more sophisticated stats here later, e.g., scans today, unique items scanned, etc.
    return render_template('dashboard.html', 
                           total_products=total_products, 
                           total_scans=total_scans)

@app.route('/history')
def scan_history_list():
    # Fetch history, ordering by most recent, joining with Product to get details
    # Limit to a reasonable number, e.g., last 50 scans, for performance
    history_items = ScanHistory.query.join(Product).order_by(ScanHistory.scanned_at.desc()).limit(50).all()
    return render_template('history.html', history_items=history_items)

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
                    'tenant_id': tenant_id  # Associate with tenant
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

if __name__ == '__main__':
    port = int(os.environ.get("FLASK_RUN_PORT", 5000))
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
