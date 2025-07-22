// Script to concatenate markdown files in correct order
const fs = require('fs');
const path = require('path');

/**
 * Concatenate all markdown files in a directory in correct page order
 * @param {string} sourceDir - Directory containing markdown files
 * @param {string} outputFile - Path to output file
 */
function concatenateMarkdownFiles(sourceDir, outputFile) {
  try {
    // Check if source directory exists
    if (!fs.existsSync(sourceDir)) {
      console.error(`Source directory ${sourceDir} does not exist`);
      process.exit(1);
    }

    // Get all markdown files in the directory
    const files = fs.readdirSync(sourceDir)
      .filter(file => file.endsWith('.md') && file.startsWith('pages_'));

    if (files.length === 0) {
      console.error(`No markdown files found in ${sourceDir}`);
      process.exit(1);
    }

    console.log(`Found ${files.length} markdown files to concatenate`);

    // Sort files by page number
    const sortedFiles = files.sort((a, b) => {
      // Extract start page numbers from filenames like "pages_1_to_10.md"
      const startPageA = parseInt(a.match(/pages_(\d+)_to_/)[1], 10);
      const startPageB = parseInt(b.match(/pages_(\d+)_to_/)[1], 10);
      return startPageA - startPageB;
    });

    console.log('Files will be concatenated in this order:');
    sortedFiles.forEach(file => console.log(`  ${file}`));

    // Concatenate files
    let combinedContent = '';
    let totalPages = 0;

    sortedFiles.forEach(file => {
      const filePath = path.join(sourceDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Extract page range from filename
      const match = file.match(/pages_(\d+)_to_(\d+)\.md/);
      if (match) {
        const startPage = parseInt(match[1], 10);
        const endPage = parseInt(match[2], 10);
        const pageCount = endPage - startPage + 1;
        totalPages += pageCount;
      }

      combinedContent += content + '\n\n';
      console.log(`Added ${file}`);
    });

    // Write combined content to output file
    fs.writeFileSync(outputFile, combinedContent);
    console.log(`\nSuccessfully concatenated ${sortedFiles.length} files (${totalPages} pages) into ${outputFile}`);

  } catch (error) {
    console.error('Error concatenating files:', error.message);
    process.exit(1);
  }
}

// Get directory name from command line or use default
const sourceDir = process.argv[2] || path.join(__dirname, 'grammar_markdown');
const outputFile = process.argv[3] || path.join(__dirname, 'grammar_complete.md');

console.log(`Concatenating markdown files from ${sourceDir} to ${outputFile}`);
concatenateMarkdownFiles(sourceDir, outputFile);
