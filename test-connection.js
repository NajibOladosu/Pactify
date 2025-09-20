/**
 * Test Connection - Basic environment and connection test
 */

// Load environment variables
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

async function testConnection() {
  console.log('🧪 Testing Basic Connection');
  console.log('=' .repeat(40));
  
  console.log('Environment Variables:');
  console.log('- SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('- SUPABASE_SERVICE_ROLE:', process.env.SUPABASE_SERVICE_ROLE ? '✅ Set' : '❌ Missing'); 
  console.log('- STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅ Set' : '❌ Missing');
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    console.log('❌ Missing required environment variables');
    return false;
  }
  
  try {
    // Test Supabase connection
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    );
    
    console.log('\n🔗 Testing Supabase connection...');
    
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);
      
    if (error && error.code !== 'PGRST116') {
      console.log('❌ Supabase connection failed:', error.message);
      return false;
    }
    
    console.log('✅ Supabase connection successful');
    
    // Test basic user creation
    console.log('\n👤 Testing user creation...');
    
    const testEmail = `test-connection-${Date.now()}@example.com`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: 'testpassword123',
      email_confirm: true
    });
    
    if (authError) {
      console.log('❌ User creation failed:', authError.message);
      return false;
    }
    
    console.log('✅ Test user created:', authData.user.id);
    
    // Clean up test user
    await supabase.auth.admin.deleteUser(authData.user.id);
    console.log('✅ Test user cleaned up');
    
    console.log('\n🎉 All connection tests passed!');
    return true;
    
  } catch (error) {
    console.log('❌ Connection test failed:', error.message);
    return false;
  }
}

testConnection().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});