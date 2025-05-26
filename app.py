import os
import pandas as pd
import requests
import json
import base64
from flask import Flask, request, render_template, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv, find_dotenv
import stripe
from supabase import create_client, Client
import logging # For better logging
from decimal import Decimal
from datetime import datetime
import urllib.parse # For URL encoding the query

# Very verbose debug to see what's happening
print("Current directory:", os.getcwd())

# Explicitly find and load .env from the current working directory
dotenv_path = find_dotenv(filename='.env', raise_error_if_not_found=False, usecwd=True)
print(f"Attempting to load .env from: {dotenv_path if dotenv_path else 'Not found by find_dotenv in CWD.'}")

if dotenv_path:
    loaded_successfully = load_dotenv(dotenv_path=dotenv_path, verbose=True, override=True)
    print(f".env file loaded from '{dotenv_path}': {loaded_successfully}")
else:
    # Fallback to default search if find_dotenv with usecwd=True specifically fails
    # This might indicate .env is not in CWD but possibly a parent dir, or another issue.
    print("find_dotenv did not locate .env in current working directory. Attempting default load_dotenv() search.")
    default_loaded = load_dotenv(verbose=True, override=True)
    print(f"Default load_dotenv() result: {default_loaded}")

print("Loaded environment variables (after explicit/default load attempt):")
print("DATABASE_URL:", os.environ.get('DATABASE_URL'))
print("SUPABASE_URL:", os.environ.get('SUPABASE_URL'))
print("SUPABASE_KEY:", os.environ.get('SUPABASE_KEY'))
print("SUPABASE_SERVICE_KEY:", os.environ.get('SUPABASE_SERVICE_KEY'))
print("EBAY_CLIENT_ID:", os.environ.get('EBAY_CLIENT_ID'))
print("EBAY_CLIENT_SECRET:", os.environ.get('EBAY_CLIENT_SECRET'))

# Load environment variables from .env file
# load_dotenv() # Already called with verbose=True above, this one is redundant

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Enable CORS - important for allowing the React frontend to call your API
CORS(app, resources={r"/api/*": {"origins": "*"}})

# --- Flask App Configuration ---
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(24))

# --- Database Configuration (SQLAlchemy) ---
# This is the single, conditional initialization block for SQLAlchemy's db instance.
DATABASE_URL = os.environ.get('DATABASE_URL')
db = None # Initialize db as None by default
if DATABASE_URL:
    app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {"pool_pre_ping": True}
    try:
        db = SQLAlchemy(app) # Initialize db instance here if DATABASE_URL is set
        logger.info("SQLAlchemy initialized with DATABASE_URL.")
    except Exception as e_sql:
        logger.error(f"SQLAlchemy initialization failed even with DATABASE_URL set: {e_sql}")
        db = None # Ensure db is None if initialization fails
else:
    logger.warning("DATABASE_URL not found in .env. SQLAlchemy (db object) will be None. SQLAlchemy features will be unavailable.")
    # db is already None, so no action needed here other than the warning.

# eBay API Configuration
EBAY_CLIENT_ID = os.getenv('EBAY_CLIENT_ID')
EBAY_CLIENT_SECRET = os.getenv('EBAY_CLIENT_SECRET')
EBAY_SANDBOX = os.getenv('EBAY_SANDBOX', 'true').lower() == 'true'
EBAY_REDIRECT_URI = os.environ.get('EBAY_REDIRECT_URI')

# Shopify API Configuration
SHOPIFY_SHOP_DOMAIN = os.getenv('SHOPIFY_SHOP_DOMAIN')  # e.g., 'your-shop.myshopify.com'
SHOPIFY_ACCESS_TOKEN = os.getenv('SHOPIFY_ACCESS_TOKEN')

# --- Stripe Configuration ---
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')
STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY') # For frontend if needed there

# Load Price IDs from environment variables
STRIPE_STARTER_PLAN_PRICE_ID = os.environ.get('STRIPE_STARTER_PLAN_PRICE_ID')
STRIPE_PRO_PLAN_PRICE_ID = os.environ.get('STRIPE_PRO_PLAN_PRICE_ID')
STRIPE_ENTERPRISE_PLAN_PRICE_ID = os.environ.get('STRIPE_ENTERPRISE_PLAN_PRICE_ID')

if not STRIPE_API_KEY or not STRIPE_WEBHOOK_SECRET:
    logger.error("Stripe API Key or Webhook Secret not found in .env. Stripe integration will fail.")
# Only set stripe.api_key if it's actually available
if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY
else:
    logger.warning("STRIPE_API_KEY is not set. Stripe functionality will be disabled.")

# --- Supabase Configuration ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_KEY") # Anon key for RLS-protected access
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") # Service role key for admin operations

if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_KEY:
    logger.error("Supabase URL or Keys not found in .env. Supabase integration will fail.")
    supabase: Client = None
    supabase_admin: Client = None
else:
    # Client for RLS-protected access (typically using user's JWT)
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    # Client for admin operations (bypasses RLS)
    supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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
        
        # Create the checkout session
        checkout_session = stripe.checkout.Session.create(
            customer=stripe_customer_id,
            payment_method_types=['card'],
            line_items=[{'price': price_id, 'quantity': 1}],
            mode='subscription',
            success_url=f"{frontend_url}/checkout-success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_url}/checkout-cancel",
            metadata={
                'tenant_id': tenant_id, 
                'supabase_user_id': user_id
            }
        )
        
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

# ... (rest of the code) ...

@app.route('/api/barcode_scan', methods=['POST'])
def handle_barcode_scan():
    user_id, tenant_id = get_ids_from_request()
    if not tenant_id:
        return jsonify({"error": "Unauthorized or tenant ID missing"}), 401
    if not supabase_admin:
        return jsonify({"error": "Supabase admin client not configured."}), 500

    data = request.get_json()
    barcode = data.get('barcode')

    if not barcode:
        return jsonify({"error": "Barcode is required"}), 400

    try:
        item = None
        found_by_column = None

        # Search by UPC, Fn Sku, X-Z ASIN in manifest_data
        product_response_upc = supabase_admin.table('manifest_data').select('*').eq('tenant_id', tenant_id).eq('UPC', barcode).maybe_single().execute()
        if product_response_upc.data:
            item = product_response_upc.data
            found_by_column = 'UPC'
        else:
            product_response_fnsku = supabase_admin.table('manifest_data').select('*').eq('tenant_id', tenant_id).eq('Fn Sku', barcode).maybe_single().execute()
            if product_response_fnsku.data:
                item = product_response_fnsku.data
                found_by_column = 'Fn Sku'
            else:
                product_response_lpn = supabase_admin.table('manifest_data').select('*').eq('tenant_id', tenant_id).eq('X-Z ASIN', barcode).maybe_single().execute()
                if product_response_lpn.data:
                    item = product_response_lpn.data
                    found_by_column = 'X-Z ASIN'

        if item:
            mapped_item = {
                "id": item.get("id"),
                "sku": item.get("Fn Sku"),
                "lpn": item.get("X-Z ASIN"),
                "asin": item.get("B00 Asin"),
                "fnsku": item.get("Fn Sku"),
                "name": item.get("Description"), # Assuming 'Description' is the title
                "description": item.get("Description"),
                "price": item.get("MSRP"),
                "category": item.get("Category"), # This might be an internal category
                "upc": item.get("UPC"),
                "quantity": item.get("Quantity"),
                "image_url": item.get("Image URL"), # Assuming 'Image URL' column exists
                "barcode_scanned": barcode,
                "found_by_column": found_by_column,
                "source": "local_db"
            }
            logger.info(f"Barcode '{barcode}' found locally for tenant '{tenant_id}'. Product SKU: {mapped_item['sku']}")
            return jsonify({"message": "Barcode successfully scanned", "product": mapped_item, "status": "found_in_db"}), 200
        else:
            # Not found locally, try eBay Catalog API
            logger.info(f"Barcode '{barcode}' not found locally for tenant '{tenant_id}'. Querying eBay Catalog API.")
            try:
                ebay_token = get_ebay_token() # You have this helper
                if not ebay_token:
                    logger.error("Failed to get eBay token for Catalog API lookup.")
                    # Don't expose token error directly, but indicate external lookup failed
                    return jsonify({"error": "Product not found locally. External lookup service unavailable."}), 404 

                search_url_base = "https://api.sandbox.ebay.com/commerce/catalog/v1_beta/product_summary/search" if EBAY_SANDBOX else "https://api.ebay.com/commerce/catalog/v1/product_summary/search"
                headers = {
                    'Authorization': f'Bearer {ebay_token}',
                    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' # Assuming US marketplace
                }
                params = {'gtin': barcode}
                
                response = requests.get(search_url_base, headers=headers, params=params)
                response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
                
                ebay_data = response.json()

                if ebay_data.get("total", 0) > 0 and ebay_data.get("productSummaries"):
                    product_summary = ebay_data["productSummaries"][0] # Take the first match

                    # Attempt to get more details including categoryId and full description using getProduct
                    ebay_product_details = None
                    ebay_category_id = None
                    ebay_description = product_summary.get('title') # Fallback description
                    
                    if product_summary.get('epid'):
                        product_details_url_base = "https://api.sandbox.ebay.com/commerce/catalog/v1_beta/product" if EBAY_SANDBOX else "https://api.ebay.com/commerce/catalog/v1/product"
                        product_details_url = f"{product_details_url_base}/{product_summary.get('epid')}"
                        try:
                            details_response = requests.get(product_details_url, headers=headers) # Same token and headers
                            details_response.raise_for_status()
                            ebay_product_details_data = details_response.json()
                            ebay_category_id = ebay_product_details_data.get('primaryCategoryId')
                            ebay_description = ebay_product_details_data.get('description', product_summary.get('title')) # Prefer full description
                            # Potentially extract more aspects from ebay_product_details_data.get('aspects') here
                        except requests.exceptions.RequestException as e_details:
                            logger.warning(f"eBay getProduct call failed for epid {product_summary.get('epid')}: {e_details}. Using summary data.")
                            # Fallback to summary data if getProduct fails

                    enriched_product = {
                        "sku": None, # No local SKU yet, to be created by user/system
                        "lpn": barcode, # Barcode could be LPN if it's an internal one matching X-Z ASIN pattern
                        "asin": None, # ASIN might not be directly available, or could be an aspect
                        "fnsku": None, # No FNSKU yet
                        "name": product_summary.get("title"),
                        "description": ebay_description,
                        "price": None, # Price needs to be set by the user
                        "category_ebay_id": ebay_category_id, # eBay's category ID
                        "category_name_ebay": None, # Could look this up via Taxonomy API later
                        "upc": barcode if found_by_column == 'UPC' or not found_by_column else product_summary.get("upc", [barcode])[0] if product_summary.get("upc") else barcode,
                        "image_url": product_summary.get("image", {}).get("imageUrl"),
                        "additional_image_urls": [img.get("imageUrl") for img in product_summary.get("additionalImages", []) if img.get("imageUrl")],
                        "quantity": 1, # Default quantity, user can adjust
                        "barcode_scanned": barcode,
                        "source": "ebay_catalog_api",
                        "ebay_epid": product_summary.get("epid"),
                        "raw_ebay_summary": product_summary,
                        "raw_ebay_details": ebay_product_details_data if 'ebay_product_details_data' in locals() else None
                    }
                    logger.info(f"Barcode '{barcode}' found on eBay Catalog API. Title: {enriched_product['name']}")
                    return jsonify({"message": "Product found on eBay", "product": enriched_product, "status": "found_on_ebay"}), 200
                else:
                    logger.info(f"Barcode '{barcode}' not found on eBay Catalog API.")
                    return jsonify({"error": "Product not found locally or on eBay.", "barcode": barcode, "status": "not_found_anywhere"}), 404

            except requests.exceptions.RequestException as e_ebay:
                logger.error(f"Error calling eBay Catalog API for barcode {barcode}: {e_ebay}")
                # Check for specific HTTP errors if needed, e.g., 404 from eBay means not found
                if e_ebay.response is not None and e_ebay.response.status_code == 404:
                     return jsonify({"error": "Product not found locally or on eBay.", "barcode": barcode, "status": "not_found_anywhere"}), 404
                return jsonify({"error": "Product not found locally. Error during external lookup."}), 503 # Service unavailable
            except Exception as e_general_ebay: # Catch other potential errors like get_ebay_token() failure
                logger.error(f"General error during eBay lookup for barcode {barcode}: {e_general_ebay}")
                return jsonify({"error": "Product not found locally. Error during external lookup."}), 500


    except Exception as e:
        logger.error(f"Error during barcode scan lookup for tenant {tenant_id}, barcode {barcode}: {e}")
        return jsonify({"error": f"Server error during barcode lookup: {str(e)}"}), 500

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
    """Create a new eBay listing by creating/replacing an inventory item and publishing an offer."""
    user_id, tenant_id = get_ids_from_request() # Assuming you want to associate this with a tenant
    if not tenant_id:
        return jsonify({"error": "Unauthorized or tenant ID missing"}), 401

    try:
        data = request.get_json()
        sku = data.get('sku')
        if not sku:
            return jsonify({"success": False, "message": "SKU is required"}), 400
        
        title = data.get('title')
        if not title:
            return jsonify({"success": False, "message": "Title is required"}), 400

        ebay_category_id = data.get('ebay_category_id') # This is the eBay leaf category ID
        if not ebay_category_id:
            return jsonify({"success": False, "message": "eBay Category ID is required"}), 400
        
        # Business Policy IDs - expecting these from the client or config
        fulfillment_policy_id = data.get('fulfillmentPolicyId')
        payment_policy_id = data.get('paymentPolicyId')
        return_policy_id = data.get('returnPolicyId')

        if not all([fulfillment_policy_id, payment_policy_id, return_policy_id]):
            # Fallback to environment variables if not provided in request
            fulfillment_policy_id = fulfillment_policy_id or os.getenv('EBAY_FULFILLMENT_POLICY_ID')
            payment_policy_id = payment_policy_id or os.getenv('EBAY_PAYMENT_POLICY_ID')
            return_policy_id = return_policy_id or os.getenv('EBAY_RETURN_POLICY_ID')
            
            if not all([fulfillment_policy_id, payment_policy_id, return_policy_id]):
                logger.error(f"eBay business policy IDs are missing for tenant {tenant_id}, SKU {sku}.")
                return jsonify({
                    "success": False, 
                    "message": "eBay business policy IDs (fulfillment, payment, return) are required either in the request or as environment variables."
                }), 400

        merchant_location_key = data.get('merchantLocationKey', os.getenv('EBAY_MERCHANT_LOCATION_KEY', 'default')) # Get from request, then env, then default
        if not merchant_location_key:
             logger.error(f"eBay merchant location key is missing for tenant {tenant_id}, SKU {sku}.")
             return jsonify({"success": False, "message": "eBay merchant location key is required."}), 400

        # Get eBay access token
        token = get_ebay_token()
        
        # eBay API endpoint for inventory item
        inventory_item_url_base = "https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item" if EBAY_SANDBOX else "https://api.ebay.com/sell/inventory/v1/inventory_item"
        
        # Prepare eBay inventory item data (createOrReplaceInventoryItem)
        # Ensure aspects are correctly formatted if provided
        aspects_input = data.get('aspects', {})
        ebay_aspects = {k: [v] if not isinstance(v, list) else v for k, v in aspects_input.items()} # Ensure aspect values are lists of strings
        if not ebay_aspects.get("Brand") and data.get("brand"): # Add brand from top level if not in aspects
            ebay_aspects["Brand"] = [data.get("brand")]

        inventory_item_data = {
            "product": {
                "title": title,
                "description": data.get('description', title), # Fallback description to title
                "aspects": ebay_aspects, # e.g., {"Brand": ["Apple"], "Color": ["Space Gray"]}
                "imageUrls": data.get('images', []) # Array of image URLs
            },
            "condition": data.get('condition', 'NEW').upper(),
            "packageWeightAndSize": data.get('packageWeightAndSize', {
                "dimensions": {"height": 5, "length": 5, "width": 5, "unit": "INCH"},
                "weight": {"value": 1, "unit": "POUND"}
            }), # Allow providing this, or use default
            "availability": {
                "shipToLocationAvailability": {
                    "quantity": int(data.get('quantity', 1))
                }
            }
        }
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Content-Language': 'en-US', # Required for this call
            'X-EBAY-C-MARKETPLACE-ID': os.getenv('EBAY_MARKETPLACE_ID', 'EBAY_US')
        }
        
        # 1. Create or Replace Inventory Item
        inventory_item_url_full = f"{inventory_item_url_base}/{sku}"
        logger.info(f"Calling eBay createOrReplaceInventoryItem for SKU {sku} for tenant {tenant_id}: URL {inventory_item_url_full}")
        inventory_response = requests.put(inventory_item_url_full, headers=headers, json=inventory_item_data)
        
        if inventory_response.status_code not in [200, 201, 204]: # 204 means success with no content (replacement)
            logger.error(f"Failed to create/replace eBay inventory item for SKU {sku}, tenant {tenant_id}. Status: {inventory_response.status_code}, Response: {inventory_response.text}")
            return jsonify({
                "success": False,
                "message": f"Failed to create/replace eBay inventory item: {inventory_response.text}"
            }), inventory_response.status_code
        
        logger.info(f"eBay inventory item for SKU {sku} created/replaced successfully for tenant {tenant_id}.")

        # 2. Create and Publish Offer
        offer_url_base = "https://api.sandbox.ebay.com/sell/inventory/v1/offer" if EBAY_SANDBOX else "https://api.ebay.com/sell/inventory/v1/offer"
        price_value = data.get('price')
        if price_value is None:
             return jsonify({"success": False, "message": "Price is required to create an offer"}), 400

        offer_data = {
            "sku": sku,
            "marketplaceId": os.getenv('EBAY_MARKETPLACE_ID', 'EBAY_US'),
            "format": "FIXED_PRICE",
            "availableQuantity": int(data.get('quantity', 1)),
            "categoryId": ebay_category_id, # eBay leaf category ID
            "listingDescription": data.get('listing_description', inventory_item_data["product"]["description"]), # Allow specific listing desc or fallback
            "listingPolicies": {
                "fulfillmentPolicyId": fulfillment_policy_id,
                "paymentPolicyId": payment_policy_id,
                "returnPolicyId": return_policy_id
            },
            "merchantLocationKey": merchant_location_key,
            "pricingSummary": {
                "price": {
                    "value": str(price_value),
                    "currency": data.get('currency', 'USD')
                }
            },
            # Add other optional fields like tax, charity, listing duration, etc. as needed
            # "tax": {
            #     "taxJurisdiction": { "region": { "stateOrProvince": "CA" }, "taxJurisdictionId": "California" },
            #     "taxType": "STATE_SALES_TAX",
            #     "thirdPartyTaxCategory": "", # if applicable
            #     "shippingAndHandlingTaxed": True,
            #     "vatPercentage": null # if applicable
            # }
        }
        
        # The createOffer call should make it live if quantity > 0 and policies are good.
        # No separate publishOffer call is strictly needed if availableQuantity is set.
        logger.info(f"Calling eBay createOffer for SKU {sku} for tenant {tenant_id}: URL {offer_url_base}")
        offer_response = requests.post(offer_url_base, headers=headers, json=offer_data)
        
        if offer_response.status_code in [200, 201]:
            offer_response_json = offer_response.json()
            offer_id = offer_response_json.get('offerId')
            # Listing ID is not in createOffer response. It's in publishOffer response, or GetOffer/GetItem.
            # For offers published by setting availableQuantity > 0, the listingId might take a moment to generate.
            listing_id = offer_response_json.get('listingId') # This is often null from createOffer
            
            logger.info(f"eBay offer created successfully for SKU {sku}, Offer ID: {offer_id}, tenant {tenant_id}.")

            # Step 5: Store and Track
            if supabase_admin: # Use admin client to insert into the new table
                try:
                    # Attempt to get the listing URL if listingId is somehow available (unlikely from createOffer)
                    listing_url = None
                    if listing_id:
                        base_ebay_url = "https://www.sandbox.ebay.com/itm/" if EBAY_SANDBOX else "https://www.ebay.com/itm/"
                        listing_url = f"{base_ebay_url}{listing_id}"

                    insert_data = {
                        'tenant_id': tenant_id,
                        'user_id': user_id, # The user who initiated this
                        'internal_sku': sku,
                        'ebay_offer_id': offer_id,
                        'ebay_listing_id': listing_id, # May be null initially
                        'ebay_marketplace_id': offer_data["marketplaceId"],
                        'ebay_listing_url': listing_url,
                        'ebay_listing_status': 'PUBLISHED', # Assuming immediate publish
                        'product_title': inventory_item_data["product"]["title"],
                        'price': price_value,
                        'currency': offer_data["pricingSummary"]["price"]["currency"],
                        'quantity': offer_data["availableQuantity"],
                        'raw_ebay_offer_data': offer_response_json # Store the raw response
                        # 'listed_at' and 'created_at' have defaults in DB
                    }
                    
                    # Upsert logic: if listing already tracked (same tenant, sku, marketplace), update it.
                    # Otherwise, insert new. Using the unique constraint for this.
                    db_response = supabase_admin.table('ebay_listings').upsert(
                        insert_data, 
                        on_conflict='tenant_id,internal_sku,ebay_marketplace_id'
                    ).execute()

                    if db_response.data:
                        logger.info(f"eBay listing data for SKU {sku}, Offer ID {offer_id} saved to database for tenant {tenant_id}.")
                    elif db_response.error:
                        logger.error(f"Failed to save eBay listing data for SKU {sku} to DB. Error: {db_response.error}")
                        # Don't fail the whole request, but log this problem
                except Exception as db_exc:
                    logger.error(f"Exception saving eBay listing data for SKU {sku} to DB: {db_exc}")
            else:
                logger.warning("Supabase admin client not available. Skipping save of eBay listing data to DB.")

            return jsonify({
                "success": True,
                "message": "eBay inventory item and offer created successfully. Tracking data saved.",
                "sku": sku,
                "offerId": offer_id,
                "listingId": listing_id, # Still likely null here
                "ebayMarketplaceId": offer_data["marketplaceId"]
            }), 201
        else:
            logger.error(f"Failed to create eBay offer for SKU {sku}, tenant {tenant_id}. Status: {offer_response.status_code}, Response: {offer_response.text}")
            return jsonify({
                "success": False,
                "message": f"Failed to create eBay offer: {offer_response.text}"
            }), offer_response.status_code
            
    except Exception as e:
        logger.error(f"Error in create_ebay_listing for tenant {user_id or 'UnknownTenant'}: {str(e)}") # user_id might be None here if get_ids failed early
        return jsonify({
            "success": False,
            "message": f"An unexpected error occurred: {str(e)}"
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

@app.route('/api/scan_history', methods=['GET'])
def get_scan_history():
    user_id, tenant_id = get_ids_from_request()
    if not tenant_id:
        return jsonify({"error": "Unauthorized or tenant ID missing"}), 401
    if not supabase_admin: # Use supabase_admin for direct table access if RLS is not set up for this or if admin view is needed
        return jsonify({"error": "Supabase admin client not configured."}), 500

    try:
        # Fetch from 'scan_history' table, joining with 'manifest_data' if product_id is linked
        # The 'databaseService.js' suggests 'manifest_data_id' and 'api_lookup_cache_id' in 'scan_history'
        # And 'manifest_data(*)' or 'api_lookup_cache(*)' for joins.
        
        # Simpler query first, can be expanded
        query = supabase_admin.table('scan_history').select(
            '''
            scanned_code, 
            scanned_at, 
            product_description,
            manifest_data_id,
            api_lookup_cache_id,
            manifest_data (Description, "Fn Sku", "B00 Asin", UPC),
            api_lookup_cache (product_name, asin, fnsku, image_url)
            '''
        ).eq('tenant_id', tenant_id).order('scanned_at', desc=True).limit(50)
        
        response = query.execute()

        if response.data:
            # Process data if needed to match frontend expectations
            # For now, returning as is.
            return jsonify(response.data), 200
        elif response.error:
            logger.error(f"Error fetching scan history for tenant {tenant_id}: {response.error}")
            return jsonify({"error": str(response.error.message)}), 500
        else:
            return jsonify([]), 200
            
    except Exception as e:
        logger.error(f"Server error fetching scan history for tenant {tenant_id}: {e}")
        return jsonify({"error": f"Server error: {str(e)}"}), 500

@app.route('/api/ebay/listings', methods=['GET'])
def get_ebay_listings_from_db():
    """Fetch all tracked eBay listings from the database for the current tenant."""
    user_id, tenant_id = get_ids_from_request()
    if not tenant_id:
        return jsonify({"error": "Unauthorized or tenant ID missing"}), 401
    if not supabase_admin:
        return jsonify({"error": "Supabase admin client not configured."}), 500

    try:
        listings_response = supabase_admin.table('ebay_listings') \
            .select("*") \
            .eq('tenant_id', tenant_id) \
            .order('created_at', desc=True) \
            .execute()

        # Log what we received, crucial for debugging
        logger.info(f"Tenant {tenant_id}: get_ebay_listings_from_db: type(listings_response) = {type(listings_response)}")
        if hasattr(listings_response, 'model_dump_json'): # For Pydantic models like APIResponse
             logger.info(f"Tenant {tenant_id}: get_ebay_listings_from_db: listings_response content = {listings_response.model_dump_json(indent=2)}")
        elif hasattr(listings_response, '__dict__'):
             logger.info(f"Tenant {tenant_id}: get_ebay_listings_from_db: listings_response dict = {listings_response.__dict__}")
        else:
             logger.info(f"Tenant {tenant_id}: get_ebay_listings_from_db: listings_response (str) = {str(listings_response)[:500]}")


        # Standard way to check for errors in supabase-py
        if hasattr(listings_response, 'error') and listings_response.error:
            error_obj = listings_response.error
            error_message = "Unknown Supabase error"
            error_details_str = str(error_obj) # Fallback
            
            if hasattr(error_obj, 'message') and error_obj.message:
                error_message = error_obj.message
            
            # Attempt to get more structured details
            if hasattr(error_obj, 'details') and error_obj.details:
                error_details_str = str(error_obj.details)
            elif hasattr(error_obj, 'code') and error_obj.code:
                 error_details_str = f"Code: {error_obj.code}, Message: {error_message}"
            elif hasattr(error_obj, 'model_dump_json'): # If error_obj is a pydantic model
                try:
                    error_details_str = error_obj.model_dump_json(indent=2)
                except Exception: # Fallback if model_dump_json fails
                    pass


            logger.error(f"Error fetching eBay listings for tenant {tenant_id} from Supabase. Message: {error_message}, Details: {error_details_str}", exc_info=True)
            return jsonify({"error": "Failed to fetch listings from database.", "details": f"{error_message} - {error_details_str}"}), 500
        
        # If no error attribute, or error is None, then data should be present
        elif hasattr(listings_response, 'data'):
            processed_listings = []
            for item in listings_response.data:
                if 'price' in item and isinstance(item['price'], Decimal):
                    item['price'] = float(item['price'])
                processed_listings.append(item)
            logger.info(f"Successfully fetched {len(processed_listings)} eBay listings for tenant {tenant_id}.")
            return jsonify(processed_listings), 200
        
        # If neither .error nor .data, this is unexpected
        else:
            logger.error(f"Tenant {tenant_id}: Unexpected response structure from Supabase: {str(listings_response)[:1000]}", exc_info=True)
            # Check if it's an httpx.Response that failed (less likely if using supabase-py client properly)
            if hasattr(listings_response, 'status_code') and hasattr(listings_response, 'text') and hasattr(listings_response, 'is_success'):
                if not listings_response.is_success:
                    http_error_details = listings_response.text[:500]
                    try:
                        http_error_json = listings_response.json()
                        http_error_details = json.dumps(http_error_json)
                    except: pass # Keep text if json fails
                    logger.error(f"Tenant {tenant_id}: Supabase call resulted in direct HTTP error: {listings_response.status_code}, Response: {http_error_details}", exc_info=True)
                    return jsonify({"error": "Failed to communicate with database.", "details": f"Service error: {listings_response.status_code}. Response: {http_error_details}"}), 500
            
            return jsonify({"error": "Received an inconsistent response from database.", "details": "Could not parse database output."}), 500

    except AttributeError as ae:
        logger.error(f"AttributeError in get_ebay_listings_from_db for tenant {tenant_id}: {str(ae)}", exc_info=True)
        return jsonify({"error": "An unexpected server processing error occurred (AttributeError).", "details": str(ae)}), 500
    except Exception as e:
        logger.error(f"General exception in get_ebay_listings_from_db for tenant {tenant_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected server error occurred: {str(e)}"}), 500

@app.route('/api/ebay/offer/<string:ebay_offer_id>', methods=['GET'])
def get_ebay_offer_details(ebay_offer_id):
    user_id, tenant_id = get_ids_from_request()
    if not tenant_id:
        return jsonify({"error": "Unauthorized or tenant ID missing"}), 401
    
    token = get_ebay_token()
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': os.getenv('EBAY_MARKETPLACE_ID', 'EBAY_US')
    }
    
    offer_api_url = f"https://api.sandbox.ebay.com/sell/inventory/v1/offer/{ebay_offer_id}" if EBAY_SANDBOX else f"https://api.ebay.com/sell/inventory/v1/offer/{ebay_offer_id}"
    
    try:
        logger.info(f"Fetching eBay offer details for offer ID: {ebay_offer_id}, tenant: {tenant_id}")
        response = requests.get(offer_api_url, headers=headers)
        response.raise_for_status() # Raise HTTPError for bad responses (4XX or 5XX)
        
        offer_details = response.json()
        
        # Update our database with the latest info (especially listingId and status)
        if supabase_admin:
            update_payload = {
                'ebay_listing_id': offer_details.get('listing', {}).get('listingId'),
                'ebay_listing_status': offer_details.get('status'), # e.g., PUBLISHED, UNPUBLISHED
                'quantity': offer_details.get('availableQuantity'),
                'price': offer_details.get('pricingSummary', {}).get('price', {}).get('value'),
                'raw_ebay_offer_data': offer_details, # Store the full latest offer data
                'last_synced_at': datetime.utcnow().isoformat()
            }
            # Remove None values so they don't overwrite existing DB values if not present in API response
            update_payload = {k: v for k, v in update_payload.items() if v is not None}

            # We need the internal_sku to correctly identify the record for update based on offer_id if it is not unique across tenants
            # Assuming ebay_offer_id IS unique enough for this update or that the RLS will scope it correctly.
            # For robust update, better to use the primary key 'id' or a unique constraint involving tenant_id.
            # Let's fetch our internal record first to ensure we update the right one and have its primary key.
            
            db_record_response = supabase_admin.table('ebay_listings') \
                                .select('id, internal_sku') \
                                .eq('tenant_id', tenant_id) \
                                .eq('ebay_offer_id', ebay_offer_id) \
                                .maybe_single() \
                                .execute()

            if db_record_response.data:
                record_id = db_record_response.data['id']
                # Add internal_sku to payload if it wasn't there for some reason, for on_conflict reference
                if 'internal_sku' not in update_payload and db_record_response.data.get('internal_sku'):
                    update_payload['internal_sku'] = db_record_response.data['internal_sku']
                if 'ebay_marketplace_id' not in update_payload: # Required for conflict resolution
                     update_payload['ebay_marketplace_id'] = os.getenv('EBAY_MARKETPLACE_ID', 'EBAY_US') # Should fetch from DB record ideally
               
                # Update the specific record by its primary key id
                # Alternatively, could use upsert on (tenant_id, internal_sku, ebay_marketplace_id) 
                # if we ensure all those fields are in update_payload.
                update_db_response = supabase_admin.table('ebay_listings') \
                                        .update(update_payload) \
                                        .eq('id', record_id) \
                                        .execute()
                if update_db_response.error:
                    logger.error(f"Failed to update DB for offer {ebay_offer_id}, tenant {tenant_id}. Error: {update_db_response.error.message if hasattr(update_db_response.error, 'message') else str(update_db_response.error)}", exc_info=True)
            else:
                logger.warning(f"No existing DB record found for offer {ebay_offer_id}, tenant {tenant_id} to update.")

        return jsonify(offer_details), 200

    except requests.exceptions.HTTPError as http_err:
        logger.error(f"HTTP error fetching eBay offer {ebay_offer_id}: {http_err}. Response: {http_err.response.text}", exc_info=True)
        return jsonify({"error": f"eBay API error: {http_err.response.status_code}", "details": http_err.response.json() if http_err.response.content and 'application/json' in http_err.response.headers.get('Content-Type','') else http_err.response.text}), http_err.response.status_code
    except Exception as e:
        logger.error(f"Error fetching eBay offer details for {ebay_offer_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/api/ebay/listings/<string:ebay_offer_id>/end', methods=['POST'])
def end_ebay_listing(ebay_offer_id):
    user_id, tenant_id = get_ids_from_request()
    if not tenant_id:
        return jsonify({"error": "Unauthorized or tenant ID missing"}), 401
    if not supabase_admin:
        return jsonify({"error": "Supabase admin client not configured."}), 500

    logger.info(f"Attempting to end eBay listing for offer ID: {ebay_offer_id}, tenant: {tenant_id}")

    try:
        # Verify the listing belongs to the tenant and get internal SKU if needed for other checks
        db_listing_check = supabase_admin.table('ebay_listings') \
            .select('id, internal_sku, ebay_listing_status') \
            .eq('tenant_id', tenant_id) \
            .eq('ebay_offer_id', ebay_offer_id) \
            .maybe_single() \
            .execute()

        if not db_listing_check.data:
            logger.warning(f"End listing: Offer ID {ebay_offer_id} not found for tenant {tenant_id}.")
            return jsonify({"error": "Listing not found or access denied."}), 404
        
        if db_listing_check.data['ebay_listing_status'] == 'ENDED':
            logger.info(f"Listing for offer ID {ebay_offer_id} is already ended for tenant {tenant_id}.")
            return jsonify({"success": True, "message": "Listing was already ended."}), 200

        token = get_ebay_token()
        headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/json',
            # X-EBAY-C-MARKETPLACE-ID is not typically needed for deleteOffer but Content-Language is good practice
            'Content-Language': 'en-US' 
        }

        delete_offer_url = f"https://api.sandbox.ebay.com/sell/inventory/v1/offer/{ebay_offer_id}" if EBAY_SANDBOX \
            else f"https://api.ebay.com/sell/inventory/v1/offer/{ebay_offer_id}"

        logger.info(f"Calling eBay deleteOffer for offer ID: {ebay_offer_id}, URL: {delete_offer_url}")
        response = requests.delete(delete_offer_url, headers=headers)

        # eBay's deleteOffer returns HTTP 204 No Content on success
        if response.status_code == 204:
            logger.info(f"eBay offer {ebay_offer_id} deleted successfully via API for tenant {tenant_id}.")
            # Update local database status
            update_payload = {
                'ebay_listing_status': 'ENDED',
                'ended_at': datetime.utcnow().isoformat(),
                'last_synced_at': datetime.utcnow().isoformat()
            }
            # Using the primary key 'id' from our earlier check for a precise update
            record_id_to_update = db_listing_check.data['id']
            db_update_response = supabase_admin.table('ebay_listings') \
                .update(update_payload) \
                .eq('id', record_id_to_update) \
                .execute()

            if db_update_response.error:
                logger.error(f"Failed to update local DB status to ENDED for offer {ebay_offer_id}, tenant {tenant_id}. Error: {db_update_response.error.message if hasattr(db_update_response.error, 'message') else str(db_update_response.error)}", exc_info=True)
                # Even if DB update fails, the eBay action was successful. Inform client but log error.
                return jsonify({"success": True, "message": "Listing ended on eBay, but DB update failed. Please refresh."}), 207 # Multi-Status
            
            logger.info(f"Local DB status updated to ENDED for offer {ebay_offer_id}, tenant {tenant_id}.")
            return jsonify({"success": True, "message": "Listing ended successfully on eBay and database updated."}), 200
        else:
            # Handle eBay API errors
            ebay_error_message = f"eBay API error when trying to end listing {ebay_offer_id}"
            try:
                error_details = response.json()
                logger.error(f"{ebay_error_message}. Status: {response.status_code}, Details: {error_details}")
                # Provide more specific error from eBay if available
                if 'errors' in error_details and error_details['errors']:
                    ebay_error_message = error_details['errors'][0].get('message', ebay_error_message)

            except ValueError: # If response is not JSON
                logger.error(f"{ebay_error_message}. Status: {response.status_code}, Response: {response.text}")
                ebay_error_message = response.text if response.text else ebay_error_message
            
            return jsonify({"error": "Failed to end listing on eBay.", "details": ebay_error_message}), response.status_code

    except requests.exceptions.RequestException as req_err:
        logger.error(f"RequestException ending eBay listing {ebay_offer_id} for tenant {tenant_id}: {req_err}", exc_info=True)
        return jsonify({"error": "Network error communicating with eBay.", "details": str(req_err)}), 503
    except Exception as e:
        logger.error(f"Unexpected error ending eBay listing {ebay_offer_id} for tenant {tenant_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected server error occurred: {str(e)}"}), 500

# === TEMPORARY ADMIN ROUTE (REMOVE AFTER USE) ===
@app.route('/api/admin/temp-set-user-tenant', methods=['POST'])
def temp_set_user_tenant():
    target_user_id = "3227bc3f-8020-4293-82a0-1141907e45cb" # odai.alkhatib@gmail.com
    target_tenant_id = "ce0168c4-ed27-4ba3-b670-3c02a0e78e0c"
    
    if not supabase_admin:
        return jsonify({"error": "Supabase admin client not configured."}), 500

    try:
        # First, get the existing app_metadata to preserve other fields
        user_info = supabase_admin.auth.admin.get_user_by_id(target_user_id)
        if not user_info or not hasattr(user_info, 'user') or not user_info.user:
            return jsonify({"error": f"User {target_user_id} not found"}), 404
        
        current_app_metadata = user_info.user.app_metadata or {}
        # Update only the tenant_id, keep other app_metadata fields
        new_app_metadata = {**current_app_metadata, "tenant_id": target_tenant_id}
        
        update_response = supabase_admin.auth.admin.update_user_by_id(
            target_user_id,
            {'app_metadata': new_app_metadata}
        )
        
        if hasattr(update_response, 'user') and update_response.user:
            logger.info(f"Successfully updated app_metadata for user {target_user_id} with tenant_id {target_tenant_id}")
            return jsonify({"success": True, "message": "User app_metadata updated.", "user": update_response.user.model_dump_json()}), 200
        elif hasattr(update_response, 'error') and update_response.error:
            error_message = update_response.error.message if hasattr(update_response.error, 'message') else str(update_response.error)
            logger.error(f"Error updating user {target_user_id} app_metadata: {error_message}", exc_info=True)
            return jsonify({"error": f"Supabase error: {error_message}"}), 500
        else:
            logger.error(f"Unknown error or response from Supabase during user update for {target_user_id}", exc_info=True)
            return jsonify({"error": "Unknown error during user update."}), 500
            
    except Exception as e:
        logger.error(f"Exception in temp_set_user_tenant: {str(e)}", exc_info=True)
        return jsonify({"error": f"Server exception: {str(e)}"}), 500
# === END TEMPORARY ADMIN ROUTE ===

# Route to get eBay category suggestions
@app.route('/api/ebay/suggest_categories', methods=['GET'])
def suggest_ebay_categories():
    user_id, tenant_id = get_ids_from_request()
    if not tenant_id:
        return jsonify({"error": "Unauthorized or tenant ID missing"}), 401

    query_params = request.args.get('q')
    if not query_params:
        return jsonify({"error": "Query parameter 'q' is required"}), 400

    # category_tree_id for eBay US is '0'. This should ideally be configurable.
    # For other sites: EBAY_GB = 3, EBAY_DE = 77, EBAY_AU = 15 etc.
    # We'll use an environment variable or a default.
    category_tree_id = os.getenv('EBAY_CATEGORY_TREE_ID', '0') 
    
    ebay_token = get_ebay_token()
    if not ebay_token:
        logger.error(f"Failed to get eBay token for category suggestion. Tenant: {tenant_id}")
        return jsonify({"error": "Failed to authenticate with eBay"}), 500

    headers = {
        'Authorization': f'Bearer {ebay_token}',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
    
    # URL encode the query parameters
    encoded_query = urllib.parse.quote(query_params)
    
    suggestion_url = f'https://api.ebay.com/commerce/taxonomy/v1/category_tree/{category_tree_id}/get_category_suggestions?q={encoded_query}'
    
    logger.info(f"Requesting eBay category suggestions for query: '{query_params}', URL: {suggestion_url}. Tenant: {tenant_id}")

    try:
        response = requests.get(suggestion_url, headers=headers)
        response.raise_for_status()  # Raise an exception for HTTP errors (4xx or 5xx)
        
        suggestions_data = response.json()
        logger.info(f"Received {len(suggestions_data.get('categorySuggestions', []))} category suggestions from eBay. Tenant: {tenant_id}")
        
        # We might want to simplify the response before sending to frontend
        # For now, sending the relevant part.
        return jsonify(suggestions_data.get('categorySuggestions', [])), 200

    except requests.exceptions.HTTPError as http_err:
        logger.error(f"HTTP error suggesting categories from eBay: {http_err}. Response: {response.text}. Tenant: {tenant_id}")
        try:
            error_details = response.json() # eBay often returns JSON errors
        except ValueError:
            error_details = {"error": "eBay API request failed", "details": response.text[:200]} # Truncate if not JSON
        return jsonify({"error": "Failed to get category suggestions from eBay", "details": error_details}), response.status_code
    except requests.exceptions.RequestException as req_err:
        logger.error(f"Request exception suggesting categories from eBay: {req_err}. Tenant: {tenant_id}")
        return jsonify({"error": "Network error while contacting eBay for category suggestions"}), 503
    except Exception as e:
        logger.error(f"Generic error suggesting categories: {e}. Tenant: {tenant_id}")
        return jsonify({"error": "An unexpected error occurred while suggesting categories"}), 500

if __name__ == '__main__':
    port = int(os.environ.get("FLASK_RUN_PORT", 5000))
    debug_mode = os.environ.get("FLASK_DEBUG", "True").lower() == "true"
    
    # Optional: Add CORS if your React app is on a different origin (e.g., localhost:5173 vs localhost:5000)
    # from flask_cors import CORS
    # CORS(app, resources={r"/api/*": {"origins": "http://localhost:5173"}}) # Example for specific API routes

    logger.info(f"Starting Flask app on port {port} with debug mode: {debug_mode}")
    app.run(debug=debug_mode, port=port, host='0.0.0.0') 