#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to check if Supabase CLI is installed
function checkSupabaseCLI() {
  try {
    execSync('supabase --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

// Function to modify schema SQL to use IF NOT EXISTS
function modifySchemaForSafeExecution(schemaContent) {
  // Replace CREATE TABLE with CREATE TABLE IF NOT EXISTS
  let modifiedSchema = schemaContent.replace(/CREATE TABLE (?!IF NOT EXISTS)/g, 'CREATE TABLE IF NOT EXISTS ');
  
  // Replace CREATE EXTENSION with CREATE EXTENSION IF NOT EXISTS
  modifiedSchema = modifiedSchema.replace(/CREATE EXTENSION (?!IF NOT EXISTS)/g, 'CREATE EXTENSION IF NOT EXISTS ');
  
  // Replace CREATE OR REPLACE FUNCTION with safer version that drops if exists
  modifiedSchema = modifiedSchema.replace(/CREATE OR REPLACE FUNCTION/g, 'DROP FUNCTION IF EXISTS $1; CREATE OR REPLACE FUNCTION');
  
  // Replace CREATE TRIGGER with CREATE TRIGGER IF NOT EXISTS (when possible)
  modifiedSchema = modifiedSchema.replace(/CREATE TRIGGER (?!IF NOT EXISTS)/g, 'CREATE TRIGGER IF NOT EXISTS ');
  
  // Add comments to explain the modifications
  modifiedSchema = `-- Modified for safe execution with IF NOT EXISTS clauses\n${modifiedSchema}`;
  
  return modifiedSchema;
}

// Function to generate SQL for dropping schema
function generateDropTablesSQL() {
  return `
-- Drop existing tables (if needed)
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS contacts;
DROP TABLE IF EXISTS user_subscriptions;
DROP TABLE IF EXISTS subscription_plans;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS milestones;
DROP TABLE IF EXISTS contract_parties;
DROP TABLE IF EXISTS contracts;
DROP TABLE IF EXISTS contract_templates;
DROP TABLE IF EXISTS profiles;

-- Drop existing triggers (if needed)
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_available_contracts_trigger ON contracts;
DROP TRIGGER IF EXISTS set_contract_number_trigger ON contracts;

-- Drop existing functions (if needed)
DROP FUNCTION IF EXISTS handle_user_update();
DROP FUNCTION IF EXISTS handle_new_user();
DROP FUNCTION IF EXISTS update_available_contracts();
DROP FUNCTION IF EXISTS set_contract_number();
`;
}

// Main function
async function applySchema() {
  console.log('🚀 Pactify Database Schema Installer');
  console.log('===================================');
  
  // Check Supabase CLI
  if (!checkSupabaseCLI()) {
    console.log('❌ Supabase CLI not found. Installing...');
    try {
      execSync('npm install -g @supabase/cli', { stdio: 'inherit' });
      console.log('✅ Supabase CLI installed successfully');
    } catch (error) {
      console.error('❌ Failed to install Supabase CLI:', error.message);
      console.log('Please install it manually: npm install -g @supabase/cli');
      rl.close();
      return;
    }
  }
  
  // Prompt for project reference
  const projectRef = await new Promise(resolve => {
    rl.question('Enter your Supabase project reference (found in project URL): ', answer => {
      resolve(answer.trim());
    });
  });
  
  if (!projectRef) {
    console.error('❌ Project reference is required');
    rl.close();
    return;
  }
  
  // Check if user is already logged in
  let isLoggedIn = false;
  try {
    execSync('supabase projects list', { stdio: 'pipe' });
    isLoggedIn = true;
  } catch (error) {
    console.log('⚠️ You need to login to Supabase first');
    console.log('🔄 Running `supabase login`...');
    try {
      execSync('supabase login', { stdio: 'inherit' });
    } catch (error) {
      console.error('❌ Failed to login:', error.message);
      rl.close();
      return;
    }
  }
  
  // Link to project
  console.log('🔄 Linking to Supabase project...');
  try {
    execSync(`supabase link --project-ref ${projectRef}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Failed to link to project:', error.message);
    rl.close();
    return;
  }
  
  // Ask for schema application mode
  console.log('\n🛠️  Schema Application Options:');
  console.log('1. Safe Mode: Add tables if they don\'t exist (recommended for existing database)');
  console.log('2. Reset Mode: Drop existing tables and recreate schema (WARNING: all data will be lost)');
  console.log('3. Direct SQL: Export SQL to apply manually through Supabase dashboard');
  
  const mode = await new Promise(resolve => {
    rl.question('\nSelect option (1-3): ', answer => {
      resolve(answer.trim());
    });
  });
  
  // Read schema file
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Schema file not found at ${schemaPath}`);
    rl.close();
    return;
  }
  
  console.log('📄 Reading schema file...');
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  
  // Create supabase directory structure if it doesn't exist
  const supabaseDir = path.join(__dirname, '..', 'supabase');
  const migrationsDir = path.join(supabaseDir, 'migrations');
  
  if (!fs.existsSync(supabaseDir)) {
    fs.mkdirSync(supabaseDir, { recursive: true });
  }
  
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }
  
  // Handle based on selected mode
  if (mode === '1') {
    // Safe Mode - Modify schema to use IF NOT EXISTS
    console.log('🔄 Preparing schema with IF NOT EXISTS clauses...');
    const safeSchema = modifySchemaForSafeExecution(schemaContent);
    
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').split('.')[0];
    const migrationFile = path.join(migrationsDir, `${timestamp}_safe_schema.sql`);
    
    fs.writeFileSync(migrationFile, safeSchema);
    console.log(`✅ Created safe migration file: ${migrationFile}`);
    
    console.log('\n⚠️  This will apply the schema safely to your Supabase project.');
    console.log('⚠️  Tables will only be created if they don\'t already exist.');
    
    const confirm = await new Promise(resolve => {
      rl.question('Are you sure you want to proceed? (y/N): ', answer => {
        resolve(answer.toLowerCase() === 'y');
      });
    });
    
    if (!confirm) {
      console.log('Operation cancelled');
      rl.close();
      return;
    }
    
    // Push migration
    console.log('🔄 Pushing schema to Supabase...');
    try {
      execSync('supabase db push', { stdio: 'inherit' });
      console.log('✅ Schema applied successfully!');
    } catch (error) {
      console.error('❌ Failed to push schema:', error.message);
      console.log('\nIf you continue to have issues, you can:');
      console.log('1. Apply the schema manually through the Supabase dashboard SQL editor');
      console.log('2. Check that your Supabase project permissions are correctly set');
      console.log('3. Try using the "Direct SQL" option to export the SQL for manual application');
    }
  } 
  else if (mode === '2') {
    // Reset Mode - Drop existing tables first
    console.log('🔄 Preparing schema with table dropping...');
    const dropSQL = generateDropTablesSQL();
    const resetSchema = `${dropSQL}\n\n${schemaContent}`;
    
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').split('.')[0];
    const migrationFile = path.join(migrationsDir, `${timestamp}_reset_schema.sql`);
    
    fs.writeFileSync(migrationFile, resetSchema);
    console.log(`✅ Created reset migration file: ${migrationFile}`);
    
    console.log('\n⚠️  WARNING: This will DROP ALL EXISTING TABLES and recreate the schema.');
    console.log('⚠️  ALL DATA WILL BE LOST. This cannot be undone.');
    
    const confirm = await new Promise(resolve => {
      rl.question('Are you absolutely sure you want to proceed? Type "RESET" to confirm: ', answer => {
        resolve(answer === 'RESET');
      });
    });
    
    if (!confirm) {
      console.log('Operation cancelled');
      rl.close();
      return;
    }
    
    // Push migration
    console.log('🔄 Resetting database and pushing schema to Supabase...');
    try {
      execSync('supabase db push', { stdio: 'inherit' });
      console.log('✅ Database reset and schema applied successfully!');
    } catch (error) {
      console.error('❌ Failed to push schema:', error.message);
      console.log('\nIf you continue to have issues, you can:');
      console.log('1. Apply the schema manually through the Supabase dashboard SQL editor');
      console.log('2. Check that your Supabase project permissions are correctly set');
    }
  }
  else if (mode === '3') {
    // Direct SQL - Export for manual application
    console.log('🔄 Preparing SQL for manual application...');
    
    const sqlDir = path.join(__dirname, '..', 'database', 'exports');
    if (!fs.existsSync(sqlDir)) {
      fs.mkdirSync(sqlDir, { recursive: true });
    }
    
    // Create safe version of schema
    const safeSchema = modifySchemaForSafeExecution(schemaContent);
    const safeSchemaPath = path.join(sqlDir, 'safe_schema.sql');
    fs.writeFileSync(safeSchemaPath, safeSchema);
    
    // Create reset version of schema
    const resetSchema = `${generateDropTablesSQL()}\n\n${schemaContent}`;
    const resetSchemaPath = path.join(sqlDir, 'reset_schema.sql');
    fs.writeFileSync(resetSchemaPath, resetSchema);
    
    // Create original schema copy
    const originalSchemaPath = path.join(sqlDir, 'original_schema.sql');
    fs.writeFileSync(originalSchemaPath, schemaContent);
    
    console.log('✅ SQL files exported successfully!');
    console.log('\nSchema files have been exported to the following locations:');
    console.log(`1. Safe Schema (with IF NOT EXISTS): ${safeSchemaPath}`);
    console.log(`2. Reset Schema (drops tables first): ${resetSchemaPath}`);
    console.log(`3. Original Schema: ${originalSchemaPath}`);
    console.log('\nTo apply the schema manually:');
    console.log('1. Go to https://app.supabase.com/project/_/sql');
    console.log('2. Open a new SQL query');
    console.log('3. Copy and paste the SQL from one of the exported files');
    console.log('4. Click "Run" to execute the SQL');
  }
  else {
    console.error('❌ Invalid option selected');
  }
  
  rl.close();
}

// Run main function
applySchema();
