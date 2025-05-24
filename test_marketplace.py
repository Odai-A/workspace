#!/usr/bin/env python3
"""
Test script for marketplace integration
This script tests the eBay and Shopify API endpoints without requiring actual API credentials
"""

import requests
import json

# Test data
test_product = {
    "name": "Test Wireless Headphones",
    "description": "High-quality wireless headphones with noise cancellation",
    "price": 79.99,
    "sku": "TEST-WH-001",
    "asin": "B08TEST123",
    "upc": "123456789012",
    "category": "Electronics",
    "fnsku": "X001TEST123"
}

def test_pricing_suggestions():
    """Test the pricing suggestions endpoint"""
    print("Testing pricing suggestions...")
    
    url = "http://localhost:5000/api/marketplace/pricing-suggestions"
    data = {
        "asin": test_product["asin"],
        "upc": test_product["upc"],
        "category": test_product["category"],
        "msrp": test_product["price"]
    }
    
    try:
        response = requests.post(url, json=data)
        if response.status_code == 200:
            result = response.json()
            print("✅ Pricing suggestions working!")
            print(f"   eBay suggested price: ${result['ebay']['suggested']}")
            print(f"   Shopify suggested price: ${result['shopify']['suggested']}")
            return True
        else:
            print(f"❌ Pricing suggestions failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error testing pricing suggestions: {e}")
        return False

def test_ebay_categories():
    """Test the eBay categories endpoint"""
    print("\nTesting eBay categories...")
    
    url = "http://localhost:5000/api/ebay/categories"
    
    try:
        response = requests.get(url)
        if response.status_code == 200:
            categories = response.json()
            print("✅ eBay categories working!")
            print(f"   Found {len(categories)} categories")
            for cat in categories[:3]:  # Show first 3
                print(f"   - {cat['name']} (ID: {cat['id']})")
            return True
        else:
            print(f"❌ eBay categories failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error testing eBay categories: {e}")
        return False

def test_ebay_category_suggestion():
    """Test the eBay category suggestion endpoint"""
    print("\nTesting eBay category suggestion...")
    
    url = "http://localhost:5000/api/ebay/suggest-category"
    data = {
        "title": test_product["name"],
        "description": test_product["description"],
        "upc": test_product["upc"]
    }
    
    try:
        response = requests.post(url, json=data)
        if response.status_code == 200:
            result = response.json()
            if result:
                print("✅ eBay category suggestion working!")
                print(f"   Suggested category: {result['categoryName']} (ID: {result['categoryId']})")
                return True
            else:
                print("⚠️  eBay category suggestion returned null")
                return False
        else:
            print(f"❌ eBay category suggestion failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error testing eBay category suggestion: {e}")
        return False

def test_shopify_collections():
    """Test the Shopify collections endpoint"""
    print("\nTesting Shopify collections...")
    
    url = "http://localhost:5000/api/shopify/collections"
    
    try:
        response = requests.get(url)
        if response.status_code == 200:
            collections = response.json()
            print("✅ Shopify collections endpoint working!")
            print(f"   Found {len(collections)} collections")
            return True
        else:
            print(f"❌ Shopify collections failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error testing Shopify collections: {e}")
        return False

def main():
    """Run all tests"""
    print("🧪 Testing Marketplace Integration")
    print("=" * 50)
    
    tests = [
        test_pricing_suggestions,
        test_ebay_categories,
        test_ebay_category_suggestion,
        test_shopify_collections
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
    
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Your marketplace integration is ready.")
    else:
        print("⚠️  Some tests failed. Check your Flask server is running on localhost:5000")
        print("   Run: python app.py")

if __name__ == "__main__":
    main() 