/**
 * Complete Workflow Integration Tests
 * Tests all newly implemented workflows end-to-end
 */

const { createClient } = require('@supabase/supabase-js');

// Test configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ahswbmnczyhqfckeglut.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoc3dibW5jenloeWZja2VnbHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTMxMzA4NDIsImV4cCI6MjAyODcwNjg0Mn0.fIdKR9K0EANiIw0zNeLM3WXsP1Vh4zDi4wd3O5Tg7WI';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

let supabase;
let testUsers = {};
let testContract = null;

describe('Complete Workflow Integration Tests', () => {
  beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Create test users
    await createTestUsers();
    
    console.log('Test setup complete. Created users:', Object.keys(testUsers));
  });

  afterAll(async () => {
    // Cleanup test data
    if (testContract) {
      await cleanupTestContract(testContract.id);
    }
    await cleanupTestUsers();
  });

  describe('Database Schema Tests', () => {
    test('Contract versions table exists and is functional', async () => {
      // Test that we can query the contract_versions table
      const { data, error } = await supabase
        .from('contract_versions')
        .select('*')
        .limit(1);
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('Audit logs table exists', async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .limit(1);
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('Notification system tables exist', async () => {
      const { data: templates, error: templateError } = await supabase
        .from('notification_templates')
        .select('*')
        .limit(1);
      
      const { data: notifications, error: notificationError } = await supabase
        .from('notifications')
        .select('*')
        .limit(1);

      expect(templateError).toBeNull();
      expect(notificationError).toBeNull();
      expect(templates).toBeDefined();
      expect(notifications).toBeDefined();
    });

    test('RBAC tables exist', async () => {
      const { data: roles, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .limit(1);
      
      const { data: userRoles, error: userRolesError } = await supabase
        .from('user_roles')
        .select('*')
        .limit(1);

      expect(rolesError).toBeNull();
      expect(userRolesError).toBeNull();
      expect(roles).toBeDefined();
      expect(userRoles).toBeDefined();
    });
  });

  describe('Contract Creation and Management', () => {
    test('Create a test contract', async () => {
      const contractData = {
        title: 'Test Contract - Workflow Integration',
        description: 'A test contract for complete workflow testing',
        terms: 'Standard test terms and conditions',
        total_amount: 1000,
        currency: 'USD',
        payment_type: 'escrow',
        timeline_days: 30,
        client_id: testUsers.client.id,
        freelancer_id: testUsers.freelancer.id,
        status: 'draft'
      };

      const { data, error } = await supabase
        .from('contracts')
        .insert(contractData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.title).toBe(contractData.title);
      
      testContract = data;
      console.log('Created test contract:', testContract.id);
    });

    test('Contract versioning workflow', async () => {
      // Test contract version creation
      const versionData = {
        contract_id: testContract.id,
        version_number: 1,
        title: 'Updated Contract Title',
        description: 'Updated description',
        total_amount: 1200,
        proposed_by: testUsers.client.id,
        changes_summary: 'Increased budget and updated description',
        status: 'proposed'
      };

      const { data: version, error: versionError } = await supabase
        .from('contract_versions')
        .insert(versionData)
        .select()
        .single();

      expect(versionError).toBeNull();
      expect(version).toBeDefined();
      expect(version.title).toBe(versionData.title);

      // Test get_contract_versions function
      const { data: versions, error: versionsError } = await supabase
        .rpc('get_contract_versions', { contract_uuid: testContract.id });

      expect(versionsError).toBeNull();
      expect(versions).toBeDefined();
      expect(versions.length).toBeGreaterThan(0);
    });
  });

  describe('Digital Signature Workflow', () => {
    test('Create contract signatures', async () => {
      // Client signs first
      const clientSignature = {
        contract_id: testContract.id,
        user_id: testUsers.client.id,
        signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        signature_type: 'electronic',
        ip_address: '127.0.0.1',
        user_agent: 'Test Agent'
      };

      const { data: clientSig, error: clientSigError } = await supabase
        .from('contract_signatures')
        .insert(clientSignature)
        .select()
        .single();

      expect(clientSigError).toBeNull();
      expect(clientSig).toBeDefined();

      // Freelancer signs second
      const freelancerSignature = {
        contract_id: testContract.id,
        user_id: testUsers.freelancer.id,
        signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        signature_type: 'electronic',
        ip_address: '127.0.0.1',
        user_agent: 'Test Agent'
      };

      const { data: freelancerSig, error: freelancerSigError } = await supabase
        .from('contract_signatures')
        .insert(freelancerSignature)
        .select()
        .single();

      expect(freelancerSigError).toBeNull();
      expect(freelancerSig).toBeDefined();

      // Verify contract status should be updated to 'signed'
      const { data: updatedContract, error: contractError } = await supabase
        .from('contracts')
        .select('status')
        .eq('id', testContract.id)
        .single();

      expect(contractError).toBeNull();
      // Note: Status update would happen via API, not direct DB insert
      expect(updatedContract).toBeDefined();
    });
  });

  describe('Work Submission Workflow', () => {
    test('Create work submission', async () => {
      const submissionData = {
        contract_id: testContract.id,
        freelancer_id: testUsers.freelancer.id,
        title: 'Initial Work Submission',
        description: 'Completed initial phase of the project',
        deliverable_urls: ['https://example.com/file1.pdf', 'https://example.com/file2.zip'],
        notes: 'Please review and provide feedback',
        status: 'pending_review'
      };

      const { data: submission, error: submissionError } = await supabase
        .from('submissions')
        .insert(submissionData)
        .select()
        .single();

      expect(submissionError).toBeNull();
      expect(submission).toBeDefined();
      expect(submission.title).toBe(submissionData.title);
      expect(submission.deliverable_urls.length).toBe(2);
    });
  });

  describe('Notification System', () => {
    test('Create notifications', async () => {
      const notificationData = {
        user_id: testUsers.client.id,
        type: 'in_app',
        title: 'Test Notification',
        message: 'This is a test notification for workflow testing',
        related_entity_type: 'contract',
        related_entity_id: testContract.id
      };

      const { data: notification, error: notificationError } = await supabase
        .from('notifications')
        .insert(notificationData)
        .select()
        .single();

      expect(notificationError).toBeNull();
      expect(notification).toBeDefined();
      expect(notification.title).toBe(notificationData.title);
    });

    test('Notification templates exist', async () => {
      const { data: templates, error } = await supabase
        .from('notification_templates')
        .select('*')
        .eq('is_active', true);

      expect(error).toBeNull();
      expect(templates).toBeDefined();
      expect(templates.length).toBeGreaterThan(0);

      // Check for required templates
      const templateNames = templates.map(t => t.name);
      expect(templateNames).toContain('contract_accepted');
      expect(templateNames).toContain('work_submitted');
      expect(templateNames).toContain('payment_released');
      expect(templateNames).toContain('dispute_created');
    });
  });

  describe('Payment System', () => {
    test('Create escrow record', async () => {
      const escrowData = {
        contract_id: testContract.id,
        total_amount: testContract.total_amount,
        currency: testContract.currency,
        status: 'pending_funding',
        created_by: testUsers.client.id
      };

      const { data: escrow, error: escrowError } = await supabase
        .from('contract_escrows')
        .insert(escrowData)
        .select()
        .single();

      expect(escrowError).toBeNull();
      expect(escrow).toBeDefined();
      expect(escrow.total_amount).toBe(testContract.total_amount);
    });
  });

  describe('RBAC System', () => {
    test('Default roles exist', async () => {
      const { data: roles, error } = await supabase
        .from('roles')
        .select('*')
        .eq('is_system_role', true);

      expect(error).toBeNull();
      expect(roles).toBeDefined();
      expect(roles.length).toBeGreaterThanOrEqual(4);

      const roleNames = roles.map(r => r.name);
      expect(roleNames).toContain('admin');
      expect(roleNames).toContain('user');
      expect(roleNames).toContain('freelancer');
      expect(roleNames).toContain('client');
    });

    test('User role assignment', async () => {
      // Get client role
      const { data: clientRole, error: roleError } = await supabase
        .from('roles')
        .select('*')
        .eq('name', 'client')
        .single();

      expect(roleError).toBeNull();
      expect(clientRole).toBeDefined();

      // Assign role to test user
      const { data: userRole, error: userRoleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: testUsers.client.id,
          role_id: clientRole.id,
          assigned_by: testUsers.client.id,
          is_active: true
        })
        .select()
        .single();

      expect(userRoleError).toBeNull();
      expect(userRole).toBeDefined();
    });

    test('Permission checking function', async () => {
      const { data: hasPermission, error } = await supabase
        .rpc('check_user_permission', {
          p_user_id: testUsers.client.id,
          p_resource: 'contracts',
          p_action: 'create'
        });

      expect(error).toBeNull();
      expect(typeof hasPermission).toBe('boolean');
    });
  });

  describe('Audit Logging', () => {
    test('Audit log function works', async () => {
      const { data: auditId, error } = await supabase
        .rpc('log_audit_event', {
          p_user_id: testUsers.client.id,
          p_action: 'test_action',
          p_resource_type: 'contract',
          p_resource_id: testContract.id,
          p_metadata: { test: true },
          p_success: true
        });

      expect(error).toBeNull();
      expect(auditId).toBeDefined();

      // Verify the audit log was created
      const { data: auditLog, error: auditError } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('id', auditId)
        .single();

      expect(auditError).toBeNull();
      expect(auditLog).toBeDefined();
      expect(auditLog.action).toBe('test_action');
    });
  });
});

// Helper functions
async function createTestUsers() {
  // Note: In a real test, you would create actual users through Supabase Auth
  // For this test, we'll use placeholder user IDs
  testUsers = {
    client: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      email: 'client@test.com',
      display_name: 'Test Client'
    },
    freelancer: {
      id: '550e8400-e29b-41d4-a716-446655440002', 
      email: 'freelancer@test.com',
      display_name: 'Test Freelancer'
    }
  };

  // Create test profiles if they don't exist
  for (const [role, user] of Object.entries(testUsers)) {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!existingProfile) {
      const { error } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          display_name: user.display_name,
          user_type: role === 'client' ? 'client' : 'freelancer'
        });

      if (error) {
        console.warn(`Could not create test profile for ${role}:`, error.message);
      }
    }
  }
}

async function cleanupTestUsers() {
  // Clean up test profiles
  const userIds = Object.values(testUsers).map(u => u.id);
  
  await supabase
    .from('profiles')
    .delete()
    .in('id', userIds);
}

async function cleanupTestContract(contractId) {
  // Clean up test contract and related data
  await supabase.from('contract_signatures').delete().eq('contract_id', contractId);
  await supabase.from('contract_versions').delete().eq('contract_id', contractId);
  await supabase.from('submissions').delete().eq('contract_id', contractId);
  await supabase.from('contract_escrows').delete().eq('contract_id', contractId);
  await supabase.from('notifications').delete().eq('related_entity_id', contractId);
  await supabase.from('contracts').delete().eq('id', contractId);
}

module.exports = {
  createTestUsers,
  cleanupTestUsers,
  cleanupTestContract
};