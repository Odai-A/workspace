import axios from 'axios';

// Test FNSKU
const fnsku = 'X000ABCDEF';
const apiKey = '20a98a6a-437e-497c-b64c-ec97ec2fbc19';

console.log('Testing FNSKU to ASIN API with:');
console.log('- FNSKU:', fnsku);
console.log('- API Key:', apiKey.substring(0, 8) + '...');

// Try multiple possible API endpoints
const endpoints = [
  `https://ato.fnskutoasin.com/api/v1/fnsku/${fnsku}?apiKey=${apiKey}`,
  `https://ato.fnskutoasin.com/api/lookup/fnsku/${fnsku}?key=${apiKey}`,
  `https://ato.fnskutoasin.com/api/v1/lookup?fnsku=${fnsku}&apiKey=${apiKey}`,
  `https://api.fnskutoasin.com/api/v1/products/${fnsku}?key=${apiKey}`
];

async function testEndpoints() {
  for (const [index, endpoint] of endpoints.entries()) {
    console.log(`\nTesting endpoint ${index + 1}...`);
    console.log('URL:', endpoint);
    
    try {
      const response = await axios.get(endpoint);
      console.log('Status:', response.status);
      
      // If the response is HTML, log a shortened version
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        console.log('Response: [HTML document returned instead of JSON]');
        console.log('❌ API returned HTML instead of JSON data');
      } else {
        console.log('Response:', JSON.stringify(response.data, null, 2));
        
        if (response.data && (response.data.succeeded === true || response.data.success === true || response.data.asin)) {
          console.log('✅ API call succeeded!');
        } else {
          console.log('❌ API call returned unsuccessful status');
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

testEndpoints().then(() => {
  console.log('\nAPI testing completed');
}).catch(err => {
  console.error('Error running tests:', err);
}); 