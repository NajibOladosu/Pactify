/**
 * Time Tracking Integration Tests
 * Tests time tracking functionality for hourly contracts using real API endpoints
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
  TestAPIManager,
  TEST_CONFIG,
  supabaseAdmin,
  createTestDelay
} from '../test-setup/test-helpers.js';

describe('Time Tracking System', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;
  let hourlyContract = null;
  let timeEntries = [];
  let timeSession = null;

  // Hourly contract data
  const HOURLY_CONTRACT_DATA = {
    title: 'Hourly Web Development Project',
    description: 'Frontend development work billed hourly',
    type: 'hourly',
    hourly_rate: 75,
    currency: 'USD',
    estimated_hours: 40,
    startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    termsAndConditions: `
1. Hourly Rate: $75/hour
2. Time tracking required for all work
3. Weekly time reports provided
4. Maximum 8 hours per day unless pre-approved
5. Overtime rate: $112.50/hour (1.5x) for hours over 40/week
    `.trim()
  };

  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');

    // Create hourly contract for testing
    hourlyContract = await TestContractManager.createContract(
      freelancerUser.user.id,
      HOURLY_CONTRACT_DATA,
      'freelancer'
    );

    // Add client to contract and sign it
    await supabaseAdmin
      .from('contract_parties')
      .insert({
        contract_id: hourlyContract.id,
        user_id: clientUser.user.id,
        role: 'client',
        status: 'pending'
      });

    // Sign contract as both parties
    await TestContractManager.signContract(
      hourlyContract.id,
      clientUser.user.id,
      'Client Digital Signature'
    );

    // Set contract to active status
    await supabaseAdmin
      .from('contracts')
      .update({ status: 'active' })
      .eq('id', hourlyContract.id);

  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  afterAll(async () => {
    // Clean up time entries
    if (timeEntries.length > 0) {
      await supabaseAdmin
        .from('time_entries')
        .delete()
        .in('id', timeEntries.map(e => e.id));
    }

    // Clean up time session
    if (timeSession) {
      await supabaseAdmin
        .from('time_tracking_sessions')
        .delete()
        .eq('id', timeSession.id);
    }

    // Clean up contract
    if (hourlyContract) {
      await TestContractManager.deleteContract(hourlyContract.id);
    }

    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.DEFAULT);

  beforeEach(async () => {
    await resetTestUsers();
  });

  describe('Time Entry Management', () => {
    test('should create time entry for hourly contract', async () => {
      const timeEntryData = {
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
        description: 'Frontend component development',
        task_category: 'development'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(timeEntryData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.timeEntry).toBeDefined();
      expect(data.timeEntry.contract_id).toBe(hourlyContract.id);
      expect(data.timeEntry.user_id).toBe(freelancerUser.user.id);
      expect(data.timeEntry.description).toBe(timeEntryData.description);
      expect(data.timeEntry.task_category).toBe(timeEntryData.task_category);
      expect(data.timeEntry.status).toBe('pending');
      expect(data.timeEntry.hours_logged).toBeCloseTo(2, 1);

      timeEntries.push(data.timeEntry);
    });

    test('should calculate hours correctly', async () => {
      const startTime = new Date('2024-01-15T09:00:00Z');
      const endTime = new Date('2024-01-15T13:30:00Z'); // 4.5 hours

      const timeEntryData = {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        description: 'API development and testing',
        task_category: 'development'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(timeEntryData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.timeEntry.hours_logged).toBeCloseTo(4.5, 1);
      timeEntries.push(data.timeEntry);
    });

    test('should reject time entry with end time before start time', async () => {
      const timeEntryData = {
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        description: 'Invalid time entry',
        task_category: 'development'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(timeEntryData)
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('end time');
    });

    test('should reject excessively long time entries', async () => {
      const timeEntryData = {
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // 25 hours
        description: 'Unrealistic time entry',
        task_category: 'development'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(timeEntryData)
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('exceeds maximum');
    });

    test('should list time entries for contract', async () => {
      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.timeEntries).toBeInstanceOf(Array);
      expect(data.timeEntries.length).toBe(timeEntries.length);
      expect(data.summary).toBeDefined();
      expect(data.summary.total_hours).toBeGreaterThan(0);
      expect(data.summary.total_amount).toBeGreaterThan(0);
      expect(data.summary.pending_hours).toBeGreaterThan(0);
    });

    test('should update time entry', async () => {
      const timeEntry = timeEntries[0];
      const updateData = {
        description: 'Updated: Frontend component development with unit tests',
        task_category: 'development'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking/${timeEntry.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.timeEntry.description).toBe(updateData.description);
      expect(data.timeEntry.id).toBe(timeEntry.id);
    });

    test('should delete time entry', async () => {
      // Create a time entry to delete
      const timeEntryData = {
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
        description: 'Time entry to be deleted',
        task_category: 'administrative'
      };

      const createResponse = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(timeEntryData)
      });

      const createdEntry = (await createResponse.json()).timeEntry;

      // Delete the entry
      const deleteResponse = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking/${createdEntry.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(deleteResponse.ok).toBe(true);
      const data = await deleteResponse.json();
      expect(data.success).toBe(true);

      // Verify it's deleted
      const listResponse = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      const listData = await listResponse.json();
      const deletedEntry = listData.timeEntries.find(e => e.id === createdEntry.id);
      expect(deletedEntry).toBeUndefined();
    });
  });

  describe('Time Tracking Sessions', () => {
    test('should start time tracking session', async () => {
      const sessionData = {
        task_description: 'Working on authentication system',
        task_category: 'development'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.session).toBeDefined();
      expect(data.session.contract_id).toBe(hourlyContract.id);
      expect(data.session.user_id).toBe(freelancerUser.user.id);
      expect(data.session.task_description).toBe(sessionData.task_description);
      expect(data.session.start_time).toBeDefined();
      expect(data.session.end_time).toBeNull();
      expect(data.session.is_active).toBe(true);

      timeSession = data.session;
    });

    test('should get active session', async () => {
      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking/sessions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.activeSession).toBeDefined();
      expect(data.activeSession.id).toBe(timeSession.id);
      expect(data.activeSession.is_active).toBe(true);
    });

    test('should prevent multiple active sessions', async () => {
      const sessionData = {
        task_description: 'Second session attempt',
        task_category: 'development'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData)
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('active session');
    });

    test('should stop time tracking session', async () => {
      await createTestDelay(1000); // Ensure some time has passed

      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking/sessions/${timeSession.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'stop' })
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.session.is_active).toBe(false);
      expect(data.session.end_time).toBeDefined();
      expect(data.timeEntry).toBeDefined(); // Should create a time entry
      expect(data.timeEntry.hours_logged).toBeGreaterThan(0);

      // Add created time entry to cleanup list
      timeEntries.push(data.timeEntry);
    });

    test('should handle session deletion', async () => {
      // Start a new session to delete
      const sessionData = {
        task_description: 'Session to be deleted',
        task_category: 'testing'
      };

      const createResponse = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData)
      });

      const newSession = (await createResponse.json()).session;

      // Delete the session
      const deleteResponse = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking/sessions/${newSession.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(deleteResponse.ok).toBe(true);
      const data = await deleteResponse.json();
      expect(data.success).toBe(true);
    });
  });

  describe('Time Entry Approval Process', () => {
    test('should approve time entry as client', async () => {
      const timeEntry = timeEntries.find(e => e.status === 'pending');
      if (!timeEntry) {
        throw new Error('No pending time entries found for approval test');
      }

      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking/${timeEntry.id}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clientAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approved: true,
          feedback: 'Great work on the frontend components!'
        })
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.timeEntry.status).toBe('approved');
      expect(data.timeEntry.approved_by).toBe(clientUser.user.id);
      expect(data.timeEntry.approval_feedback).toBe('Great work on the frontend components!');
      expect(data.timeEntry.approved_at).toBeDefined();
    });

    test('should reject time entry as client', async () => {
      const timeEntry = timeEntries.find(e => e.status === 'pending');
      if (!timeEntry) {
        // Create a new entry for rejection test
        const timeEntryData = {
          start_time: new Date().toISOString(),
          end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
          description: 'Entry to be rejected',
          task_category: 'development'
        };

        const createResponse = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${freelancerAuth.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(timeEntryData)
        });

        const newEntry = (await createResponse.json()).timeEntry;
        timeEntries.push(newEntry);

        // Now reject it
        const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking/${newEntry.id}/approve`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${clientAuth.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            approved: false,
            feedback: 'Please provide more detailed description of work performed.'
          })
        });

        expect(response.ok).toBe(true);
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(data.timeEntry.status).toBe('rejected');
        expect(data.timeEntry.approved_by).toBe(clientUser.user.id);
        expect(data.timeEntry.approval_feedback).toBe('Please provide more detailed description of work performed.');
      }
    });

    test('should prevent non-client from approving entries', async () => {
      const timeEntry = timeEntries.find(e => e.status === 'pending');
      if (!timeEntry) {
        return; // Skip if no pending entries
      }

      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking/${timeEntry.id}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`, // Freelancer trying to approve own work
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approved: true,
          feedback: 'Self-approval attempt'
        })
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });
  });

  describe('Time Tracking Analytics', () => {
    test('should provide time tracking summary', async () => {
      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.summary).toBeDefined();
      expect(data.summary.total_hours).toBeGreaterThan(0);
      expect(data.summary.approved_hours).toBeGreaterThanOrEqual(0);
      expect(data.summary.pending_hours).toBeGreaterThanOrEqual(0);
      expect(data.summary.rejected_hours).toBeGreaterThanOrEqual(0);
      expect(data.summary.total_amount).toBeGreaterThan(0);

      // Verify calculations
      const expectedTotal = data.summary.approved_hours + data.summary.pending_hours + data.summary.rejected_hours;
      expect(data.summary.total_hours).toBeCloseTo(expectedTotal, 1);

      const expectedAmount = data.summary.approved_hours * HOURLY_CONTRACT_DATA.hourly_rate;
      expect(data.summary.approved_amount).toBeCloseTo(expectedAmount, 2);
    });

    test('should provide client view of time tracking', async () => {
      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${clientAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.timeEntries).toBeInstanceOf(Array);
      expect(data.summary).toBeDefined();

      // Client should see all entries but with appropriate permissions
      data.timeEntries.forEach(entry => {
        expect(entry.contract_id).toBe(hourlyContract.id);
        expect(entry.user_id).toBe(freelancerUser.user.id);
      });
    });
  });

  describe('Security and Access Control', () => {
    test('should prevent access to other contract time entries', async () => {
      // Create another contract
      const otherContract = await TestContractManager.createContract(
        clientUser.user.id,
        HOURLY_CONTRACT_DATA,
        'client'
      );

      const response = await TestAPIManager.makeRequest(`/api/contracts/${otherContract.id}/time-tracking`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);

      // Clean up
      await TestContractManager.deleteContract(otherContract.id);
    });

    test('should require authentication for time tracking', async () => {
      const response = await TestAPIManager.makeRequest(`/api/contracts/${hourlyContract.id}/time-tracking`, {
        method: 'GET'
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should prevent time tracking on non-hourly contracts', async () => {
      // Create a fixed-price contract
      const fixedContract = await TestContractManager.createContract(
        freelancerUser.user.id,
        TEST_CONFIG.CONTRACT_DATA.GRAPHIC_DESIGN,
        'freelancer'
      );

      const timeEntryData = {
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        description: 'Should not work on fixed contract',
        task_category: 'development'
      };

      const response = await TestAPIManager.makeRequest(`/api/contracts/${fixedContract.id}/time-tracking`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(timeEntryData)
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('hourly');

      // Clean up
      await TestContractManager.deleteContract(fixedContract.id);
    });
  });
});