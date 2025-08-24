# Pactify

Pactify is a comprehensive platform for freelancers and clients to create legally binding contracts, manage secure escrow payments, and streamline project workflows. The platform provides electronic signatures, milestone-based payments, dispute resolution, and complete project management tools.

## 🚀 Features

### 📄 Contract Management
- **Smart Contract Creation**: AI-enhanced contract wizard with customizable templates
- **Digital Signatures**: Legally binding electronic signatures with HTML5 canvas
- **Contract Templates**: Pre-built templates for web development, design, consulting, and more
- **Contract Analytics**: Comprehensive tracking and reporting
- **Contract Revisions**: Version control and change tracking

### 💰 Escrow & Payment System
- **Secure Milestone Payments**: Stripe-powered escrow with automatic release
- **Multi-Currency Support**: Global payment processing capabilities
- **Fee Management**: Transparent fee calculation and processing
- **Payment Analytics**: Detailed transaction history and reporting
- **Refund & Dispute Handling**: Automated dispute resolution system

### 👥 User Management
- **Multi-Role Support**: Freelancer, client, or dual-role accounts
- **Profile Verification**: KYC verification with document upload
- **Stripe Connect Integration**: Seamless payout management for freelancers
- **User Analytics**: Activity tracking and performance metrics

### 📊 Subscription System
- **Free Tier**: Basic contract management (3 contracts/month)
- **Professional Tier**: Advanced features and unlimited contracts
- **Business Tier**: Team collaboration, API access, and priority support
- **Flexible Billing**: Monthly or yearly subscription options

### 🔧 Advanced Features
- **Deliverable Management**: File uploads, version tracking, and approval workflows
- **Real-time Messaging**: Built-in communication system with notifications
- **Dispute Resolution**: Comprehensive dispute handling with escalation
- **Mobile Responsive**: Fully optimized for mobile devices
- **API Access**: RESTful API for business tier users

## 🛠 Technology Stack

- **Frontend**: Next.js 14 with App Router, React 19, TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Authentication**: Supabase Auth with Google OAuth integration
- **Payments**: Stripe with Connect for escrow and payouts
- **File Storage**: Supabase Storage for contracts and deliverables
- **Email**: Nodemailer with SMTP integration
- **Testing**: Jest with comprehensive test suite (200+ tests)

## 📁 Project Structure

```
pactify/
├── app/                      # Next.js App Router
│   ├── (auth-pages)/         # Authentication pages
│   ├── (dashboard)/          # Protected dashboard routes
│   │   └── dashboard/        # Main dashboard pages
│   ├── api/                  # API routes
│   │   ├── auth/             # Authentication endpoints
│   │   ├── contracts/        # Contract management
│   │   ├── payments/         # Payment processing
│   │   ├── subscriptions/    # Subscription management
│   │   └── webhooks/         # Stripe webhooks
│   └── globals.css           # Global styles
├── components/               # Reusable React components
│   ├── ui/                   # shadcn/ui components
│   ├── contract/             # Contract-specific components
│   ├── payment/              # Payment-related components
│   └── dashboard/            # Dashboard components
├── lib/                      # Utility functions and configurations
│   ├── validations/          # Zod validation schemas
│   ├── utils/                # Helper functions
│   └── constants/            # Application constants
├── utils/                    # Core utilities
│   ├── supabase/             # Supabase client configurations
│   ├── profile-helpers.ts    # User profile management
│   └── send-email.ts         # Email utilities
├── __tests__/                # Comprehensive test suite
│   ├── integration/          # Integration tests
│   ├── api/                  # API endpoint tests
│   ├── e2e/                  # End-to-end tests
│   ├── utils/                # Utility function tests
│   └── components/           # Component tests
├── scripts/                  # Development and deployment scripts
├── database/                 # Database schema and migrations
├── docs/                     # Project documentation
│   ├── Documentation.md      # Complete project documentation
│   ├── IMPLEMENTATION_PROGRESS.md  # Development progress
│   └── API.md               # API documentation
└── public/                   # Static assets
```

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** and npm
- **Supabase account** with project created
- **Stripe account** with test mode enabled
- **Email service** (Gmail, SendGrid, etc.) for notifications

### Environment Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd pactify
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.test.template .env.local
   ```

4. **Configure your `.env.local` file**:
   ```env
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE=your_service_role_key

   # Stripe Configuration (Test Mode)
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
   STRIPE_SECRET_KEY=sk_test_your_key
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

   # Email Configuration
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password

   # Application URLs
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXTAUTH_URL=http://localhost:3000
   ```

### Database Setup

1. **Apply the database schema**:
   ```bash
   npm run db:schema
   ```

2. **Set up Row Level Security policies** in your Supabase dashboard

### Development

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Open your browser** to [http://localhost:3000](http://localhost:3000)

## 🧪 Testing

Pactify includes a comprehensive test suite with **200+ tests** covering all functionality.

### Basic Testing
```bash
npm test                    # Run 57 basic tests (always works)
npm run test:simple         # Enhanced test runner with better reporting
npm run test:coverage       # Generate coverage reports
```

### Comprehensive Testing
```bash
npm run test:comprehensive  # Run all 200+ tests with real database
npm run test:auth          # Authentication tests
npm run test:contracts     # Contract workflow tests
npm run test:payments      # Payment processing tests
npm run test:subscriptions # Subscription management tests
npm run test:e2e           # End-to-end workflow tests
```

### Test Environment Setup
```bash
npm run test:setup          # Interactive test environment setup
node __tests__/verify-environment.js  # Verify test configuration
```

**Testing Features:**
- ✅ **Real Database Testing**: Uses actual Supabase and Stripe (no mocks)
- ✅ **Complete Coverage**: All features tested from authentication to payment
- ✅ **Integration Testing**: Real API endpoints and external service integration
- ✅ **End-to-End Testing**: Complete user workflows validated
- ✅ **Security Testing**: Authentication, authorization, and data protection

## 🔧 Development Commands

### Build & Deployment
```bash
npm run build              # Production build
npm run build:ci           # CI build with full checks
npm run start              # Start production server
npm run lint               # Run ESLint
npm run type-check         # Run TypeScript compiler
```

### Database Management
```bash
npm run db:schema          # Apply database schema
```

### Testing Commands
```bash
npm test                   # Basic tests
npm run test:watch         # Watch mode for development
npm run test:coverage      # Generate coverage reports
npm run test:comprehensive # Full test suite with real data
```

## 📖 Usage

### For Freelancers

1. **Create Your Profile**
   - Sign up and complete profile setup
   - Enable Stripe Connect for payments
   - Complete KYC verification

2. **Create Contracts**
   - Use the contract wizard with AI enhancement
   - Choose from professional templates
   - Set up milestone-based payments

3. **Manage Projects**
   - Track contract status and payments
   - Upload deliverables and get approvals
   - Communicate with clients via built-in messaging

### For Clients

1. **Review and Sign Contracts**
   - Receive contract invitations via email
   - Review terms and digital signature
   - Set up secure escrow payments

2. **Project Management**
   - Monitor project progress and milestones
   - Review and approve deliverables
   - Release payments upon completion

3. **Payment Protection**
   - Funds held securely in escrow
   - Dispute resolution if issues arise
   - Transparent fee structure

### Admin Features

1. **User Management**
   - View all users and their activity
   - Handle KYC verification requests
   - Manage subscription tiers

2. **System Monitoring**
   - Track payments and transactions
   - Monitor platform usage and performance
   - Handle disputes and escalations

## 🔐 Security Features

- **Row Level Security (RLS)**: Database-level access control
- **JWT Authentication**: Secure token-based authentication
- **Data Encryption**: All sensitive data encrypted at rest
- **Input Validation**: Comprehensive server-side validation
- **CSRF Protection**: Built-in Next.js CSRF protection
- **Secure Headers**: Security headers and content policies
- **Audit Logging**: Complete activity tracking and logging

## 🚀 Production Deployment

### Vercel Deployment (Recommended)

1. **Connect your repository** to Vercel
2. **Set environment variables** in Vercel dashboard
3. **Deploy automatically** on push to main branch

### Manual Deployment

1. **Build the application**:
   ```bash
   npm run build:ci
   ```

2. **Set up production database** with proper RLS policies

3. **Configure Stripe webhooks** for your production domain

4. **Deploy to your hosting provider** of choice

## 📊 Project Status

- **Development Progress**: 100% Complete
- **Testing Coverage**: 200+ tests covering all functionality
- **Database Schema**: Fully implemented with RLS
- **Payment Integration**: Complete Stripe integration with escrow
- **User Management**: Full authentication and profile system
- **Contract System**: AI-enhanced contract creation and management
- **Mobile Support**: Fully responsive design

## 🔄 Development Roadmap

### ✅ Completed Features
- [x] **Complete Authentication System** with Google OAuth
- [x] **Contract Creation & Management** with AI enhancement
- [x] **Digital Signature System** with HTML5 canvas
- [x] **Stripe Payment Integration** with escrow functionality
- [x] **Subscription Management** with multiple tiers
- [x] **User Profile & KYC System** with document verification
- [x] **Deliverable Management** with file uploads
- [x] **Real-time Messaging** with notifications
- [x] **Dispute Resolution System** with escalation
- [x] **Comprehensive Testing Suite** with 200+ tests
- [x] **Admin Dashboard** with user management
- [x] **Mobile Responsive Design** optimized for all devices
- [x] **API Documentation** and testing endpoints

### 🎯 Future Enhancements
- [ ] **Mobile App** (React Native) with push notifications
- [ ] **Advanced Analytics** with custom dashboards
- [ ] **Team Collaboration** features for business accounts
- [ ] **Multi-language Support** for global users
- [ ] **Advanced AI Features** for contract analysis
- [ ] **Integration Marketplace** with third-party tools
- [ ] **Blockchain Integration** for contract verification

## 🤝 Contributing

We welcome contributions to Pactify! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and add tests
4. **Run the test suite**: `npm run test:comprehensive`
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- **Follow TypeScript best practices**
- **Add tests for new features**
- **Update documentation as needed**
- **Use conventional commit messages**
- **Ensure all tests pass before submitting**

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the `docs/` folder for detailed guides
- **Issues**: Report bugs via GitHub Issues
- **Email**: Contact support for urgent matters
- **Community**: Join our Discord for discussions

---

**Pactify** - Streamlining freelance contracts and payments with security, transparency, and ease of use.

Built with ❤️ using Next.js, Supabase, and Stripe.