const { WithdrawalSecurity } = require('@/lib/security/withdrawal-security');
const { getSupabaseClient, TEST_USERS } = require('../utils/test-helpers');

describe('Security Assessment System', () => {
  let withdrawalSecurity;
  let supabase;
  const testId = Date.now();

  beforeAll(() => {
    supabase = getSupabaseClient();
    withdrawalSecurity = new WithdrawalSecurity(supabase);
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await Promise.all([
      supabase.from('withdrawals').delete().like('idempotency_key', `test_security_${testId}%`),
      supabase.from('withdrawal_security_logs').delete().like('metadata->test_id', testId.toString()),
      supabase.from('payout_methods').delete().like('stripe_external_account_id', `ba_security_${testId}%`)
    ]);
  });

  afterEach(async () => {
    // Clean up test data
    await Promise.all([
      supabase.from('withdrawals').delete().like('idempotency_key', `test_security_${testId}%`),
      supabase.from('withdrawal_security_logs').delete().like('metadata->test_id', testId.toString()),
      supabase.from('payout_methods').delete().like('stripe_external_account_id', `ba_security_${testId}%`)
    ]);
  });

  describe('Account Security Assessment', () => {
    test('should assess new account risk', async () => {
      const assessment = await withdrawalSecurity.assessAccountSecurity(TEST_USERS.NEW);

      expect(assessment.score).toBeGreaterThan(0);
      expect(assessment.flags).toContain('new_account');
      expect(assessment.details).toHaveProperty('account_age_days');
      expect(assessment.details.account_age_days).toBeLessThan(30);
    });

    test('should assess established account as low risk', async () => {
      // Create old profile
      const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('profiles').upsert({
        id: TEST_USERS.VERIFIED,
        created_at: oldDate,
        identity_status: 'verified'
      }, { onConflict: 'id' });

      const assessment = await withdrawalSecurity.assessAccountSecurity(TEST_USERS.VERIFIED);

      expect(assessment.score).toBeLessThan(20);
      expect(assessment.flags).not.toContain('new_account');
      expect(assessment.details.account_age_days).toBeGreaterThan(80);
    });

    test('should flag unverified identity as high risk', async () => {
      await supabase.from('profiles').upsert({
        id: TEST_USERS.PENDING,
        identity_status: 'pending'
      }, { onConflict: 'id' });

      const assessment = await withdrawalSecurity.assessAccountSecurity(TEST_USERS.PENDING);

      expect(assessment.score).toBeGreaterThan(30);
      expect(assessment.flags).toContain('unverified_identity');
    });

    test('should assess account with previous failed withdrawals', async () => {
      // Create failed withdrawal history
      await supabase.from('withdrawals').insert([
        {
          user_id: TEST_USERS.VERIFIED,
          amount_cents: 50000,
          currency: 'USD',
          status: 'failed',
          failure_reason: 'insufficient_funds',
          idempotency_key: `test_security_${testId}_failed_1`,
          created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          user_id: TEST_USERS.VERIFIED,
          amount_cents: 30000,
          currency: 'USD',
          status: 'failed',
          failure_reason: 'account_closed',
          idempotency_key: `test_security_${testId}_failed_2`,
          created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      const assessment = await withdrawalSecurity.assessAccountSecurity(TEST_USERS.VERIFIED);

      expect(assessment.score).toBeGreaterThan(25);
      expect(assessment.flags).toContain('high_failure_rate');
      expect(assessment.details.failed_withdrawals_last_30_days).toBe(2);
    });

    test('should assess account with suspicious activity patterns', async () => {
      // Create rapid withdrawal attempts
      const rapidAttempts = Array.from({ length: 5 }, (_, i) => ({
        user_id: TEST_USERS.VERIFIED,
        amount_cents: 10000,
        currency: 'USD',
        status: 'pending',
        idempotency_key: `test_security_${testId}_rapid_${i}`,
        created_at: new Date(Date.now() - i * 5 * 60 * 1000).toISOString() // 5 minutes apart
      }));

      await supabase.from('withdrawals').insert(rapidAttempts);

      const assessment = await withdrawalSecurity.assessAccountSecurity(TEST_USERS.VERIFIED);

      expect(assessment.score).toBeGreaterThan(20);
      expect(assessment.flags).toContain('rapid_withdrawal_pattern');
    });
  });

  describe('Amount Risk Assessment', () => {
    test('should assess small amounts as low risk', async () => {
      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 5000, // $50
        currency: 'USD'
      };

      const assessment = await withdrawalSecurity.assessAmountRisk(context);

      expect(assessment.score).toBeLessThan(15);
      expect(assessment.flags).not.toContain('high_amount');
    });

    test('should assess large amounts as high risk', async () => {
      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 800000, // $8,000
        currency: 'USD'
      };

      const assessment = await withdrawalSecurity.assessAmountRisk(context);

      expect(assessment.score).toBeGreaterThan(30);
      expect(assessment.flags).toContain('high_amount');
      expect(assessment.details.amount_usd).toBe(8000);
    });

    test('should assess round amounts as potentially suspicious', async () => {
      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 100000, // Exactly $1,000
        currency: 'USD'
      };

      const assessment = await withdrawalSecurity.assessAmountRisk(context);

      expect(assessment.flags).toContain('round_amount');
      expect(assessment.details.is_round_amount).toBe(true);
    });

    test('should flag amounts near daily limits', async () => {
      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 490000, // $4,900 (near $5,000 daily limit)
        currency: 'USD'
      };

      const assessment = await withdrawalSecurity.assessAmountRisk(context);

      expect(assessment.flags).toContain('near_limit');
      expect(assessment.details.percentage_of_daily_limit).toBeGreaterThan(95);
    });

    test('should assess amounts relative to user history', async () => {
      // Create withdrawal history with small amounts
      await supabase.from('withdrawals').insert([
        {
          user_id: TEST_USERS.VERIFIED,
          amount_cents: 10000,
          currency: 'USD',
          status: 'paid',
          idempotency_key: `test_security_${testId}_history_1`,
          created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          user_id: TEST_USERS.VERIFIED,
          amount_cents: 15000,
          currency: 'USD',
          status: 'paid',
          idempotency_key: `test_security_${testId}_history_2`,
          created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 200000, // $2,000 - much larger than history
        currency: 'USD'
      };

      const assessment = await withdrawalSecurity.assessAmountRisk(context);

      expect(assessment.flags).toContain('unusual_amount');
      expect(assessment.details.amount_vs_average_ratio).toBeGreaterThan(10);
    });
  });

  describe('Behavioral Risk Assessment', () => {
    test('should assess normal behavioral patterns as low risk', async () => {
      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 50000,
        currency: 'USD',
        ipAddress: '203.0.113.1', // Standard IP
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        requestTime: new Date()
      };

      const assessment = await withdrawalSecurity.assessBehavioralRisk(context);

      expect(assessment.score).toBeLessThan(20);
      expect(assessment.flags.length).toBeLessThan(2);
    });

    test('should flag unusual timing patterns', async () => {
      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 50000,
        currency: 'USD',
        ipAddress: '203.0.113.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        requestTime: new Date('2024-01-01T03:00:00Z') // 3 AM
      };

      const assessment = await withdrawalSecurity.assessBehavioralRisk(context);

      expect(assessment.flags).toContain('unusual_time');
      expect(assessment.details.request_hour).toBe(3);
    });

    test('should detect velocity abuse patterns', async () => {
      // Create recent withdrawal attempts
      const recentAttempts = Array.from({ length: 4 }, (_, i) => ({
        user_id: TEST_USERS.VERIFIED,
        amount_cents: 25000,
        currency: 'USD',
        status: 'pending',
        idempotency_key: `test_security_${testId}_velocity_${i}`,
        created_at: new Date(Date.now() - i * 15 * 60 * 1000).toISOString() // 15 minutes apart
      }));

      await supabase.from('withdrawals').insert(recentAttempts);

      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 25000,
        currency: 'USD',
        ipAddress: '203.0.113.1',
        userAgent: 'Mozilla/5.0'
      };

      const assessment = await withdrawalSecurity.assessBehavioralRisk(context);

      expect(assessment.flags).toContain('high_velocity');
      expect(assessment.details.requests_last_hour).toBeGreaterThan(3);
    });

    test('should detect rapid successive requests', async () => {
      // Log recent security events
      await supabase.from('withdrawal_security_logs').insert([
        {
          user_id: TEST_USERS.VERIFIED,
          event_type: 'attempt',
          ip_address: '203.0.113.1',
          metadata: { action: 'withdrawal_request', test_id: testId.toString() },
          created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString() // 2 minutes ago
        },
        {
          user_id: TEST_USERS.VERIFIED,
          event_type: 'attempt',
          ip_address: '203.0.113.1',
          metadata: { action: 'withdrawal_request', test_id: testId.toString() },
          created_at: new Date(Date.now() - 1 * 60 * 1000).toISOString() // 1 minute ago
        }
      ]);

      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 50000,
        currency: 'USD',
        ipAddress: '203.0.113.1',
        userAgent: 'Mozilla/5.0'
      };

      const assessment = await withdrawalSecurity.assessBehavioralRisk(context);

      expect(assessment.flags).toContain('rapid_requests');
      expect(assessment.details.recent_attempts).toBeGreaterThan(1);
    });
  });

  describe('Network Security Assessment', () => {
    test('should assess standard residential IPs as low risk', async () => {
      const context = {
        userId: TEST_USERS.VERIFIED,
        ipAddress: '203.0.113.1', // Standard IP
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      const assessment = await withdrawalSecurity.assessNetworkSecurity(context);

      expect(assessment.score).toBeLessThan(15);
      expect(assessment.flags.length).toBeLessThan(2);
    });

    test('should flag private network IPs as suspicious', async () => {
      const privateIPs = ['10.0.0.1', '192.168.1.1', '172.16.0.1'];

      for (const ip of privateIPs) {
        const context = {
          userId: TEST_USERS.VERIFIED,
          ipAddress: ip,
          userAgent: 'Mozilla/5.0'
        };

        const assessment = await withdrawalSecurity.assessNetworkSecurity(context);

        expect(assessment.flags).toContain('suspicious_ip');
        expect(assessment.details.ip_type).toBe('private');
      }
    });

    test('should flag localhost IPs as high risk', async () => {
      const context = {
        userId: TEST_USERS.VERIFIED,
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0'
      };

      const assessment = await withdrawalSecurity.assessNetworkSecurity(context);

      expect(assessment.score).toBeGreaterThan(40);
      expect(assessment.flags).toContain('suspicious_ip');
      expect(assessment.details.ip_type).toBe('localhost');
    });

    test('should detect automated user agents', async () => {
      const botUserAgents = [
        'curl/7.68.0',
        'python-requests/2.25.1',
        'PostmanRuntime/7.26.8',
        'bot',
        ''
      ];

      for (const userAgent of botUserAgents) {
        const context = {
          userId: TEST_USERS.VERIFIED,
          ipAddress: '203.0.113.1',
          userAgent
        };

        const assessment = await withdrawalSecurity.assessNetworkSecurity(context);

        expect(assessment.flags).toContain('automated_user_agent');
        expect(assessment.score).toBeGreaterThan(20);
      }
    });

    test('should assess geolocation changes', async () => {
      // Create security log with different IP
      await supabase.from('withdrawal_security_logs').insert({
        user_id: TEST_USERS.VERIFIED,
        event_type: 'success',
        ip_address: '198.51.100.1', // Different IP from different location
        metadata: { action: 'withdrawal_request', test_id: testId.toString() },
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      });

      const context = {
        userId: TEST_USERS.VERIFIED,
        ipAddress: '203.0.113.1', // Different IP
        userAgent: 'Mozilla/5.0'
      };

      const assessment = await withdrawalSecurity.assessNetworkSecurity(context);

      expect(assessment.flags).toContain('ip_change');
      expect(assessment.details.recent_ip_addresses).toContain('198.51.100.1');
    });
  });

  describe('Payout Method Security Assessment', () => {
    test('should assess verified old payout methods as low risk', async () => {
      // Create old verified payout method
      await supabase.from('payout_methods').insert({
        id: `${testId}-old-method`,
        user_id: TEST_USERS.VERIFIED,
        stripe_external_account_id: `ba_security_${testId}_old`,
        stripe_account_id: 'acct_test_verified',
        method_type: 'bank_account',
        is_verified: true,
        verification_status: 'verified',
        added_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago
      });

      const context = {
        userId: TEST_USERS.VERIFIED,
        payoutMethodId: `${testId}-old-method`
      };

      const assessment = await withdrawalSecurity.assessPayoutMethodSecurity(context);

      expect(assessment.score).toBeLessThan(10);
      expect(assessment.flags.length).toBe(0);
    });

    test('should flag new payout methods as risky', async () => {
      // Create new payout method
      await supabase.from('payout_methods').insert({
        id: `${testId}-new-method`,
        user_id: TEST_USERS.VERIFIED,
        stripe_external_account_id: `ba_security_${testId}_new`,
        stripe_account_id: 'acct_test_verified',
        method_type: 'bank_account',
        is_verified: true,
        verification_status: 'verified',
        added_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() // 12 hours ago (within 72 hours)
      });

      const context = {
        userId: TEST_USERS.VERIFIED,
        payoutMethodId: `${testId}-new-method`
      };

      const assessment = await withdrawalSecurity.assessPayoutMethodSecurity(context);

      expect(assessment.score).toBeGreaterThan(20);
      expect(assessment.flags).toContain('new_payout_method');
      expect(assessment.details.hours_since_added).toBeLessThan(72);
    });

    test('should flag unverified payout methods', async () => {
      // Create unverified payout method
      await supabase.from('payout_methods').insert({
        id: `${testId}-unverified-method`,
        user_id: TEST_USERS.VERIFIED,
        stripe_external_account_id: `ba_security_${testId}_unverified`,
        stripe_account_id: 'acct_test_verified',
        method_type: 'bank_account',
        is_verified: false,
        verification_status: 'pending',
        added_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      });

      const context = {
        userId: TEST_USERS.VERIFIED,
        payoutMethodId: `${testId}-unverified-method`
      };

      const assessment = await withdrawalSecurity.assessPayoutMethodSecurity(context);

      expect(assessment.score).toBeGreaterThan(30);
      expect(assessment.flags).toContain('unverified_method');
    });

    test('should handle missing payout method', async () => {
      const context = {
        userId: TEST_USERS.VERIFIED,
        payoutMethodId: 'non-existent-method'
      };

      const assessment = await withdrawalSecurity.assessPayoutMethodSecurity(context);

      expect(assessment.score).toBe(100);
      expect(assessment.flags).toContain('invalid_method');
    });
  });

  describe('Comprehensive Security Assessment', () => {
    test('should combine multiple risk factors correctly', async () => {
      // Setup high-risk scenario
      await Promise.all([
        // New account
        supabase.from('profiles').upsert({
          id: TEST_USERS.NEW,
          created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days old
          identity_status: 'pending'
        }, { onConflict: 'id' }),

        // New payout method
        supabase.from('payout_methods').insert({
          id: `${testId}-risky-method`,
          user_id: TEST_USERS.NEW,
          stripe_external_account_id: `ba_security_${testId}_risky`,
          stripe_account_id: 'acct_test_new',
          method_type: 'debit_card',
          is_verified: false,
          verification_status: 'pending',
          added_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() // 6 hours ago
        }),

        // Recent failed attempts
        supabase.from('withdrawal_security_logs').insert({
          user_id: TEST_USERS.NEW,
          event_type: 'failure',
          ip_address: '10.0.0.1',
          metadata: { action: 'withdrawal_request', test_id: testId.toString() },
          created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString()
        })
      ]);

      const context = {
        userId: TEST_USERS.NEW,
        amountCents: 500000, // $5,000 - high amount
        currency: 'USD',
        payoutMethodId: `${testId}-risky-method`,
        ipAddress: '10.0.0.1', // Private IP
        userAgent: 'curl/7.68.0' // Bot user agent
      };

      const assessment = await withdrawalSecurity.assessWithdrawalSecurity(context);

      expect(assessment.score).toBeGreaterThan(70);
      expect(assessment.requires_review).toBe(true);
      expect(assessment.flags.length).toBeGreaterThan(5);
      expect(assessment.flags).toContain('new_account');
      expect(assessment.flags).toContain('high_amount');
      expect(assessment.flags).toContain('new_payout_method');
      expect(assessment.flags).toContain('suspicious_ip');
      expect(assessment.flags).toContain('automated_user_agent');
    });

    test('should pass low-risk legitimate withdrawals', async () => {
      // Setup low-risk scenario
      await Promise.all([
        // Established verified account
        supabase.from('profiles').upsert({
          id: TEST_USERS.VERIFIED,
          created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days old
          identity_status: 'verified'
        }, { onConflict: 'id' }),

        // Old verified payout method
        supabase.from('payout_methods').insert({
          id: `${testId}-safe-method`,
          user_id: TEST_USERS.VERIFIED,
          stripe_external_account_id: `ba_security_${testId}_safe`,
          stripe_account_id: 'acct_test_verified',
          method_type: 'bank_account',
          is_verified: true,
          verification_status: 'verified',
          added_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days old
        }),

        // Successful withdrawal history
        supabase.from('withdrawals').insert({
          user_id: TEST_USERS.VERIFIED,
          amount_cents: 75000,
          currency: 'USD',
          status: 'paid',
          idempotency_key: `test_security_${testId}_history`,
          created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        })
      ]);

      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 80000, // $800 - reasonable amount
        currency: 'USD',
        payoutMethodId: `${testId}-safe-method`,
        ipAddress: '203.0.113.1', // Standard IP
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      const assessment = await withdrawalSecurity.assessWithdrawalSecurity(context);

      expect(assessment.score).toBeLessThan(30);
      expect(assessment.requires_review).toBe(false);
      expect(assessment.flags.length).toBeLessThan(3);
    });

    test('should handle edge cases and missing data gracefully', async () => {
      const context = {
        userId: 'non-existent-user',
        amountCents: 50000,
        currency: 'USD',
        payoutMethodId: 'non-existent-method'
      };

      const assessment = await withdrawalSecurity.assessWithdrawalSecurity(context);

      expect(assessment.score).toBeGreaterThan(80);
      expect(assessment.requires_review).toBe(true);
      expect(assessment.flags).toContain('invalid_method');
    });
  });

  describe('Security Logging', () => {
    test('should log security assessments', async () => {
      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 50000,
        currency: 'USD',
        ipAddress: '203.0.113.1',
        userAgent: 'Mozilla/5.0'
      };

      await withdrawalSecurity.logSecurityEvent(
        TEST_USERS.VERIFIED,
        'security_assessment',
        '203.0.113.1',
        'Mozilla/5.0',
        25,
        ['test_flag'],
        { test_id: testId.toString(), action: 'assessment' }
      );

      // Verify log was created
      const { data: logs } = await supabase
        .from('withdrawal_security_logs')
        .select('*')
        .eq('user_id', TEST_USERS.VERIFIED)
        .eq('event_type', 'security_assessment')
        .like('metadata->test_id', testId.toString())
        .order('created_at', { ascending: false })
        .limit(1);

      expect(logs).toHaveLength(1);
      expect(logs[0].risk_score).toBe(25);
      expect(logs[0].flags).toEqual(['test_flag']);
      expect(logs[0].metadata.action).toBe('assessment');
    });

    test('should track security trends over time', async () => {
      const baseTime = Date.now();

      // Create series of security events
      const events = [
        { score: 10, flags: ['low_risk'], offset: -60 },
        { score: 25, flags: ['medium_risk'], offset: -30 },
        { score: 45, flags: ['high_risk', 'suspicious_ip'], offset: -15 },
        { score: 60, flags: ['high_risk', 'rapid_requests'], offset: 0 }
      ];

      for (const [index, event] of events.entries()) {
        await supabase.from('withdrawal_security_logs').insert({
          user_id: TEST_USERS.VERIFIED,
          event_type: 'security_assessment',
          ip_address: '203.0.113.1',
          risk_score: event.score,
          flags: event.flags,
          metadata: { test_id: testId.toString(), sequence: index },
          created_at: new Date(baseTime + event.offset * 60 * 1000).toISOString()
        });
      }

      // Query trend
      const { data: trend } = await supabase
        .from('withdrawal_security_logs')
        .select('risk_score, flags, created_at')
        .eq('user_id', TEST_USERS.VERIFIED)
        .like('metadata->test_id', testId.toString())
        .order('created_at', { ascending: true });

      expect(trend).toHaveLength(4);
      expect(trend[0].risk_score).toBe(10);
      expect(trend[3].risk_score).toBe(60);
      expect(trend[3].flags).toContain('rapid_requests');
    });
  });

  describe('Performance and Optimization', () => {
    test('should complete security assessment within reasonable time', async () => {
      const context = {
        userId: TEST_USERS.VERIFIED,
        amountCents: 100000,
        currency: 'USD',
        payoutMethodId: 'some-method-id',
        ipAddress: '203.0.113.1',
        userAgent: 'Mozilla/5.0'
      };

      const startTime = Date.now();
      await withdrawalSecurity.assessWithdrawalSecurity(context);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    test('should handle concurrent assessments', async () => {
      const contexts = Array.from({ length: 5 }, (_, i) => ({
        userId: TEST_USERS.VERIFIED,
        amountCents: 50000 + i * 10000,
        currency: 'USD',
        ipAddress: '203.0.113.1',
        userAgent: 'Mozilla/5.0'
      }));

      const startTime = Date.now();
      const assessments = await Promise.all(
        contexts.map(context => withdrawalSecurity.assessWithdrawalSecurity(context))
      );
      const duration = Date.now() - startTime;

      expect(assessments).toHaveLength(5);
      expect(duration).toBeLessThan(5000); // All 5 should complete within 5 seconds
      assessments.forEach(assessment => {
        expect(assessment).toHaveProperty('score');
        expect(assessment).toHaveProperty('requires_review');
        expect(assessment).toHaveProperty('flags');
      });
    });
  });
});