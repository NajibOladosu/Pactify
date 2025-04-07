#!/usr/bin/env node

/**
 * This script helps extract Vercel project details after linking with Vercel CLI
 * Run this script after executing 'vercel link' to get the necessary IDs for GitHub Actions
 */

const fs = require('fs');
const path = require('path');

// Path to the Vercel project.json file
const projectFilePath = path.join(process.cwd(), '.vercel', 'project.json');

// Check if the project file exists
if (!fs.existsSync(projectFilePath)) {
  console.error('❌ Vercel project file not found!');
  console.log('Please run \'vercel link\' first to link your project with Vercel');
  process.exit(1);
}

try {
  // Read and parse the project file
  const projectData = JSON.parse(fs.readFileSync(projectFilePath, 'utf8'));
  
  console.log('\n🚀 Vercel Project Details');
  console.log('=======================');
  console.log(`Organization ID: ${projectData.orgId}`);
  console.log(`Project ID: ${projectData.projectId}`);
  
  console.log('\n📋 Use these values as GitHub Secrets:');
  console.log('VERCEL_ORG_ID:', projectData.orgId);
  console.log('VERCEL_PROJECT_ID:', projectData.projectId);
  console.log('\nAdditionally, you\'ll need to add a VERCEL_TOKEN secret');
  console.log('You can create one at https://vercel.com/account/tokens');
  
  console.log('\n✅ Ready for GitHub Actions deployment!');
} catch (error) {
  console.error('❌ Error reading Vercel project file:', error.message);
  process.exit(1);
}
