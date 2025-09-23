'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WithdrawalMethodsManagerProps {
  userId: string;
  methods?: any[];
  loading?: boolean;
}

export function WithdrawalMethodsManager({ 
  userId, 
  methods = [], 
  loading = false 
}: WithdrawalMethodsManagerProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-16 bg-gray-200 rounded" />
            <div className="h-16 bg-gray-200 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Methods</CardTitle>
      </CardHeader>
      <CardContent>
        {methods.length === 0 ? (
          <p className="text-muted-foreground">No payment methods configured yet.</p>
        ) : (
          <div className="space-y-2">
            {methods.map((method: any, index: number) => (
              <div key={index} className="p-3 border rounded-lg">
                <p className="font-medium">{method.label || 'Payment Method'}</p>
                <p className="text-sm text-muted-foreground">{method.type || 'Unknown'}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default WithdrawalMethodsManager;