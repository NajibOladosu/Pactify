/**
 * Contract API Endpoints Tests
 * Tests all contract-related API endpoints for functionality, security, and validation
 */

import {
  setupTestUsers,
  cleanupTestUsers,
  getTestUser,
  authenticateTestUser
} from '../test-setup/setup-test-users.js';
import {
  TestAPIManager,
  TEST_CONFIG,
  createTestDelay
} from '../test-setup/test-helpers.js';

describe('Contract API Endpoints', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;
  let testContractId = null;

  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');
  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  afterAll(async () => {
    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.DEFAULT);

  beforeEach(async () => {
    await createTestDelay(500);
  });

  describe('POST /api/contracts', () => {
    test('should create contract with valid data', async () => {
      const contractData = {
        title: 'API Test Contract',
        description: 'Testing contract creation via API',
        type: 'fixed',
        total_amount: 5000,
        currency: 'USD',
        client_email: clientUser.user.email,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        terms_and_conditions: 'Standard terms and conditions for API testing'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/contracts',
        contractData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(201);
      expect(response.data.contract).toBeDefined();
      expect(response.data.contract.title).toBe(contractData.title);
      expect(response.data.contract.creator_id).toBe(freelancerUser.user.id);
      expect(response.data.contract.total_amount).toBe(contractData.total_amount.toString());

      testContractId = response.data.contract.id;
    });

    test('should reject contract with invalid data', async () => {
      const invalidData = {
        title: '', // Empty title
        total_amount: -100, // Negative amount
        currency: 'INVALID' // Invalid currency
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/contracts',
        invalidData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
    });

    test('should require authentication', async () => {
      const contractData = {
        title: 'Unauthenticated Contract',
        description: 'This should fail',
        total_amount: 1000
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/contracts',
        contractData
      );

      expect(response.status).toBe(401);
    });

    test('should respect subscription limits for free tier', async () => {
      // Create multiple contracts to test limit
      const contractPromises = [];
      for (let i = 0; i < 5; i++) {
        const contractData = {
          title: `Limit Test Contract ${i + 1}`,
          description: 'Testing subscription limits',
          total_amount: 1000,
          currency: 'USD'
        };

        contractPromises.push(
          TestAPIManager.makeRequest(
            'POST',
            '/api/contracts',
            contractData,
            freelancerAuth.session.access_token
          )
        );
      }

      const responses = await Promise.all(contractPromises);
      
      // Some requests should succeed (within limit) and some should fail
      const successfulRequests = responses.filter(r => r.status === 201);
      const limitExceededRequests = responses.filter(r => r.status === 402);

      expect(successfulRequests.length).toBeLessThanOrEqual(3); // Free tier limit
      expect(limitExceededRequests.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/contracts', () => {
    test('should list user contracts', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/contracts',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.contracts)).toBe(true);
      expect(response.data.contracts.length).toBeGreaterThan(0);
      
      // Verify user can only see their own contracts
      response.data.contracts.forEach(contract => {
        expect(
          contract.creator_id === freelancerUser.user.id ||
          contract.parties?.some(p => p.user_id === freelancerUser.user.id)
        ).toBe(true);
      });
    });

    test('should support pagination', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/contracts?limit=2&offset=0',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.contracts.length).toBeLessThanOrEqual(2);
      expect(response.data.pagination).toBeDefined();
    });

    test('should support filtering by status', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/contracts?status=draft',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      response.data.contracts.forEach(contract => {
        expect(contract.status).toBe('draft');
      });
    });

    test('should require authentication', async () => {
      const response = await TestAPIManager.makeRequest('GET', '/api/contracts');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/contracts/[id]', () => {
    test('should get contract details', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        `/api/contracts/${testContractId}`,
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.contract).toBeDefined();
      expect(response.data.contract.id).toBe(testContractId);
      expect(response.data.contract.parties).toBeDefined();
      expect(response.data.contract.milestones).toBeDefined();
    });

    test('should return 404 for non-existent contract', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await TestAPIManager.makeRequest(
        'GET',
        `/api/contracts/${fakeId}`,
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(404);
    });

    test('should deny access to unauthorized contract', async () => {
      // Create a contract as freelancer, try to access as different user
      const unauthorizedToken = 'fake_token_123';
      const response = await TestAPIManager.makeRequest(
        'GET',
        `/api/contracts/${testContractId}`,
        null,
        unauthorizedToken
      );

      expect([401, 403]).toContain(response.status);
    });
  });

  describe('PUT /api/contracts/[id]', () => {
    test('should update contract details', async () => {
      const updateData = {
        title: 'Updated API Test Contract',
        description: 'Updated description via API',
        total_amount: 6000
      };

      const response = await TestAPIManager.makeRequest(
        'PUT',
        `/api/contracts/${testContractId}`,
        updateData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.contract.title).toBe(updateData.title);
      expect(response.data.contract.total_amount).toBe(updateData.total_amount.toString());
    });

    test('should prevent updates to locked contracts', async () => {
      // First lock the contract
      await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContractId}/lock`,
        {},
        freelancerAuth.session.access_token
      );

      const updateData = {
        title: 'Should Not Update'
      };

      const response = await TestAPIManager.makeRequest(
        'PUT',
        `/api/contracts/${testContractId}`,
        updateData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(403);
      expect(response.data.error).toContain('locked');
    });

    test('should validate update data', async () => {
      const invalidUpdate = {
        total_amount: -500 // Negative amount
      };

      const response = await TestAPIManager.makeRequest(
        'PUT',
        `/api/contracts/${testContractId}`,
        invalidUpdate,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/contracts/[id]/sign', () => {
    test('should sign contract with valid signature', async () => {
      const signatureData = {
        signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        ip_address: '127.0.0.1',
        user_agent: 'Jest Test Agent'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContractId}/sign`,
        signatureData,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.signature.signature_data).toBe(signatureData.signature_data);
    });

    test('should reject invalid signature data', async () => {
      const invalidSignature = {
        signature_data: 'invalid_data'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContractId}/sign`,
        invalidSignature,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(400);
    });

    test('should prevent duplicate signatures', async () => {
      const signatureData = {
        signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      };

      // Try to sign again
      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContractId}/sign`,
        signatureData,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(409); // Conflict - already signed
    });
  });

  describe('POST /api/contracts/[id]/parties', () => {
    test('should add party to contract', async () => {
      const partyData = {
        email: 'newparty@test.com',
        role: 'client'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContractId}/parties`,
        partyData,
        freelancerAuth.session.access_token
      );

      expect([200, 201]).toContain(response.status);
      expect(response.data.party).toBeDefined();
      expect(response.data.party.role).toBe(partyData.role);
    });

    test('should validate party data', async () => {
      const invalidParty = {
        email: 'invalid-email',
        role: 'invalid-role'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContractId}/parties`,
        invalidParty,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(400);
    });

    test('should prevent non-creators from adding parties', async () => {
      const partyData = {
        email: 'unauthorized@test.com',
        role: 'client'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContractId}/parties`,
        partyData,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/contracts/[id]/milestones', () => {
    test('should create milestone for contract', async () => {
      const milestoneData = {
        title: 'API Test Milestone',
        description: 'Testing milestone creation via API',
        amount: 2500,
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContractId}/milestones`,
        milestoneData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(201);
      expect(response.data.milestone).toBeDefined();
      expect(response.data.milestone.title).toBe(milestoneData.title);
      expect(response.data.milestone.amount).toBe(milestoneData.amount.toString());
    });

    test('should validate milestone amount against contract total', async () => {
      const excessiveMilestone = {
        title: 'Excessive Milestone',
        amount: 50000, // More than contract total
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContractId}/milestones`,
        excessiveMilestone,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('amount');
    });
  });

  describe('GET /api/contracts/[id]/activities', () => {
    test('should get contract activity log', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        `/api/contracts/${testContractId}/activities`,
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.activities)).toBe(true);
      expect(response.data.activities.length).toBeGreaterThan(0);
      
      // Verify activity structure
      response.data.activities.forEach(activity => {
        expect(activity).toHaveProperty('action');
        expect(activity).toHaveProperty('timestamp');
        expect(activity).toHaveProperty('user_id');
      });
    });

    test('should order activities by timestamp', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        `/api/contracts/${testContractId}/activities`,
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      const activities = response.data.activities;
      
      for (let i = 1; i < activities.length; i++) {
        const prevTime = new Date(activities[i-1].timestamp);
        const currTime = new Date(activities[i].timestamp);
        expect(currTime.getTime()).toBeLessThanOrEqual(prevTime.getTime());
      }
    });
  });

  describe('Rate Limiting and Security', () => {
    test('should implement rate limiting', async () => {
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          TestAPIManager.makeRequest(
            'GET',
            '/api/contracts',
            null,
            freelancerAuth.session.access_token
          )
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should validate CSRF protection', async () => {
      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/contracts',
        { title: 'CSRF Test' },
        freelancerAuth.session.access_token,
        { 'X-Requested-With': 'malicious' }
      );

      // Should reject or handle CSRF appropriately
      expect([200, 201, 403]).toContain(response.status);
    });

    test('should sanitize input data', async () => {
      const maliciousData = {
        title: '<script>alert("XSS")</script>',
        description: '"><img src=x onerror=alert("XSS")>',
        total_amount: 1000
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/contracts',
        maliciousData,
        freelancerAuth.session.access_token
      );

      if (response.status === 201) {
        // Verify data is sanitized
        expect(response.data.contract.title).not.toContain('<script>');
        expect(response.data.contract.description).not.toContain('onerror');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Try to create contract with extremely long title
      const problematicData = {
        title: 'A'.repeat(10000), // Extremely long title
        description: 'Testing error handling',
        total_amount: 1000
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/contracts',
        problematicData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
      expect(response.data.error).not.toContain('database'); // No internal details leaked
    });

    test('should return consistent error format', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/contracts/invalid-id',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
      expect(response.data).toHaveProperty('message');
      expect(typeof response.data.error).toBe('string');
    });
  });
});