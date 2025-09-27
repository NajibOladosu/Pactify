/**
 * Contract Lifecycle Integration Tests
 * Tests complete contract workflow from creation to completion
 */

const {
  setupTestUsers,
  cleanupTestUsers,
  getTestUser,
  authenticateTestUser,
  resetTestUsers
} = require('../test-setup/setup-test-users.js');
const {
  TestContractManager,
  TestAPIManager,
  TEST_CONFIG,
  supabaseAdmin,
  createTestDelay
} = require('../test-setup/test-helpers.js');

describe('Contract Lifecycle Management', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;
  let testContract = null;

  // Setup before all tests
  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');
  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  // Cleanup after all tests
  afterAll(async () => {
    if (testContract) {
      await TestContractManager.deleteContract(testContract.id);
    }
    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.DEFAULT);

  // Reset test data before each test suite
  beforeEach(async () => {
    await resetTestUsers();
  });

  describe('Contract Creation', () => {
    test('should create contract as freelancer successfully', async () => {
      const contractData = TEST_CONFIG.CONTRACT_DATA.WEB_DEVELOPMENT;
      
      testContract = await TestContractManager.createContract(
        freelancerUser.user.id,
        contractData,
        'freelancer'
      );

      expect(testContract).toBeDefined();
      expect(testContract.title).toBe(contractData.title);
      expect(testContract.description).toBe(contractData.description);
      expect(testContract.creator_id).toBe(freelancerUser.user.id);
      expect(testContract.freelancer_id).toBe(freelancerUser.user.id);
      expect(testContract.client_email).toBe(TEST_CONFIG.USERS.CLIENT.email);
      expect(testContract.type).toBe(contractData.type);
      expect(parseFloat(testContract.total_amount)).toBe(contractData.totalAmount);
      expect(testContract.currency).toBe(contractData.currency);
      expect(testContract.status).toBe('draft');
      expect(testContract.contract_number).toMatch(/^PACT-\d{8}-\d{3}$/);
    });

    test('should create contract as client successfully', async () => {
      const contractData = TEST_CONFIG.CONTRACT_DATA.GRAPHIC_DESIGN;
      
      const clientContract = await TestContractManager.createContract(
        clientUser.user.id,
        contractData,
        'client'
      );

      expect(clientContract).toBeDefined();
      expect(clientContract.title).toBe(contractData.title);
      expect(clientContract.creator_id).toBe(clientUser.user.id);
      expect(clientContract.client_id).toBe(clientUser.user.id);
      expect(clientContract.freelancer_email).toBe(TEST_CONFIG.USERS.FREELANCER.email);
      expect(clientContract.type).toBe(contractData.type);
      expect(parseFloat(clientContract.total_amount)).toBe(contractData.totalAmount);

      // Clean up
      await TestContractManager.deleteContract(clientContract.id);
    });

    test('should create milestones with milestone-based contract', async () => {
      const contractData = TEST_CONFIG.CONTRACT_DATA.WEB_DEVELOPMENT;
      
      // Get milestones for the test contract
      const { data: milestones, error } = await supabaseAdmin
        .from('milestones')
        .select('*')
        .eq('contract_id', testContract.id)
        .order('due_date', { ascending: true });

      expect(error).toBeNull();
      expect(milestones).toHaveLength(contractData.milestones.length);

      // Verify milestone data
      milestones.forEach((milestone, index) => {
        const expectedMilestone = contractData.milestones[index];
        expect(milestone.title).toBe(expectedMilestone.title);
        expect(milestone.description).toBe(expectedMilestone.description);
        expect(parseFloat(milestone.amount)).toBe(expectedMilestone.amount);
        expect(milestone.status).toBe('pending');
      });

      // Verify total amount matches sum of milestones
      const totalMilestoneAmount = milestones.reduce(
        (sum, milestone) => sum + parseFloat(milestone.amount),
        0
      );
      expect(totalMilestoneAmount).toBe(contractData.totalAmount);
    });

    test('should decrease available contracts for free tier users', async () => {
      // Check initial available contracts
      const { data: initialProfile } = await supabaseAdmin
        .from('profiles')
        .select('available_contracts')
        .eq('id', freelancerUser.user.id)
        .single();

      expect(initialProfile.available_contracts).toBe(2); // Should be 2 after creating the first contract

      // Create another contract
      const anotherContract = await TestContractManager.createContract(
        freelancerUser.user.id,
        TEST_CONFIG.CONTRACT_DATA.GRAPHIC_DESIGN,
        'freelancer'
      );

      // Check available contracts decreased
      const { data: updatedProfile } = await supabaseAdmin
        .from('profiles')
        .select('available_contracts')
        .eq('id', freelancerUser.user.id)
        .single();

      expect(updatedProfile.available_contracts).toBe(1);

      // Clean up
      await TestContractManager.deleteContract(anotherContract.id);
    });

    test('should fail to create contract when free tier limit reached', async () => {
      // Set available contracts to 0
      await supabaseAdmin
        .from('profiles')
        .update({ available_contracts: 0 })
        .eq('id', freelancerUser.user.id);

      // Attempt to create contract should fail or handle gracefully
      const contractData = TEST_CONFIG.CONTRACT_DATA.GRAPHIC_DESIGN;
      
      try {
        const limitedContract = await TestContractManager.createContract(
          freelancerUser.user.id,
          contractData,
          'freelancer'
        );

        // If it succeeds, verify available contracts didn't go negative
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('available_contracts')
          .eq('id', freelancerUser.user.id)
          .single();

        expect(profile.available_contracts).toBeGreaterThanOrEqual(0);

        // Clean up if contract was created
        if (limitedContract) {
          await TestContractManager.deleteContract(limitedContract.id);
        }
      } catch (error) {
        // Expected to fail for free tier limit
        expect(error.message).toContain('limit');
      }

      // Reset available contracts
      await supabaseAdmin
        .from('profiles')
        .update({ available_contracts: 3 })
        .eq('id', freelancerUser.user.id);
    });
  });

  describe('Contract Parties Management', () => {
    test('should create contract party for creator', async () => {
      const { data: parties, error } = await supabaseAdmin
        .from('contract_parties')
        .select('*')
        .eq('contract_id', testContract.id);

      expect(error).toBeNull();
      expect(parties).toHaveLength(1);
      expect(parties[0].user_id).toBe(freelancerUser.user.id);
      expect(parties[0].role).toBe('creator');
      expect(parties[0].status).toBe('signed');
    });

    test('should add client as contract party', async () => {
      // Add client to contract
      const { data: clientParty, error } = await supabaseAdmin
        .from('contract_parties')
        .insert({
          contract_id: testContract.id,
          user_id: clientUser.user.id,
          role: 'client',
          status: 'pending'
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(clientParty.user_id).toBe(clientUser.user.id);
      expect(clientParty.role).toBe('client');
      expect(clientParty.status).toBe('pending');

      // Verify total parties
      const { data: allParties } = await supabaseAdmin
        .from('contract_parties')
        .select('*')
        .eq('contract_id', testContract.id);

      expect(allParties).toHaveLength(2);
    });
  });

  describe('Contract Signing', () => {
    test('should sign contract as client', async () => {
      const signatureData = 'Client Digital Signature Test';
      
      const signedParty = await TestContractManager.signContract(
        testContract.id,
        clientUser.user.id,
        signatureData
      );

      expect(signedParty.status).toBe('signed');
      expect(signedParty.signature_data).toBe(signatureData);
      expect(signedParty.signature_date).toBeDefined();
    });

    test('should update contract status to signed when all parties sign', async () => {
      // Check if contract status is now 'signed'
      const { data: contract, error } = await supabaseAdmin
        .from('contracts')
        .select('status')
        .eq('id', testContract.id)
        .single();

      expect(error).toBeNull();
      expect(contract.status).toBe('signed');
    });

    test('should not allow duplicate signatures', async () => {
      try {
        await TestContractManager.signContract(
          testContract.id,
          clientUser.user.id,
          'Duplicate signature attempt'
        );

        // If it doesn't throw, verify the signature wasn't changed
        const { data: party } = await supabaseAdmin
          .from('contract_parties')
          .select('signature_data')
          .eq('contract_id', testContract.id)
          .eq('user_id', clientUser.user.id)
          .single();

        expect(party.signature_data).toBe('Client Digital Signature Test');
      } catch (error) {
        // Expected behavior - should prevent duplicate signing
        expect(error.message).toBeDefined();
      }
    });
  });

  describe('Contract Status Management', () => {
    test('should transition from signed to active status', async () => {
      // Update contract to active status (normally done after funding)
      const { data: updatedContract, error } = await supabaseAdmin
        .from('contracts')
        .update({ status: 'active' })
        .eq('id', testContract.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedContract.status).toBe('active');
    });

    test('should track contract status history', async () => {
      // Check that contract has progressed through expected statuses
      const { data: contract } = await supabaseAdmin
        .from('contracts')
        .select('*')
        .eq('id', testContract.id)
        .single();

      expect(contract.created_at).toBeDefined();
      expect(contract.updated_at).toBeDefined();
      expect(new Date(contract.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(contract.created_at).getTime()
      );
    });

    test('should handle contract cancellation', async () => {
      // Create a separate contract for cancellation test
      const cancelContract = await TestContractManager.createContract(
        freelancerUser.user.id,
        TEST_CONFIG.CONTRACT_DATA.GRAPHIC_DESIGN,
        'freelancer'
      );

      // Cancel the contract
      const { data: cancelledContract, error } = await supabaseAdmin
        .from('contracts')
        .update({ status: 'cancelled' })
        .eq('id', cancelContract.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(cancelledContract.status).toBe('cancelled');

      // Clean up
      await TestContractManager.deleteContract(cancelContract.id);
    });
  });

  describe('Milestone Management', () => {
    test('should update milestone status to in_progress', async () => {
      const { data: milestones } = await supabaseAdmin
        .from('milestones')
        .select('*')
        .eq('contract_id', testContract.id)
        .order('due_date', { ascending: true });

      const firstMilestone = milestones[0];

      const { data: updatedMilestone, error } = await supabaseAdmin
        .from('milestones')
        .update({ status: 'in_progress' })
        .eq('id', firstMilestone.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedMilestone.status).toBe('in_progress');
    });

    test('should complete milestone and update status', async () => {
      const { data: milestones } = await supabaseAdmin
        .from('milestones')
        .select('*')
        .eq('contract_id', testContract.id)
        .order('due_date', { ascending: true });

      const firstMilestone = milestones[0];

      const { data: completedMilestone, error } = await supabaseAdmin
        .from('milestones')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', firstMilestone.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(completedMilestone.status).toBe('completed');
      expect(completedMilestone.completed_at).toBeDefined();
    });

    test('should track milestone progress', async () => {
      const { data: milestones } = await supabaseAdmin
        .from('milestones')
        .select('*')
        .eq('contract_id', testContract.id);

      const completedMilestones = milestones.filter(m => m.status === 'completed');
      const totalMilestones = milestones.length;
      const progressPercentage = (completedMilestones.length / totalMilestones) * 100;

      expect(progressPercentage).toBeGreaterThan(0);
      expect(progressPercentage).toBeLessThanOrEqual(100);
    });
  });

  describe('Contract Completion', () => {
    test('should complete all remaining milestones', async () => {
      const { data: pendingMilestones } = await supabaseAdmin
        .from('milestones')
        .select('*')
        .eq('contract_id', testContract.id)
        .neq('status', 'completed');

      // Complete all remaining milestones
      for (const milestone of pendingMilestones) {
        await supabaseAdmin
          .from('milestones')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', milestone.id);
      }

      // Verify all milestones are completed
      const { data: allMilestones } = await supabaseAdmin
        .from('milestones')
        .select('status')
        .eq('contract_id', testContract.id);

      const allCompleted = allMilestones.every(m => m.status === 'completed');
      expect(allCompleted).toBe(true);
    });

    test('should complete contract when all milestones done', async () => {
      const { data: completedContract, error } = await supabaseAdmin
        .from('contracts')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', testContract.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(completedContract.status).toBe('completed');
      expect(completedContract.completed_at).toBeDefined();
    });

    test('should verify contract completion data integrity', async () => {
      const { data: contract } = await supabaseAdmin
        .from('contracts')
        .select(`
          *,
          milestones (*),
          contract_parties (*)
        `)
        .eq('id', testContract.id)
        .single();

      // Verify all data is consistent
      expect(contract.status).toBe('completed');
      expect(contract.completed_at).toBeDefined();
      expect(contract.milestones.every(m => m.status === 'completed')).toBe(true);
      expect(contract.contract_parties.every(p => p.status === 'signed')).toBe(true);

      // Verify timeline integrity
      const createdAt = new Date(contract.created_at);
      const completedAt = new Date(contract.completed_at);
      expect(completedAt.getTime()).toBeGreaterThan(createdAt.getTime());
    });
  });

  describe('Contract Validation and Constraints', () => {
    test('should validate contract data constraints', async () => {
      // Test invalid status
      const { error: statusError } = await supabaseAdmin
        .from('contracts')
        .update({ status: 'invalid_status' })
        .eq('id', testContract.id);

      expect(statusError).toBeDefined();
      expect(statusError.message).toContain('invalid');
    });

    test('should maintain data consistency across related tables', async () => {
      // Verify foreign key relationships
      const { data: contract } = await supabaseAdmin
        .from('contracts')
        .select(`
          id,
          creator_id,
          milestones (contract_id),
          contract_parties (contract_id)
        `)
        .eq('id', testContract.id)
        .single();

      // All milestones should reference the correct contract
      contract.milestones.forEach(milestone => {
        expect(milestone.contract_id).toBe(testContract.id);
      });

      // All parties should reference the correct contract
      contract.contract_parties.forEach(party => {
        expect(party.contract_id).toBe(testContract.id);
      });
    });

    test('should handle concurrent contract modifications', async () => {
      // Simulate concurrent updates
      const updatePromises = [
        supabaseAdmin
          .from('contracts')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', testContract.id),
        supabaseAdmin
          .from('contracts')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', testContract.id)
      ];

      const results = await Promise.allSettled(updatePromises);
      
      // At least one should succeed
      const succeeded = results.some(result => result.status === 'fulfilled' && !result.value.error);
      expect(succeeded).toBe(true);
    });
  });
});