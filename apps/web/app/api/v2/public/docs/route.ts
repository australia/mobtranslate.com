import { NextResponse } from 'next/server'
import { corsHeaders } from '../../middleware'

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

export async function GET() {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MobTranslate Dictionary API Documentation</title>
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: sans-serif;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 2rem;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 2.5rem;
        }
        .header p {
          margin: 0.5rem 0 0 0;
          opacity: 0.9;
          font-size: 1.1rem;
        }
        #swagger-ui {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }
        .info-section {
          max-width: 1200px;
          margin: 2rem auto;
          padding: 0 2rem;
        }
        .info-card {
          background: #f7f9fc;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .info-card h2 {
          margin-top: 0;
          color: #333;
        }
        .info-card ul {
          line-height: 1.8;
        }
        .code-example {
          background: #2d3748;
          color: #fff;
          padding: 1rem;
          border-radius: 4px;
          overflow-x: auto;
        }
        .code-example pre {
          margin: 0;
          font-family: 'Courier New', monospace;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>MobTranslate Dictionary API</h1>
        <p>Public API for accessing dictionary data - Build language learning apps, quiz games, and more!</p>
      </div>
      
      <div class="info-section">
        <div class="info-card">
          <h2>🚀 Quick Start</h2>
          <p>Our API is completely open and requires no authentication. Simply make HTTP GET requests to our endpoints.</p>
          <div class="code-example">
            <pre>// Fetch all dictionaries
fetch('https://mobtranslate.com/api/v2/public/dictionaries')
  .then(res => res.json())
  .then(data => console.log(data))

// Search for words
fetch('https://mobtranslate.com/api/v2/public/search?q=hello')
  .then(res => res.json())
  .then(data => console.log(data))</pre>
          </div>
        </div>
        
        <div class="info-card">
          <h2>✨ Features</h2>
          <ul>
            <li><strong>No Authentication Required:</strong> Completely open API for public use</li>
            <li><strong>CORS Enabled:</strong> Access from any domain, perfect for web apps</li>
            <li><strong>Rich Data:</strong> Get words, definitions, translations, pronunciations, and more</li>
            <li><strong>Pagination:</strong> Efficiently handle large datasets</li>
            <li><strong>Search:</strong> Powerful search across words, definitions, and translations</li>
            <li><strong>Multiple Languages:</strong> Access dictionaries for various languages</li>
          </ul>
        </div>
        
        <div class="info-card">
          <h2>📚 Use Cases</h2>
          <ul>
            <li>Build language learning applications</li>
            <li>Create vocabulary quiz games</li>
            <li>Develop translation tools</li>
            <li>Educational resources and flashcards</li>
            <li>Language preservation projects</li>
            <li>Linguistic research tools</li>
          </ul>
        </div>
        
        <div class="info-card">
          <h2>📖 Example Applications</h2>
          <div class="code-example">
            <pre>// Example: Build a vocabulary quiz game
async function getRandomWord(dictionaryId) {
  const response = await fetch(
    \`https://mobtranslate.com/api/v2/public/dictionaries/\${dictionaryId}/words?limit=100\`
  );
  const data = await response.json();
  const randomIndex = Math.floor(Math.random() * data.words.length);
  return data.words[randomIndex];
}

// Example: Search translations
async function searchTranslations(query) {
  const response = await fetch(
    \`https://mobtranslate.com/api/v2/public/search?q=\${query}&type=translation\`
  );
  return response.json();
}</pre>
          </div>
        </div>
      </div>
      
      <div id="swagger-ui"></div>
      
      <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
      <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
      <script>
        window.onload = function() {
          window.ui = SwaggerUIBundle({
            url: "/api/v2/public/spec",
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIStandalonePreset
            ],
            plugins: [
              SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "StandaloneLayout",
            tryItOutEnabled: true,
            supportedSubmitMethods: ['get'],
            onComplete: function() {
              console.log("Swagger UI loaded successfully");
            }
          });
        }
      </script>
    </body>
    </html>
  `

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      ...corsHeaders()
    }
  })
}