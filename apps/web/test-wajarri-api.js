const baseUrl = 'http://localhost:3000/api/v2/public';

async function testWajarriAPI() {
  console.log('🔍 Testing Wajarri Dictionary API Access\n');
  console.log('==========================================\n');

  try {
    // Test 1: Check if Wajarri is in dictionaries list
    console.log('📚 Test 1: Fetching all dictionaries...');
    const dictResponse = await fetch(`${baseUrl}/dictionaries`);
    const dictData = await dictResponse.json();
    
    if (dictData.dictionaries) {
      const wajarri = dictData.dictionaries.find(d => d.code === 'wbv');
      if (wajarri) {
        console.log('✅ Wajarri found in dictionaries list!');
        console.log(`   - Name: ${wajarri.name}`);
        console.log(`   - Code: ${wajarri.code}`);
        console.log(`   - Region: ${wajarri.region}`);
        console.log(`   - Status: ${wajarri.status}`);
      } else {
        console.log('❌ Wajarri not found in dictionaries list');
      }
    }

    // Test 2: Get Wajarri dictionary details
    console.log('\n📖 Test 2: Fetching Wajarri dictionary details...');
    const detailResponse = await fetch(`${baseUrl}/dictionaries/wbv`);
    
    if (detailResponse.ok) {
      const detailData = await detailResponse.json();
      console.log('✅ Wajarri dictionary details retrieved!');
      console.log(`   - Total words: ${detailData.stats?.total_words || 0}`);
      console.log(`   - Language family: ${detailData.family}`);
      console.log(`   - ISO 639-3: ${detailData.iso_639_3}`);
    } else {
      console.log(`❌ Failed to get dictionary details: ${detailResponse.status}`);
    }

    // Test 3: Get sample Wajarri words
    console.log('\n🔤 Test 3: Fetching Wajarri words...');
    const wordsResponse = await fetch(`${baseUrl}/dictionaries/wbv/words?limit=10`);
    
    if (wordsResponse.ok) {
      const wordsData = await wordsResponse.json();
      console.log(`✅ Retrieved ${wordsData.words?.length || 0} Wajarri words!`);
      
      if (wordsData.words && wordsData.words.length > 0) {
        console.log('\n📝 Sample words:');
        wordsData.words.slice(0, 5).forEach(word => {
          const translation = word.translations?.[0]?.translation || 
                            word.definitions?.[0]?.definition || 
                            'No translation';
          console.log(`   • ${word.word} = ${translation}`);
        });
        
        console.log(`\n📊 Pagination info:`);
        console.log(`   - Page: ${wordsData.pagination.page}`);
        console.log(`   - Total words: ${wordsData.pagination.total}`);
        console.log(`   - Total pages: ${wordsData.pagination.total_pages}`);
      }
    } else {
      console.log(`❌ Failed to get words: ${wordsResponse.status}`);
    }

    // Test 4: Search for Wajarri words
    console.log('\n🔍 Test 4: Searching Wajarri dictionary...');
    const searchResponse = await fetch(`${baseUrl}/search?q=water&dictionary_code=wbv`);
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      console.log(`✅ Search completed! Found ${searchData.results?.length || 0} results`);
      
      if (searchData.results && searchData.results.length > 0) {
        console.log('\n🔎 Search results:');
        searchData.results.slice(0, 3).forEach(result => {
          console.log(`   - Type: ${result.type}`);
          if (result.word) {
            console.log(`     Word: ${result.word.word}`);
          }
        });
      }
    } else {
      console.log(`❌ Search failed: ${searchResponse.status}`);
    }

    // Test 5: CORS headers check
    console.log('\n🌐 Test 5: Checking CORS headers...');
    const corsResponse = await fetch(`${baseUrl}/dictionaries/wbv/words?limit=1`);
    const corsHeader = corsResponse.headers.get('access-control-allow-origin');
    
    if (corsHeader === '*') {
      console.log('✅ CORS is properly configured (accessible from any domain)');
    } else {
      console.log(`⚠️  CORS header value: ${corsHeader || 'not set'}`);
    }

  } catch (error) {
    console.error('❌ Error during testing:', error.message);
  }

  console.log('\n==========================================');
  console.log('\n🎉 Wajarri Dictionary API Summary:');
  console.log('   - API Base: ' + baseUrl);
  console.log('   - Dictionary endpoint: /dictionaries/wbv');
  console.log('   - Words endpoint: /dictionaries/wbv/words');
  console.log('   - Search: /search?q=term&dictionary_code=wbv');
  console.log('\n💡 Ready for building Wajarri language apps!');
}

// Check if server is running
fetch('http://localhost:3000')
  .then(() => {
    console.log('✅ Server is running\n');
    testWajarriAPI();
  })
  .catch(() => {
    console.log('❌ Server is not running. Please start it with: pnpm dev');
  });