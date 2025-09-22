import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { withCSRF } from "@/utils/security/csrf";
import { validateFile, createSecureUploadPath, SAFE_FILE_TYPES } from "@/utils/security/file-validation";
import { withRateLimit } from "@/utils/security/rate-limit";
import { auditLogger } from "@/utils/security/audit-logger";

async function handleFileUpload(request: NextRequest) {
  let user: any = null;
  try {
    const supabase = await createClient();
    
    // Get current user
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    
    user = currentUser;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Comprehensive file validation
    const validationResult = await validateFile(file, {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: SAFE_FILE_TYPES // Only safe file types
    });

    if (!validationResult.valid) {
      await auditLogger.logSecurityEvent({
        userId: user.id,
        action: 'file_upload_rejected',
        resource: 'file',
        details: { 
          filename: file.name,
          fileType: file.type,
          fileSize: file.size,
          error: validationResult.error
        },
        success: false,
        severity: 'medium'
      });

      return NextResponse.json({ 
        error: validationResult.error 
      }, { status: 400 });
    }

    // Log warnings if any
    if (validationResult.warnings) {
      await auditLogger.logSecurityEvent({
        userId: user.id,
        action: 'file_upload_warning',
        resource: 'file',
        details: { 
          filename: validationResult.fileInfo.name,
          warnings: validationResult.warnings
        },
        success: true,
        severity: 'low'
      });
    }

    // Create secure upload path
    const secureFileName = createSecureUploadPath(user.id, validationResult.fileInfo.name);

    // Convert File to ArrayBuffer then to Uint8Array
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage with secure filename
    const { data, error } = await supabase.storage
      .from('deliverables')
      .upload(secureFileName, uint8Array, {
        contentType: file.type,
        cacheControl: '3600'
      });

    if (error) {
      console.error('Error uploading file:', error);
      await auditLogger.logSecurityEvent({
        userId: user.id,
        action: 'file_upload_failed',
        resource: 'file',
        details: { 
          filename: validationResult.fileInfo.name,
          error: error.message
        },
        success: false,
        severity: 'medium'
      });
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('deliverables')
      .getPublicUrl(secureFileName);

    // Log successful upload
    await auditLogger.logSecurityEvent({
      userId: user.id,
      action: 'file_upload_success',
      resource: 'file',
      details: { 
        filename: validationResult.fileInfo.name,
        fileSize: validationResult.fileInfo.size,
        fileType: validationResult.fileInfo.type,
        fileHash: validationResult.fileInfo.hash,
        storagePath: secureFileName
      },
      success: true,
      severity: 'low'
    });

    return NextResponse.json({
      success: true,
      file: {
        name: validationResult.fileInfo.name,
        size: validationResult.fileInfo.size,
        type: validationResult.fileInfo.type,
        hash: validationResult.fileInfo.hash,
        url: urlData.publicUrl,
        path: secureFileName
      }
    });

  } catch (error) {
    console.error('File upload error:', error);
    if (user) {
      await auditLogger.logSecurityEvent({
        userId: user.id,
        action: 'file_upload_error',
        resource: 'file',
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        success: false,
        severity: 'high'
      });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Apply security middleware
export const POST = withRateLimit(withCSRF(handleFileUpload));