import { NextRequest } from 'next/server';
import { handleCSRFTokenRequest } from '@/utils/security/csrf';

export async function GET(request: NextRequest) {
  return handleCSRFTokenRequest(request);
}