// Rail handlers registry and factory

import { RailHandler, Rail } from '../types';
import { StripeRailHandler } from './stripe-handler';
import { WiseRailHandler } from './wise-handler';
import { PayPalRailHandler } from './paypal-handler';
import { PayoneerRailHandler } from './payoneer-handler';
import { LocalRailHandler } from './local-handler';

// Registry of all available rail handlers
const railHandlers = new Map<Rail, RailHandler>();

// Lazy initialization function
function initializeHandler(rail: Rail): RailHandler {
  switch (rail) {
    case 'stripe':
      return new StripeRailHandler();
    case 'wise':
      return new WiseRailHandler();
    case 'paypal':
      return new PayPalRailHandler();
    case 'payoneer':
      return new PayoneerRailHandler();
    case 'local':
      return new LocalRailHandler();
    default:
      throw new Error(`Unknown rail type: ${rail}`);
  }
}

/**
 * Get a rail handler by rail type
 */
export function getRailHandler(rail: Rail): RailHandler {
  let handler = railHandlers.get(rail);
  if (!handler) {
    handler = initializeHandler(rail);
    railHandlers.set(rail, handler);
  }
  return handler;
}

/**
 * Get all available rail types
 */
export function getAvailableRails(): Rail[] {
  return ['stripe', 'wise', 'paypal', 'payoneer', 'local'];
}

/**
 * Check if a rail is supported
 */
export function isRailSupported(rail: Rail): boolean {
  return getAvailableRails().includes(rail);
}

// Export individual handlers for direct use if needed
export {
  StripeRailHandler,
  WiseRailHandler,
  PayPalRailHandler,
  PayoneerRailHandler,
  LocalRailHandler
};