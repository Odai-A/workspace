// Test script to verify cache save is working
// Run this in browser console after scanning an item

// Test 1: Check if api_lookup_cache table is accessible
async function testCacheAccess() {
  const { supabase } = await import('./inventory_system/src/config/supabaseClient.js');
  
  try {
    const { data, error } = await supabase
      .from('api_lookup_cache')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Cannot access api_lookup_cache:', error);
      return false;
    }
    
    console.log('✅ Can access api_lookup_cache table');
    return true;
  } catch (e) {
    console.error('❌ Error accessing api_lookup_cache:', e);
    return false;
  }
}

// Test 2: Try to save a test entry
async function testCacheSave() {
  const { apiCacheService } = await import('./inventory_system/src/services/databaseService.js');
  
  const testData = {
    fnsku: 'TEST-FNSKU-123',
    asin: 'B00TEST123',
    name: 'Test Product',
    description: 'Test Description',
    price: 29.99,
    category: 'Test Category',
    image_url: 'https://example.com/test-image.jpg',
    source: 'test'
  };
  
  console.log('🧪 Testing cache save with:', testData);
  
  try {
    const result = await apiCacheService.saveLookup(testData);
    
    if (result) {
      console.log('✅ Test save SUCCESS:', result);
      return true;
    } else {
      console.error('❌ Test save FAILED - returned null');
      return false;
    }
  } catch (error) {
    console.error('❌ Test save ERROR:', error);
    return false;
  }
}

// Run tests
console.log('🧪 Running cache tests...');
testCacheAccess().then(accessOk => {
  if (accessOk) {
    testCacheSave();
  }
});

