# PDF to Markdown Converter

This script converts PDF files to Markdown format using the Datalab API.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Replace the API key in `pdftomd.js`:
```javascript
const API_KEY = 'YOUR_API_KEY'; // Replace with your actual Datalab API key
```

3. Place your PDF file in this directory and update the path in `pdftomd.js`:
```javascript
const PDF_PATH = path.join(__dirname, 'your-file.pdf'); // Change to your PDF filename
```

## Usage

Run the script:
```bash
npm start
```

Or use it programmatically:
```javascript
const { convertPdfToMarkdown } = require('./pdftomd');

convertPdfToMarkdown('/path/to/your/file.pdf')
  .then(markdown => {
    console.log('Conversion successful!');
    // Do something with the markdown
  })
  .catch(error => {
    console.error('Conversion failed:', error.message);
  });
```

## Output

The script will:
1. Save the markdown to `output.md`
2. Extract and save any images to an `images` directory
