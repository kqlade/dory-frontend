const fs = require('fs');
const path = require('path');
const util = require('util');

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const SRC_DIR = path.join(__dirname, 'src');
const OUTPUT_FILE = path.join(__dirname, 'codebase.txt');
const EXCLUDED_DIR = 'html2text';

// Function to recursively get all files
async function getAllFiles(dir) {
  const entries = await readdir(dir);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry);
      const stats = await stat(entryPath);
      
      // Skip html2text directory
      if (stats.isDirectory() && entry === EXCLUDED_DIR) {
        return [];
      }
      
      if (stats.isDirectory()) {
        return getAllFiles(entryPath);
      }
      
      return entryPath;
    })
  );
  
  return files.flat();
}

// Main function to generate the codebase file
async function generateCodebaseFile() {
  try {
    console.log('Collecting files...');
    const allFiles = await getAllFiles(SRC_DIR);
    console.log(`Found ${allFiles.length} files`);
    
    let outputContent = '';
    
    for (const filePath of allFiles) {
      // Show relative path from project root
      const relativePath = path.relative(__dirname, filePath);
      outputContent += `\n\n==========================================\n`;
      outputContent += `FILE: ${relativePath}\n`;
      outputContent += `==========================================\n\n`;
      
      try {
        const content = await readFile(filePath, 'utf8');
        outputContent += content;
      } catch (error) {
        outputContent += `[Error reading file: ${error.message}]`;
      }
    }
    
    await writeFile(OUTPUT_FILE, outputContent);
    console.log(`Codebase collected in ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error generating codebase file:', error);
  }
}

// Run the script
generateCodebaseFile();
