"""
Facebook Integration Service
Handles Facebook OAuth, Graph API calls, and product posting
"""

import os
import requests
import json
import base64
from urllib.parse import urlencode
from datetime import datetime, timezone, timedelta
from cryptography.fernet import Fernet
import logging

logger = logging.getLogger(__name__)

# Facebook App Configuration
# These should be set in environment variables:
# FACEBOOK_APP_ID - Your Facebook App ID
# FACEBOOK_APP_SECRET - Your Facebook App Secret
# FACEBOOK_REDIRECT_URI - OAuth redirect URI (e.g., https://yourdomain.com/api/facebook/callback)
# FACEBOOK_ENCRYPTION_KEY - Base64-encoded Fernet key for token encryption

# Load environment variables - read on-demand, not at import time
# This ensures .env is loaded before these are accessed
def _get_env_var(name):
    """Get environment variable, loading .env if needed"""
    value = os.getenv(name)
    if value is None:
        # Try loading .env if not already loaded
        from dotenv import load_dotenv
        load_dotenv()
        value = os.getenv(name)
    return value

FACEBOOK_APP_ID = None  # Will be read on-demand
FACEBOOK_APP_SECRET = None
FACEBOOK_REDIRECT_URI = None
FACEBOOK_ENCRYPTION_KEY = None

def _ensure_env_loaded():
    """Ensure environment variables are loaded"""
    global FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_REDIRECT_URI, FACEBOOK_ENCRYPTION_KEY
    if FACEBOOK_APP_ID is None:
        FACEBOOK_APP_ID = _get_env_var('FACEBOOK_APP_ID')
        FACEBOOK_APP_SECRET = _get_env_var('FACEBOOK_APP_SECRET')
        FACEBOOK_REDIRECT_URI = _get_env_var('FACEBOOK_REDIRECT_URI')
        FACEBOOK_ENCRYPTION_KEY = _get_env_var('FACEBOOK_ENCRYPTION_KEY')

# Facebook Graph API base URL
GRAPH_API_BASE = 'https://graph.facebook.com/v18.0'

# Required permissions for Facebook Login
REQUIRED_PERMISSIONS = [
    'pages_show_list',      # List pages user manages
    'pages_read_engagement', # Read page engagement
    'pages_manage_posts'     # Post to pages
]


def get_encryption_key():
    """
    Get or generate encryption key for token storage.
    If FACEBOOK_ENCRYPTION_KEY is not set, generates a new one (for development only).
    In production, always set FACEBOOK_ENCRYPTION_KEY in environment variables.
    """
    _ensure_env_loaded()
    if FACEBOOK_ENCRYPTION_KEY:
        try:
            return base64.urlsafe_b64decode(FACEBOOK_ENCRYPTION_KEY.encode())
        except Exception as e:
            logger.error(f"Error decoding encryption key: {e}")
            raise
    
    # Development fallback - generate a key (NOT for production!)
    logger.warning("⚠️ FACEBOOK_ENCRYPTION_KEY not set. Generating temporary key (NOT SECURE for production!)")
    key = Fernet.generate_key()
    logger.warning(f"Generated key (save this to FACEBOOK_ENCRYPTION_KEY): {base64.urlsafe_b64encode(key).decode()}")
    return key


def encrypt_token(token):
    """Encrypt a Facebook access token for secure storage"""
    try:
        key = get_encryption_key()
        f = Fernet(base64.urlsafe_b64encode(key).decode())
        encrypted = f.encrypt(token.encode())
        return base64.urlsafe_b64encode(encrypted).decode()
    except Exception as e:
        logger.error(f"Error encrypting token: {e}")
        raise


def decrypt_token(encrypted_token):
    """Decrypt a Facebook access token"""
    try:
        key = get_encryption_key()
        f = Fernet(base64.urlsafe_b64encode(key).decode())
        encrypted_bytes = base64.urlsafe_b64decode(encrypted_token.encode())
        decrypted = f.decrypt(encrypted_bytes)
        return decrypted.decode()
    except Exception as e:
        logger.error(f"Error decrypting token: {e}")
        raise


def get_facebook_oauth_url(state=None):
    """
    Generate Facebook OAuth authorization URL
    Returns the URL where users should be redirected to authorize the app
    """
    _ensure_env_loaded()
    if not FACEBOOK_APP_ID or not FACEBOOK_REDIRECT_URI:
        raise ValueError("FACEBOOK_APP_ID and FACEBOOK_REDIRECT_URI must be set")
    
    params = {
        'client_id': FACEBOOK_APP_ID,
        'redirect_uri': FACEBOOK_REDIRECT_URI,
        'scope': ','.join(REQUIRED_PERMISSIONS),
        'response_type': 'code',
    }
    
    if state:
        params['state'] = state
    
    auth_url = f"https://www.facebook.com/v18.0/dialog/oauth?{urlencode(params)}"
    return auth_url


def exchange_code_for_token(code):
    """
    Exchange OAuth authorization code for access token
    Returns: {
        'access_token': str,
        'token_type': str,
        'expires_in': int (seconds),
        'user_id': str
    }
    """
    _ensure_env_loaded()
    if not FACEBOOK_APP_ID or not FACEBOOK_APP_SECRET or not FACEBOOK_REDIRECT_URI:
        raise ValueError("Facebook OAuth configuration missing")
    
    token_url = f"{GRAPH_API_BASE}/oauth/access_token"
    
    params = {
        'client_id': FACEBOOK_APP_ID,
        'client_secret': FACEBOOK_APP_SECRET,
        'redirect_uri': FACEBOOK_REDIRECT_URI,
        'code': code
    }
    
    response = requests.get(token_url, params=params)
    response.raise_for_status()
    
    data = response.json()
    
    # Get user ID
    user_info_url = f"{GRAPH_API_BASE}/me"
    user_response = requests.get(
        user_info_url,
        params={'access_token': data['access_token']}
    )
    user_response.raise_for_status()
    user_data = user_response.json()
    
    return {
        'access_token': data['access_token'],
        'token_type': data.get('token_type', 'bearer'),
        'expires_in': data.get('expires_in', 0),
        'user_id': user_data.get('id')
    }


def get_user_pages(access_token):
    """
    Fetch list of Facebook Pages the user manages
    Returns list of pages with their access tokens
    """
    url = f"{GRAPH_API_BASE}/me/accounts"
    
    params = {
        'access_token': access_token,
        'fields': 'id,name,category,access_token'
    }
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    data = response.json()
    return data.get('data', [])


def get_page_access_token(page_id, user_access_token):
    """
    Get long-lived page access token
    First exchanges user token for long-lived token, then gets page token
    """
    _ensure_env_loaded()
    # Exchange for long-lived user token
    exchange_url = f"{GRAPH_API_BASE}/oauth/access_token"
    params = {
        'grant_type': 'fb_exchange_token',
        'client_id': FACEBOOK_APP_ID,
        'client_secret': FACEBOOK_APP_SECRET,
        'fb_exchange_token': user_access_token
    }
    
    response = requests.get(exchange_url, params=params)
    response.raise_for_status()
    long_lived_token = response.json()['access_token']
    
    # Get page token
    pages_url = f"{GRAPH_API_BASE}/me/accounts"
    params = {
        'access_token': long_lived_token,
        'fields': 'id,access_token'
    }
    
    response = requests.get(pages_url, params=params)
    response.raise_for_status()
    
    pages = response.json().get('data', [])
    for page in pages:
        if page['id'] == page_id:
            return page['access_token']
    
    raise ValueError(f"Page {page_id} not found or user doesn't have access")


def create_catalog_product(catalog_id, page_access_token, product_data):
    """
    Create or update a product in Facebook Catalog
    product_data should contain:
    - retailer_id (required) - unique identifier (e.g., ASIN, FNSKU)
    - name (required)
    - description
    - price (required) - as string with currency (e.g., "10.99 USD")
    - image_url (required)
    - availability (default: "in stock")
    - condition (default: "new")
    - link (optional)
    
    Returns Facebook catalog product ID
    """
    url = f"{GRAPH_API_BASE}/{catalog_id}/products"
    
    # Build product data according to Facebook Catalog API
    fb_product = {
        'retailer_id': product_data['retailer_id'],
        'name': product_data['name'],
        'description': product_data.get('description', product_data['name']),
        'availability': product_data.get('availability', 'in stock'),
        'condition': product_data.get('condition', 'new'),
        'price': product_data['price'],  # Format: "10.99 USD"
        'image_url': product_data['image_url'],
    }
    
    if product_data.get('link'):
        fb_product['url'] = product_data['link']
    
    params = {
        'access_token': page_access_token
    }
    
    response = requests.post(url, params=params, json=fb_product)
    response.raise_for_status()
    
    result = response.json()
    return result.get('product_id') or result.get('id')


def upload_photo_to_page(page_id, page_access_token, image_url, caption=None, published=False):
    """
    Upload a photo to a Facebook Page
    Returns photo ID
    """
    url = f"{GRAPH_API_BASE}/{page_id}/photos"
    
    params = {
        'access_token': page_access_token,
        'url': image_url,  # Facebook will fetch the image from this URL
        'published': 'false' if not published else 'true'
    }
    
    if caption:
        params['caption'] = caption
    
    response = requests.post(url, params=params)
    response.raise_for_status()
    
    result = response.json()
    return result.get('id')


def create_page_post(page_id, page_access_token, message, photo_ids=None, product_id=None):
    """
    Create a post on a Facebook Page
    - message: Post text content
    - photo_ids: List of photo IDs (from upload_photo_to_page)
    - product_id: Facebook Catalog product ID to tag in the post
    
    Returns post ID and post URL
    """
    url = f"{GRAPH_API_BASE}/{page_id}/feed"
    
    params = {
        'access_token': page_access_token,
        'message': message
    }
    
    # Attach photos if provided
    if photo_ids:
        attached_media = []
        for photo_id in photo_ids:
            attached_media.append({'media_fbid': photo_id})
        params['attached_media'] = json.dumps(attached_media)
    
    # Tag catalog product if provided (creates "Shop Now" button)
    if product_id:
        params['product_item'] = json.dumps({'product_id': product_id})
    
    response = requests.post(url, params=params)
    response.raise_for_status()
    
    result = response.json()
    post_id = result.get('id')
    
    # Get post URL
    post_url = f"https://www.facebook.com/{post_id.replace('_', '/posts/')}"
    
    return {
        'post_id': post_id,
        'post_url': post_url
    }


def verify_token(access_token):
    """
    Verify if an access token is still valid
    Returns token info including expiration
    """
    _ensure_env_loaded()
    url = f"{GRAPH_API_BASE}/debug_token"
    
    params = {
        'input_token': access_token,
        'access_token': FACEBOOK_APP_ID + '|' + FACEBOOK_APP_SECRET
    }
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    data = response.json()
    return data.get('data', {})

