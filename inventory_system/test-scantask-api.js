import axios from 'axios';

// Test barcode/FNSKU
const barCode = 'X000ABCDEF';
const apiKey = '20a98a6a-437e-497c-b64c-ec97ec2fbc19';

console.log('Testing ScanTask API with:');
console.log('- Barcode:', barCode);
console.log('- API Key:', apiKey.substring(0, 8) + '...');

// Base URL for the API
const baseUrl = 'https://ato.fnskutoasin.com';

// API endpoints to test
const endpoints = [
  {
    name: 'GetMyByBarCode',
    method: 'GET',
    url: `${baseUrl}/api/v1/ScanTask/GetMyByBarCode?barCode=${barCode}`
  },
  {
    name: 'GetMy (all scan tasks)',
    method: 'GET',
    url: `${baseUrl}/api/v1/ScanTask/GetMy`
  },
  {
    name: 'AddOrGet (POST)',
    method: 'POST',
    url: `${baseUrl}/api/v1/ScanTask/AddOrGet`,
    data: { barCode }
  },
  {
    name: 'GetMyById',
    method: 'GET',
    url: `${baseUrl}/api/v1/ScanTask/GetMyById?id=1` // Assuming first ID is 1
  }
];

// Request headers
const requestOptions = {
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  timeout: 8000 // 8 second timeout
};

// Test each endpoint
async function testEndpoints() {
  for (const endpoint of endpoints) {
    console.log(`\n----- Testing ${endpoint.name} -----`);
    console.log(`${endpoint.method} ${endpoint.url}`);
    
    try {
      let response;
      
      if (endpoint.method === 'GET') {
        response = await axios.get(endpoint.url, requestOptions);
      } else if (endpoint.method === 'POST') {
        response = await axios.post(endpoint.url, endpoint.data, requestOptions);
      }
      
      console.log('Status:', response.status);
      
      // If response is HTML, log a shortened version
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        console.log('Response: [HTML document returned instead of JSON]');
        console.log('❌ API returned HTML instead of JSON data');
      } else {
        // For large responses, only print a summary
        if (Array.isArray(response.data)) {
          console.log(`Response: Array with ${response.data.length} items`);
          if (response.data.length > 0) {
            console.log('First item:', JSON.stringify(response.data[0], null, 2));
          }
        } else {
          console.log('Response:', JSON.stringify(response.data, null, 2));
        }
        
        if (response.data && (
          response.data.succeeded === true || 
          response.data.success === true || 
          response.data.asin || 
          (Array.isArray(response.data) && response.data.length > 0)
        )) {
          console.log('✅ API call succeeded!');
        } else {
          console.log('❌ API call returned unsuccessful status or empty data');
        }
      }
    } catch (error) {
      console.error('❌ API Error:', error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE html>') 
          ? '[HTML document returned]' 
          : JSON.stringify(error.response.data, null, 2));
      }
    }
  }
}

// Run the tests
testEndpoints().then(() => {
  console.log('\nAPI testing completed');
}).catch(err => {
  console.error('Error running tests:', err);
}); 