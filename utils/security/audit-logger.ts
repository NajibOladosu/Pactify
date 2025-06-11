import { createClient } from "@/utils/supabase/server";

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ip?: string;
  userAgent?: string;
  timestamp?: string;
  success: boolean;
  errorCode?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class AuditLogger {
  private static instance: AuditLogger;
  private logs: AuditLogEntry[] = [];
  private batchSize = 10;
  private flushInterval = 30000; // 30 seconds

  private constructor() {
    // Flush logs periodically
    setInterval(() => {
      this.flushLogs();
    }, this.flushInterval);
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    const logEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };

    this.logs.push(logEntry);

    // Log critical events immediately
    if (entry.severity === 'critical') {
      await this.flushLogs();
      this.notifySecurityTeam(logEntry);
    }

    // Flush if batch is full
    if (this.logs.length >= this.batchSize) {
      await this.flushLogs();
    }
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    action: 'login' | 'logout' | 'failed_login' | 'password_reset' | 'account_locked',
    userId?: string,
    details?: any,
    ip?: string,
    userAgent?: string,
    success: boolean = true
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      action: `auth_${action}`,
      resource: 'authentication',
      details,
      ip,
      userAgent,
      success,
      severity: success ? 'low' : 'medium'
    });
  }

  /**
   * Log contract events
   */
  async logContractEvent(
    action: string,
    contractId: string,
    userId?: string,
    details?: any,
    success: boolean = true
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      action: `contract_${action}`,
      resource: 'contract',
      resourceId: contractId,
      details,
      success,
      severity: 'low'
    });
  }

  /**
   * Log payment events
   */
  async logPaymentEvent(
    action: string,
    paymentId: string,
    userId?: string,
    amount?: number,
    currency?: string,
    details?: any,
    success: boolean = true
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      action: `payment_${action}`,
      resource: 'payment',
      resourceId: paymentId,
      details: {
        ...details,
        amount,
        currency
      },
      success,
      severity: 'medium'
    });
  }

  /**
   * Log KYC events
   */
  async logKycEvent(
    action: string,
    userId: string,
    verificationLevel?: string,
    details?: any,
    success: boolean = true
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      action: `kyc_${action}`,
      resource: 'kyc_verification',
      resourceId: userId,
      details: {
        ...details,
        verificationLevel
      },
      success,
      severity: 'medium'
    });
  }

  /**
   * Log data access events
   */
  async logDataAccess(
    resource: string,
    resourceId: string,
    userId?: string,
    action: 'read' | 'create' | 'update' | 'delete' = 'read',
    details?: any
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      action: `data_${action}`,
      resource,
      resourceId,
      details,
      success: true,
      severity: action === 'delete' ? 'medium' : 'low'
    });
  }

  /**
   * Log security violations
   */
  async logSecurityViolation(
    violation: string,
    userId?: string,
    ip?: string,
    userAgent?: string,
    details?: any
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      action: `security_violation_${violation}`,
      resource: 'security',
      details,
      ip,
      userAgent,
      success: false,
      severity: 'high'
    });
  }

  /**
   * Log rate limiting events
   */
  async logRateLimitViolation(
    identifier: string,
    endpoint: string,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logSecurityEvent({
      action: 'rate_limit_exceeded',
      resource: 'rate_limit',
      details: {
        identifier,
        endpoint
      },
      ip,
      userAgent,
      success: false,
      severity: 'medium'
    });
  }

  /**
   * Log file operations
   */
  async logFileOperation(
    action: 'upload' | 'download' | 'delete',
    filename: string,
    userId?: string,
    fileSize?: number,
    details?: any,
    success: boolean = true
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      action: `file_${action}`,
      resource: 'file',
      resourceId: filename,
      details: {
        ...details,
        fileSize
      },
      success,
      severity: action === 'upload' ? 'low' : 'medium'
    });
  }

  /**
   * Log admin actions
   */
  async logAdminAction(
    action: string,
    adminUserId: string,
    targetResource: string,
    targetResourceId?: string,
    details?: any,
    success: boolean = true
  ): Promise<void> {
    await this.logSecurityEvent({
      userId: adminUserId,
      action: `admin_${action}`,
      resource: targetResource,
      resourceId: targetResourceId,
      details,
      success,
      severity: 'high'
    });
  }

  /**
   * Flush logs to storage
   */
  private async flushLogs(): Promise<void> {
    if (this.logs.length === 0) return;

    const logsToFlush = [...this.logs];
    this.logs = [];

    try {
      await this.persistLogs(logsToFlush);
    } catch (error) {
      console.error('Failed to flush audit logs:', error);
      // Re-add logs to retry later
      this.logs.unshift(...logsToFlush);
    }
  }

  /**
   * Persist logs to storage
   */
  private async persistLogs(logs: AuditLogEntry[]): Promise<void> {
    try {
      // In production, this would write to a dedicated audit database
      // For now, we'll use contract_activities table with a special type
      const supabase = await createClient();
      
      const auditRecords = logs.map(log => ({
        contract_id: "00000000-0000-0000-0000-000000000000", // Special UUID for audit logs
        user_id: log.userId || "00000000-0000-0000-0000-000000000000",
        activity_type: `audit_${log.action}`,
        description: `${log.resource} ${log.action} - ${log.success ? 'SUCCESS' : 'FAILED'}`,
        metadata: {
          resource: log.resource,
          resourceId: log.resourceId,
          details: log.details,
          ip: log.ip,
          userAgent: log.userAgent,
          severity: log.severity,
          errorCode: log.errorCode,
          auditLog: true
        },
        created_at: log.timestamp
      }));

      const { error } = await supabase
        .from('contract_activities')
        .insert(auditRecords);

      if (error) {
        console.error('Failed to persist audit logs:', error);
        throw error;
      }

      // Also log to console in development
      if (process.env.NODE_ENV === 'development') {
        logs.forEach(log => {
          console.log(`[AUDIT-${log.severity.toUpperCase()}]`, log);
        });
      }

    } catch (error) {
      console.error('Error persisting audit logs:', error);
      throw error;
    }
  }

  /**
   * Notify security team of critical events
   */
  private async notifySecurityTeam(logEntry: AuditLogEntry): Promise<void> {
    // In production, this would send alerts via email, Slack, etc.
    console.error('[CRITICAL SECURITY EVENT]', {
      timestamp: logEntry.timestamp,
      action: logEntry.action,
      resource: logEntry.resource,
      userId: logEntry.userId,
      details: logEntry.details
    });

    // Could integrate with alerting services like PagerDuty, Slack webhooks, etc.
  }

  /**
   * Query audit logs
   */
  async queryLogs(filters: {
    userId?: string;
    resource?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    severity?: string;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    try {
      const supabase = await createClient();
      
      let query = supabase
        .from('contract_activities')
        .select('*')
        .like('activity_type', 'audit_%')
        .order('created_at', { ascending: false });

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }

      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Failed to query audit logs:', error);
        return [];
      }

      return (data || []).map(record => ({
        userId: record.user_id,
        action: record.activity_type.replace('audit_', ''),
        resource: record.metadata?.resource || 'unknown',
        resourceId: record.metadata?.resourceId,
        details: record.metadata?.details,
        ip: record.metadata?.ip,
        userAgent: record.metadata?.userAgent,
        timestamp: record.created_at,
        success: !record.metadata?.errorCode,
        errorCode: record.metadata?.errorCode,
        severity: record.metadata?.severity || 'low'
      }));

    } catch (error) {
      console.error('Error querying audit logs:', error);
      return [];
    }
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalEvents: number;
    eventsBySeverity: Record<string, number>;
    eventsByResource: Record<string, number>;
    eventsByAction: Record<string, number>;
    failedEvents: number;
    topUsers: Array<{ userId: string; eventCount: number }>;
  }> {
    const logs = await this.queryLogs({ startDate, endDate, limit: 10000 });

    const report = {
      totalEvents: logs.length,
      eventsBySeverity: {} as Record<string, number>,
      eventsByResource: {} as Record<string, number>,
      eventsByAction: {} as Record<string, number>,
      failedEvents: 0,
      topUsers: [] as Array<{ userId: string; eventCount: number }>
    };

    const userCounts: Record<string, number> = {};

    logs.forEach(log => {
      // Count by severity
      report.eventsBySeverity[log.severity] = (report.eventsBySeverity[log.severity] || 0) + 1;

      // Count by resource
      report.eventsByResource[log.resource] = (report.eventsByResource[log.resource] || 0) + 1;

      // Count by action
      report.eventsByAction[log.action] = (report.eventsByAction[log.action] || 0) + 1;

      // Count failed events
      if (!log.success) {
        report.failedEvents++;
      }

      // Count by user
      if (log.userId) {
        userCounts[log.userId] = (userCounts[log.userId] || 0) + 1;
      }
    });

    // Get top 10 users by event count
    report.topUsers = Object.entries(userCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userId, eventCount]) => ({ userId, eventCount }));

    return report;
  }
}

// Export singleton instance
export const auditLogger = AuditLogger.getInstance();

// Convenience functions
export const logSecurityEvent = (entry: Omit<AuditLogEntry, 'timestamp'>) => 
  auditLogger.logSecurityEvent(entry);

export const logAuthEvent = (
  action: 'login' | 'logout' | 'failed_login' | 'password_reset' | 'account_locked',
  userId?: string,
  details?: any,
  ip?: string,
  userAgent?: string,
  success: boolean = true
) => auditLogger.logAuthEvent(action, userId, details, ip, userAgent, success);

export const logContractEvent = (
  action: string,
  contractId: string,
  userId?: string,
  details?: any,
  success: boolean = true
) => auditLogger.logContractEvent(action, contractId, userId, details, success);

export const logPaymentEvent = (
  action: string,
  paymentId: string,
  userId?: string,
  amount?: number,
  currency?: string,
  details?: any,
  success: boolean = true
) => auditLogger.logPaymentEvent(action, paymentId, userId, amount, currency, details, success);