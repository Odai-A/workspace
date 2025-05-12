import os
import pandas as pd
from flask import Flask, request, render_template, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:Od_pugilist5243@db.jjtdvdbfbsdcoyehubmx.supabase.co:5432/postgres'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {"pool_pre_ping": True}
app.config['SECRET_KEY'] = os.urandom(24) # For flash messages

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

if __name__ == '__main__':
    app.run(debug=True) 