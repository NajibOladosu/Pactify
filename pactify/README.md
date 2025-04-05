# Pactify

Pactify is a modern platform for freelancers and clients to create legally binding contracts and manage secure escrow payments. The platform streamlines the contract creation process, provides electronic signatures, and ensures secure payment handling.

## Features

### Contract Management
- Create custom contracts or use pre-made templates
- Electronic signatures with legal validity
- Contract status tracking and management
- Contract template library

### Escrow Payments
- Secure milestone-based payments
- Payment release upon work completion
- Transaction history and reporting
- Multiple payment method support (planned)

### User Roles
- Freelancer accounts
- Client accounts
- Dual role accounts (both freelancer and client)

### Subscription Plans
- Free tier with basic features
- Professional tier with advanced features
- Business tier with team collaboration and API access

## Technology Stack

- **Frontend**: Next.js 14 with App Router, React, TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Backend**: Supabase (PostgreSQL database, Auth, Storage)
- **Authentication**: Email/Password, Google OAuth
- **Payments**: Stripe integration (planned)

## Project Structure

```
pactify/
├── app/                  # Next.js App Router
│   ├── (auth-pages)/     # Authentication pages
│   ├── dashboard/        # User dashboard
│   ├── api/              # API routes
│   └── ...               # Other app pages
├── components/           # Reusable React components
├── lib/                  # Utility functions
├── public/               # Static assets
└── utils/                # Helper functions
    └── supabase/         # Supabase client utilities
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account with project created
- Google OAuth credentials (for Google sign-in)
- Stripe account (for payment processing, optional for initial setup)

### Environment Setup

1. Copy the `.env.example` file to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in the required environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

3. For Google OAuth, add your Google credentials to the Supabase Auth settings.

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Database Setup

1. Run the schema setup script to create all necessary database tables:
   ```bash
   node scripts/apply-schema.js
   ```

## Usage

### Creating a Contract

1. Sign in to your account
2. Navigate to Dashboard > Contracts
3. Click "Create Contract"
4. Choose a template or start from scratch
5. Fill in the contract details
6. Send to your client for signing

### Managing Templates

1. Go to Dashboard > Templates
2. Create or browse existing templates
3. Use templates to quickly generate contracts

### Subscription Management

1. Go to Dashboard > Subscription
2. View your current plan details
3. Upgrade or manage your subscription

## Development Roadmap

- [x] Authentication system
- [x] Contract creation interface
- [x] Template management
- [x] Subscription management UI
- [ ] Complete Stripe integration
- [ ] Full escrow payment system
- [ ] Mobile responsive design optimization
- [ ] Email notification system
- [ ] API access for Business tier
- [ ] Mobile app with push notifications

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
