import os
import pandas as pd
import requests
import json
import base64
from flask import Flask, request, render_template, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:Od_pugilist5243@db.jjtdvdbfbsdcoyehubmx.supabase.co:5432/postgres'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
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

class Product(db.Model):
    __tablename__ = 'products'
    id = db.Column(db.Integer, primary_key=True)
    lpn = db.Column(db.Text, unique=True, nullable=False)
    asin = db.Column(db.Text)
    fnsku = db.Column(db.Text)
    title = db.Column(db.Text)
    msrp = db.Column(db.Float)

    def __repr__(self):
        return f"<Product {self.lpn}>"

class ScanHistory(db.Model):
    __tablename__ = 'scan_history'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    scanned_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    product = db.relationship('Product') # Allows easy access to product details

    def __repr__(self):
        return f"<ScanHistory product_id={self.product_id} at {self.scanned_at}>"

@app.before_request
def create_tables_if_not_exist():
    # This will create tables based on SQLAlchemy models if they don't exist.
    # In a production environment, you might prefer to use migrations (e.g., Alembic).
    with app.app_context(): # Ensure we are within application context
        db.create_all()

@app.route('/')
def index():
    return redirect(url_for('search'))

@app.route('/upload', methods=['GET', 'POST'])
def upload_csv():
    if request.method == 'POST':
        if 'csvfile' not in request.files:
            flash('No file part', 'danger')
            return redirect(request.url)
        file = request.files['csvfile']
        if file.filename == '':
            flash('No selected file', 'danger')
            return redirect(request.url)
        if file and file.filename.endswith('.csv'):
            try:
                # Try reading with UTF-8 first
                try:
                    df = pd.read_csv(file, dtype=str, encoding='utf-8')
                except UnicodeDecodeError:
                    # If UTF-8 fails, reset the file stream and try with latin1
                    file.seek(0) 
                    df = pd.read_csv(file, dtype=str, encoding='latin1')

                required_columns = {'X-Z ASIN', 'B00 Asin', 'Fn Sku', 'Description'}
                if not required_columns.issubset(df.columns):
                    missing = required_columns - set(df.columns)
                    flash(f'Missing required columns: {", ".join(missing)}', 'danger')
                    return redirect(request.url)

                processed_count = 0
                updated_count = 0
                added_count = 0

                for _, row in df.iterrows():
                    lpn = row.get('X-Z ASIN')
                    asin = row.get('B00 Asin')
                    fnsku = row.get('Fn Sku')
                    title = row.get('Description')
                    msrp_str = row.get('MSRP') # Get MSRP as string

                    if not lpn: # Skip row if LPN (X-Z ASIN) is missing
                        continue
                    
                    # Fill NaN or None with None for database compatibility
                    asin = None if pd.isna(asin) else asin
                    fnsku = None if pd.isna(fnsku) else fnsku
                    title = None if pd.isna(title) else title
                    
                    msrp = None
                    if pd.notna(msrp_str):
                        try:
                            msrp = float(str(msrp_str).replace('$', '').replace(',', '')) # Clean and convert
                        except ValueError:
                            msrp = None # If conversion fails, set to None

                    product = Product.query.filter_by(lpn=lpn).first()
                    if product:
                        product.asin = asin
                        product.fnsku = fnsku
                        product.title = title
                        product.msrp = msrp # Update MSRP
                        updated_count += 1
                    else:
                        product = Product(lpn=lpn, asin=asin, fnsku=fnsku, title=title, msrp=msrp) # Add MSRP
                        db.session.add(product)
                    processed_count += 1
                
                db.session.commit()
                flash(f'Successfully processed {processed_count} rows. Added: {added_count}, Updated: {updated_count}', 'success')
            except Exception as e:
                db.session.rollback()
                flash(f'Error processing CSV: {str(e)}', 'danger')
            return redirect(url_for('upload_csv'))
        else:
            flash('Invalid file type. Please upload a CSV file.', 'danger')
            return redirect(request.url)

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
    app.run(debug=True) 