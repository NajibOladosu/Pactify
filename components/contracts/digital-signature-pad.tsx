"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { 
  PenToolIcon, 
  RotateCcwIcon, 
  CheckCircleIcon,
  UserIcon,
  CalendarIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Signature {
  id: string;
  user_id: string;
  signed_at: string;
  profiles?: {
    display_name: string;
    avatar_url?: string;
  };
}

interface SignatureStatus {
  client_signed: boolean;
  freelancer_signed: boolean;
  fully_signed: boolean;
  signatures: Signature[];
  user_has_signed: boolean;
}

interface DigitalSignaturePadProps {
  contractId: string;
  userId: string;
  userRole: 'client' | 'freelancer' | 'creator';
  contractTitle: string;
  isSigningEnabled?: boolean;
  onSignatureComplete?: (signatureStatus: SignatureStatus) => void;
}

export default function DigitalSignaturePad({
  contractId,
  userId,
  userRole,
  contractTitle,
  isSigningEnabled = true,
  onSignatureComplete
}: DigitalSignaturePadProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string>('');
  const [signatureStatus, setSignatureStatus] = useState<SignatureStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigning, setIsSigning] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  // Fetch signature status on component mount
  useEffect(() => {
    fetchSignatureStatus();
  }, [contractId]);

  const fetchSignatureStatus = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/contracts/${contractId}/sign`);
      const result = await response.json();

      if (response.ok) {
        setSignatureStatus(result.signature_status);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch signature status",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Failed to fetch signature status:', error);
      toast({
        title: "Error",
        description: "Failed to fetch signature status",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Set drawing styles
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fill background with white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [showSignaturePad]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    // Capture signature data
    const canvas = canvasRef.current;
    if (canvas) {
      const dataURL = canvas.toDataURL('image/png');
      setSignatureData(dataURL);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setSignatureData('');
  };

  const submitSignature = async () => {
    if (!signatureData) {
      toast({
        title: "Error",
        description: "Please provide your signature before submitting",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSigning(true);
      const response = await fetch(`/api/contracts/${contractId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_data: signatureData })
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Signature Successful!",
          description: result.message,
        });

        // Refresh signature status
        await fetchSignatureStatus();
        setShowSignaturePad(false);
        setSignatureData('');
        
        if (onSignatureComplete) {
          onSignatureComplete(result.signature_status);
        }
      } else {
        toast({
          title: "Signature Failed",
          description: result.message || "Failed to submit signature",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Signature submission error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSigning(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading signature status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!signatureStatus) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            Failed to load signature status
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Signature Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5" />
            Digital Signatures
          </CardTitle>
          <CardDescription>
            Electronic signatures for "{contractTitle}"
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client Signature Status */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  signatureStatus.client_signed ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
                )}>
                  <UserIcon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-medium">Client Signature</h4>
                  <p className="text-sm text-muted-foreground">
                    {signatureStatus.client_signed ? 'Signed' : 'Pending signature'}
                  </p>
                </div>
              </div>
              {signatureStatus.client_signed ? (
                <CheckCircleIcon className="h-5 w-5 text-green-600" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-orange-400" />
              )}
            </div>

            {/* Freelancer Signature Status */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  signatureStatus.freelancer_signed ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
                )}>
                  <UserIcon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-medium">Freelancer Signature</h4>
                  <p className="text-sm text-muted-foreground">
                    {signatureStatus.freelancer_signed ? 'Signed' : 'Pending signature'}
                  </p>
                </div>
              </div>
              {signatureStatus.freelancer_signed ? (
                <CheckCircleIcon className="h-5 w-5 text-green-600" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-orange-400" />
              )}
            </div>
          </div>

          {/* Overall Status */}
          <div className="mt-4 p-4 rounded-lg border-2 border-dashed">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Contract Status</h4>
                <p className="text-sm text-muted-foreground">
                  {signatureStatus.fully_signed 
                    ? 'All parties have signed. Contract is ready for funding.'
                    : 'Waiting for signatures from all parties.'
                  }
                </p>
              </div>
              <Badge variant={signatureStatus.fully_signed ? 'default' : 'secondary'}>
                {signatureStatus.fully_signed ? 'Fully Signed' : 'Partial Signatures'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signature Action */}
      {!signatureStatus.user_has_signed && isSigningEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenToolIcon className="h-5 w-5" />
              Your Signature Required
            </CardTitle>
            <CardDescription>
              Please review the contract and provide your digital signature to proceed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showSignaturePad ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <AlertTriangleIcon className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900">Before you sign:</p>
                    <ul className="text-blue-700 mt-1 space-y-1">
                      <li>• Review all contract terms and conditions</li>
                      <li>• Ensure all details are correct</li>
                      <li>• Your signature will be legally binding</li>
                      <li>• You cannot undo this action</li>
                    </ul>
                  </div>
                </div>
                
                <Button 
                  onClick={() => setShowSignaturePad(true)}
                  className="w-full"
                >
                  <PenToolIcon className="h-4 w-4 mr-2" />
                  Sign Contract
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Draw your signature below:</h4>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-1">
                    <canvas
                      ref={canvasRef}
                      className="w-full h-32 cursor-crosshair bg-white rounded"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Use your mouse or touchpad to draw your signature
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={clearSignature}
                    variant="outline"
                    className="flex-1"
                  >
                    <RotateCcwIcon className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                  <Button
                    onClick={submitSignature}
                    disabled={!signatureData || isSigning}
                    className="flex-1"
                  >
                    {isSigning ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Signing...
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon className="h-4 w-4 mr-2" />
                        Submit Signature
                      </>
                    )}
                  </Button>
                </div>

                <Button
                  onClick={() => {
                    setShowSignaturePad(false);
                    clearSignature();
                  }}
                  variant="ghost"
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Signature History */}
      {signatureStatus.signatures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Signature History</CardTitle>
            <CardDescription>
              Record of all signatures for this contract
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {signatureStatus.signatures.map((signature) => (
                <div key={signature.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircleIcon className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {signature.profiles?.display_name || 'Unknown User'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Signed digitally
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <CalendarIcon className="h-3 w-3" />
                      {new Date(signature.signed_at).toLocaleDateString()}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(signature.signed_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legal Notice */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-900">Legal Notice</p>
              <p className="text-amber-700 mt-1">
                Digital signatures are legally binding and have the same legal effect as handwritten signatures. 
                By signing this contract, you agree to be bound by its terms and conditions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}