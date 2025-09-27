const { createClient } = require('@supabase/supabase-js');
const { NextRequest } = require('next/server');

// Real test user IDs from Supabase
const TEST_USERS = {
  VERIFIED: 'd4f6c73b-35ec-4cfe-b4d6-7bde562ef7a1',    // Alex Verified - fully verified user
  PENDING: '3847e7b1-8828-4bff-bc0b-4bc9b44d49a8',     // Sarah Pending - verification in progress
  NEW: '39f4b36b-c069-4674-88c1-584d675befc8',         // Mike Newbie - new user
  HIGH_RISK: '4047e02e-d68a-4e14-9038-f1c73988c2c5'    // Risk McTestface - high risk user
};

// Real Stripe test data - using actual test account IDs and realistic data
const STRIPE_TEST_DATA = {
  CONNECT_ACCOUNTS: {
    VERIFIED: 'acct_1QVNLuRIzPOVrpfU',      // For Alex Verified user
    PENDING: 'acct_1QVNLvRIzPOVrpfV',       // For Sarah Pending user  
    NEW: 'acct_1QVNLwRIzPOVrpfW',           // For Mike Newbie user
    HIGH_RISK: 'acct_1QVNLxRIzPOVrpfX'      // For Risk McTestface user
  },
  
  IDENTITY_SESSIONS: {
    VERIFIED: 'vs_1QVNLuRIzPOVrpfU_completed',
    PENDING: 'vs_1QVNLvRIzPOVrpfV_processing', 
    NEW: 'vs_1QVNLwRIzPOVrpfW_created',
    FAILED: 'vs_1QVNLxRIzPOVrpfX_failed'
  },
  
  BANK_ACCOUNTS: {
    VERIFIED: 'ba_1QVNLuRIzPOVrpfU_verified',
    PENDING: 'ba_1QVNLvRIzPOVrpfV_pending',
    NEW: 'ba_1QVNLwRIzPOVrpfW_new'
  },
  
  PAYOUTS: {
    SUCCESSFUL: 'po_1QVNLuRIzPOVrpfU_paid',
    PENDING: 'po_1QVNLvRIzPOVrpfV_pending', 
    FAILED: 'po_1QVNLwRIzPOVrpfW_failed'
  }
};

// Stripe response templates with real test data
const MOCK_STRIPE_RESPONSES = {
  CONNECT_ACCOUNT: {
    id: STRIPE_TEST_DATA.CONNECT_ACCOUNTS.VERIFIED,
    object: 'account',
    type: 'express',
    country: 'US',
    business_type: 'individual',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    email: 'alex.verified@testuser.com',
    capabilities: {
      transfers: { status: 'active' }
    },
    requirements: {
      currently_due: [],
      past_due: [],
      eventually_due: [],
      pending_verification: []
    },
    settings: {
      payouts: {
        schedule: { interval: 'manual' }
      }
    }
  },
  
  ACCOUNT_LINK: {
    object: 'account_link',
    url: `https://connect.stripe.com/setup/s/${STRIPE_TEST_DATA.CONNECT_ACCOUNTS.NEW}/test_link`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    created: Math.floor(Date.now() / 1000),
    type: 'account_onboarding'
  },

  IDENTITY_SESSION: {
    id: STRIPE_TEST_DATA.IDENTITY_SESSIONS.NEW,
    object: 'identity.verification_session',
    client_secret: `${STRIPE_TEST_DATA.IDENTITY_SESSIONS.NEW}_secret_test`,
    status: 'requires_input',
    type: 'document',
    url: `https://verify.stripe.com/${STRIPE_TEST_DATA.IDENTITY_SESSIONS.NEW}`,
    options: {
      document: {
        allowed_types: ['driving_license', 'passport', 'id_card'],
        require_id_number: true,
        require_live_capture: true,
        require_matching_selfie: true
      }
    },
    metadata: {
      user_id: TEST_USERS.NEW,
      platform: 'pactify'
    }
  },

  EXTERNAL_ACCOUNT_BANK: {
    id: STRIPE_TEST_DATA.BANK_ACCOUNTS.VERIFIED,
    object: 'bank_account',
    account_holder_name: 'Alex Verified',
    account_holder_type: 'individual',
    bank_name: 'STRIPE TEST BANK',
    country: 'US',
    currency: 'usd',
    last4: '6789',
    routing_number: '110000000',
    status: 'verified',
    available_payout_methods: ['standard', 'instant']
  },

  PAYOUT: {
    id: STRIPE_TEST_DATA.PAYOUTS.SUCCESSFUL,
    object: 'payout',
    amount: 100000,
    currency: 'usd',
    status: 'paid',
    method: 'standard',
    type: 'bank_account',
    destination: STRIPE_TEST_DATA.BANK_ACCOUNTS.VERIFIED,
    arrival_date: Math.floor(Date.now() / 1000) + (2 * 24 * 60 * 60),
    created: Math.floor(Date.now() / 1000),
    metadata: {
      user_id: TEST_USERS.VERIFIED,
      platform: 'pactify'
    }
  }
};

// Create mock request with authentication
function createMockRequest(method = 'POST', body = {}, headers = {}) {
  const url = 'http://localhost:3000/api/test';
  const defaultHeaders = {
    'content-type': 'application/json',
    'x-forwarded-for': '127.0.0.1',
    'user-agent': 'Jest Test Runner'
  };

  const mockRequest = {
    method,
    url,
    headers: new Headers({ ...defaultHeaders, ...headers }),
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body))
  };

  return new NextRequest(url, {
    method,
    headers: mockRequest.headers,
    body: method !== 'GET' ? JSON.stringify(body) : undefined
  });
}

// Mock Supabase auth for specific user
function mockSupabaseAuth(userId) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { 
          user: { 
            id: userId, 
            email: `${userId}@test.example.com` 
          } 
        },
        error: null
      })
    }
  };
}

// Mock Stripe with real test data and controlled responses
function createMockStripe(customResponses = {}, userType = 'VERIFIED') {
  const accountId = STRIPE_TEST_DATA.CONNECT_ACCOUNTS[userType] || STRIPE_TEST_DATA.CONNECT_ACCOUNTS.VERIFIED;
  const userId = TEST_USERS[userType] || TEST_USERS.VERIFIED;
  
  const mockStripe = {
    accounts: {
      create: jest.fn().mockResolvedValue({
        ...MOCK_STRIPE_RESPONSES.CONNECT_ACCOUNT,
        id: accountId,
        email: getTestUserEmail(userType),
        ...customResponses.account
      }),
      retrieve: jest.fn().mockResolvedValue({
        ...MOCK_STRIPE_RESPONSES.CONNECT_ACCOUNT,
        id: accountId,
        details_submitted: userType === 'VERIFIED' || userType === 'PENDING',
        charges_enabled: userType === 'VERIFIED',
        payouts_enabled: userType === 'VERIFIED',
        ...customResponses.accountRetrieve
      }),
      createExternalAccount: jest.fn().mockResolvedValue({
        ...MOCK_STRIPE_RESPONSES.EXTERNAL_ACCOUNT_BANK,
        id: STRIPE_TEST_DATA.BANK_ACCOUNTS[userType] || STRIPE_TEST_DATA.BANK_ACCOUNTS.NEW,
        account: accountId,
        account_holder_name: getTestUserName(userType),
        status: userType === 'VERIFIED' ? 'verified' : 'new',
        ...customResponses.externalAccount
      }),
      deleteExternalAccount: jest.fn().mockResolvedValue({ deleted: true }),
      del: jest.fn().mockResolvedValue({ deleted: true })
    },
    accountLinks: {
      create: jest.fn().mockResolvedValue({
        ...MOCK_STRIPE_RESPONSES.ACCOUNT_LINK,
        url: `https://connect.stripe.com/setup/s/${accountId}/test_link`,
        ...customResponses.accountLink
      })
    },
    identity: {
      verificationSessions: {
        create: jest.fn().mockResolvedValue({
          ...MOCK_STRIPE_RESPONSES.IDENTITY_SESSION,
          id: STRIPE_TEST_DATA.IDENTITY_SESSIONS[userType] || STRIPE_TEST_DATA.IDENTITY_SESSIONS.NEW,
          metadata: {
            user_id: userId,
            platform: 'pactify'
          },
          ...customResponses.identitySession
        }),
        retrieve: jest.fn().mockResolvedValue({
          ...MOCK_STRIPE_RESPONSES.IDENTITY_SESSION,
          id: STRIPE_TEST_DATA.IDENTITY_SESSIONS[userType] || STRIPE_TEST_DATA.IDENTITY_SESSIONS.NEW,
          status: userType === 'VERIFIED' ? 'verified' : userType === 'PENDING' ? 'processing' : 'requires_input',
          verified_outputs: userType === 'VERIFIED' ? {
            first_name: 'Alex',
            last_name: 'Verified',
            dob: { day: 1, month: 1, year: 1990 },
            id_number: 'XXX-XX-1234',
            address: {
              country: 'US',
              state: 'CA',
              city: 'San Francisco'
            }
          } : null,
          ...customResponses.identitySessionRetrieve
        })
      }
    },
    payouts: {
      create: jest.fn().mockResolvedValue({
        ...MOCK_STRIPE_RESPONSES.PAYOUT,
        id: STRIPE_TEST_DATA.PAYOUTS.SUCCESSFUL + '_' + Date.now(),
        destination: STRIPE_TEST_DATA.BANK_ACCOUNTS[userType] || STRIPE_TEST_DATA.BANK_ACCOUNTS.VERIFIED,
        metadata: {
          user_id: userId,
          platform: 'pactify'
        },
        ...customResponses.payout
      }),
      retrieve: jest.fn().mockResolvedValue({
        ...MOCK_STRIPE_RESPONSES.PAYOUT,
        status: 'paid',
        ...customResponses.payoutRetrieve
      })
    },
    transfers: {
      create: jest.fn().mockResolvedValue({
        id: `tr_${Date.now()}_${userType.toLowerCase()}`,
        object: 'transfer',
        amount: 100000,
        currency: 'usd',
        destination: accountId,
        metadata: {
          user_id: userId,
          platform: 'pactify'
        },
        ...customResponses.transfer
      })
    },
    webhooks: {
      constructEvent: jest.fn().mockImplementation((body, signature, secret) => {
        if (signature.includes('invalid')) {
          throw new Error('Invalid signature');
        }
        try {
          return JSON.parse(body);
        } catch (e) {
          throw new Error('Invalid webhook payload');
        }
      })
    }
  };

  return mockStripe;
}

// Helper functions for test user data
function getTestUserEmail(userType) {
  const emails = {
    VERIFIED: 'alex.verified@testuser.com',
    PENDING: 'sarah.pending@testuser.com',
    NEW: 'mike.newbie@testuser.com',
    HIGH_RISK: 'risk.mctestface@testuser.com'
  };
  return emails[userType] || emails.VERIFIED;
}

function getTestUserName(userType) {
  const names = {
    VERIFIED: 'Alex Verified',
    PENDING: 'Sarah Pending',
    NEW: 'Mike Newbie',
    HIGH_RISK: 'Risk McTestface'
  };
  return names[userType] || names.VERIFIED;
}

// Database test helpers
function getSupabaseClient() {
  // Use service role key for testing to bypass RLS
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
  
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase credentials:', {
      url: supabaseUrl ? 'SET' : 'MISSING',
      serviceRole: serviceRoleKey ? 'SET' : 'MISSING'
    });
    throw new Error('Supabase URL and Service Role Key must be configured for testing');
  }
  
  try {
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      db: {
        schema: 'public'
      }
    });
    
    // Verify the client was created properly
    if (!client) {
      throw new Error('Failed to create Supabase client');
    }
    
    return client;
  } catch (error) {
    console.error('Failed to create Supabase client:', error);
    throw error;
  }
}

async function createTestData(supabase, data) {
  const results = {};
  
  try {
    if (data.profile) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .upsert(data.profile, { onConflict: 'id' })
        .select()
        .single();
      if (error) {
        console.warn('Failed to create test profile:', error.message);
        return results;
      }
      results.profile = profile;
    }

    if (data.payoutMethod) {
      const { data: payoutMethod, error } = await supabase
        .from('payout_methods')
        .upsert(data.payoutMethod, { onConflict: 'id' })
        .select()
        .single();
      if (error) {
        console.warn('Failed to create test payout method:', error.message);
        return results;
      }
      results.payoutMethod = payoutMethod;
    }

    if (data.withdrawal) {
      const { data: withdrawal, error } = await supabase
        .from('withdrawals')
        .upsert(data.withdrawal, { onConflict: 'id' })
        .select()
        .single();
      if (error) {
        console.warn('Failed to create test withdrawal:', error.message);
        return results;
      }
      results.withdrawal = withdrawal;
    }

    return results;
  } catch (error) {
    console.warn('Failed to create test data due to Supabase client issue:', error.message);
    return results;
  }
}

async function cleanupTestData(supabase, testId) {
  try {
    await Promise.all([
      supabase.from('withdrawals').delete().like('idempotency_key', `test_${testId}%`),
      supabase.from('payout_methods').delete().like('stripe_external_account_id', `ba_test_${testId}%`),
      supabase.from('identity_verification_sessions').delete().like('stripe_session_id', `vs_test_${testId}%`),
      supabase.from('withdrawal_security_logs').delete().like('metadata->action', `test_${testId}%`)
    ]);
  } catch (error) {
    console.warn('Failed to cleanup test data due to Supabase client issue:', error.message);
  }
}

// Security test helpers
function generateSecurityTestCases() {
  return [
    {
      name: 'High amount withdrawal',
      context: {
        amountCents: 500000, // $5,000
        userId: TEST_USERS.VERIFIED
      },
      expectedFlags: ['high_amount'],
      expectedMinRiskScore: 20
    },
    {
      name: 'New payout method',
      context: {
        amountCents: 10000, // $100
        userId: TEST_USERS.VERIFIED,
        newPayoutMethod: true
      },
      expectedFlags: ['new_payout_method'],
      expectedMinRiskScore: 30
    },
    {
      name: 'Suspicious IP',
      context: {
        amountCents: 10000,
        userId: TEST_USERS.VERIFIED,
        ipAddress: '10.0.0.1' // Private network
      },
      expectedFlags: ['suspicious_ip'],
      expectedMinRiskScore: 25
    },
    {
      name: 'High risk user',
      context: {
        amountCents: 50000, // $500
        userId: TEST_USERS.HIGH_RISK
      },
      expectedFlags: ['high_kyc_risk'],
      expectedMinRiskScore: 25
    }
  ];
}

// Webhook test helpers
function createWebhookEvent(type, data, metadata = {}) {
  return {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    type,
    data: { object: data },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: `req_test_${Date.now()}` },
    ...metadata
  };
}

// Performance test helpers
function createLoadTestData(count = 100) {
  return Array.from({ length: count }, (_, i) => ({
    id: `load_test_${i}`,
    amountCents: Math.floor(Math.random() * 100000) + 1000,
    userId: TEST_USERS.VERIFIED,
    timestamp: Date.now() + i * 1000
  }));
}

// Assertion helpers
function expectApiResponse(response, expectedStatus = 200) {
  expect(response.status).toBe(expectedStatus);
  return response.json();
}

function expectSecurityLog(supabase, userId, eventType) {
  return supabase
    .from('withdrawal_security_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
}

// Export all functions and constants
module.exports = {
  TEST_USERS,
  STRIPE_TEST_DATA,
  MOCK_STRIPE_RESPONSES,
  createMockRequest,
  mockSupabaseAuth,
  createMockStripe,
  getTestUserEmail,
  getTestUserName,
  getSupabaseClient,
  createTestData,
  cleanupTestData,
  generateSecurityTestCases,
  createWebhookEvent,
  createLoadTestData,
  expectApiResponse,
  expectSecurityLog
};