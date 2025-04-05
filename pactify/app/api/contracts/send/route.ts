import { NextResponse } from 'next/server';
import { sendEmail, getContractInvitationEmail } from '@/lib/utils/send-email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate the required fields
    if (!body.contractId || !body.contractTitle || !body.senderName || !body.recipientEmail) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    
    // Generate the email options
    const emailOptions = getContractInvitationEmail(
      body.contractId,
      body.contractTitle,
      body.senderName,
      body.recipientEmail
    );
    
    // Send the email
    const emailSent = await sendEmail(emailOptions);
    
    if (emailSent) {
      return NextResponse.json({ 
        message: "Contract email sent successfully",
        success: true
      });
    } else {
      return NextResponse.json(
        { error: "Failed to send contract email", success: false },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error sending contract email:', error);
    return NextResponse.json(
      { error: "Failed to send contract email", success: false },
      { status: 500 }
    );
  }
}
