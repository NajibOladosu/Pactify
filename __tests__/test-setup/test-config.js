/**
 * Test Configuration and Constants
 * Centralized configuration for all test suites
 */

const TEST_CONFIG = {
  // Test users for comprehensive testing - using real test accounts
  USERS: {
    FREELANCER: {
      email: 'alex.verified@testuser.com',
      password: 'testpassword123',
      displayName: 'Alex Verified',
      userType: 'freelancer',
      profile: {
        bio: 'Experienced developer for testing',
        companyName: 'FreelanceDev Solutions',
        website: 'https://freelancedev.com'
      }
    },
    CLIENT: {
      email: 'sarah.pending@testuser.com',
      password: 'testpassword123',
      displayName: 'Sarah Pending',
      userType: 'client',
      profile: {
        bio: 'Test client for integration testing',
        companyName: 'Test Client Corp',
        website: 'https://testclient.com'
      }
    }
  },

  // Test contract data
  CONTRACT_DATA: {
    WEB_DEVELOPMENT: {
      title: 'E-commerce Website Development',
      description: 'Build a complete e-commerce website with React and Node.js',
      type: 'milestone',
      totalAmount: 5000,
      currency: 'USD',
      startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 60 days from now
      termsAndConditions: `
1. Project Scope: Complete e-commerce website development
2. Technology Stack: React.js frontend, Node.js backend, PostgreSQL database
3. Timeline: 8 weeks from project start
4. Deliverables: Source code, deployment, documentation, 30 days support
5. Payment: Milestone-based payments
6. Revisions: Up to 3 rounds of revisions per milestone
7. Intellectual Property: Full rights transfer upon final payment
      `.trim(),
      milestones: [
        {
          title: 'Project Setup & Design',
          description: 'Project initialization, database schema, UI/UX design mockups',
          amount: 1000,
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          deliverables: ['Database schema', 'UI/UX mockups', 'Project structure']
        },
        {
          title: 'Backend Development',
          description: 'API development, user authentication, database integration',
          amount: 2000,
          dueDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          deliverables: ['REST API', 'Authentication system', 'Database models']
        },
        {
          title: 'Frontend Development',
          description: 'React components, shopping cart, payment integration',
          amount: 1500,
          dueDate: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          deliverables: ['React application', 'Shopping cart', 'Payment flow']
        },
        {
          title: 'Testing & Deployment',
          description: 'Testing, bug fixes, deployment, documentation',
          amount: 500,
          dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          deliverables: ['Test suite', 'Deployed application', 'Documentation']
        }
      ]
    },

    GRAPHIC_DESIGN: {
      title: 'Brand Identity Design Package',
      description: 'Complete brand identity including logo, business cards, and style guide',
      type: 'fixed',
      totalAmount: 1200,
      currency: 'USD',
      startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      termsAndConditions: `
1. Design Services: Logo design, business card design, brand style guide
2. Deliverables: High-resolution files in PNG, SVG, PDF formats
3. Revisions: Up to 5 rounds of revisions included
4. Timeline: 3 weeks from project start
5. Usage Rights: Full commercial usage rights upon payment
6. Source Files: Original design files included
      `.trim()
    }
  },

  // Test subscription plans
  SUBSCRIPTION_PLANS: {
    PROFESSIONAL: {
      id: 'professional',
      name: 'Professional Plan',
      billingCycle: 'monthly'
    },
    BUSINESS: {
      id: 'business',
      name: 'Business Plan',
      billingCycle: 'yearly'
    }
  },

  // Test payment data
  PAYMENT_DATA: {
    STRIPE_TEST_CARDS: {
      VISA_SUCCESS: '4242424242424242',
      VISA_DECLINED: '4000000000000002',
      VISA_INSUFFICIENT_FUNDS: '4000000000009995',
      MASTERCARD_SUCCESS: '5555555555554444'
    }
  },

  // Test dispute data
  DISPUTE_DATA: {
    QUALITY_ISSUE: {
      type: 'quality_issue',
      title: 'Deliverable Quality Concerns',
      description: 'The delivered work does not meet the agreed specifications and quality standards.',
      evidence: 'Screenshots and detailed comparison with requirements'
    },
    TIMELINE_DELAY: {
      type: 'timeline_delay',
      title: 'Project Timeline Exceeded',
      description: 'The project has significantly exceeded the agreed timeline without proper communication.',
      evidence: 'Timeline documentation and communication history'
    }
  },

  // Test deliverable data
  DELIVERABLE_DATA: {
    DESIGN_MOCKUPS: {
      title: 'UI/UX Design Mockups',
      description: 'Complete wireframes and high-fidelity mockups for the e-commerce website',
      files: [
        {
          name: 'homepage-mockup.png',
          type: 'image/png',
          size: 2048000 // 2MB
        },
        {
          name: 'product-page-mockup.png',
          type: 'image/png',
          size: 1536000 // 1.5MB
        }
      ]
    },
    SOURCE_CODE: {
      title: 'Source Code Package',
      description: 'Complete source code for the backend API with documentation',
      files: [
        {
          name: 'backend-source.zip',
          type: 'application/zip',
          size: 10485760 // 10MB
        },
        {
          name: 'api-documentation.pdf',
          type: 'application/pdf',
          size: 512000 // 512KB
        }
      ]
    }
  },

  // Test environment URLs
  URLS: {
    BASE_URL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    API_BASE: process.env.TEST_BASE_URL ? `${process.env.TEST_BASE_URL}/api` : 'http://localhost:3000/api'
  },

  // Test timeouts and delays
  TIMEOUTS: {
    DEFAULT: 30000,
    LONG_OPERATION: 60000,
    PAYMENT_PROCESSING: 45000,
    PAGE_LOAD: 10000
  },

  // Test database cleanup
  CLEANUP: {
    ENABLED: process.env.CLEANUP_TEST_DATA !== 'false',
    PRESERVE_ON_FAILURE: process.env.PRESERVE_TEST_DATA_ON_FAILURE === 'true'
  }
};

// Helper functions for test data generation
const generateTestEmail = (prefix = 'test') => {
  const timestamp = Date.now();
  return `${prefix}.${timestamp}@pactify-test.com`;
};

const generateContractNumber = () => {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const sequence = Math.floor(Math.random() * 999) + 1;
  return `PACT-${dateStr}-${sequence.toString().padStart(3, '0')}`;
};

const createTestDelay = (ms = 1000) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

module.exports = {
  TEST_CONFIG,
  generateTestEmail,
  generateContractNumber,
  createTestDelay
};