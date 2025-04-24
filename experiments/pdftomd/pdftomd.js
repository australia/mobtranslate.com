// PDF to Markdown conversion using Datalab API
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { PDFDocument } = require('pdf-lib');

// Configuration
const API_KEY = process.env.OPENAI_API_KEY; // Replace with your actual API key

// Get PDF path from command line or use default
const PDF_PATH = process.argv[2] || path.join(__dirname, 'grammar.pdf'); // Path to your PDF file

// Get total pages from command line (optional)
const TOTAL_PAGES = process.argv[3] ? parseInt(process.argv[3], 10) : null;

// Batch size - number of pages to process at once
const PAGES_PER_BATCH = 10;

/**
 * Extract a specific page range from a PDF file
 * @param {string} pdfPath - Path to the PDF file
 * @param {number} startPage - Start page (1-based index)
 * @param {number} pageCount - Number of pages to extract
 * @returns {Promise<Buffer>} - Buffer containing the extracted PDF
 */
async function extractPdfPages(pdfPath, startPage, pageCount) {
  try {
    // Read the PDF file
    const pdfBytes = fs.readFileSync(pdfPath);

    // Load the PDF document
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Create a new PDF document for the extracted pages
    const extractedPdf = await PDFDocument.create();

    // Get the total number of pages in the original PDF
    const totalPages = pdfDoc.getPageCount();

    // Calculate the actual page range to extract
    const actualStartPage = Math.min(startPage - 1, totalPages - 1); // Convert to 0-based index
    const actualPageCount = Math.min(pageCount, totalPages - actualStartPage);

    // Copy the specified pages from the original PDF to the new PDF
    for (let i = 0; i < actualPageCount; i++) {
      const pageIndex = actualStartPage + i;
      if (pageIndex < totalPages) {
        const [copiedPage] = await extractedPdf.copyPages(pdfDoc, [pageIndex]);
        extractedPdf.addPage(copiedPage);
      }
    }

    // Serialize the new PDF to bytes
    const extractedPdfBytes = await extractedPdf.save();

    return Buffer.from(extractedPdfBytes);
  } catch (error) {
    console.error('Error extracting PDF pages:', error.message);
    throw error;
  }
}

/**
 * Convert a specific page range of a PDF to Markdown using Datalab's Marker API
 * @param {string} pdfPath - Path to the PDF file
 * @param {number} startPage - Start page (1-based index)
 * @param {number} maxPages - Maximum number of pages to process
 * @returns {Promise<string>} - The markdown content
 */
async function convertPdfToMarkdown(
  pdfPath,
  startPage = 1,
  maxPages = PAGES_PER_BATCH,
) {
  try {
    // Check if the file exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    console.log(
      `Extracting pages ${startPage} to ${startPage + maxPages - 1} from PDF...`,
    );
    // Extract the specific page range from the PDF
    const extractedPdfBuffer = await extractPdfPages(
      pdfPath,
      startPage,
      maxPages,
    );

    // Step 1: Submit the extracted PDF for processing
    console.log('Submitting extracted PDF for processing...');

    // Create form data with the extracted PDF
    const formData = new FormData();
    formData.append('file', extractedPdfBuffer, {
      filename: `${path.basename(pdfPath, '.pdf')}_pages_${startPage}_to_${startPage + maxPages - 1}.pdf`,
    });
    formData.append('langs', 'English');
    formData.append('output_format', 'markdown');
    formData.append('paginate', 'false');
    formData.append('use_llm', 'true');

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
    const maxPolls = 30000;
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

        // Create output directory based on PDF filename (without extension)
        const pdfBaseName = path.basename(pdfPath, path.extname(pdfPath));
        const outputDir = path.join(__dirname, `${pdfBaseName}_markdown`);

        // Create the directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Save the markdown to a file with batch number in the output directory
        const outputPath = path.join(
          outputDir,
          `pages_${startPage}_to_${startPage + maxPages - 1}.md`,
        );
        fs.writeFileSync(outputPath, checkData.markdown);
        console.log(`Markdown saved to ${outputPath}`);

        // Save any images if they exist
        if (checkData.images && Object.keys(checkData.images).length > 0) {
          const imagesDir = path.join(outputDir, 'images');
          if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
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

/**
 * Get the total number of pages in a PDF file
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<number>} - Total number of pages
 */
async function getPdfPageCount(pdfPath) {
  // If total pages was provided as a command line argument, use that
  if (TOTAL_PAGES) {
    console.log(`Using provided page count: ${TOTAL_PAGES}`);
    return TOTAL_PAGES;
  }

  try {
    console.log('Detecting PDF page count...');
    // We'll use a trick - request just 1 page and check the page_count in the response
    const fileBuffer = fs.readFileSync(pdfPath);

    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: path.basename(pdfPath) });
    formData.append('output_format', 'markdown');
    formData.append('max_pages', '1');

    const response = await axios.post(
      'https://www.datalab.to/api/v1/marker',
      formData,
      {
        headers: {
          'X-Api-Key': API_KEY,
          ...formData.getHeaders(),
        },
      },
    );

    const { request_check_url } = response.data;

    // Poll for the result
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const checkResponse = await axios.get(request_check_url, {
        headers: { 'X-Api-Key': API_KEY },
      });

      const checkData = checkResponse.data;

      if (checkData.status === 'complete') {
        const detectedPages = checkData.page_count || 1;
        console.log(`API detected ${detectedPages} pages`);

        // If the API reports just 1 page but we suspect there are more,
        // ask the user for confirmation
        if (detectedPages === 1) {
          console.log(
            'WARNING: API only detected 1 page. This might be incorrect.',
          );
          console.log(
            'If you know the actual page count, run the script with:',
          );
          console.log('node pdftomd.js your-pdf-file.pdf PAGE_COUNT');
          console.log('For example: node pdftomd.js grammar.pdf 250');

          // Wait 5 seconds to give user time to read the message
          await new Promise((resolve) => setTimeout(resolve, 5000));

          // Default to 10 pages if we only detected 1 (likely incorrect)
          return 10;
        }

        return detectedPages;
      }
    }

    console.log('Could not determine page count, defaulting to 10 pages');
    return 10; // Default to 10 if we can't determine
  } catch (error) {
    console.error('Error getting page count:', error.message);
    console.log('Defaulting to 10 pages');
    return 10; // Default to 10 if there's an error
  }
}

/**
 * Process a PDF in batches of pages
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<void>}
 */
async function processPdfInBatches(pdfPath) {
  try {
    // Get the total number of pages
    const totalPages = await getPdfPageCount(pdfPath);
    console.log(`PDF has ${totalPages} pages total`);

    // Calculate number of batches
    const numBatches = Math.ceil(totalPages / PAGES_PER_BATCH);
    console.log(
      `Will process in ${numBatches} batches of ${PAGES_PER_BATCH} pages each`,
    );

    // Process each batch
    for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
      const startPage = batchIndex * PAGES_PER_BATCH + 1;
      const pagesInThisBatch = Math.min(
        PAGES_PER_BATCH,
        totalPages - (startPage - 1),
      );

      console.log(
        `\nProcessing batch ${batchIndex + 1}/${numBatches}: pages ${startPage} to ${startPage + pagesInThisBatch - 1}`,
      );

      try {
        await convertPdfToMarkdown(pdfPath, startPage, pagesInThisBatch);
        console.log(
          `Batch ${batchIndex + 1}/${numBatches} completed successfully`,
        );
      } catch (error) {
        console.error(
          `Error processing batch ${batchIndex + 1}/${numBatches}:`,
          error.message,
        );
      }
    }

    console.log('\nAll batches processed!');
  } catch (error) {
    console.error('Error processing PDF in batches:', error.message);
    throw error;
  }
}

// Execute the conversion if this file is run directly
if (require.main === module) {
  if (process.argv.length < 3) {
    console.log('Usage: node pdftomd.js <path-to-pdf-file> [total-pages]');
    console.log('Example: node pdftomd.js ./document.pdf 250');
    console.log(`Attempting to use default path: ${PDF_PATH}`);
  }

  console.log(
    `Converting PDF at ${PDF_PATH} in batches of ${PAGES_PER_BATCH} pages...`,
  );
  processPdfInBatches(PDF_PATH)
    .then(() => {
      console.log('Conversion successful!');
    })
    .catch((error) => {
      console.error('Conversion failed:', error.message);
      process.exit(1);
    });
}

module.exports = { convertPdfToMarkdown, processPdfInBatches };
