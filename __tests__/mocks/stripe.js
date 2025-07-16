export const mockStripe = {
  paymentIntents: {
    create: jest.fn(),
    confirm: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
  },
  customers: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  accounts: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  checkout: {
    sessions: {
      create: jest.fn(),
      retrieve: jest.fn(),
      expire: jest.fn(),
      listLineItems: jest.fn(),
    },
  },
  subscriptions: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
    list: jest.fn(),
  },
  invoices: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
    finalizeInvoice: jest.fn(),
    pay: jest.fn(),
  },
  prices: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    list: jest.fn(),
  },
  products: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    list: jest.fn(),
  },
  webhookEndpoints: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
  },
  constructEvent: jest.fn(),
}

export const mockPaymentIntent = {
  id: 'pi_123',
  amount: 1000,
  currency: 'usd',
  status: 'succeeded',
  client_secret: 'pi_123_secret',
  created: Date.now(),
  description: 'Test payment',
  metadata: {},
}

export const mockCustomer = {
  id: 'cus_123',
  email: 'test@example.com',
  name: 'Test User',
  created: Date.now(),
  metadata: {},
}

export const mockCheckoutSession = {
  id: 'cs_123',
  payment_status: 'paid',
  status: 'complete',
  url: 'https://checkout.stripe.com/c/pay/123',
  success_url: 'https://example.com/success',
  cancel_url: 'https://example.com/cancel',
  customer: 'cus_123',
  amount_total: 1000,
  currency: 'usd',
  metadata: {},
}

export const mockSubscription = {
  id: 'sub_123',
  customer: 'cus_123',
  status: 'active',
  current_period_start: Date.now(),
  current_period_end: Date.now() + 30 * 24 * 60 * 60 * 1000,
  cancel_at_period_end: false,
  items: {
    data: [
      {
        id: 'si_123',
        price: {
          id: 'price_123',
          unit_amount: 2000,
          currency: 'usd',
          recurring: {
            interval: 'month',
          },
        },
      },
    ],
  },
  metadata: {},
}