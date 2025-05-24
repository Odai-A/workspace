# 🧪 Shopify Integration Test Guide

## Quick Test Setup (5 minutes)

### **Step 1: Add Test Credentials**
Create `.env` file in your `inventory_system` folder:
```env
REACT_APP_SHOPIFY_STORE=your-test-store
REACT_APP_SHOPIFY_API_KEY=test_key
REACT_APP_SHOPIFY_PASSWORD=test_password
```

### **Step 2: Test the Feature**

1. **Start your application**:
   ```bash
   cd inventory_system
   npm start
   ```

2. **Go to Scanner page**

3. **Scan test ASIN**: `B0CHBJXG7G`
   - This will show as "Direct ASIN lookup - No API charge"
   - Blue banner indicates free lookup

4. **Click "🛍️ Create Shopify Listing"**

5. **Test connection**: Click "Test Shopify Connection"
   - Should show connection status

6. **Review the modal features**:
   - ✅ Auto-generated title
   - ✅ Pricing with markup (default 50%)
   - ✅ Amazon link preview
   - ✅ Rich HTML description

7. **Check the preview section**:
   - Amazon link button should be visible
   - Description should include product details
   - Price calculation should work

## 🎯 **Expected Results**

### **Modal Should Show**:
- **Title**: "Amazon Product B0CHBJXG7G"
- **Price**: Based on markup (default $29.99 if no base price)
- **Amazon Link**: Orange button linking to Amazon
- **Preview**: Full HTML description with styling

### **Description Preview**:
```html
🛒 View Original Product
See this product on Amazon for additional details...
[📱 View on Amazon Button]
```

### **Features Working**:
- ✅ Markup calculation
- ✅ Title auto-generation
- ✅ Amazon URL creation
- ✅ Status selection (Draft/Active)
- ✅ Advanced settings toggle

## 🛠️ **Test Without Real Shopify Store**

Even without valid Shopify credentials, you can:

1. **Test the UI**: Modal opens and displays correctly
2. **Test Form Logic**: Price calculations, title generation
3. **Test Preview**: Amazon link generation, description HTML
4. **Test Validation**: Required fields, format checking

The connection test will fail (expected), but everything else should work!

## 🚀 **Real Store Test**

If you have a Shopify store:

1. **Create a test product**: Use `B0CHBJXG7G`
2. **Set status to "Draft"**: So it doesn't go live
3. **Create the listing**
4. **Check Shopify admin**: Product should appear
5. **Verify Amazon link**: Click it in the product description

## 📝 **Test Checklist**

- [ ] Scanner detects ASIN correctly
- [ ] "Create Shopify Listing" button appears
- [ ] Modal opens with form fields
- [ ] Amazon link preview shows
- [ ] Price calculation works
- [ ] Advanced settings toggle
- [ ] Connection test (pass/fail both OK for testing)
- [ ] Form validation works
- [ ] Preview updates when form changes

## 🎉 **Success!**

If you can see the modal with Amazon link preview and working form calculations, the integration is working! 

**Next steps**: Set up real Shopify credentials using `SHOPIFY_SETUP.md` guide.

---

**Quick Test Command:**
```bash
# Test with ASIN
Manual Input: B0CHBJXG7G
Click: Lookup → Create Shopify Listing → Preview
``` 