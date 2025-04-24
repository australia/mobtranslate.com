// PDF to Markdown conversion using Datalab API
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Configuration
const API_KEY = 'YzS7T3YBpjXcecfgAcWpLBHL63cNEgC9ai4olCxx_3w'; // Replace with your actual API key

// Get PDF path from command line or use default
const PDF_PATH = process.argv[2] || path.join(__dirname, 'sample.pdf'); // Path to your PDF file

/**
 * Convert PDF to Markdown using Datalab's Marker API
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<string>} - The markdown content
 */
async function convertPdfToMarkdown(pdfPath) {
  try {
    // Check if the file exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }
    // Step 1: Submit the PDF for processing
    console.log('Submitting PDF for processing...');

    // Read the file as a buffer
    const fileBuffer = fs.readFileSync(pdfPath);

    // Create form data
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: path.basename(pdfPath) });
    formData.append('langs', 'English');
    formData.append('output_format', 'markdown');
    formData.append('paginate', 'false');

    // Submit the request
    const submitResponse = await axios.post(
      'https://www.datalab.to/api/v1/marker',
      formData,
      {
        headers: {
          'X-Api-Key': API_KEY,
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      },
    );

    const { request_id, request_check_url, success, error } =
      submitResponse.data;

    if (!success) {
      throw new Error(`Failed to submit PDF: ${error}`);
    }

    console.log(`Request ID: ${request_id}`);
    console.log(`Check URL: ${request_check_url}`);

    // Step 2: Poll for results
    console.log('Polling for results...');
    const maxPolls = 300;
    const pollInterval = 2000; // 2 seconds

    for (let i = 0; i < maxPolls; i++) {
      console.log(`Poll attempt ${i + 1}/${maxPolls}`);

      // Wait for the poll interval
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      // Check the status
      const checkResponse = await axios.get(request_check_url, {
        headers: { 'X-Api-Key': API_KEY },
      });

      const checkData = checkResponse.data;

      if (checkData.status === 'complete') {
        console.log('Processing complete!');

        if (!checkData.success) {
          throw new Error(`Processing failed: ${checkData.error}`);
        }

        // Save the markdown to a file
        const outputPath = path.join(__dirname, 'output.md');
        fs.writeFileSync(outputPath, checkData.markdown);
        console.log(`Markdown saved to ${outputPath}`);

        // Save any images if they exist
        if (checkData.images && Object.keys(checkData.images).length > 0) {
          const imagesDir = path.join(__dirname, 'images');
          if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir);
          }

          for (const [filename, base64Data] of Object.entries(
            checkData.images,
          )) {
            const imagePath = path.join(imagesDir, filename);
            const imageBuffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(imagePath, imageBuffer);
            console.log(`Image saved to ${imagePath}`);
          }
        }

        return checkData.markdown;
      }

      console.log(`Status: ${checkData.status}`);
    }

    throw new Error(
      'Maximum polling attempts reached. Try checking the status manually.',
    );
  } catch (error) {
    console.error('Error converting PDF to Markdown:', error.message);
    throw error;
  }
}

// Execute the conversion if this file is run directly
if (require.main === module) {
  if (process.argv.length < 3) {
    console.log('Usage: node pdftomd.js <path-to-pdf-file>');
    console.log('Example: node pdftomd.js ./document.pdf');
    console.log(`Attempting to use default path: ${PDF_PATH}`);
  }

  console.log(`Converting PDF at ${PDF_PATH}...`);
  convertPdfToMarkdown(PDF_PATH)
    .then((markdown) => {
      console.log('Conversion successful!');
    })
    .catch((error) => {
      console.error('Conversion failed:', error.message);
      process.exit(1);
    });
}

module.exports = { convertPdfToMarkdown };
