const fs = require('fs');
const path = require('path');

// Files and directories to remove
const filesToRemove = [
  './app/(dashboard)/dashboard/layout-debug.tsx',
  './app/api/debug-user/route.ts',
  './app/api/debug/payments/route.ts',
  './app/api/test-auth/route.ts',
  './app/api/test-subscription/route.ts',
  './app/api/test/contract-visibility/route.ts'
];

const dirsToRemove = [
  './app/api/debug/payments',
  './app/api/debug/contracts',
  './app/api/debug',
  './app/api/debug-user',
  './app/api/test-auth',
  './app/api/test-subscription',
  './app/api/test/contract-visibility',
  './app/api/test',
  './app/api/current-user-debug',
  './app/api/debug-dashboard',
  './app/(dashboard)/dashboard/debug'
];

console.log('Starting cleanup of debugging files...');

// Remove files
filesToRemove.forEach(file => {
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`✅ Removed file: ${file}`);
    } else {
      console.log(`⚠️  File not found: ${file}`);
    }
  } catch (error) {
    console.log(`❌ Error removing file ${file}:`, error.message);
  }
});

// Remove directories (in reverse order to handle nested structures)
dirsToRemove.reverse().forEach(dir => {
  try {
    if (fs.existsSync(dir)) {
      fs.rmdirSync(dir);
      console.log(`✅ Removed directory: ${dir}`);
    } else {
      console.log(`⚠️  Directory not found: ${dir}`);
    }
  } catch (error) {
    console.log(`❌ Error removing directory ${dir}:`, error.message);
  }
});

console.log('🎉 Cleanup completed!');