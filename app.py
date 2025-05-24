import os
import pandas as pd
<<<<<<< HEAD
=======
import requests
import json
import base64
>>>>>>> c50ba32bc7ce0bd4ad0a31e0ab8402b70b945444
from flask import Flask, request, render_template, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
<<<<<<< HEAD

# Enable CORS - important for allowing the React frontend to call your API
CORS(app, resources={r"/api/*": {"origins": "*"}})
=======

# Try to use Supabase, but fall back to local SQLite for testing
try:
    # Check if we can resolve the Supabase hostname first
    import socket
    socket.gethostbyname('db.jjtdvdbfbsdcoyehubmx.supabase.co')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:Od_pugilist5243@db.jjtdvdbfbsdcoyehubmx.supabase.co:5432/postgres'
    print("✅ Using Supabase database")
except (socket.gaierror, Exception) as e:
    # Fall back to local SQLite for testing
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///local_inventory.db'
    print("⚠️  Supabase unavailable, using local SQLite database for testing")
    print(f"   Network error: {e}")

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# Only use pool_pre_ping for PostgreSQL
if 'postgresql' in app.config['SQLALCHEMY_DATABASE_URI']:
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {"pool_pre_ping": True}
app.config['SECRET_KEY'] = os.urandom(24) # For flash messages

# Enable CORS for all domains and routes
CORS(app)

# eBay API Configuration
EBAY_CLIENT_ID = os.getenv('EBAY_CLIENT_ID')
EBAY_CLIENT_SECRET = os.getenv('EBAY_CLIENT_SECRET')
EBAY_SANDBOX = os.getenv('EBAY_SANDBOX', 'true').lower() == 'true'
EBAY_REDIRECT_URI = os.getenv('EBAY_REDIRECT_URI')

# Shopify API Configuration
SHOPIFY_SHOP_DOMAIN = os.getenv('SHOPIFY_SHOP_DOMAIN')  # e.g., 'your-shop.myshopify.com'
SHOPIFY_ACCESS_TOKEN = os.getenv('SHOPIFY_ACCESS_TOKEN')

db = SQLAlchemy(app)
>>>>>>> c50ba32bc7ce0bd4ad0a31e0ab8402b70b945444

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

<<<<<<< HEAD
if not STRIPE_API_KEY or not STRIPE_WEBHOOK_SECRET:
    logger.error("Stripe API Key or Webhook Secret not found in .env. Stripe integration will fail.")
stripe.api_key = STRIPE_API_KEY
=======
@app.before_request
def create_tables_if_not_exist():
    # This will create tables based on SQLAlchemy models if they don't exist.
    # In a production environment, you might prefer to use migrations (e.g., Alembic).
    with app.app_context(): # Ensure we are within application context
        db.create_all()
        
        # Add sample data for testing if using local SQLite
        if 'sqlite' in app.config['SQLALCHEMY_DATABASE_URI']:
            # Check if we already have data
            if Product.query.count() == 0:
                print("📦 Adding sample data for testing...")
                sample_products = [
                    Product(lpn='TEST-001', asin='B08XYZ123', fnsku='X001-ABC-123', title='Sample Product 1', msrp=29.99),
                    Product(lpn='TEST-002', asin='B08XYZ456', fnsku='X002-DEF-456', title='Sample Product 2', msrp=19.99),
                    Product(lpn='TEST-003', asin='B08XYZ789', fnsku='X003-GHI-789', title='Sample Product 3', msrp=39.99),
                ]
                for product in sample_products:
                    db.session.add(product)
                try:
                    db.session.commit()
                    print("✅ Sample data added successfully")
                except Exception as e:
                    db.session.rollback()
                    print(f"❌ Error adding sample data: {e}")
>>>>>>> c50ba32bc7ce0bd4ad0a31e0ab8402b70b945444

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

<<<<<<< HEAD
=======
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
    """Lookup product data from external API using FNSKU"""
    try:
        data = request.get_json()
        fnsku = data.get('fnsku', '').strip()
        
        if not fnsku:
            return jsonify({
                "success": False,
                "message": "FNSKU is required"
            }), 400
        
        # FIRST: Check local database for FNSKU
        local_product = Product.query.filter_by(fnsku=fnsku).first()
        
        if local_product:
            # Found in local database - return this data without API call
            product_data = {
                "success": True,
                "source": "local_database",
                "asin": local_product.asin or '',
                "title": local_product.title or '',
                "price": str(local_product.msrp) if local_product.msrp else '',
                "fnsku": fnsku,
                "lpn": local_product.lpn,
                "image_url": '',  # Local database doesn't have images
                "amazon_url": f"https://www.amazon.com/dp/{local_product.asin}" if local_product.asin else '',
                "message": "Found in local inventory database"
            }
            
            return jsonify(product_data)
        
        # NOT FOUND LOCALLY: Proceed with external API call
        # Using the provided fnskutoasin.com API
        BASE_URL = "https://ato.fnskutoasin.com"
        API_KEY = "20a98a6a-437e-497c-b64c-ec97ec2fbc19"
        
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
        
        # Process the scan data
        if scan_data:
            # Extract relevant data from the API response
            asin = scan_data.get('asin', '')
            
            product_data = {
                "success": True,
                "source": "external_api",
                "asin": asin,
                "title": f"Product for ASIN: {asin}" if asin else "Product information found",
                "price": "",  # This API doesn't seem to provide price info based on the screenshots
                "fnsku": fnsku,
                "image_url": "",  # This API doesn't seem to provide image URLs
                "amazon_url": f"https://www.amazon.com/dp/{asin}" if asin else '',
                "scan_task_id": scan_data.get('id', ''),
                "task_state": scan_data.get('taskState', ''),
                "assignment_date": scan_data.get('assignmentDate', ''),
                "raw_data": scan_data,  # Include raw response for debugging
                "message": "Found via fnskutoasin.com API (charged lookup)"
            }
            
            # OPTIONAL: Save external API result to local database for future use
            # This prevents future API calls for the same FNSKU
            try:
                if asin:
                    # Create a new product entry with the external data
                    # Use a generated LPN since we don't have one from external API
                    new_lpn = f"EXT-{fnsku}"  # Prefix to indicate external source
                    
                    # Check if this LPN already exists to avoid duplicates
                    existing_product = Product.query.filter_by(lpn=new_lpn).first()
                    if not existing_product:
                        new_product = Product(
                            lpn=new_lpn,
                            asin=asin,
                            fnsku=fnsku,
                            title=f"Product for ASIN: {asin}",
                            msrp=None  # No price data from this API
                        )
                        db.session.add(new_product)
                        db.session.commit()
                        product_data["saved_to_local"] = True
            except Exception as e:
                # Don't fail the whole request if saving fails
                print(f"Warning: Could not save external API result to local database: {e}")
                product_data["saved_to_local"] = False
            
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
        return jsonify({
            "success": False,
            "message": f"Error performing external lookup: {str(e)}"
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
>>>>>>> c50ba32bc7ce0bd4ad0a31e0ab8402b70b945444

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

if __name__ == '__main__':
    port = int(os.environ.get("FLASK_RUN_PORT", 5000))
    debug_mode = os.environ.get("FLASK_DEBUG", "True").lower() == "true"
    
    # Optional: Add CORS if your React app is on a different origin (e.g., localhost:5173 vs localhost:5000)
    # from flask_cors import CORS
    # CORS(app, resources={r"/api/*": {"origins": "http://localhost:5173"}}) # Example for specific API routes

    logger.info(f"Starting Flask app on port {port} with debug mode: {debug_mode}")
    app.run(debug=debug_mode, port=port, host='0.0.0.0') 