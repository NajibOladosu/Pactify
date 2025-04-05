#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Check if Supabase CLI is installed
function checkSupabaseCLI() {
  try {
    execSync('supabase --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    console.log('❌ Supabase CLI is not installed or not in PATH');
    console.log('Please install it: https://supabase.com/docs/guides/cli/getting-started');
    return false;
  }
}

// Apply schema to Supabase project
async function applySchema() {
  console.log('🚀 Applying database schema to Supabase project...');
  
  // Get schema SQL file path
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Schema file not found at ${schemaPath}`);
    process.exit(1);
  }
  
  // Prompt for confirmation
  console.log('⚠️  This will apply the schema to your Supabase project.');
  console.log('⚠️  Existing tables with the same names will be affected.');
  
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
  
  try {
    // Check if we have SUPABASE_URL and SUPABASE_SERVICE_ROLE in .env.local
    let envContent = '';
    try {
      envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
    } catch (error) {
      try {
        envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
      } catch (innerError) {
        console.error('❌ Could not find .env.local or .env file');
        rl.close();
        return;
      }
    }
    
    const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1];
    const supabaseServiceRole = envContent.match(/SUPABASE_SERVICE_ROLE=(.+)/)?.[1];
    
    if (!supabaseUrl || !supabaseServiceRole) {
      console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE in .env file');
      rl.close();
      return;
    }
    
    // Execute the schema against Supabase using PSQL
    console.log('📄 Reading schema file...');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('🔄 Executing SQL against Supabase database...');
    
    // Get Supabase DB URL using supabase CLI
    console.log('📊 Connecting to database...');
    
    // Create a temporary SQL file
    const tempSqlPath = path.join(__dirname, 'temp-schema.sql');
    fs.writeFileSync(tempSqlPath, schemaSql);
    
    try {
      // Option 1: Using Supabase db execute command (if available)
      try {
        execSync(`supabase db execute --file ${tempSqlPath}`, { 
          stdio: 'inherit',
          env: {
            ...process.env,
            SUPABASE_URL: supabaseUrl,
            SUPABASE_SERVICE_ROLE: supabaseServiceRole
          }
        });
      } catch (error) {
        // Option 2: Fallback to REST API for direct SQL execution
        console.log('⚠️ Supabase CLI execution failed, trying alternative method...');
        
        const execResult = execSync(`curl -X POST "${supabaseUrl}/rest/v1/rpc/execute_sql" \
          -H "apikey: ${supabaseServiceRole}" \
          -H "Authorization: Bearer ${supabaseServiceRole}" \
          -H "Content-Type: application/json" \
          -d '{"sql":"${schemaSql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"}'`, 
          { encoding: 'utf8' }
        );
        
        console.log('API Response:', execResult);
      }
      
      console.log('✅ Schema applied successfully!');
    } catch (execError) {
      console.error('❌ Failed to apply schema:', execError.message);
      console.log('Please check the SQL syntax or try applying it manually through the Supabase dashboard.');
    } finally {
      // Clean up temp file
      fs.unlinkSync(tempSqlPath);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  rl.close();
}

// Main function
async function main() {
  console.log('🔧 Pactify Database Schema Installer');
  console.log('===============================');
  
  if (!checkSupabaseCLI()) {
    process.exit(1);
  }
  
  await applySchema();
}

main();
