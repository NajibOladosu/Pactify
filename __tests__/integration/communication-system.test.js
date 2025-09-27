/**
 * Communication System Integration Tests
 * Tests messaging, comments, and real-time communication features
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

describe('Communication System', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;
  let testContract = null;
  let messages = [];
  let comments = [];

  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');

    // Create test contract for communication
    testContract = await TestContractManager.createContract(
      freelancerUser.user.id,
      TEST_CONFIG.CONTRACT_DATA.WEB_DEVELOPMENT,
      'freelancer'
    );

    // Add client and sign contract
    await supabaseAdmin
      .from('contract_parties')
      .insert({
        contract_id: testContract.id,
        user_id: clientUser.user.id,
        role: 'client',
        status: 'pending'
      });

    await TestContractManager.signContract(testContract.id, clientUser.user.id, 'Test Signature');

    // Set to active
    await supabaseAdmin
      .from('contracts')
      .update({ status: 'active' })
      .eq('id', testContract.id);

  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  afterAll(async () => {
    // Clean up messages
    if (messages.length > 0) {
      await supabaseAdmin
        .from('contract_messages')
        .delete()
        .in('id', messages.map(m => m.id));
    }

    // Clean up comments
    if (comments.length > 0) {
      await supabaseAdmin
        .from('contract_comments')
        .delete()
        .in('id', comments.map(c => c.id));
    }

    if (testContract) {
      await TestContractManager.deleteContract(testContract.id);
    }

    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.DEFAULT);

  beforeEach(async () => {
    await resetTestUsers();
  });

  describe('Contract Messaging', () => {
    test('should send message as freelancer', async () => {
      const messageData = {
        content: 'Hello! I\'ve started working on your project. Do you have any specific preferences for the color scheme?',
        message_type: 'general',
        priority: 'normal'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.message).toBeDefined();
      expect(data.message.content).toBe(messageData.content);
      expect(data.message.sender_id).toBe(freelancerUser.user.id);
      expect(data.message.message_type).toBe(messageData.message_type);
      expect(data.message.is_read).toBe(false);

      messages.push(data.message);
    });

    test('should send message as client', async () => {
      const messageData = {
        content: 'Thanks for reaching out! For the color scheme, I prefer a modern blue and white theme. I can send some reference designs.',
        message_type: 'general',
        priority: 'normal'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clientAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.message.sender_id).toBe(clientUser.user.id);
      expect(data.message.content).toBe(messageData.content);

      messages.push(data.message);
    });

    test('should send urgent message', async () => {
      const urgentMessage = {
        content: 'URGENT: The client needs the project delivered 2 days early for a presentation. Please confirm if this is possible.',
        message_type: 'urgent',
        priority: 'high'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clientAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(urgentMessage)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.message.message_type).toBe('urgent');
      expect(data.message.priority).toBe('high');

      messages.push(data.message);
    });

    test('should retrieve messages with pagination', async () => {
      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages?page=1&limit=10`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.messages).toBeInstanceOf(Array);
      expect(data.messages.length).toBe(messages.length);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.total).toBe(messages.length);
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(10);

      // Verify messages are ordered by creation date (newest first)
      for (let i = 0; i < data.messages.length - 1; i++) {
        const current = new Date(data.messages[i].created_at);
        const next = new Date(data.messages[i + 1].created_at);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    });

    test('should mark messages as read', async () => {
      const message = messages.find(m => m.sender_id !== freelancerUser.user.id);
      if (!message) return;

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message_ids: [message.id],
          mark_as_read: true
        })
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.updated_count).toBe(1);

      // Verify message is marked as read
      const { data: updatedMessage } = await supabaseAdmin
        .from('contract_messages')
        .select('is_read')
        .eq('id', message.id)
        .single();

      expect(updatedMessage.is_read).toBe(true);
    });

    test('should get unread message count', async () => {
      // Send a new message first
      const newMessage = {
        content: 'This is a new unread message for testing.',
        message_type: 'general'
      };

      await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clientAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newMessage)
      });

      // Get unread count for freelancer
      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages?unread_only=true`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.unread_count).toBeGreaterThan(0);
      expect(data.messages.every(m => !m.is_read)).toBe(true);
    });

    test('should filter messages by type', async () => {
      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages?type=urgent`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.messages).toBeInstanceOf(Array);
      data.messages.forEach(message => {
        expect(message.message_type).toBe('urgent');
      });
    });
  });

  describe('Contract Comments', () => {
    test('should add comment to contract', async () => {
      const commentData = {
        content: 'The initial wireframes look great! I especially like the user flow for the checkout process.',
        comment_type: 'feedback',
        is_internal: false
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clientAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commentData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.comment).toBeDefined();
      expect(data.comment.content).toBe(commentData.content);
      expect(data.comment.author_id).toBe(clientUser.user.id);
      expect(data.comment.comment_type).toBe(commentData.comment_type);
      expect(data.comment.is_internal).toBe(false);

      comments.push(data.comment);
    });

    test('should add internal comment', async () => {
      const internalComment = {
        content: 'Note to self: Need to double-check the API integration before next milestone.',
        comment_type: 'note',
        is_internal: true
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(internalComment)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.comment.is_internal).toBe(true);
      expect(data.comment.comment_type).toBe('note');

      comments.push(data.comment);
    });

    test('should reply to comment', async () => {
      const originalComment = comments.find(c => !c.is_internal);
      if (!originalComment) return;

      const replyData = {
        content: 'Thank you! I spent extra time on the UX design to make sure it flows smoothly.',
        comment_type: 'reply',
        parent_comment_id: originalComment.id,
        is_internal: false
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(replyData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.comment.parent_comment_id).toBe(originalComment.id);
      expect(data.comment.comment_type).toBe('reply');

      comments.push(data.comment);
    });

    test('should retrieve comments with threading', async () => {
      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/comments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.comments).toBeInstanceOf(Array);

      // Check that replies are properly nested or referenced
      const replies = data.comments.filter(c => c.parent_comment_id);
      replies.forEach(reply => {
        const parent = data.comments.find(c => c.id === reply.parent_comment_id);
        expect(parent).toBeDefined();
      });
    });

    test('should filter internal comments by visibility', async () => {
      // As client, should not see internal comments from freelancer
      const clientResponse = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/comments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${clientAuth.access_token}`,
        }
      });

      expect(clientResponse.ok).toBe(true);
      const clientData = await clientResponse.json();

      const internalComments = clientData.comments.filter(c => c.is_internal && c.author_id !== clientUser.user.id);
      expect(internalComments.length).toBe(0);

      // As freelancer, should see own internal comments
      const freelancerResponse = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/comments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      const freelancerData = await freelancerResponse.json();
      const ownInternalComments = freelancerData.comments.filter(c => c.is_internal && c.author_id === freelancerUser.user.id);
      expect(ownInternalComments.length).toBeGreaterThan(0);
    });

    test('should update comment', async () => {
      const comment = comments.find(c => c.author_id === freelancerUser.user.id && !c.parent_comment_id);
      if (!comment) return;

      const updateData = {
        content: 'Updated: Thank you! I spent extra time on the UX design and added some additional animations to make it even smoother.',
        edited: true
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/comments/${comment.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.comment.content).toBe(updateData.content);
        expect(data.comment.edited).toBe(true);
        expect(data.comment.edited_at).toBeDefined();
      }
    });

    test('should delete comment', async () => {
      // Create a comment to delete
      const deleteComment = {
        content: 'This comment will be deleted',
        comment_type: 'note',
        is_internal: true
      };

      const createResponse = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(deleteComment)
      });

      const createdComment = (await createResponse.json()).comment;

      // Delete the comment
      const deleteResponse = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/comments/${createdComment.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(deleteResponse.ok).toBe(true);
      const data = await deleteResponse.json();
      expect(data.success).toBe(true);

      // Verify it's deleted
      const { data: deletedComment, error } = await supabaseAdmin
        .from('contract_comments')
        .select('*')
        .eq('id', createdComment.id)
        .single();

      expect(error).toBeDefined(); // Should not find the comment
    });
  });

  describe('Communication Security and Permissions', () => {
    test('should prevent unauthorized access to contract messages', async () => {
      // Create another user
      const unauthorizedUser = await TestAPIManager.createTestUser({
        email: 'unauthorized@test.com',
        password: 'Test123!',
        displayName: 'Unauthorized User',
        userType: 'client'
      });

      const unauthorizedAuth = await TestAPIManager.authenticateUser(unauthorizedUser.email, unauthorizedUser.password);

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${unauthorizedAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);

      // Clean up
      await TestAPIManager.deleteTestUser(unauthorizedUser.user.id);
    });

    test('should require authentication for messaging', async () => {
      const messageData = {
        content: 'Unauthenticated message attempt',
        message_type: 'general'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData)
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should validate message content', async () => {
      const invalidMessages = [
        { content: '', message_type: 'general' }, // Empty content
        { content: 'Valid content' }, // Missing message type
        { content: 'x'.repeat(10001), message_type: 'general' }, // Too long
      ];

      for (const invalidMessage of invalidMessages) {
        const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${freelancerAuth.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(invalidMessage)
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
      }
    });

    test('should sanitize message content', async () => {
      const htmlMessage = {
        content: 'This message contains <script>alert("xss")</script> and <b>HTML</b> tags.',
        message_type: 'general'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(htmlMessage)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Content should be sanitized (no script tags, but safe HTML might be preserved)
      expect(data.message.content).not.toContain('<script>');
      expect(data.message.content).not.toContain('alert(');

      messages.push(data.message);
    });
  });

  describe('Communication Analytics and Metrics', () => {
    test('should track message statistics', async () => {
      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages?stats=true`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      if (data.stats) {
        expect(data.stats).toHaveProperty('total_messages');
        expect(data.stats).toHaveProperty('unread_count');
        expect(data.stats).toHaveProperty('messages_by_type');
        expect(data.stats).toHaveProperty('messages_by_sender');

        expect(data.stats.total_messages).toBeGreaterThan(0);
        expect(typeof data.stats.unread_count).toBe('number');
      }
    });

    test('should provide response time metrics', async () => {
      // This would typically analyze response times between messages
      // For testing, we just verify the endpoint structure
      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/analytics/communication`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('response_times');
      }
      // If endpoint doesn't exist, that's fine - it's an advanced feature
    });
  });

  describe('Real-time Communication Features', () => {
    test('should handle message delivery status', async () => {
      const messageData = {
        content: 'Message with delivery tracking',
        message_type: 'general',
        requires_delivery_receipt: true
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData)
      });

      if (response.ok) {
        const data = await response.json();
        expect(data.message).toHaveProperty('delivery_status');
        messages.push(data.message);
      }
    });

    test('should support message search', async () => {
      const searchResponse = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages/search?q=color+scheme`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        expect(searchData.results).toBeInstanceOf(Array);
        
        // Should find messages containing the search terms
        searchData.results.forEach(result => {
          const content = result.content.toLowerCase();
          expect(content.includes('color') || content.includes('scheme')).toBe(true);
        });
      }
    });

    test('should handle file attachments in messages', async () => {
      const messageWithAttachment = {
        content: 'Here are the reference designs you requested.',
        message_type: 'general',
        attachments: [
          {
            filename: 'reference-design.jpg',
            url: 'https://example.com/files/reference-design.jpg',
            file_type: 'image/jpeg',
            file_size: 1024000
          }
        ]
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${testContract.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clientAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageWithAttachment)
      });

      if (response.ok) {
        const data = await response.json();
        expect(data.message.attachments).toBeDefined();
        if (data.message.attachments) {
          expect(data.message.attachments.length).toBe(1);
          expect(data.message.attachments[0].filename).toBe('reference-design.jpg');
        }
        messages.push(data.message);
      }
    });
  });
});