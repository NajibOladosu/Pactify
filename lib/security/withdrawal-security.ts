import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

export interface SecurityAssessment {
  riskScore: number;
  riskFlags: string[];
  requiresReview: boolean;
  allowWithdrawal: boolean;
  reason?: string;
}

export interface WithdrawalContext {
  userId: string;
  amountCents: number;
  currency: string;
  payoutMethodId: string;
  ipAddress: string;
  userAgent: string;
  urgency?: 'standard' | 'express';
}

export class WithdrawalSecurityManager {
  
  // Risk thresholds
  private static readonly RISK_THRESHOLDS = {
    LOW: 25,
    MEDIUM: 50,
    HIGH: 75,
    CRITICAL: 100,
  };

  // Security limits
  private static readonly SECURITY_LIMITS = {
    MAX_AMOUNT_WITHOUT_REVIEW: 100000, // $1,000
    MAX_DAILY_ATTEMPTS: 10,
    MAX_HOURLY_ATTEMPTS: 3,
    MIN_ACCOUNT_AGE_DAYS: 7,
    MIN_PAYOUT_METHOD_AGE_HOURS: 72,
    MAX_FAILED_ATTEMPTS_PER_DAY: 5,
  };

  /**
   * Comprehensive security assessment for withdrawal requests
   */
  async assessWithdrawalSecurity(context: WithdrawalContext): Promise<SecurityAssessment> {
    let riskScore = 0;
    const riskFlags: string[] = [];

    try {
      // 1. User Account Security Checks
      const accountRisk = await this.assessAccountSecurity(context.userId);
      riskScore += accountRisk.score;
      riskFlags.push(...accountRisk.flags);

      // 2. Amount and Pattern Analysis
      const amountRisk = await this.assessAmountRisk(context);
      riskScore += amountRisk.score;
      riskFlags.push(...amountRisk.flags);

      // 3. Behavioral Analysis
      const behaviorRisk = await this.assessBehavioralRisk(context);
      riskScore += behaviorRisk.score;
      riskFlags.push(...behaviorRisk.flags);

      // 4. Payout Method Security
      const payoutMethodRisk = await this.assessPayoutMethodSecurity(context);
      riskScore += payoutMethodRisk.score;
      riskFlags.push(...payoutMethodRisk.flags);

      // 5. Network and Device Security
      const networkRisk = await this.assessNetworkSecurity(context);
      riskScore += networkRisk.score;
      riskFlags.push(...networkRisk.flags);

      // 6. Rate Limiting Checks
      const rateLimitRisk = await this.assessRateLimits(context);
      riskScore += rateLimitRisk.score;
      riskFlags.push(...rateLimitRisk.flags);

      // Determine if manual review is required
      const requiresReview = riskScore >= WithdrawalSecurityManager.RISK_THRESHOLDS.MEDIUM ||
                            context.amountCents > WithdrawalSecurityManager.SECURITY_LIMITS.MAX_AMOUNT_WITHOUT_REVIEW ||
                            riskFlags.includes('critical_risk');

      // Determine if withdrawal should be allowed
      const allowWithdrawal = riskScore < WithdrawalSecurityManager.RISK_THRESHOLDS.CRITICAL &&
                              !riskFlags.includes('blocked_user') &&
                              !riskFlags.includes('account_compromised');

      return {
        riskScore,
        riskFlags,
        requiresReview,
        allowWithdrawal,
        reason: !allowWithdrawal ? this.getBlockReason(riskFlags) : undefined,
      };

    } catch (error) {
      console.error('Error during security assessment:', error);
      
      // Fail secure - require review if assessment fails
      return {
        riskScore: 100,
        riskFlags: ['assessment_error'],
        requiresReview: true,
        allowWithdrawal: false,
        reason: 'Security assessment failed - manual review required',
      };
    }
  }

  /**
   * Assess user account security posture
   */
  private async assessAccountSecurity(userId: string): Promise<{ score: number; flags: string[] }> {
    let score = 0;
    const flags: string[] = [];

    try {
      // Get user profile and account info
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('created_at, identity_status, last_kyc_check_at, kyc_risk_score')
        .eq('id', userId)
        .single();

      if (!profile) {
        return { score: 50, flags: ['profile_not_found'] };
      }

      // Account age check
      const accountAge = Date.now() - new Date(profile.created_at).getTime();
      const accountAgeDays = accountAge / (24 * 60 * 60 * 1000);

      if (accountAgeDays < WithdrawalSecurityManager.SECURITY_LIMITS.MIN_ACCOUNT_AGE_DAYS) {
        score += 30;
        flags.push('new_account');
      }

      // Identity verification status
      if (profile.identity_status !== 'verified') {
        score += 50;
        flags.push('identity_not_verified');
      }

      // KYC risk score
      if (profile.kyc_risk_score && profile.kyc_risk_score > 70) {
        score += 25;
        flags.push('high_kyc_risk');
      }

      // Recent failed attempts
      const { data: recentFailures } = await supabaseAdmin
        .from('withdrawal_security_logs')
        .select('created_at')
        .eq('user_id', userId)
        .eq('event_type', 'failure')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (recentFailures && recentFailures.length >= WithdrawalSecurityManager.SECURITY_LIMITS.MAX_FAILED_ATTEMPTS_PER_DAY) {
        score += 40;
        flags.push('multiple_recent_failures');
      }

      return { score, flags };

    } catch (error) {
      console.error('Error assessing account security:', error);
      return { score: 30, flags: ['account_check_error'] };
    }
  }

  /**
   * Assess withdrawal amount and pattern risks
   */
  private async assessAmountRisk(context: WithdrawalContext): Promise<{ score: number; flags: string[] }> {
    let score = 0;
    const flags: string[] = [];

    try {
      // High amount risk
      if (context.amountCents >= 500000) { // $5,000+
        score += 30;
        flags.push('high_amount');
      } else if (context.amountCents >= 100000) { // $1,000+
        score += 15;
        flags.push('medium_amount');
      }

      // Get recent withdrawal patterns
      const { data: recentWithdrawals } = await supabaseAdmin
        .from('withdrawals')
        .select('amount_cents, created_at, status')
        .eq('user_id', context.userId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (recentWithdrawals && recentWithdrawals.length > 0) {
        // Check for unusual amount patterns
        const amounts = recentWithdrawals.map(w => w.amount_cents);
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;

        if (context.amountCents > avgAmount * 3) {
          score += 20;
          flags.push('unusual_amount_pattern');
        }

        // Check for rapid successive withdrawals
        const recentSuccessful = recentWithdrawals.filter(w => 
          w.status === 'paid' || w.status === 'processing'
        );

        if (recentSuccessful.length >= 3) {
          score += 25;
          flags.push('rapid_withdrawal_pattern');
        }
      }

      return { score, flags };

    } catch (error) {
      console.error('Error assessing amount risk:', error);
      return { score: 15, flags: ['amount_check_error'] };
    }
  }

  /**
   * Assess behavioral patterns and anomalies
   */
  private async assessBehavioralRisk(context: WithdrawalContext): Promise<{ score: number; flags: string[] }> {
    let score = 0;
    const flags: string[] = [];

    try {
      // Get user's historical activity patterns
      const { data: activityLogs } = await supabaseAdmin
        .from('withdrawal_security_logs')
        .select('created_at, ip_address, user_agent, metadata')
        .eq('user_id', context.userId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (activityLogs && activityLogs.length > 0) {
        // Check for IP address changes
        const uniqueIPs = new Set(activityLogs.map(log => log.ip_address));
        if (uniqueIPs.size > 5) {
          score += 20;
          flags.push('multiple_ip_addresses');
        }

        // Check for user agent changes
        const uniqueUserAgents = new Set(activityLogs.map(log => log.user_agent));
        if (uniqueUserAgents.size > 3) {
          score += 15;
          flags.push('multiple_devices');
        }

        // Check for geographic anomalies (simplified - would need GeoIP in production)
        if (!activityLogs.some(log => log.ip_address === context.ipAddress)) {
          score += 10;
          flags.push('new_ip_address');
        }

        // Check for unusual timing patterns (e.g., withdrawals at odd hours)
        const currentHour = new Date().getHours();
        if (currentHour < 6 || currentHour > 23) {
          score += 5;
          flags.push('unusual_timing');
        }
      }

      return { score, flags };

    } catch (error) {
      console.error('Error assessing behavioral risk:', error);
      return { score: 10, flags: ['behavior_check_error'] };
    }
  }

  /**
   * Assess payout method security
   */
  private async assessPayoutMethodSecurity(context: WithdrawalContext): Promise<{ score: number; flags: string[] }> {
    let score = 0;
    const flags: string[] = [];

    try {
      const { data: payoutMethod } = await supabaseAdmin
        .from('payout_methods')
        .select('added_at, verification_status, is_verified, method_type')
        .eq('id', context.payoutMethodId)
        .eq('user_id', context.userId)
        .single();

      if (!payoutMethod) {
        return { score: 50, flags: ['invalid_payout_method'] };
      }

      // Check payout method age
      const methodAge = Date.now() - new Date(payoutMethod.added_at).getTime();
      const methodAgeHours = methodAge / (60 * 60 * 1000);

      if (methodAgeHours < WithdrawalSecurityManager.SECURITY_LIMITS.MIN_PAYOUT_METHOD_AGE_HOURS) {
        score += 35;
        flags.push('new_payout_method');
      }

      // Check verification status
      if (!payoutMethod.is_verified) {
        score += 40;
        flags.push('unverified_payout_method');
      }

      // Debit card risk (higher risk than bank accounts)
      if (payoutMethod.method_type === 'debit_card') {
        score += 10;
        flags.push('debit_card_payout');
      }

      return { score, flags };

    } catch (error) {
      console.error('Error assessing payout method security:', error);
      return { score: 25, flags: ['payout_method_check_error'] };
    }
  }

  /**
   * Assess network and device security
   */
  private async assessNetworkSecurity(context: WithdrawalContext): Promise<{ score: number; flags: string[] }> {
    let score = 0;
    const flags: string[] = [];

    try {
      // Check for suspicious IP patterns
      if (this.isSuspiciousIP(context.ipAddress)) {
        score += 30;
        flags.push('suspicious_ip');
      }

      // Check for bot-like user agent
      if (this.isSuspiciousUserAgent(context.userAgent)) {
        score += 20;
        flags.push('suspicious_user_agent');
      }

      // Check for VPN/Proxy usage (simplified check)
      if (this.isPotentialVPN(context.ipAddress)) {
        score += 15;
        flags.push('potential_vpn');
      }

      return { score, flags };

    } catch (error) {
      console.error('Error assessing network security:', error);
      return { score: 10, flags: ['network_check_error'] };
    }
  }

  /**
   * Assess rate limiting violations
   */
  private async assessRateLimits(context: WithdrawalContext): Promise<{ score: number; flags: string[] }> {
    let score = 0;
    const flags: string[] = [];

    try {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Check hourly attempts
      const { data: hourlyAttempts } = await supabaseAdmin
        .from('withdrawals')
        .select('id')
        .eq('user_id', context.userId)
        .gte('created_at', hourAgo.toISOString());

      if (hourlyAttempts && hourlyAttempts.length >= WithdrawalSecurityManager.SECURITY_LIMITS.MAX_HOURLY_ATTEMPTS) {
        score += 50;
        flags.push('hourly_rate_limit_exceeded');
      }

      // Check daily attempts
      const { data: dailyAttempts } = await supabaseAdmin
        .from('withdrawals')
        .select('id')
        .eq('user_id', context.userId)
        .gte('created_at', dayAgo.toISOString());

      if (dailyAttempts && dailyAttempts.length >= WithdrawalSecurityManager.SECURITY_LIMITS.MAX_DAILY_ATTEMPTS) {
        score += 40;
        flags.push('daily_rate_limit_exceeded');
      }

      return { score, flags };

    } catch (error) {
      console.error('Error assessing rate limits:', error);
      return { score: 20, flags: ['rate_limit_check_error'] };
    }
  }

  /**
   * Helper methods for security checks
   */
  private isSuspiciousIP(ip: string): boolean {
    // In production, check against threat intelligence feeds
    const suspiciousPatterns = [
      /^10\./, // Private networks
      /^192\.168\./, // Private networks
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private networks
      /^127\./, // Localhost
    ];

    return suspiciousPatterns.some(pattern => pattern.test(ip));
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /postman/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  private isPotentialVPN(ip: string): boolean {
    // Simplified VPN detection - in production, use a proper service
    // This is just a placeholder
    return false;
  }

  private getBlockReason(riskFlags: string[]): string {
    if (riskFlags.includes('blocked_user')) {
      return 'Account has been blocked due to security concerns';
    }
    if (riskFlags.includes('account_compromised')) {
      return 'Account appears to be compromised - please contact support';
    }
    if (riskFlags.includes('identity_not_verified')) {
      return 'Identity verification required for withdrawals';
    }
    if (riskFlags.includes('hourly_rate_limit_exceeded')) {
      return 'Too many withdrawal attempts this hour';
    }
    if (riskFlags.includes('daily_rate_limit_exceeded')) {
      return 'Daily withdrawal attempt limit reached';
    }
    
    return 'Withdrawal blocked due to security concerns';
  }

  /**
   * Log security assessment for audit purposes
   */
  async logSecurityAssessment(
    context: WithdrawalContext,
    assessment: SecurityAssessment,
    withdrawalId?: string
  ): Promise<void> {
    try {
      await supabaseAdmin.from('withdrawal_security_logs').insert({
        user_id: context.userId,
        withdrawal_id: withdrawalId,
        event_type: assessment.allowWithdrawal ? 'success' : 'failure',
        ip_address: context.ipAddress,
        user_agent: context.userAgent,
        risk_score: assessment.riskScore,
        flags: assessment.riskFlags,
        metadata: {
          action: 'security_assessment',
          amount_cents: context.amountCents,
          currency: context.currency,
          requires_review: assessment.requiresReview,
          block_reason: assessment.reason,
        }
      });
    } catch (error) {
      console.error('Error logging security assessment:', error);
    }
  }
}

// Export singleton instance
export const withdrawalSecurity = new WithdrawalSecurityManager();

// Export class with the name expected by tests
export class WithdrawalSecurity extends WithdrawalSecurityManager {
  constructor(supabaseClient?: any) {
    super();
    // Allow injection of custom Supabase client for testing
    if (supabaseClient) {
      // Override the admin client for testing
      (this as any).supabaseClient = supabaseClient;
    }
  }

  // Override to maintain parent interface compatibility
  async assessWithdrawalSecurity(context: WithdrawalContext): Promise<SecurityAssessment> {
    return await super.assessWithdrawalSecurity(context);
  }

  // Test-compatible methods removed to avoid accessing private members

  async logSecurityEvent(userId: string, eventType: string, ipAddress: string, userAgent: string, riskScore: number, flags: string[], metadata: any) {
    try {
      const client = (this as any).supabaseClient || supabaseAdmin;
      await client.from('withdrawal_security_logs').insert({
        user_id: userId,
        event_type: eventType,
        ip_address: ipAddress,
        user_agent: userAgent,
        risk_score: riskScore,
        flags: flags,
        metadata: metadata
      });
    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }
}