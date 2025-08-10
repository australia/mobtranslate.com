const baseUrl = 'http://localhost:3000/api/v2/public';

async function testAPI() {
  console.log('🧪 Testing MobTranslate Dictionary API v2\n');
  console.log('==========================================\n');

  const tests = [
    {
      name: 'List Dictionaries',
      url: `${baseUrl}/dictionaries`,
      expectedStatus: 200,
      checkResponse: (data) => {
        return data.dictionaries && Array.isArray(data.dictionaries) && data.pagination;
      }
    },
    {
      name: 'Get Dictionary by Code',
      url: `${baseUrl}/dictionaries/en`,
      expectedStatus: [200, 404], // Might not exist
      checkResponse: (data) => {
        return data.id || data.error;
      }
    },
    {
      name: 'Search API',
      url: `${baseUrl}/search?q=test`,
      expectedStatus: 200,
      checkResponse: (data) => {
        return data.results && Array.isArray(data.results) && data.pagination;
      }
    },
    {
      name: 'API Documentation',
      url: `${baseUrl}/docs`,
      expectedStatus: 200,
      checkResponse: null,
      checkHeaders: (headers) => {
        return headers.get('content-type').includes('text/html');
      }
    },
    {
      name: 'OpenAPI Spec',
      url: `${baseUrl}/spec`,
      expectedStatus: 200,
      checkResponse: (data) => {
        return data.openapi && data.info && data.paths;
      }
    },
    {
      name: 'CORS Headers Check',
      url: `${baseUrl}/dictionaries`,
      expectedStatus: 200,
      checkHeaders: (headers) => {
        const cors = headers.get('access-control-allow-origin');
        return cors === '*';
      }
    }
  ];

  for (const test of tests) {
    try {
      console.log(`📝 Testing: ${test.name}`);
      console.log(`   URL: ${test.url}`);
      
      const response = await fetch(test.url);
      const status = response.status;
      
      // Check status
      const expectedStatuses = Array.isArray(test.expectedStatus) 
        ? test.expectedStatus 
        : [test.expectedStatus];
      
      if (expectedStatuses.includes(status)) {
        console.log(`   ✅ Status: ${status}`);
      } else {
        console.log(`   ❌ Status: ${status} (expected: ${expectedStatuses.join(' or ')})`);
      }
      
      // Check headers
      if (test.checkHeaders) {
        if (test.checkHeaders(response.headers)) {
          console.log(`   ✅ Headers check passed`);
        } else {
          console.log(`   ❌ Headers check failed`);
        }
      }
      
      // Check response
      if (test.checkResponse) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          if (test.checkResponse(data)) {
            console.log(`   ✅ Response structure valid`);
          } else {
            console.log(`   ❌ Response structure invalid`);
            console.log(`   Response:`, JSON.stringify(data, null, 2).substring(0, 200));
          }
        }
      }
      
      console.log('');
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
    }
  }
  
  console.log('\n==========================================');
  console.log('📊 API Testing Complete!\n');
  console.log('The API is now available at:');
  console.log(`  - Base URL: ${baseUrl}`);
  console.log(`  - Documentation: ${baseUrl}/docs`);
  console.log(`  - OpenAPI Spec: ${baseUrl}/spec`);
  console.log('\n🎮 Ready for building apps like quiz games!');
}

// Check if server is running first
fetch('http://localhost:3000')
  .then(() => {
    console.log('✅ Server is running\n');
    testAPI();
  })
  .catch(() => {
    console.log('❌ Server is not running. Please start it with: pnpm dev');
  });