const fs = require('fs');
const path = require('path');
require('dotenv').config();

const templatePath = path.join(__dirname, '../public/manifest.template.json');
const outputPath = path.join(__dirname, '../public/manifest.json');

// Read the template
let manifestContent = fs.readFileSync(templatePath, 'utf8');

// Replace environment variables
manifestContent = manifestContent.replace(
  '%GOOGLE_OAUTH_CLIENT_ID%',
  process.env.GOOGLE_OAUTH_CLIENT_ID || ''
);

// Write the manifest
fs.writeFileSync(outputPath, manifestContent);

console.log('✅ manifest.json generated successfully'); 