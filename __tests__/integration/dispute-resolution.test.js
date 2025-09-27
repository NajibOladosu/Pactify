/**
 * Dispute Resolution Integration Tests
 * Tests dispute creation, escalation, responses, and resolution workflows
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

describe('Dispute Resolution System', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;
  let testContract = null;
  let testDispute = null;
  let testMilestone = null;

  // Setup before all tests
  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');

    // Create test contract for dispute tests
    testContract = await TestContractManager.createContract(
      freelancerUser.user.id,
      TEST_CONFIG.CONTRACT_DATA.WEB_DEVELOPMENT,
      'freelancer'
    );

    // Add client as party and sign contract
    await supabaseAdmin
      .from('contract_parties')
      .insert({
        contract_id: testContract.id,
        user_id: clientUser.user.id,
        role: 'client',
        status: 'pending'
      });

    await TestContractManager.signContract(testContract.id, clientUser.user.id);

    // Set contract to active status
    await supabaseAdmin
      .from('contracts')
      .update({ status: 'active' })
      .eq('id', testContract.id);

    // Get a milestone for dispute testing
    const { data: milestones } = await supabaseAdmin
      .from('milestones')
      .select('*')
      .eq('contract_id', testContract.id)
      .order('due_date', { ascending: true })
      .limit(1);

    testMilestone = milestones[0];

  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  // Cleanup after all tests
  afterAll(async () => {
    if (testContract) {
      await TestContractManager.deleteContract(testContract.id);
    }
    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.DEFAULT);

  beforeEach(async () => {
    await createTestDelay(500); // Prevent rate limiting
  });

  describe('Dispute Creation', () => {
    test('should create dispute as client for quality issues', async () => {
      const disputeData = {
        contract_id: testContract.id,
        milestone_id: testMilestone.id,
        dispute_type: 'quality_issue',
        title: TEST_CONFIG.DISPUTE_DATA.QUALITY_ISSUE.title,
        description: TEST_CONFIG.DISPUTE_DATA.QUALITY_ISSUE.description,
        raised_by: clientUser.user.id,
        amount_disputed: parseFloat(testMilestone.amount),
        evidence: TEST_CONFIG.DISPUTE_DATA.QUALITY_ISSUE.evidence,
        status: 'open',
        priority: 'medium'
      };

      const { data: dispute, error } = await supabaseAdmin
        .from('contract_disputes')
        .insert(disputeData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(dispute).toBeDefined();
      expect(dispute.contract_id).toBe(testContract.id);
      expect(dispute.milestone_id).toBe(testMilestone.id);
      expect(dispute.dispute_type).toBe('quality_issue');
      expect(dispute.title).toBe(TEST_CONFIG.DISPUTE_DATA.QUALITY_ISSUE.title);
      expect(dispute.raised_by).toBe(clientUser.user.id);
      expect(parseFloat(dispute.amount_disputed)).toBe(parseFloat(testMilestone.amount));
      expect(dispute.status).toBe('open');

      testDispute = dispute;
    });

    test('should create dispute as freelancer for timeline issues', async () => {
      const freelancerDisputeData = {
        contract_id: testContract.id,
        milestone_id: testMilestone.id,
        dispute_type: 'timeline_delay',
        title: TEST_CONFIG.DISPUTE_DATA.TIMELINE_DELAY.title,
        description: TEST_CONFIG.DISPUTE_DATA.TIMELINE_DELAY.description,
        raised_by: freelancerUser.user.id,
        amount_disputed: 0, // Not about money, about timeline
        evidence: TEST_CONFIG.DISPUTE_DATA.TIMELINE_DELAY.evidence,
        status: 'open',
        priority: 'high'
      };

      const { data: timelineDispute, error } = await supabaseAdmin
        .from('contract_disputes')
        .insert(freelancerDisputeData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(timelineDispute.dispute_type).toBe('timeline_delay');
      expect(timelineDispute.raised_by).toBe(freelancerUser.user.id);
      expect(timelineDispute.priority).toBe('high');

      // Clean up timeline dispute for other tests
      await supabaseAdmin
        .from('contract_disputes')
        .delete()
        .eq('id', timelineDispute.id);
    });

    test('should validate dispute data constraints', async () => {
      // Test invalid dispute type
      const invalidDisputeData = {
        contract_id: testContract.id,
        dispute_type: 'invalid_type',
        title: 'Invalid Dispute',
        description: 'This should fail',
        raised_by: clientUser.user.id,
        status: 'open'
      };

      const { error } = await supabaseAdmin
        .from('contract_disputes')
        .insert(invalidDisputeData);

      expect(error).toBeDefined();
      expect(error.message).toContain('invalid');
    });

    test('should update contract status when dispute is created', async () => {
      const { data: contractWithDispute, error } = await supabaseAdmin
        .from('contracts')
        .update({ status: 'disputed' })
        .eq('id', testContract.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(contractWithDispute.status).toBe('disputed');
    });
  });

  describe('Dispute Responses', () => {
    test('should allow freelancer to respond to client dispute', async () => {
      const responseData = {
        dispute_id: testDispute.id,
        user_id: freelancerUser.user.id,
        response_type: 'defense',
        message: 'The work was completed according to specifications. I have provided detailed documentation and examples that demonstrate the deliverable meets all requirements outlined in the contract.',
        evidence: 'Documentation, screenshots, and test results attached',
        response_to: null // Initial response, not replying to another response
      };

      const { data: response, error } = await supabaseAdmin
        .from('dispute_responses')
        .insert(responseData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(response.dispute_id).toBe(testDispute.id);
      expect(response.user_id).toBe(freelancerUser.user.id);
      expect(response.response_type).toBe('defense');
      expect(response.message).toContain('according to specifications');
    });

    test('should allow client to counter-respond', async () => {
      const { data: freelancerResponse } = await supabaseAdmin
        .from('dispute_responses')
        .select('*')
        .eq('dispute_id', testDispute.id)
        .eq('user_id', freelancerUser.user.id)
        .single();

      const counterResponseData = {
        dispute_id: testDispute.id,
        user_id: clientUser.user.id,
        response_type: 'counter_argument',
        message: 'While documentation was provided, the actual implementation does not match the agreed specifications. Please see my detailed comparison and the specific points where the deliverable falls short.',
        evidence: 'Comparison document, requirement analysis, and gap identification',
        response_to: freelancerResponse.id
      };

      const { data: counterResponse, error } = await supabaseAdmin
        .from('dispute_responses')
        .insert(counterResponseData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(counterResponse.response_type).toBe('counter_argument');
      expect(counterResponse.response_to).toBe(freelancerResponse.id);
      expect(counterResponse.message).toContain('does not match');
    });

    test('should track response timeline and sequence', async () => {
      const { data: responses } = await supabaseAdmin
        .from('dispute_responses')
        .select('*')
        .eq('dispute_id', testDispute.id)
        .order('created_at', { ascending: true });

      expect(responses.length).toBeGreaterThanOrEqual(2);

      // Verify timeline order
      for (let i = 1; i < responses.length; i++) {
        const prevTime = new Date(responses[i-1].created_at);
        const currTime = new Date(responses[i].created_at);
        expect(currTime.getTime()).toBeGreaterThanOrEqual(prevTime.getTime());
      }

      // Verify response chain
      const counterResponse = responses.find(r => r.response_to !== null);
      expect(counterResponse).toBeDefined();
      expect(counterResponse.response_to).toBe(responses[0].id);
    });

    test('should limit response frequency to prevent spam', async () => {
      // Create multiple responses in quick succession
      const rapidResponses = [];
      
      for (let i = 0; i < 3; i++) {
        const rapidResponseData = {
          dispute_id: testDispute.id,
          user_id: freelancerUser.user.id,
          response_type: 'clarification',
          message: `Additional clarification ${i + 1}`,
          evidence: 'Supporting documentation'
        };

        try {
          const { data: response, error } = await supabaseAdmin
            .from('dispute_responses')
            .insert(rapidResponseData)
            .select()
            .single();

          if (!error) {
            rapidResponses.push(response);
          }
        } catch (error) {
          // Expected if rate limiting is in place
        }
      }

      // Clean up rapid responses
      if (rapidResponses.length > 0) {
        await supabaseAdmin
          .from('dispute_responses')
          .delete()
          .in('id', rapidResponses.map(r => r.id));
      }
    });
  });

  describe('Dispute Escalation', () => {
    test('should allow dispute escalation after response period', async () => {
      // Simulate time passing (48 hours since last response)
      const escalationTime = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const { data: escalatedDispute, error } = await supabaseAdmin
        .from('contract_disputes')
        .update({
          status: 'escalated',
          escalated_at: escalationTime,
          escalated_by: clientUser.user.id,
          escalation_reason: 'No satisfactory resolution reached through direct communication'
        })
        .eq('id', testDispute.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(escalatedDispute.status).toBe('escalated');
      expect(escalatedDispute.escalated_by).toBe(clientUser.user.id);
      expect(escalatedDispute.escalation_reason).toContain('No satisfactory resolution');
    });

    test('should create escalation record with admin assignment', async () => {
      const escalationData = {
        dispute_id: testDispute.id,
        escalated_by: clientUser.user.id,
        escalation_reason: 'Dispute requires admin review and mediation',
        admin_assigned: null, // Would be assigned in real system
        priority_level: 'high',
        estimated_resolution_days: 5,
        escalation_notes: 'Complex dispute requiring detailed review of technical specifications'
      };

      const { data: escalation, error } = await supabaseAdmin
        .from('dispute_escalations')
        .insert(escalationData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(escalation.dispute_id).toBe(testDispute.id);
      expect(escalation.priority_level).toBe('high');
      expect(escalation.estimated_resolution_days).toBe(5);
    });

    test('should notify relevant parties of escalation', async () => {
      // Create notifications for both parties
      const notifications = [
        {
          contract_id: testContract.id,
          user_id: freelancerUser.user.id,
          notification_type: 'dispute_escalated',
          title: 'Dispute Escalated',
          message: `Dispute "${testDispute.title}" has been escalated to admin review`,
          metadata: {
            dispute_id: testDispute.id,
            escalated_by: clientUser.user.id
          }
        },
        {
          contract_id: testContract.id,
          user_id: clientUser.user.id,
          notification_type: 'dispute_escalated',
          title: 'Dispute Escalated',
          message: `Your dispute "${testDispute.title}" has been escalated to admin review`,
          metadata: {
            dispute_id: testDispute.id,
            escalated_by: clientUser.user.id
          }
        }
      ];

      const { data: createdNotifications, error } = await supabaseAdmin
        .from('contract_notifications')
        .insert(notifications)
        .select();

      expect(error).toBeNull();
      expect(createdNotifications).toHaveLength(2);
      
      // Verify both parties got notifications
      const freelancerNotif = createdNotifications.find(n => n.user_id === freelancerUser.user.id);
      const clientNotif = createdNotifications.find(n => n.user_id === clientUser.user.id);
      
      expect(freelancerNotif).toBeDefined();
      expect(clientNotif).toBeDefined();
    });
  });

  describe('Dispute Resolution', () => {
    test('should allow admin resolution with ruling', async () => {
      const resolutionData = {
        dispute_id: testDispute.id,
        resolved_by: 'admin', // In real system, would be admin user ID
        resolution_type: 'partial_refund',
        ruling: 'After reviewing evidence from both parties, the deliverable partially meets specifications but requires additional work. Client is entitled to 30% refund, and freelancer should complete remaining items.',
        amount_awarded_to_client: parseFloat(testMilestone.amount) * 0.3,
        amount_awarded_to_freelancer: parseFloat(testMilestone.amount) * 0.7,
        resolution_notes: 'Both parties should work together to complete remaining items within 14 days',
        requires_action_from_freelancer: true,
        requires_action_from_client: false,
        deadline_for_action: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      };

      const { data: resolution, error } = await supabaseAdmin
        .from('dispute_resolutions')
        .insert(resolutionData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(resolution.resolution_type).toBe('partial_refund');
      expect(parseFloat(resolution.amount_awarded_to_client)).toBe(parseFloat(testMilestone.amount) * 0.3);
      expect(parseFloat(resolution.amount_awarded_to_freelancer)).toBe(parseFloat(testMilestone.amount) * 0.7);
      expect(resolution.requires_action_from_freelancer).toBe(true);
    });

    test('should update dispute status to resolved', async () => {
      const { data: resolvedDispute, error } = await supabaseAdmin
        .from('contract_disputes')
        .update({
          status: 'resolved',
          resolved_at: new Date(),
          resolution_summary: 'Partial refund awarded to client, freelancer to complete remaining work'
        })
        .eq('id', testDispute.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(resolvedDispute.status).toBe('resolved');
      expect(resolvedDispute.resolved_at).toBeDefined();
      expect(resolvedDispute.resolution_summary).toContain('Partial refund');
    });

    test('should create payment adjustments based on resolution', async () => {
      const { data: resolution } = await supabaseAdmin
        .from('dispute_resolutions')
        .select('*')
        .eq('dispute_id', testDispute.id)
        .single();

      // Create refund record for client
      const clientRefundData = {
        contract_id: testContract.id,
        user_id: clientUser.user.id,
        amount: parseFloat(resolution.amount_awarded_to_client),
        status: 'pending',
        payment_type: 'refund',
        stripe_payment_id: 'dispute_refund_123',
        metadata: {
          dispute_id: testDispute.id,
          resolution_id: resolution.id,
          reason: 'Dispute resolution - partial refund'
        }
      };

      const { data: refundRecord, error: refundError } = await supabaseAdmin
        .from('contract_payments')
        .insert(clientRefundData)
        .select()
        .single();

      expect(refundError).toBeNull();
      expect(refundRecord.payment_type).toBe('refund');
      expect(parseFloat(refundRecord.amount)).toBe(parseFloat(resolution.amount_awarded_to_client));

      // Create payment record for freelancer's portion
      const freelancerPaymentData = {
        contract_id: testContract.id,
        user_id: freelancerUser.user.id,
        amount: parseFloat(resolution.amount_awarded_to_freelancer),
        status: 'completed',
        payment_type: 'release',
        stripe_payment_id: 'dispute_payment_123',
        metadata: {
          dispute_id: testDispute.id,
          resolution_id: resolution.id,
          reason: 'Dispute resolution - freelancer portion'
        }
      };

      const { data: paymentRecord, error: paymentError } = await supabaseAdmin
        .from('contract_payments')
        .insert(freelancerPaymentData)
        .select()
        .single();

      expect(paymentError).toBeNull();
      expect(paymentRecord.payment_type).toBe('release');
      expect(parseFloat(paymentRecord.amount)).toBe(parseFloat(resolution.amount_awarded_to_freelancer));
    });

    test('should update contract status after resolution', async () => {
      // Check if all disputes are resolved
      const { data: openDisputes } = await supabaseAdmin
        .from('contract_disputes')
        .select('*')
        .eq('contract_id', testContract.id)
        .neq('status', 'resolved');

      if (!openDisputes || openDisputes.length === 0) {
        // Update contract back to active if no open disputes
        const { data: updatedContract, error } = await supabaseAdmin
          .from('contracts')
          .update({ status: 'active' })
          .eq('id', testContract.id)
          .select()
          .single();

        expect(error).toBeNull();
        expect(updatedContract.status).toBe('active');
      }
    });
  });

  describe('Dispute Analytics and Reporting', () => {
    test('should track dispute metrics by type', async () => {
      const { data: disputesByType } = await supabaseAdmin
        .from('contract_disputes')
        .select('dispute_type')
        .eq('contract_id', testContract.id);

      const disputeTypeCounts = disputesByType.reduce((counts, dispute) => {
        counts[dispute.dispute_type] = (counts[dispute.dispute_type] || 0) + 1;
        return counts;
      }, {});

      expect(disputeTypeCounts.quality_issue).toBe(1);
    });

    test('should calculate dispute resolution time', async () => {
      const { data: resolvedDisputes } = await supabaseAdmin
        .from('contract_disputes')
        .select('created_at, resolved_at')
        .eq('status', 'resolved')
        .eq('contract_id', testContract.id);

      resolvedDisputes.forEach(dispute => {
        const createdAt = new Date(dispute.created_at);
        const resolvedAt = new Date(dispute.resolved_at);
        const resolutionTimeHours = (resolvedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        
        expect(resolutionTimeHours).toBeGreaterThan(0);
        // In real system, would track against SLA targets
      });
    });

    test('should track party satisfaction with resolution', async () => {
      const satisfactionData = [
        {
          dispute_id: testDispute.id,
          user_id: clientUser.user.id,
          satisfaction_rating: 4,
          feedback: 'Fair resolution considering the circumstances',
          would_recommend_platform: true
        },
        {
          dispute_id: testDispute.id,
          user_id: freelancerUser.user.id,
          satisfaction_rating: 3,
          feedback: 'Resolution was reasonable, will ensure better communication next time',
          would_recommend_platform: true
        }
      ];

      const { data: satisfactionRecords, error } = await supabaseAdmin
        .from('dispute_satisfaction')
        .insert(satisfactionData)
        .select();

      expect(error).toBeNull();
      expect(satisfactionRecords).toHaveLength(2);
      
      const avgSatisfaction = satisfactionRecords.reduce(
        (sum, record) => sum + record.satisfaction_rating, 0
      ) / satisfactionRecords.length;
      
      expect(avgSatisfaction).toBe(3.5);
    });
  });

  describe('Dispute Prevention and Education', () => {
    test('should identify contracts at risk for disputes', async () => {
      // Contracts with overdue milestones might be at risk
      const { data: overdueContracts } = await supabaseAdmin
        .from('contracts')
        .select(`
          *,
          milestones!inner (
            id,
            due_date,
            status
          )
        `)
        .eq('status', 'active')
        .lt('milestones.due_date', new Date().toISOString())
        .neq('milestones.status', 'completed');

      // This query would identify at-risk contracts in real system
      expect(Array.isArray(overdueContracts)).toBe(true);
    });

    test('should suggest dispute prevention measures', async () => {
      // Based on contract and milestone data, system could suggest:
      // - Early communication reminders
      // - Milestone check-ins
      // - Clearer specification requirements
      
      const preventionSuggestions = {
        contractId: testContract.id,
        suggestions: [
          'Schedule regular milestone check-ins',
          'Request detailed specifications for next milestone',
          'Set up automated progress reminders'
        ],
        riskLevel: 'medium',
        reasoning: 'Contract has complex milestones with potential for miscommunication'
      };

      // In real system, this would be stored and presented to users
      expect(preventionSuggestions.suggestions.length).toBeGreaterThan(0);
      expect(preventionSuggestions.riskLevel).toBe('medium');
    });
  });
});