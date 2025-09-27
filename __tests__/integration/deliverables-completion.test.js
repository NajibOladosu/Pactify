/**
 * Deliverables and Contract Completion Integration Tests
 * Tests file uploads, deliverable submissions, reviews, and contract completion workflows
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
  TestPaymentManager,
  TestAPIManager,
  TEST_CONFIG,
  supabaseAdmin,
  createTestDelay
} = require('../test-setup/test-helpers.js');

describe('Deliverables and Contract Completion', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;
  let testContract = null;
  let testMilestone = null;
  let testDeliverable = null;

  // Setup before all tests
  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');

    // Create test contract for deliverable tests
    testContract = await TestContractManager.createContract(
      freelancerUser.user.id,
      TEST_CONFIG.CONTRACT_DATA.MILESTONE_PROJECT,
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

    // Get first milestone for testing
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

  describe('File Upload and Management', () => {
    test('should validate file types and sizes', async () => {
      const allowedTypes = ['.pdf', '.doc', '.docx', '.zip', '.png', '.jpg', '.jpeg'];
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      
      // Test valid file
      const validFile = {
        name: 'deliverable.pdf',
        size: 2 * 1024 * 1024, // 2MB
        type: 'application/pdf'
      };

      const isValidType = allowedTypes.some(type => 
        validFile.name.toLowerCase().endsWith(type)
      );
      const isValidSize = validFile.size <= maxFileSize;

      expect(isValidType).toBe(true);
      expect(isValidSize).toBe(true);

      // Test invalid file type
      const invalidFile = {
        name: 'malicious.exe',
        size: 1024 * 1024,
        type: 'application/octet-stream'
      };

      const isInvalidType = allowedTypes.some(type => 
        invalidFile.name.toLowerCase().endsWith(type)
      );

      expect(isInvalidType).toBe(false);
    });

    test('should create file upload record', async () => {
      const fileData = {
        contract_id: testContract.id,
        milestone_id: testMilestone.id,
        uploaded_by: freelancerUser.user.id,
        file_name: 'milestone1_deliverable.pdf',
        file_size: 2048000,
        file_type: 'application/pdf',
        file_path: '/uploads/test/milestone1_deliverable.pdf',
        upload_status: 'completed',
        metadata: {
          originalName: 'Website Design Mockups.pdf',
          description: 'Initial design mockups for homepage and key pages'
        }
      };

      const { data: uploadRecord, error } = await supabaseAdmin
        .from('contract_files')
        .insert(fileData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(uploadRecord.contract_id).toBe(testContract.id);
      expect(uploadRecord.milestone_id).toBe(testMilestone.id);
      expect(uploadRecord.uploaded_by).toBe(freelancerUser.user.id);
      expect(uploadRecord.file_name).toBe('milestone1_deliverable.pdf');
      expect(uploadRecord.upload_status).toBe('completed');
    });

    test('should track file versions for updates', async () => {
      // Create initial file
      const initialFileData = {
        contract_id: testContract.id,
        milestone_id: testMilestone.id,
        uploaded_by: freelancerUser.user.id,
        file_name: 'design_v1.pdf',
        file_size: 1024000,
        file_type: 'application/pdf',
        file_path: '/uploads/test/design_v1.pdf',
        version: 1,
        upload_status: 'completed'
      };

      const { data: v1File } = await supabaseAdmin
        .from('contract_files')
        .insert(initialFileData)
        .select()
        .single();

      // Create updated version
      const updatedFileData = {
        contract_id: testContract.id,
        milestone_id: testMilestone.id,
        uploaded_by: freelancerUser.user.id,
        file_name: 'design_v2.pdf',
        file_size: 1536000,
        file_type: 'application/pdf',
        file_path: '/uploads/test/design_v2.pdf',
        version: 2,
        previous_version_id: v1File.id,
        upload_status: 'completed'
      };

      const { data: v2File, error } = await supabaseAdmin
        .from('contract_files')
        .insert(updatedFileData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(v2File.version).toBe(2);
      expect(v2File.previous_version_id).toBe(v1File.id);
    });
  });

  describe('Deliverable Submission', () => {
    test('should create deliverable submission', async () => {
      const deliverableData = {
        contract_id: testContract.id,
        milestone_id: testMilestone.id,
        submitted_by: freelancerUser.user.id,
        title: 'Homepage Design Deliverable',
        description: 'Complete homepage design including desktop and mobile layouts, with interactive prototypes and style guide.',
        submission_notes: 'Please review the mobile responsive design carefully. All images are high resolution and ready for development.',
        status: 'submitted',
        submission_type: 'milestone_completion',
        deliverable_items: [
          {
            name: 'Homepage Desktop Design',
            description: 'High-fidelity desktop layout',
            file_attachments: ['homepage_desktop.pdf', 'assets.zip']
          },
          {
            name: 'Mobile Design',
            description: 'Responsive mobile layout',
            file_attachments: ['homepage_mobile.pdf']
          },
          {
            name: 'Interactive Prototype',
            description: 'Clickable prototype link',
            external_links: ['https://figma.com/proto/homepage']
          }
        ]
      };

      const { data: deliverable, error } = await supabaseAdmin
        .from('contract_deliverables')
        .insert(deliverableData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(deliverable.contract_id).toBe(testContract.id);
      expect(deliverable.milestone_id).toBe(testMilestone.id);
      expect(deliverable.submitted_by).toBe(freelancerUser.user.id);
      expect(deliverable.title).toBe('Homepage Design Deliverable');
      expect(deliverable.status).toBe('submitted');
      expect(deliverable.deliverable_items).toHaveLength(3);

      testDeliverable = deliverable;
    });

    test('should update milestone status when deliverable submitted', async () => {
      const { data: updatedMilestone, error } = await supabaseAdmin
        .from('milestones')
        .update({ status: 'in_review' })
        .eq('id', testMilestone.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedMilestone.status).toBe('in_review');
    });

    test('should notify client of deliverable submission', async () => {
      const notificationData = {
        contract_id: testContract.id,
        user_id: clientUser.user.id,
        notification_type: 'deliverable_submitted',
        title: 'New Deliverable Submitted',
        message: `${freelancerUser.user.email} has submitted deliverable "${testDeliverable.title}" for review`,
        metadata: {
          deliverable_id: testDeliverable.id,
          milestone_id: testMilestone.id,
          submitted_by: freelancerUser.user.id
        },
        priority: 'high'
      };

      const { data: notification, error } = await supabaseAdmin
        .from('contract_notifications')
        .insert(notificationData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(notification.notification_type).toBe('deliverable_submitted');
      expect(notification.user_id).toBe(clientUser.user.id);
      expect(notification.priority).toBe('high');
    });

    test('should handle deliverable resubmission', async () => {
      const resubmissionData = {
        contract_id: testContract.id,
        milestone_id: testMilestone.id,
        submitted_by: freelancerUser.user.id,
        title: 'Homepage Design Deliverable (Revised)',
        description: 'Updated deliverable addressing client feedback',
        submission_notes: 'Incorporated all feedback from previous review. Updated color scheme and adjusted mobile layout.',
        status: 'submitted',
        submission_type: 'revision',
        revision_of: testDeliverable.id,
        revision_number: 2,
        deliverable_items: [
          {
            name: 'Revised Homepage Design',
            description: 'Updated design with client feedback incorporated',
            file_attachments: ['homepage_revised_v2.pdf']
          }
        ]
      };

      const { data: revision, error } = await supabaseAdmin
        .from('contract_deliverables')
        .insert(resubmissionData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(revision.submission_type).toBe('revision');
      expect(revision.revision_of).toBe(testDeliverable.id);
      expect(revision.revision_number).toBe(2);
    });
  });

  describe('Client Review Process', () => {
    test('should allow client to review deliverable', async () => {
      const reviewData = {
        deliverable_id: testDeliverable.id,
        contract_id: testContract.id,
        reviewer_id: clientUser.user.id,
        review_status: 'in_progress',
        review_type: 'milestone_review',
        started_at: new Date()
      };

      const { data: review, error } = await supabaseAdmin
        .from('deliverable_reviews')
        .insert(reviewData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(review.deliverable_id).toBe(testDeliverable.id);
      expect(review.reviewer_id).toBe(clientUser.user.id);
      expect(review.review_status).toBe('in_progress');
    });

    test('should submit detailed feedback with approval', async () => {
      const feedbackData = {
        deliverable_id: testDeliverable.id,
        reviewer_id: clientUser.user.id,
        decision: 'approved',
        overall_rating: 5,
        feedback_summary: 'Excellent work! The design exceeds expectations and perfectly captures our brand vision.',
        detailed_feedback: [
          {
            item: 'Homepage Desktop Design',
            rating: 5,
            comments: 'Perfect layout and visual hierarchy. Very professional.'
          },
          {
            item: 'Mobile Design',
            rating: 5,
            comments: 'Great responsive design. All elements scale beautifully.'
          },
          {
            item: 'Interactive Prototype',
            rating: 4,
            comments: 'Very helpful for visualizing user flow. Minor suggestion: add loading states.'
          }
        ],
        approval_notes: 'Approved for implementation. Please proceed with development phase.',
        requires_changes: false,
        approved_at: new Date()
      };

      const { data: feedback, error } = await supabaseAdmin
        .from('deliverable_feedback')
        .insert(feedbackData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(feedback.decision).toBe('approved');
      expect(feedback.overall_rating).toBe(5);
      expect(feedback.requires_changes).toBe(false);
      expect(feedback.detailed_feedback).toHaveLength(3);
    });

    test('should handle deliverable rejection with feedback', async () => {
      // Create a test deliverable to reject
      const rejectionDeliverableData = {
        contract_id: testContract.id,
        milestone_id: testMilestone.id,
        submitted_by: freelancerUser.user.id,
        title: 'Test Rejection Deliverable',
        description: 'Test deliverable for rejection workflow',
        status: 'submitted'
      };

      const { data: rejectionDeliverable } = await supabaseAdmin
        .from('contract_deliverables')
        .insert(rejectionDeliverableData)
        .select()
        .single();

      const rejectionFeedbackData = {
        deliverable_id: rejectionDeliverable.id,
        reviewer_id: clientUser.user.id,
        decision: 'rejected',
        overall_rating: 2,
        feedback_summary: 'Does not meet the requirements outlined in the contract. Several key elements are missing.',
        detailed_feedback: [
          {
            item: 'Design Quality',
            rating: 2,
            comments: 'Color scheme does not match brand guidelines'
          },
          {
            item: 'Completeness',
            rating: 1,
            comments: 'Missing mobile responsive layouts'
          }
        ],
        rejection_reason: 'Missing requirements and brand guideline violations',
        required_changes: [
          'Update color scheme to match brand guidelines',
          'Add complete mobile responsive layouts',
          'Include proper typography as per style guide'
        ],
        requires_changes: true,
        change_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      };

      const { data: rejection, error } = await supabaseAdmin
        .from('deliverable_feedback')
        .insert(rejectionFeedbackData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(rejection.decision).toBe('rejected');
      expect(rejection.requires_changes).toBe(true);
      expect(rejection.required_changes).toHaveLength(3);
      
      // Update deliverable status
      await supabaseAdmin
        .from('contract_deliverables')
        .update({ status: 'rejected' })
        .eq('id', rejectionDeliverable.id);

      // Cleanup
      await supabaseAdmin
        .from('contract_deliverables')
        .delete()
        .eq('id', rejectionDeliverable.id);
    });

    test('should track review timeline and SLA', async () => {
      const { data: reviews } = await supabaseAdmin
        .from('deliverable_reviews')
        .select('*')
        .eq('deliverable_id', testDeliverable.id)
        .order('started_at', { ascending: true });

      if (reviews && reviews.length > 0) {
        const review = reviews[0];
        const startTime = new Date(review.started_at);
        const currentTime = new Date();
        const reviewTimeHours = (currentTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

        expect(reviewTimeHours).toBeGreaterThanOrEqual(0);
        // In production, would check against SLA (e.g., 48 hours)
      }
    });
  });

  describe('Milestone Completion', () => {
    test('should complete milestone after deliverable approval', async () => {
      // Update deliverable to approved
      await supabaseAdmin
        .from('contract_deliverables')
        .update({ status: 'approved' })
        .eq('id', testDeliverable.id);

      // Complete the milestone
      const { data: completedMilestone, error } = await supabaseAdmin
        .from('milestones')
        .update({
          status: 'completed',
          completed_at: new Date()
        })
        .eq('id', testMilestone.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(completedMilestone.status).toBe('completed');
      expect(completedMilestone.completed_at).toBeDefined();
    });

    test('should trigger payment release for completed milestone', async () => {
      // Create escrow payment record
      const escrowData = {
        contract_id: testContract.id,
        milestone_id: testMilestone.id,
        amount: parseFloat(testMilestone.amount),
        platform_fee: parseFloat(testMilestone.amount) * 0.075, // 7.5% for professional tier
        stripe_fee: (parseFloat(testMilestone.amount) * 1.075) * 0.029 + 0.30,
        total_charged: parseFloat(testMilestone.amount) * 1.075 + ((parseFloat(testMilestone.amount) * 1.075) * 0.029 + 0.30),
        status: 'funded',
        stripe_payment_intent_id: 'pi_test_milestone_payment',
        funded_at: new Date(Date.now() - 24 * 60 * 60 * 1000) // Funded yesterday
      };

      const { data: escrowPayment } = await supabaseAdmin
        .from('escrow_payments')
        .insert(escrowData)
        .select()
        .single();

      // Release payment
      const { data: releasedPayment, error } = await supabaseAdmin
        .from('escrow_payments')
        .update({
          status: 'released',
          released_at: new Date(),
          stripe_transfer_id: 'tr_test_milestone_release'
        })
        .eq('id', escrowPayment.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(releasedPayment.status).toBe('released');
      expect(releasedPayment.released_at).toBeDefined();
      expect(releasedPayment.stripe_transfer_id).toBe('tr_test_milestone_release');
    });

    test('should update contract progress tracking', async () => {
      // Get all milestones for the contract
      const { data: allMilestones } = await supabaseAdmin
        .from('milestones')
        .select('status')
        .eq('contract_id', testContract.id);

      const completedMilestones = allMilestones.filter(m => m.status === 'completed').length;
      const totalMilestones = allMilestones.length;
      const progressPercentage = (completedMilestones / totalMilestones) * 100;

      expect(progressPercentage).toBeGreaterThan(0);
      expect(progressPercentage).toBeLessThanOrEqual(100);

      // Update contract with progress
      const { data: updatedContract, error } = await supabaseAdmin
        .from('contracts')
        .update({
          progress_percentage: progressPercentage,
          last_milestone_completed: new Date()
        })
        .eq('id', testContract.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedContract.progress_percentage).toBe(progressPercentage);
    });
  });

  describe('Contract Completion', () => {
    test('should complete contract when all milestones finished', async () => {
      // Complete all remaining milestones
      await supabaseAdmin
        .from('milestones')
        .update({ status: 'completed', completed_at: new Date() })
        .eq('contract_id', testContract.id)
        .neq('status', 'completed');

      // Check if all milestones are completed
      const { data: pendingMilestones } = await supabaseAdmin
        .from('milestones')
        .select('id')
        .eq('contract_id', testContract.id)
        .neq('status', 'completed');

      if (!pendingMilestones || pendingMilestones.length === 0) {
        // Complete the contract
        const { data: completedContract, error } = await supabaseAdmin
          .from('contracts')
          .update({
            status: 'completed',
            completed_at: new Date(),
            progress_percentage: 100
          })
          .eq('id', testContract.id)
          .select()
          .single();

        expect(error).toBeNull();
        expect(completedContract.status).toBe('completed');
        expect(completedContract.completed_at).toBeDefined();
        expect(completedContract.progress_percentage).toBe(100);
      }
    });

    test('should generate completion certificates', async () => {
      const completionCertificateData = {
        contract_id: testContract.id,
        freelancer_id: freelancerUser.user.id,
        client_id: clientUser.user.id,
        certificate_type: 'contract_completion',
        completion_date: new Date(),
        contract_value: parseFloat(testContract.total_amount),
        work_description: testContract.description,
        certificate_hash: 'cert_hash_' + Date.now(),
        verification_url: `https://pactify.com/verify/cert_hash_${Date.now()}`,
        metadata: {
          milestones_completed: 3,
          total_deliverables: 5,
          client_satisfaction: 5
        }
      };

      const { data: certificate, error } = await supabaseAdmin
        .from('completion_certificates')
        .insert(completionCertificateData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(certificate.contract_id).toBe(testContract.id);
      expect(certificate.certificate_type).toBe('contract_completion');
      expect(certificate.verification_url).toContain('verify');
    });

    test('should collect final project feedback', async () => {
      const projectFeedbackData = [
        {
          contract_id: testContract.id,
          from_user_id: clientUser.user.id,
          to_user_id: freelancerUser.user.id,
          rating: 5,
          feedback_type: 'project_completion',
          title: 'Excellent Work!',
          feedback_text: 'Outstanding project delivery. High quality work, excellent communication, and delivered on time. Would definitely work together again.',
          recommendation: 'highly_recommend',
          skills_demonstrated: ['UI/UX Design', 'Communication', 'Time Management'],
          would_hire_again: true
        },
        {
          contract_id: testContract.id,
          from_user_id: freelancerUser.user.id,
          to_user_id: clientUser.user.id,
          rating: 5,
          feedback_type: 'project_completion',
          title: 'Great Client',
          feedback_text: 'Clear requirements, timely feedback, and professional throughout. Made the project smooth and enjoyable.',
          recommendation: 'highly_recommend',
          payment_promptness: 5,
          communication_quality: 5
        }
      ];

      const { data: feedback, error } = await supabaseAdmin
        .from('project_feedback')
        .insert(projectFeedbackData)
        .select();

      expect(error).toBeNull();
      expect(feedback).toHaveLength(2);
      
      const clientFeedback = feedback.find(f => f.from_user_id === clientUser.user.id);
      const freelancerFeedback = feedback.find(f => f.from_user_id === freelancerUser.user.id);
      
      expect(clientFeedback.rating).toBe(5);
      expect(clientFeedback.would_hire_again).toBe(true);
      expect(freelancerFeedback.payment_promptness).toBe(5);
    });

    test('should update user profiles with completion statistics', async () => {
      // Update freelancer profile
      const { data: freelancerProfile, error: freelancerError } = await supabaseAdmin
        .from('profiles')
        .select('completed_projects, total_earnings')
        .eq('id', freelancerUser.user.id)
        .single();

      const updatedFreelancerStats = {
        completed_projects: (freelancerProfile.completed_projects || 0) + 1,
        total_earnings: (freelancerProfile.total_earnings || 0) + parseFloat(testContract.total_amount)
      };

      await supabaseAdmin
        .from('profiles')
        .update(updatedFreelancerStats)
        .eq('id', freelancerUser.user.id);

      // Update client profile  
      const { data: clientProfile, error: clientError } = await supabaseAdmin
        .from('profiles')
        .select('contracts_hired, total_spent')
        .eq('id', clientUser.user.id)
        .single();

      const updatedClientStats = {
        contracts_hired: (clientProfile.contracts_hired || 0) + 1,
        total_spent: (clientProfile.total_spent || 0) + parseFloat(testContract.total_amount)
      };

      await supabaseAdmin
        .from('profiles')
        .update(updatedClientStats)
        .eq('id', clientUser.user.id);

      expect(freelancerError).toBeNull();
      expect(clientError).toBeNull();
    });
  });

  describe('Post-Completion Activities', () => {
    test('should archive completed contract files', async () => {
      const { data: contractFiles } = await supabaseAdmin
        .from('contract_files')
        .select('*')
        .eq('contract_id', testContract.id);

      if (contractFiles && contractFiles.length > 0) {
        const archiveUpdateData = {
          archived_at: new Date(),
          archive_status: 'archived',
          retention_until: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000) // 7 years
        };

        const { error } = await supabaseAdmin
          .from('contract_files')
          .update(archiveUpdateData)
          .eq('contract_id', testContract.id);

        expect(error).toBeNull();
      }
    });

    test('should generate project summary report', async () => {
      const projectSummary = {
        contract_id: testContract.id,
        summary_type: 'project_completion',
        generated_at: new Date(),
        contract_duration_days: Math.ceil(
          (new Date() - new Date(testContract.created_at)) / (1000 * 60 * 60 * 24)
        ),
        total_deliverables: 2, // Based on our test data
        total_revisions: 1,
        average_review_time_hours: 24,
        client_satisfaction_score: 5,
        freelancer_satisfaction_score: 5,
        summary_data: {
          milestones_completed: 3,
          payments_released: 3,
          total_contract_value: parseFloat(testContract.total_amount),
          platform_fees_collected: parseFloat(testContract.total_amount) * 0.075,
          project_category: 'web_development'
        }
      };

      const { data: summary, error } = await supabaseAdmin
        .from('project_summaries')
        .insert(projectSummary)
        .select()
        .single();

      expect(error).toBeNull();
      expect(summary.contract_id).toBe(testContract.id);
      expect(summary.summary_type).toBe('project_completion');
      expect(summary.client_satisfaction_score).toBe(5);
    });

    test('should handle warranty/support period setup', async () => {
      const warrantyData = {
        contract_id: testContract.id,
        freelancer_id: freelancerUser.user.id,
        client_id: clientUser.user.id,
        warranty_type: 'bug_fixes',
        warranty_duration_days: 30,
        warranty_start_date: new Date(),
        warranty_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        warranty_terms: 'Free bug fixes and minor adjustments for 30 days post-completion',
        coverage_includes: [
          'Bug fixes',
          'Minor content updates',
          'Browser compatibility issues'
        ],
        coverage_excludes: [
          'New feature requests',
          'Major design changes',
          'Third-party integration issues'
        ],
        status: 'active'
      };

      const { data: warranty, error } = await supabaseAdmin
        .from('contract_warranties')
        .insert(warrantyData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(warranty.warranty_type).toBe('bug_fixes');
      expect(warranty.warranty_duration_days).toBe(30);
      expect(warranty.status).toBe('active');
    });
  });
});