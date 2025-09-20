// Rail handlers registry and factory

import { RailHandler, Rail } from '../types';
import { StripeRailHandler } from './stripe-handler';
import { WiseRailHandler } from './wise-handler';
import { PayPalRailHandler } from './paypal-handler';
import { PayoneerRailHandler } from './payoneer-handler';
import { LocalRailHandler } from './local-handler';

// Registry of all available rail handlers
const railHandlers = new Map<Rail, RailHandler>();

// Initialize handlers
railHandlers.set('stripe', new StripeRailHandler());
railHandlers.set('wise', new WiseRailHandler());
railHandlers.set('paypal', new PayPalRailHandler());
railHandlers.set('payoneer', new PayoneerRailHandler());
railHandlers.set('local', new LocalRailHandler());

/**
 * Get a rail handler by rail type
 */
export function getRailHandler(rail: Rail): RailHandler {
  const handler = railHandlers.get(rail);
  if (!handler) {
    throw new Error(`No handler found for rail: ${rail}`);
  }
  return handler;
}

/**
 * Get all available rail types
 */
export function getAvailableRails(): Rail[] {
  return Array.from(railHandlers.keys());
}

/**
 * Check if a rail is supported
 */
export function isRailSupported(rail: Rail): boolean {
  return railHandlers.has(rail);
}

// Export individual handlers for direct use if needed
export {
  StripeRailHandler,
  WiseRailHandler,
  PayPalRailHandler,
  PayoneerRailHandler,
  LocalRailHandler
};