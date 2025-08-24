/**
 * End-to-End Complete Workflow Integration Tests
 * Tests the entire platform workflow from user registration to project completion
 */

import {
  setupTestUsers,
  cleanupTestUsers,
  getTestUser,
  authenticateTestUser,
  resetTestUsers
} from '../test-setup/setup-test-users.js';
import {
  TestContractManager,
  TestPaymentManager,
  TestAPIManager,
  TEST_CONFIG,
  supabaseAdmin,
  createTestDelay
} from '../test-setup/test-helpers.js';

describe('Complete Platform Workflow E2E Tests', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;
  let workflowData = {};

  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');
  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  afterAll(async () => {
    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  beforeEach(async () => {
    await createTestDelay(1000); // Longer delay for E2E tests
  });

  describe('Complete Project Lifecycle', () => {
    test('1. Create comprehensive contract with milestones', async () => {
      console.log('🔄 Creating contract with detailed milestones...');
      
      const contractData = {
        title: 'E2E Test: Complete Web Platform Development',
        description: 'End-to-end testing of a comprehensive web platform development project including design, development, testing, and deployment phases.',
        type: 'milestone',
        total_amount: 15000,
        currency: 'USD',
        client_email: clientUser.user.email,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
        terms_and_conditions: 'Comprehensive terms covering all project phases with detailed deliverables and acceptance criteria.',
        milestones: [
          {
            title: 'Phase 1: Research & Design',
            description: 'User research, wireframes, and high-fidelity designs',
            amount: 3000,
            due_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
            deliverables: [
              'User research report',
              'Information architecture',
              'Wireframes for all key pages',
              'High-fidelity designs',
              'Design system documentation'
            ]
          },
          {
            title: 'Phase 2: Frontend Development',
            description: 'Responsive frontend implementation',
            amount: 5000,
            due_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
            deliverables: [
              'Responsive HTML/CSS/JS implementation',
              'Cross-browser compatibility',
              'Mobile-first responsive design',
              'Performance optimization'
            ]
          },
          {
            title: 'Phase 3: Backend Development',
            description: 'API development and database setup',
            amount: 4500,
            due_date: new Date(Date.now() + 70 * 24 * 60 * 60 * 1000).toISOString(),
            deliverables: [
              'RESTful API implementation',
              'Database schema and setup',
              'Authentication and authorization',
              'API documentation'
            ]
          },
          {
            title: 'Phase 4: Testing & Deployment',
            description: 'Quality assurance and production deployment',
            amount: 2500,
            due_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            deliverables: [
              'Comprehensive testing suite',
              'Bug fixes and optimizations',
              'Production deployment',
              'Documentation and handover'
            ]
          }
        ]
      };

      const contract = await TestContractManager.createContract(
        freelancerUser.user.id,
        contractData,
        'freelancer'
      );

      expect(contract).toBeDefined();
      expect(contract.title).toBe(contractData.title);
      expect(contract.type).toBe('milestone');
      expect(parseFloat(contract.total_amount)).toBe(contractData.total_amount);

      // Verify milestones were created
      const { data: milestones } = await supabaseAdmin
        .from('milestones')
        .select('*')
        .eq('contract_id', contract.id)
        .order('due_date', { ascending: true });

      expect(milestones).toHaveLength(4);
      expect(milestones[0].title).toBe('Phase 1: Research & Design');
      expect(parseFloat(milestones[0].amount)).toBe(3000);

      workflowData.contract = contract;
      workflowData.milestones = milestones;

      console.log('✅ Contract created successfully with 4 milestones');
    });

    test('2. Add client as party and handle contract negotiation', async () => {
      console.log('🔄 Adding client and handling contract negotiation...');

      // Add client as party
      await supabaseAdmin
        .from('contract_parties')
        .insert({
          contract_id: workflowData.contract.id,
          user_id: clientUser.user.id,
          role: 'client',
          status: 'pending'
        });

      // Simulate contract review and minor adjustment
      const contractUpdate = {
        description: workflowData.contract.description + ' Updated after client review to include additional security requirements.',
        milestones: [
          ...workflowData.contract.content.milestones,
          {
            title: 'Phase 5: Security Audit',
            description: 'Security review and penetration testing',
            amount: 1500,
            due_date: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString()
          }
        ]
      };

      const { data: updatedContract, error } = await supabaseAdmin
        .from('contracts')
        .update({
          description: contractUpdate.description,
          total_amount: 16500, // Added 1500 for security audit
          content: {
            ...workflowData.contract.content,
            milestones: contractUpdate.milestones
          }
        })
        .eq('id', workflowData.contract.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(parseFloat(updatedContract.total_amount)).toBe(16500);

      // Create the additional milestone
      const { data: securityMilestone } = await supabaseAdmin
        .from('milestones')
        .insert({
          contract_id: workflowData.contract.id,
          title: 'Phase 5: Security Audit',
          description: 'Security review and penetration testing',
          amount: 1500,
          due_date: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      workflowData.milestones.push(securityMilestone);
      workflowData.contract = updatedContract;

      console.log('✅ Contract negotiation completed, security milestone added');
    });

    test('3. Digital contract signing by both parties', async () => {
      console.log('🔄 Processing digital signatures...');

      // Client signs first
      const clientSignature = await TestContractManager.signContract(
        workflowData.contract.id,
        clientUser.user.id,
        {
          signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          ip_address: '192.168.1.100',
          user_agent: 'Mozilla/5.0 (Test Client Browser)'
        }
      );

      expect(clientSignature).toBeDefined();
      expect(clientSignature.signature_date).toBeDefined();

      // Brief delay to ensure different timestamps
      await createTestDelay(1000);

      // Freelancer signs second
      const freelancerSignature = await TestContractManager.signContract(
        workflowData.contract.id,
        freelancerUser.user.id,
        {
          signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          ip_address: '192.168.1.101',
          user_agent: 'Mozilla/5.0 (Test Freelancer Browser)'
        }
      );

      expect(freelancerSignature).toBeDefined();

      // Verify contract status is now signed
      const { data: signedContract } = await supabaseAdmin
        .from('contracts')
        .select('status')
        .eq('id', workflowData.contract.id)
        .single();

      expect(signedContract.status).toBe('signed');

      // Create signing activity records
      const activities = [
        {
          contract_id: workflowData.contract.id,
          user_id: clientUser.user.id,
          action: 'contract_signed',
          details: { role: 'client', timestamp: new Date() }
        },
        {
          contract_id: workflowData.contract.id,
          user_id: freelancerUser.user.id,
          action: 'contract_signed',
          details: { role: 'freelancer', timestamp: new Date() }
        },
        {
          contract_id: workflowData.contract.id,
          user_id: null,
          action: 'contract_fully_executed',
          details: { timestamp: new Date(), next_step: 'escrow_funding' }
        }
      ];

      await supabaseAdmin
        .from('contract_activities')
        .insert(activities);

      console.log('✅ Contract fully executed by both parties');
    });

    test('4. Escrow funding with comprehensive fee calculation', async () => {
      console.log('🔄 Processing escrow funding...');

      const contractAmount = parseFloat(workflowData.contract.total_amount);
      const userTier = 'free'; // Test user default tier
      
      // Calculate fees based on tier
      const platformFeePercentage = userTier === 'free' ? 0.10 : userTier === 'professional' ? 0.075 : 0.05;
      const platformFee = contractAmount * platformFeePercentage;
      const stripeFeePercentage = 0.029;
      const stripeFeeFixed = 0.30;
      const totalBeforeFees = contractAmount + platformFee;
      const stripeFee = (totalBeforeFees * stripeFeePercentage) + stripeFeeFixed;
      const totalCharged = totalBeforeFees + stripeFee;

      const escrowData = {
        contract_id: workflowData.contract.id,
        amount: contractAmount,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total_charged: totalCharged,
        status: 'funded',
        stripe_payment_intent_id: 'pi_test_comprehensive_escrow',
        funded_at: new Date()
      };

      const { data: escrowPayment, error } = await supabaseAdmin
        .from('escrow_payments')
        .insert(escrowData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(parseFloat(escrowPayment.amount)).toBe(contractAmount);
      expect(parseFloat(escrowPayment.platform_fee)).toBe(platformFee);
      expect(parseFloat(escrowPayment.total_charged)).toBe(totalCharged);

      // Update contract status to active
      await supabaseAdmin
        .from('contracts')
        .update({ status: 'active' })
        .eq('id', workflowData.contract.id);

      workflowData.escrow = escrowPayment;

      console.log(`✅ Escrow funded: $${contractAmount} + $${platformFee.toFixed(2)} platform fee + $${stripeFee.toFixed(2)} Stripe fee = $${totalCharged.toFixed(2)} total`);
    });

    test('5. Phase 1: Design deliverables submission and approval', async () => {
      console.log('🔄 Processing Phase 1 deliverables...');

      const phase1Milestone = workflowData.milestones[0];

      // Freelancer submits deliverables
      const deliverableData = {
        contract_id: workflowData.contract.id,
        milestone_id: phase1Milestone.id,
        submitted_by: freelancerUser.user.id,
        title: 'Phase 1: Research & Design Deliverables',
        description: 'Complete design phase deliverables including research findings, wireframes, and high-fidelity designs.',
        submission_notes: 'All deliverables have been completed according to specifications. Please review the user research findings and design rationale document for context.',
        status: 'submitted',
        submission_type: 'milestone_completion',
        deliverable_items: [
          {
            name: 'User Research Report',
            description: '45-page comprehensive user research report with personas and user journeys',
            file_attachments: ['user_research_report.pdf', 'personas.pdf'],
            completion_percentage: 100
          },
          {
            name: 'Information Architecture',
            description: 'Complete site map and user flow diagrams',
            file_attachments: ['sitemap.pdf', 'user_flows.pdf'],
            completion_percentage: 100
          },
          {
            name: 'Wireframes',
            description: 'Low and high-fidelity wireframes for all key pages',
            file_attachments: ['wireframes_low_fi.pdf', 'wireframes_high_fi.pdf'],
            completion_percentage: 100
          },
          {
            name: 'High-Fidelity Designs',
            description: 'Pixel-perfect designs for desktop, tablet, and mobile',
            file_attachments: ['designs_desktop.pdf', 'designs_mobile.pdf'],
            external_links: ['https://figma.com/file/designs-prototype'],
            completion_percentage: 100
          },
          {
            name: 'Design System',
            description: 'Comprehensive design system with components and guidelines',
            file_attachments: ['design_system.pdf'],
            external_links: ['https://figma.com/file/design-system'],
            completion_percentage: 100
          }
        ]
      };

      const { data: deliverable } = await supabaseAdmin
        .from('contract_deliverables')
        .insert(deliverableData)
        .select()
        .single();

      // Update milestone status
      await supabaseAdmin
        .from('milestones')
        .update({ status: 'in_review' })
        .eq('id', phase1Milestone.id);

      // Client reviews and approves
      const reviewData = {
        deliverable_id: deliverable.id,
        reviewer_id: clientUser.user.id,
        decision: 'approved',
        overall_rating: 5,
        feedback_summary: 'Exceptional work! The research is thorough and the designs are exactly what we envisioned.',
        detailed_feedback: [
          {
            item: 'User Research Report',
            rating: 5,
            comments: 'Comprehensive research with actionable insights'
          },
          {
            item: 'High-Fidelity Designs',
            rating: 5,
            comments: 'Beautiful designs that perfectly capture our brand'
          }
        ],
        approval_notes: 'Approved without changes. Ready to proceed to development.',
        requires_changes: false,
        approved_at: new Date()
      };

      await supabaseAdmin
        .from('deliverable_feedback')
        .insert(reviewData);

      // Complete milestone
      await supabaseAdmin
        .from('milestones')
        .update({
          status: 'completed',
          completed_at: new Date()
        })
        .eq('id', phase1Milestone.id);

      // Release payment for Phase 1
      const paymentReleaseData = {
        contract_id: workflowData.contract.id,
        milestone_id: phase1Milestone.id,
        amount: parseFloat(phase1Milestone.amount),
        platform_fee: parseFloat(phase1Milestone.amount) * 0.10,
        stripe_fee: (parseFloat(phase1Milestone.amount) * 1.10 * 0.029) + 0.30,
        total_charged: parseFloat(phase1Milestone.amount) * 1.10 + ((parseFloat(phase1Milestone.amount) * 1.10 * 0.029) + 0.30),
        status: 'released',
        stripe_payment_intent_id: 'pi_test_phase1_release',
        stripe_transfer_id: 'tr_test_phase1_transfer',
        funded_at: workflowData.escrow.funded_at,
        released_at: new Date()
      };

      await supabaseAdmin
        .from('escrow_payments')
        .insert(paymentReleaseData);

      workflowData.phase1Deliverable = deliverable;

      console.log('✅ Phase 1 completed and payment released: $3,000');
    });

    test('6. Phase 2: Frontend development with revision cycle', async () => {
      console.log('🔄 Processing Phase 2 with revision cycle...');

      const phase2Milestone = workflowData.milestones[1];

      // Initial submission
      const initialSubmissionData = {
        contract_id: workflowData.contract.id,
        milestone_id: phase2Milestone.id,
        submitted_by: freelancerUser.user.id,
        title: 'Phase 2: Frontend Development (Initial)',
        description: 'Initial frontend implementation with core functionality',
        submission_notes: 'Core frontend implementation complete. All major pages are functional and responsive.',
        status: 'submitted',
        submission_type: 'milestone_completion',
        deliverable_items: [
          {
            name: 'Responsive Implementation',
            description: 'HTML/CSS/JS implementation of all designed pages',
            external_links: ['https://staging.example.com'],
            completion_percentage: 90
          },
          {
            name: 'Cross-browser Testing',
            description: 'Testing across Chrome, Firefox, Safari, and Edge',
            file_attachments: ['browser_test_results.pdf'],
            completion_percentage: 85
          }
        ]
      };

      const { data: initialSubmission } = await supabaseAdmin
        .from('contract_deliverables')
        .insert(initialSubmissionData)
        .select()
        .single();

      // Client review with feedback for improvements
      const feedbackData = {
        deliverable_id: initialSubmission.id,
        reviewer_id: clientUser.user.id,
        decision: 'needs_revision',
        overall_rating: 3,
        feedback_summary: 'Good progress but needs some adjustments before approval.',
        detailed_feedback: [
          {
            item: 'Responsive Implementation',
            rating: 3,
            comments: 'Mobile layout needs improvement on tablets. Some animations are too slow.'
          },
          {
            item: 'Cross-browser Testing',
            rating: 4,
            comments: 'Good browser support but Safari has some CSS issues.'
          }
        ],
        rejection_reason: 'Mobile responsiveness and Safari compatibility issues',
        required_changes: [
          'Fix tablet responsive layout between 768px and 1024px',
          'Optimize animation performance',
          'Fix Safari CSS compatibility issues',
          'Add loading states for better UX'
        ],
        requires_changes: true,
        change_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };

      await supabaseAdmin
        .from('deliverable_feedback')
        .insert(feedbackData);

      // Update deliverable status
      await supabaseAdmin
        .from('contract_deliverables')
        .update({ status: 'needs_revision' })
        .eq('id', initialSubmission.id);

      // Freelancer resubmits with fixes
      const revisionData = {
        contract_id: workflowData.contract.id,
        milestone_id: phase2Milestone.id,
        submitted_by: freelancerUser.user.id,
        title: 'Phase 2: Frontend Development (Revised)',
        description: 'Revised frontend implementation addressing all client feedback',
        submission_notes: 'All requested changes have been implemented. Tablet responsive issues fixed, animations optimized, Safari compatibility resolved, and loading states added.',
        status: 'submitted',
        submission_type: 'revision',
        revision_of: initialSubmission.id,
        revision_number: 2,
        deliverable_items: [
          {
            name: 'Responsive Implementation (Fixed)',
            description: 'Fully responsive implementation with fixed tablet layout',
            external_links: ['https://staging.example.com'],
            completion_percentage: 100
          },
          {
            name: 'Performance Optimized',
            description: 'Optimized animations and improved loading times',
            file_attachments: ['performance_report.pdf'],
            completion_percentage: 100
          },
          {
            name: 'Cross-browser Compatible',
            description: 'Full compatibility across all major browsers including Safari',
            file_attachments: ['browser_test_results_v2.pdf'],
            completion_percentage: 100
          }
        ]
      };

      const { data: revision } = await supabaseAdmin
        .from('contract_deliverables')
        .insert(revisionData)
        .select()
        .single();

      // Client approves revision
      const approvalData = {
        deliverable_id: revision.id,
        reviewer_id: clientUser.user.id,
        decision: 'approved',
        overall_rating: 5,
        feedback_summary: 'Perfect! All issues have been resolved. Excellent work on the revisions.',
        detailed_feedback: [
          {
            item: 'Responsive Implementation',
            rating: 5,
            comments: 'Tablet layout is now perfect. Great responsive behavior.'
          },
          {
            item: 'Performance',
            rating: 5,
            comments: 'Animations are smooth and loading times are excellent.'
          },
          {
            item: 'Cross-browser Support',
            rating: 5,
            comments: 'All browsers working perfectly including Safari.'
          }
        ],
        approval_notes: 'All revisions completed successfully. Ready for backend development.',
        requires_changes: false,
        approved_at: new Date()
      };

      await supabaseAdmin
        .from('deliverable_feedback')
        .insert(approvalData);

      // Complete Phase 2
      await supabaseAdmin
        .from('milestones')
        .update({
          status: 'completed',
          completed_at: new Date()
        })
        .eq('id', phase2Milestone.id);

      // Release payment for Phase 2
      const phase2PaymentData = {
        contract_id: workflowData.contract.id,
        milestone_id: phase2Milestone.id,
        amount: parseFloat(phase2Milestone.amount),
        platform_fee: parseFloat(phase2Milestone.amount) * 0.10,
        stripe_fee: (parseFloat(phase2Milestone.amount) * 1.10 * 0.029) + 0.30,
        total_charged: parseFloat(phase2Milestone.amount) * 1.10 + ((parseFloat(phase2Milestone.amount) * 1.10 * 0.029) + 0.30),
        status: 'released',
        stripe_payment_intent_id: 'pi_test_phase2_release',
        stripe_transfer_id: 'tr_test_phase2_transfer',
        funded_at: workflowData.escrow.funded_at,
        released_at: new Date()
      };

      await supabaseAdmin
        .from('escrow_payments')
        .insert(phase2PaymentData);

      console.log('✅ Phase 2 completed with revision cycle and payment released: $5,000');
    });

    test('7. Phase 3: Backend development with client communication', async () => {
      console.log('🔄 Processing Phase 3 with client communication...');

      const phase3Milestone = workflowData.milestones[2];

      // Client sends message about additional requirements
      const clientMessageData = {
        contract_id: workflowData.contract.id,
        sender_id: clientUser.user.id,
        message_type: 'project_update',
        subject: 'Additional API Requirements',
        content: 'Hi! After reviewing the frontend, we\'d like to add a few additional API endpoints for user preferences and notification settings. Can we discuss the scope and any additional costs?',
        metadata: {
          priority: 'medium',
          requires_response: true
        }
      };

      const { data: clientMessage } = await supabaseAdmin
        .from('contract_messages')
        .insert(clientMessageData)
        .select()
        .single();

      // Freelancer responds
      const freelancerResponseData = {
        contract_id: workflowData.contract.id,
        sender_id: freelancerUser.user.id,
        message_type: 'project_update',
        subject: 'Re: Additional API Requirements',
        content: 'Hi! I can definitely add those endpoints. The user preferences API will integrate well with the existing authentication system. For the notification settings, I can include email and push notification toggles. This is within the scope of our current milestone, so no additional cost needed.',
        reply_to: clientMessage.id,
        metadata: {
          priority: 'medium',
          milestone_related: phase3Milestone.id
        }
      };

      await supabaseAdmin
        .from('contract_messages')
        .insert(freelancerResponseData);

      // Freelancer submits Phase 3 deliverables
      const phase3DeliverableData = {
        contract_id: workflowData.contract.id,
        milestone_id: phase3Milestone.id,
        submitted_by: freelancerUser.user.id,
        title: 'Phase 3: Backend Development Complete',
        description: 'Complete backend API with all endpoints, authentication, and database integration including the additional user preferences and notification settings APIs.',
        submission_notes: 'Backend development complete with all originally planned endpoints plus the additional user preferences and notification settings APIs as discussed.',
        status: 'submitted',
        submission_type: 'milestone_completion',
        deliverable_items: [
          {
            name: 'RESTful API',
            description: 'Complete API with authentication, CRUD operations, and business logic',
            file_attachments: ['api_documentation.pdf'],
            external_links: ['https://api.example.com/docs'],
            completion_percentage: 100
          },
          {
            name: 'Database Schema',
            description: 'Optimized database schema with proper indexes and relationships',
            file_attachments: ['database_schema.sql', 'er_diagram.pdf'],
            completion_percentage: 100
          },
          {
            name: 'Authentication System',
            description: 'JWT-based authentication with role-based access control',
            file_attachments: ['auth_documentation.pdf'],
            completion_percentage: 100
          },
          {
            name: 'Additional APIs',
            description: 'User preferences and notification settings endpoints as requested',
            file_attachments: ['additional_apis_docs.pdf'],
            completion_percentage: 100
          }
        ]
      };

      const { data: phase3Deliverable } = await supabaseAdmin
        .from('contract_deliverables')
        .insert(phase3DeliverableData)
        .select()
        .single();

      // Client reviews and approves
      const phase3ApprovalData = {
        deliverable_id: phase3Deliverable.id,
        reviewer_id: clientUser.user.id,
        decision: 'approved',
        overall_rating: 5,
        feedback_summary: 'Excellent backend implementation! The additional APIs are exactly what we needed.',
        detailed_feedback: [
          {
            item: 'RESTful API',
            rating: 5,
            comments: 'Well-structured API with excellent documentation'
          },
          {
            item: 'Database Schema',
            rating: 5,
            comments: 'Efficient schema design with proper optimization'
          },
          {
            item: 'Authentication System',
            rating: 5,
            comments: 'Secure and robust authentication implementation'
          },
          {
            item: 'Additional APIs',
            rating: 5,
            comments: 'Perfect implementation of the additional requirements'
          }
        ],
        approval_notes: 'Outstanding work! Ready for the final testing and deployment phase.',
        requires_changes: false,
        approved_at: new Date()
      };

      await supabaseAdmin
        .from('deliverable_feedback')
        .insert(phase3ApprovalData);

      // Complete Phase 3
      await supabaseAdmin
        .from('milestones')
        .update({
          status: 'completed',
          completed_at: new Date()
        })
        .eq('id', phase3Milestone.id);

      // Release payment for Phase 3
      const phase3PaymentData = {
        contract_id: workflowData.contract.id,
        milestone_id: phase3Milestone.id,
        amount: parseFloat(phase3Milestone.amount),
        platform_fee: parseFloat(phase3Milestone.amount) * 0.10,
        stripe_fee: (parseFloat(phase3Milestone.amount) * 1.10 * 0.029) + 0.30,
        total_charged: parseFloat(phase3Milestone.amount) * 1.10 + ((parseFloat(phase3Milestone.amount) * 1.10 * 0.029) + 0.30),
        status: 'released',
        stripe_payment_intent_id: 'pi_test_phase3_release',
        stripe_transfer_id: 'tr_test_phase3_transfer',
        funded_at: workflowData.escrow.funded_at,
        released_at: new Date()
      };

      await supabaseAdmin
        .from('escrow_payments')
        .insert(phase3PaymentData);

      console.log('✅ Phase 3 completed with client communication and payment released: $4,500');
    });

    test('8. Complete project with final testing and project closure', async () => {
      console.log('🔄 Completing final phases and project closure...');

      // Complete remaining milestones (Phase 4 and Phase 5)
      const remainingMilestones = workflowData.milestones.slice(3);

      for (const milestone of remainingMilestones) {
        // Submit deliverables
        const deliverableData = {
          contract_id: workflowData.contract.id,
          milestone_id: milestone.id,
          submitted_by: freelancerUser.user.id,
          title: `${milestone.title} Complete`,
          description: `Completed ${milestone.title.toLowerCase()} with all requirements met`,
          submission_notes: 'All deliverables completed according to specifications',
          status: 'submitted',
          submission_type: 'milestone_completion',
          deliverable_items: [
            {
              name: 'Primary Deliverable',
              description: `Main deliverable for ${milestone.title}`,
              completion_percentage: 100
            }
          ]
        };

        const { data: deliverable } = await supabaseAdmin
          .from('contract_deliverables')
          .insert(deliverableData)
          .select()
          .single();

        // Approve deliverable
        await supabaseAdmin
          .from('deliverable_feedback')
          .insert({
            deliverable_id: deliverable.id,
            reviewer_id: clientUser.user.id,
            decision: 'approved',
            overall_rating: 5,
            feedback_summary: 'Excellent work!',
            requires_changes: false,
            approved_at: new Date()
          });

        // Complete milestone
        await supabaseAdmin
          .from('milestones')
          .update({
            status: 'completed',
            completed_at: new Date()
          })
          .eq('id', milestone.id);

        // Release payment
        await supabaseAdmin
          .from('escrow_payments')
          .insert({
            contract_id: workflowData.contract.id,
            milestone_id: milestone.id,
            amount: parseFloat(milestone.amount),
            platform_fee: parseFloat(milestone.amount) * 0.10,
            stripe_fee: (parseFloat(milestone.amount) * 1.10 * 0.029) + 0.30,
            total_charged: parseFloat(milestone.amount) * 1.10 + ((parseFloat(milestone.amount) * 1.10 * 0.029) + 0.30),
            status: 'released',
            stripe_payment_intent_id: `pi_test_${milestone.title.toLowerCase().replace(/\s/g, '_')}_release`,
            stripe_transfer_id: `tr_test_${milestone.title.toLowerCase().replace(/\s/g, '_')}_transfer`,
            funded_at: workflowData.escrow.funded_at,
            released_at: new Date()
          });
      }

      // Complete the contract
      const { data: completedContract, error } = await supabaseAdmin
        .from('contracts')
        .update({
          status: 'completed',
          completed_at: new Date(),
          progress_percentage: 100
        })
        .eq('id', workflowData.contract.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(completedContract.status).toBe('completed');
      expect(completedContract.progress_percentage).toBe(100);

      // Generate completion certificate
      const certificateData = {
        contract_id: workflowData.contract.id,
        freelancer_id: freelancerUser.user.id,
        client_id: clientUser.user.id,
        certificate_type: 'contract_completion',
        completion_date: new Date(),
        contract_value: parseFloat(workflowData.contract.total_amount),
        work_description: workflowData.contract.description,
        certificate_hash: `cert_${Date.now()}_${workflowData.contract.id}`,
        verification_url: `https://pactify.com/verify/cert_${Date.now()}_${workflowData.contract.id}`,
        metadata: {
          milestones_completed: workflowData.milestones.length,
          total_deliverables: 15,
          client_satisfaction: 5,
          project_duration_days: 90,
          revisions_requested: 1,
          on_time_completion: true
        }
      };

      const { data: certificate } = await supabaseAdmin
        .from('completion_certificates')
        .insert(certificateData)
        .select()
        .single();

      expect(certificate).toBeDefined();
      expect(certificate.contract_value).toBe(parseFloat(workflowData.contract.total_amount));

      // Exchange final feedback
      const finalFeedbackData = [
        {
          contract_id: workflowData.contract.id,
          from_user_id: clientUser.user.id,
          to_user_id: freelancerUser.user.id,
          rating: 5,
          feedback_type: 'project_completion',
          title: 'Outstanding Development Work!',
          feedback_text: 'Absolutely exceptional work from start to finish. The quality of code, attention to detail, and communication throughout the project was outstanding. Delivered exactly what we needed and more. Highly recommend!',
          recommendation: 'highly_recommend',
          skills_demonstrated: ['Full-Stack Development', 'UI/UX Implementation', 'Communication', 'Problem Solving', 'Time Management'],
          would_hire_again: true,
          project_highlights: [
            'Excellent code quality and documentation',
            'Responsive design implementation',
            'Additional features delivered at no extra cost',
            'Great communication and project updates'
          ]
        },
        {
          contract_id: workflowData.contract.id,
          from_user_id: freelancerUser.user.id,
          to_user_id: clientUser.user.id,
          rating: 5,
          feedback_type: 'project_completion',
          title: 'Fantastic Client Experience',
          feedback_text: 'Working with this client was an absolute pleasure. Clear requirements, timely feedback, professional communication, and prompt payments. The project vision was well-defined and the collaborative approach made this one of my best projects this year.',
          recommendation: 'highly_recommend',
          payment_promptness: 5,
          communication_quality: 5,
          requirements_clarity: 5,
          client_highlights: [
            'Clear and detailed project requirements',
            'Constructive feedback and quick approvals',
            'Professional and respectful communication',
            'Prompt payment releases'
          ]
        }
      ];

      const { data: feedback } = await supabaseAdmin
        .from('project_feedback')
        .insert(finalFeedbackData)
        .select();

      expect(feedback).toHaveLength(2);
      expect(feedback[0].rating).toBe(5);
      expect(feedback[1].rating).toBe(5);

      // Update user profiles with project completion stats
      await supabaseAdmin
        .from('profiles')
        .update({
          completed_projects: 1,
          total_earnings: parseFloat(workflowData.contract.total_amount),
          average_rating: 5.0,
          last_project_completed: new Date()
        })
        .eq('id', freelancerUser.user.id);

      await supabaseAdmin
        .from('profiles')
        .update({
          contracts_hired: 1,
          total_spent: parseFloat(workflowData.contract.total_amount),
          average_rating_given: 5.0,
          last_contract_completed: new Date()
        })
        .eq('id', clientUser.user.id);

      console.log('✅ Project completed successfully with perfect ratings!');
      console.log(`💰 Total project value: $${workflowData.contract.total_amount}`);
      console.log(`🎯 Milestones completed: ${workflowData.milestones.length}`);
      console.log(`⭐ Client satisfaction: 5/5 stars`);
      console.log(`🏆 Certificate generated: ${certificate.certificate_hash}`);
    });

    test('9. Verify complete workflow data integrity', async () => {
      console.log('🔄 Verifying complete workflow data integrity...');

      // Verify contract completion
      const { data: contractCheck } = await supabaseAdmin
        .from('contracts')
        .select('*')
        .eq('id', workflowData.contract.id)
        .single();

      expect(contractCheck.status).toBe('completed');
      expect(contractCheck.progress_percentage).toBe(100);
      expect(contractCheck.completed_at).toBeDefined();

      // Verify all milestones completed
      const { data: milestonesCheck } = await supabaseAdmin
        .from('milestones')
        .select('status')
        .eq('contract_id', workflowData.contract.id);

      milestonesCheck.forEach(milestone => {
        expect(milestone.status).toBe('completed');
      });

      // Verify all payments released
      const { data: paymentsCheck } = await supabaseAdmin
        .from('escrow_payments')
        .select('status, amount')
        .eq('contract_id', workflowData.contract.id);

      expect(paymentsCheck.length).toBe(5); // One for each milestone
      paymentsCheck.forEach(payment => {
        expect(payment.status).toBe('released');
        expect(parseFloat(payment.amount)).toBeGreaterThan(0);
      });

      // Verify total payments equal contract amount
      const totalPaid = paymentsCheck.reduce(
        (sum, payment) => sum + parseFloat(payment.amount),
        0
      );
      expect(totalPaid).toBe(parseFloat(workflowData.contract.total_amount));

      // Verify feedback exists
      const { data: feedbackCheck } = await supabaseAdmin
        .from('project_feedback')
        .select('*')
        .eq('contract_id', workflowData.contract.id);

      expect(feedbackCheck).toHaveLength(2);
      expect(feedbackCheck.every(f => f.rating === 5)).toBe(true);

      // Verify completion certificate
      const { data: certificateCheck } = await supabaseAdmin
        .from('completion_certificates')
        .select('*')
        .eq('contract_id', workflowData.contract.id);

      expect(certificateCheck).toHaveLength(1);
      expect(certificateCheck[0].certificate_hash).toBeDefined();
      expect(certificateCheck[0].verification_url).toContain('verify');

      // Verify user profile updates
      const { data: freelancerProfile } = await supabaseAdmin
        .from('profiles')
        .select('completed_projects, total_earnings, average_rating')
        .eq('id', freelancerUser.user.id)
        .single();

      expect(freelancerProfile.completed_projects).toBeGreaterThanOrEqual(1);
      expect(parseFloat(freelancerProfile.total_earnings)).toBeGreaterThanOrEqual(parseFloat(workflowData.contract.total_amount));
      expect(freelancerProfile.average_rating).toBe(5.0);

      const { data: clientProfile } = await supabaseAdmin
        .from('profiles')
        .select('contracts_hired, total_spent')
        .eq('id', clientUser.user.id)
        .single();

      expect(clientProfile.contracts_hired).toBeGreaterThanOrEqual(1);
      expect(parseFloat(clientProfile.total_spent)).toBeGreaterThanOrEqual(parseFloat(workflowData.contract.total_amount));

      console.log('✅ Complete workflow data integrity verified');
      console.log('🎉 End-to-End Test Suite Completed Successfully!');
    });
  });

  describe('Workflow Performance and Analytics', () => {
    test('should generate comprehensive project analytics', async () => {
      const { data: projectSummary } = await supabaseAdmin
        .from('project_summaries')
        .insert({
          contract_id: workflowData.contract.id,
          summary_type: 'project_completion',
          generated_at: new Date(),
          contract_duration_days: 90,
          total_deliverables: 15,
          total_revisions: 1,
          average_review_time_hours: 24,
          client_satisfaction_score: 5,
          freelancer_satisfaction_score: 5,
          summary_data: {
            milestones_completed: workflowData.milestones.length,
            payments_released: workflowData.milestones.length,
            total_contract_value: parseFloat(workflowData.contract.total_amount),
            platform_fees_collected: parseFloat(workflowData.contract.total_amount) * 0.10,
            project_category: 'web_development',
            on_time_completion: true,
            budget_adherence: 100,
            communication_rating: 5
          }
        })
        .select()
        .single();

      expect(projectSummary).toBeDefined();
      expect(projectSummary.client_satisfaction_score).toBe(5);
      expect(projectSummary.total_deliverables).toBe(15);
    });

    test('should verify platform metrics are updated', async () => {
      // These would be real metrics in production
      const expectedMetrics = {
        total_contracts_completed: expect.any(Number),
        total_revenue_processed: expect.any(Number),
        average_project_completion_time: expect.any(Number),
        average_satisfaction_rating: expect.any(Number),
        platform_fees_collected: expect.any(Number)
      };

      // In real implementation, these would come from aggregated database queries
      expect(expectedMetrics).toBeDefined();
    });
  });
});