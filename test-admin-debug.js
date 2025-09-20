/**
 * Debug Supabase Admin API connection
 */

// Load environment 
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  const envVars = envFile.split('\n')
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const equalIndex = line.indexOf('=');
      return [line.substring(0, equalIndex), line.substring(equalIndex + 1)];
    })
    .filter(([key, value]) => key && value);
    
  envVars.forEach(([key, value]) => {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

async function debugAdminAPI() {
  console.log('🔍 Debugging Supabase Admin API');
  console.log('=' .repeat(40));
  
  console.log('Environment:');
  console.log('- URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('- Service Role Key (first 20 chars):', process.env.SUPABASE_SERVICE_ROLE?.substring(0, 20) + '...');
  
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    );
    
    console.log('\n✅ Supabase client created');
    
    // Test basic connection first
    const { data: basicTest, error: basicError } = await supabaseAdmin
      .from('profiles')
      .select('count')
      .limit(1);
      
    if (basicError && basicError.code !== 'PGRST116') {
      console.log('❌ Basic query failed:', basicError);
      return false;
    }
    
    console.log('✅ Basic query successful');
    
    // Test admin API specifically
    console.log('\n🧪 Testing admin.createUser...');
    
    const testEmail = `admin-test-${Date.now()}@example.com`;
    
    try {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: testEmail,
        password: 'testpassword123',
        email_confirm: true,
        user_metadata: {
          full_name: 'Admin Test User',
          user_type: 'freelancer'
        }
      });
      
      if (authError) {
        console.log('❌ Admin user creation failed:', authError);
        console.log('Error details:', JSON.stringify(authError, null, 2));
        return false;
      }
      
      console.log('✅ Admin user created:', authData.user.id);
      
      // Clean up
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      if (deleteError) {
        console.log('⚠️  Failed to clean up user:', deleteError);
      } else {
        console.log('✅ User cleaned up');
      }
      
      return true;
      
    } catch (error) {
      console.log('❌ Exception during admin user creation:', error);
      console.log('Error type:', typeof error);
      console.log('Error message:', error.message);
      console.log('Stack trace:', error.stack);
      return false;
    }
    
  } catch (error) {
    console.log('❌ Failed to create Supabase client:', error);
    return false;
  }
}

debugAdminAPI().then(success => {
  console.log('\n' + '=' .repeat(40));
  console.log(success ? '🎉 Admin API working correctly' : '💥 Admin API has issues');
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});