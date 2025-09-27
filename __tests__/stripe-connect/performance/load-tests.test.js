const { POST: createAccount } = require('@/app/api/connect/v2/create-account/route');
const { POST: createVerification } = require('@/app/api/identity/create-verification-session/route');
const { POST: addPayoutMethod } = require('@/app/api/payout-methods/route');
const { POST: requestWithdrawal } = require('@/app/api/withdrawals/v2/request/route');
const { POST: handleWebhook } = require('@/app/api/webhooks/stripe/v2/route');
const { WithdrawalSecurity } = require('@/lib/security/withdrawal-security');
const { createMockRequest, mockSupabaseAuth, createMockStripe, TEST_USERS, getSupabaseClient } = require('../utils/test-helpers');
const crypto = require('crypto');

// Mock dependencies
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn()
}));

jest.mock('@/utils/profile-helpers', () => ({
  ensureUserProfile: jest.fn()
}));

describe('Performance and Load Tests', () => {
  let mockStripe;
  let supabase;
  let withdrawalSecurity;
  const testId = Date.now();
  const webhookSecret = 'whsec_test_performance_secret';

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    
    mockStripe = createMockStripe();
    supabase = getSupabaseClient();
    withdrawalSecurity = new WithdrawalSecurity(supabase);
    
    // Mock Stripe module
    jest.doMock('stripe', () => ({
      __esModule: true,
      default: jest.fn(() => mockStripe)
    }));

    // Setup mock Supabase client
    const { createClient } = require('@/utils/supabase/server');
    createClient.mockReturnValue(supabase);

    // Setup profile helper
    const mockProfileHelper = require('@/utils/profile-helpers');
    mockProfileHelper.ensureUserProfile.mockImplementation(async () => ({
      id: TEST_USERS.VERIFIED,
      email: 'performance-user@test.example.com',
      stripe_account_id: 'acct_test_performance',
      identity_status: 'verified'
    }));
  });

  afterAll(async () => {
    // Cleanup test data
    await Promise.all([
      supabase.from('withdrawals').delete().like('idempotency_key', `perf_test_${testId}%`),
      supabase.from('payout_methods').delete().like('stripe_external_account_id', `ba_perf_${testId}%`),
      supabase.from('identity_verification_sessions').delete().like('stripe_session_id', `vs_perf_${testId}%`),
      supabase.from('withdrawal_security_logs').delete().like('metadata->test_type', 'performance')
    ]);
    
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Supabase for performance user
    jest.doMock('@/utils/supabase/server', () => ({
      createClient: () => mockSupabaseAuth(TEST_USERS.VERIFIED)
    }));
  });

  function createWebhookRequest(eventType, data, accountId = null) {
    const event = {
      id: `evt_perf_${testId}_${Date.now()}_${Math.random()}`,
      object: 'event',
      created: Math.floor(Date.now() / 1000),
      type: eventType,
      data: { object: data },
      ...(accountId && { account: accountId })
    };

    const payload = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    return createMockRequest('POST', payload, {
      'stripe-signature': `t=${timestamp},v1=${signature}`
    });
  }

  describe('Concurrent Request Handling', () => {
    test('should handle concurrent Connect account creation requests', async () => {
      const concurrentRequests = 20;
      const startTime = Date.now();

      // Setup Stripe mocks for concurrent requests
      mockStripe.accounts.create.mockImplementation(async () => ({
        id: `acct_perf_${Date.now()}_${Math.random()}`,
        object: 'account',
        type: 'express',
        email: 'test@example.com'
      }));

      mockStripe.accountLinks.create.mockImplementation(async () => ({
        object: 'account_link',
        url: 'https://connect.stripe.com/setup/test',
        created: Math.floor(Date.now() / 1000),
        expires_at: Math.floor(Date.now() / 1000) + 1800
      }));

      // Create concurrent requests
      const requests = Array.from({ length: concurrentRequests }, (_, i) => 
        createMockRequest('POST', {
          country: 'US',
          business_type: 'individual'
        })
      );

      // Execute requests concurrently
      const responses = await Promise.all(
        requests.map(request => createAccount(request))
      );

      const duration = Date.now() - startTime;
      const successfulRequests = responses.filter(r => r.status === 200).length;

      console.log(`✅ Processed ${successfulRequests}/${concurrentRequests} concurrent account creation requests in ${duration}ms`);
      console.log(`📊 Average response time: ${(duration / concurrentRequests).toFixed(2)}ms per request`);

      expect(successfulRequests).toBeGreaterThan(concurrentRequests * 0.8); // At least 80% success rate
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    }, 15000);

    test('should handle concurrent identity verification requests', async () => {
      const concurrentRequests = 15;
      const startTime = Date.now();

      // Setup Stripe mocks
      mockStripe.identity.verificationSessions.create.mockImplementation(async () => ({
        id: `vs_perf_${Date.now()}_${Math.random()}`,
        object: 'identity.verification_session',
        client_secret: `vs_secret_${Math.random()}`,
        type: 'document',
        status: 'requires_input'
      }));

      const requests = Array.from({ length: concurrentRequests }, () => 
        createMockRequest('POST', {
          type: 'document'
        })
      );

      const responses = await Promise.all(
        requests.map(request => createVerification(request))
      );

      const duration = Date.now() - startTime;
      const successfulRequests = responses.filter(r => r.status === 200).length;

      console.log(`✅ Processed ${successfulRequests}/${concurrentRequests} concurrent identity verification requests in ${duration}ms`);

      expect(successfulRequests).toBeGreaterThan(concurrentRequests * 0.8);
      expect(duration).toBeLessThan(8000);
    }, 12000);

    test('should handle concurrent payout method additions', async () => {
      const concurrentRequests = 10;
      const startTime = Date.now();

      // Setup Stripe mocks
      mockStripe.accounts.createExternalAccount.mockImplementation(async () => ({
        id: `ba_perf_${Date.now()}_${Math.random()}`,
        object: 'bank_account',
        account: 'acct_test_performance',
        last4: Math.floor(Math.random() * 9999).toString().padStart(4, '0'),
        bank_name: 'Test Bank',
        country: 'US',
        currency: 'usd'
      }));

      const requests = Array.from({ length: concurrentRequests }, (_, i) => 
        createMockRequest('POST', {
          type: 'bank_account',
          bank_account: {
            country: 'US',
            currency: 'USD',
            account_holder_name: `Test User ${i}`,
            account_holder_type: 'individual',
            routing_number: '110000000',
            account_number: `00012345678${i}`
          }
        })
      );

      const responses = await Promise.all(
        requests.map(request => addPayoutMethod(request))
      );

      const duration = Date.now() - startTime;
      const successfulRequests = responses.filter(r => r.status === 200).length;

      console.log(`✅ Processed ${successfulRequests}/${concurrentRequests} concurrent payout method additions in ${duration}ms`);

      expect(successfulRequests).toBeGreaterThan(concurrentRequests * 0.8);
      expect(duration).toBeLessThan(6000);
    }, 10000);

    test('should handle concurrent withdrawal requests with security assessment', async () => {
      const concurrentRequests = 12;
      const startTime = Date.now();

      // Create test payout method first
      await supabase.from('payout_methods').insert({
        id: `${testId}-perf-payout`,
        user_id: TEST_USERS.VERIFIED,
        stripe_external_account_id: `ba_perf_${testId}`,
        stripe_account_id: 'acct_test_performance',
        method_type: 'bank_account',
        is_verified: true,
        verification_status: 'verified',
        added_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days old
      });

      // Setup Stripe mocks
      mockStripe.payouts.create.mockImplementation(async () => ({
        id: `po_perf_${Date.now()}_${Math.random()}`,
        object: 'payout',
        amount: 50000,
        currency: 'usd',
        status: 'pending'
      }));

      // Mock database operations
      jest.doMock('@/utils/supabase/server', () => ({
        createClient: () => ({
          ...mockSupabaseAuth(TEST_USERS.VERIFIED),
          rpc: jest.fn().mockImplementation((funcName) => {
            if (funcName === 'get_user_available_balance') {
              return Promise.resolve({
                data: [{ available_balance_cents: 1000000 }], // $10,000 available
                error: null
              });
            }
            return Promise.resolve({ data: [], error: null });
          }),
          from: (table) => ({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({
                    data: table === 'payout_methods' ? [{
                      id: `${testId}-perf-payout`,
                      is_verified: true,
                      added_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                      method_type: 'bank_account',
                      stripe_external_account_id: `ba_perf_${testId}`
                    }] : [],
                    error: null
                  })
                })
              })
            }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: `withdrawal_perf_${Math.random()}`,
                    user_id: TEST_USERS.VERIFIED,
                    amount_cents: 50000,
                    currency: 'USD',
                    status: 'processing',
                    created_at: new Date().toISOString()
                  },
                  error: null
                })
              })
            }),
            upsert: jest.fn().mockResolvedValue({ error: null })
          })
        })
      }));

      const requests = Array.from({ length: concurrentRequests }, (_, i) => 
        createMockRequest('POST', {
          amount_cents: 50000 + (i * 1000), // Vary amounts slightly
          currency: 'USD',
          payout_method_id: `${testId}-perf-payout`,
          urgency: 'standard'
        })
      );

      const responses = await Promise.all(
        requests.map(request => requestWithdrawal(request))
      );

      const duration = Date.now() - startTime;
      const successfulRequests = responses.filter(r => r.status === 200).length;

      console.log(`✅ Processed ${successfulRequests}/${concurrentRequests} concurrent withdrawal requests in ${duration}ms`);
      console.log(`⚡ Average request processing time: ${(duration / concurrentRequests).toFixed(2)}ms`);

      expect(successfulRequests).toBeGreaterThan(concurrentRequests * 0.8);
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds

      // Cleanup
      await supabase.from('payout_methods').delete().eq('id', `${testId}-perf-payout`);
    }, 20000);

    test('should handle concurrent webhook processing', async () => {
      const concurrentWebhooks = 25;
      const startTime = Date.now();

      // Create different types of webhook events
      const eventTypes = [
        'account.updated',
        'identity.verification_session.verified',
        'payout.paid',
        'transfer.created',
        'account.external_account.updated'
      ];

      const webhooks = Array.from({ length: concurrentWebhooks }, (_, i) => {
        const eventType = eventTypes[i % eventTypes.length];
        const accountId = `acct_perf_${i}`;
        
        let eventData;
        switch (eventType) {
          case 'account.updated':
            eventData = {
              id: accountId,
              object: 'account',
              type: 'express',
              charges_enabled: true,
              payouts_enabled: true
            };
            break;
          case 'identity.verification_session.verified':
            eventData = {
              id: `vs_perf_${i}`,
              object: 'identity.verification_session',
              status: 'verified'
            };
            break;
          case 'payout.paid':
            eventData = {
              id: `po_perf_${i}`,
              object: 'payout',
              amount: 100000,
              currency: 'usd',
              status: 'paid'
            };
            break;
          case 'transfer.created':
            eventData = {
              id: `tr_perf_${i}`,
              object: 'transfer',
              amount: 50000,
              currency: 'usd',
              destination: accountId
            };
            break;
          case 'account.external_account.updated':
            eventData = {
              id: `ba_perf_${i}`,
              object: 'bank_account',
              account: accountId,
              status: 'verified'
            };
            break;
        }

        return createWebhookRequest(eventType, eventData, accountId);
      });

      const responses = await Promise.all(
        webhooks.map(webhook => handleWebhook(webhook))
      );

      const duration = Date.now() - startTime;
      const successfulWebhooks = responses.filter(r => r.status === 200).length;

      console.log(`✅ Processed ${successfulWebhooks}/${concurrentWebhooks} concurrent webhooks in ${duration}ms`);
      console.log(`🚀 Webhook throughput: ${(concurrentWebhooks / (duration / 1000)).toFixed(2)} webhooks/second`);

      expect(successfulWebhooks).toBeGreaterThan(concurrentWebhooks * 0.9); // Higher success rate expected for webhooks
      expect(duration).toBeLessThan(8000);
    }, 12000);
  });

  describe('Security Assessment Performance', () => {
    test('should perform security assessments efficiently under load', async () => {
      const assessmentCount = 50;
      const startTime = Date.now();

      // Create test data for assessments
      const contexts = Array.from({ length: assessmentCount }, (_, i) => ({
        userId: TEST_USERS.VERIFIED,
        amountCents: 50000 + (i * 1000),
        currency: 'USD',
        payoutMethodId: `method_${i}`,
        ipAddress: `203.0.113.${(i % 254) + 1}`,
        userAgent: 'Mozilla/5.0 (Performance Test)'
      }));

      // Run assessments concurrently
      const assessments = await Promise.all(
        contexts.map(context => withdrawalSecurity.assessWithdrawalSecurity(context))
      );

      const duration = Date.now() - startTime;

      console.log(`🔒 Completed ${assessmentCount} security assessments in ${duration}ms`);
      console.log(`⚡ Average assessment time: ${(duration / assessmentCount).toFixed(2)}ms`);

      expect(assessments).toHaveLength(assessmentCount);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      
      // Verify all assessments have required properties
      assessments.forEach(assessment => {
        expect(assessment).toHaveProperty('score');
        expect(assessment).toHaveProperty('requires_review');
        expect(assessment).toHaveProperty('flags');
        expect(typeof assessment.score).toBe('number');
        expect(typeof assessment.requires_review).toBe('boolean');
        expect(Array.isArray(assessment.flags)).toBe(true);
      });
    }, 15000);

    test('should handle security logging efficiently', async () => {
      const logCount = 100;
      const startTime = Date.now();

      // Create concurrent security log entries
      const logPromises = Array.from({ length: logCount }, (_, i) => 
        withdrawalSecurity.logSecurityEvent(
          TEST_USERS.VERIFIED,
          'performance_test',
          `203.0.113.${(i % 254) + 1}`,
          'Performance Test Agent',
          Math.floor(Math.random() * 100),
          ['performance_flag'],
          { test_type: 'performance', sequence: i }
        )
      );

      await Promise.all(logPromises);

      const duration = Date.now() - startTime;

      console.log(`📝 Logged ${logCount} security events in ${duration}ms`);
      console.log(`💾 Average logging time: ${(duration / logCount).toFixed(2)}ms per log`);

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify logs were created
      const { data: logs } = await supabase
        .from('withdrawal_security_logs')
        .select('id')
        .eq('user_id', TEST_USERS.VERIFIED)
        .eq('event_type', 'performance_test')
        .like('metadata->test_type', 'performance');

      expect(logs.length).toBeGreaterThan(logCount * 0.95); // At least 95% success rate
    }, 10000);
  });

  describe('Database Performance', () => {
    test('should handle rapid database queries efficiently', async () => {
      const queryCount = 100;
      const startTime = Date.now();

      // Test various database operations
      const queries = Array.from({ length: queryCount }, async (_, i) => {
        switch (i % 4) {
          case 0:
            return supabase.from('profiles').select('id, identity_status').eq('id', TEST_USERS.VERIFIED).single();
          case 1:
            return supabase.from('withdrawals').select('count').eq('user_id', TEST_USERS.VERIFIED);
          case 2:
            return supabase.from('payout_methods').select('id').eq('user_id', TEST_USERS.VERIFIED);
          case 3:
            return supabase.rpc('get_user_available_balance', { p_user_id: TEST_USERS.VERIFIED });
        }
      });

      const results = await Promise.all(queries);

      const duration = Date.now() - startTime;
      const successfulQueries = results.filter(result => !result.error).length;

      console.log(`🗄️  Executed ${successfulQueries}/${queryCount} database queries in ${duration}ms`);
      console.log(`📊 Query throughput: ${(queryCount / (duration / 1000)).toFixed(2)} queries/second`);

      expect(successfulQueries).toBeGreaterThan(queryCount * 0.95);
      expect(duration).toBeLessThan(3000);
    }, 5000);

    test('should handle database insertions under load', async () => {
      const insertCount = 50;
      const startTime = Date.now();

      // Create test data for bulk insertion
      const testData = Array.from({ length: insertCount }, (_, i) => ({
        user_id: TEST_USERS.VERIFIED,
        event_type: 'load_test',
        ip_address: `192.168.1.${(i % 254) + 1}`,
        risk_score: Math.floor(Math.random() * 100),
        flags: [`test_flag_${i}`],
        metadata: { test_type: 'load_test', sequence: i }
      }));

      // Insert in batches to simulate real-world usage
      const batchSize = 10;
      const batches = [];
      for (let i = 0; i < testData.length; i += batchSize) {
        batches.push(testData.slice(i, i + batchSize));
      }

      const insertPromises = batches.map(batch => 
        supabase.from('withdrawal_security_logs').insert(batch)
      );

      const results = await Promise.all(insertPromises);

      const duration = Date.now() - startTime;
      const successfulBatches = results.filter(result => !result.error).length;

      console.log(`📥 Inserted ${successfulBatches * batchSize} records in ${batches.length} batches (${duration}ms)`);
      console.log(`⚡ Insert rate: ${(insertCount / (duration / 1000)).toFixed(2)} inserts/second`);

      expect(successfulBatches).toBe(batches.length);
      expect(duration).toBeLessThan(4000);
    }, 8000);
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory during repeated operations', async () => {
      const iterations = 20;
      const operationsPerIteration = 10;

      // Track memory usage before test
      const initialMemory = process.memoryUsage();

      for (let i = 0; i < iterations; i++) {
        // Perform various operations
        const operations = Array.from({ length: operationsPerIteration }, async (_, j) => {
          const context = {
            userId: TEST_USERS.VERIFIED,
            amountCents: 50000,
            currency: 'USD',
            ipAddress: '203.0.113.1',
            userAgent: 'Memory Test Agent'
          };

          return withdrawalSecurity.assessWithdrawalSecurity(context);
        });

        await Promise.all(operations);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseKB = memoryIncrease / 1024;

      console.log(`🧠 Memory usage after ${iterations * operationsPerIteration} operations:`);
      console.log(`   Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Increase: ${memoryIncreaseKB.toFixed(2)} KB`);

      // Memory increase should be reasonable (less than 50MB for this test)
      expect(memoryIncreaseKB).toBeLessThan(50 * 1024);
    }, 10000);
  });

  describe('Response Time Benchmarks', () => {
    test('should meet response time SLAs for critical operations', async () => {
      const slaRequirements = {
        accountCreation: 2000,      // 2 seconds
        identityVerification: 1500, // 1.5 seconds  
        payoutMethodAdd: 1000,      // 1 second
        withdrawalRequest: 3000,    // 3 seconds (includes security assessment)
        webhookProcessing: 500      // 500ms
      };

      const results = {};

      // Test account creation SLA
      let startTime = Date.now();
      mockStripe.accounts.create.mockResolvedValueOnce({
        id: 'acct_sla_test',
        object: 'account',
        type: 'express'
      });
      mockStripe.accountLinks.create.mockResolvedValueOnce({
        object: 'account_link',
        url: 'https://connect.stripe.com/setup/test'
      });

      const accountRequest = createMockRequest('POST', {
        country: 'US',
        business_type: 'individual'
      });
      
      await createAccount(accountRequest);
      results.accountCreation = Date.now() - startTime;

      // Test identity verification SLA
      startTime = Date.now();
      mockStripe.identity.verificationSessions.create.mockResolvedValueOnce({
        id: 'vs_sla_test',
        object: 'identity.verification_session',
        client_secret: 'vs_secret_test'
      });

      const identityRequest = createMockRequest('POST', {
        type: 'document'
      });
      
      await createVerification(identityRequest);
      results.identityVerification = Date.now() - startTime;

      // Test webhook processing SLA
      startTime = Date.now();
      const webhook = createWebhookRequest('account.updated', {
        id: 'acct_sla_test',
        object: 'account',
        type: 'express'
      });
      
      await handleWebhook(webhook);
      results.webhookProcessing = Date.now() - startTime;

      console.log('📊 Response Time SLA Results:');
      Object.entries(results).forEach(([operation, time]) => {
        const sla = slaRequirements[operation];
        const status = time <= sla ? '✅' : '❌';
        console.log(`   ${operation}: ${time}ms (SLA: ${sla}ms) ${status}`);
      });

      // Verify all operations meet SLA requirements
      Object.entries(results).forEach(([operation, time]) => {
        expect(time).toBeLessThanOrEqual(slaRequirements[operation]);
      });
    }, 15000);
  });
});