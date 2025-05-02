"use client";

import React, { useState, useTransition, useEffect } from 'react';
import { ContractDetail } from "@/app/(dashboard)/dashboard/contracts/[id]/edit/page"; // Import type from edit page
import TiptapEditor from '@/components/editor/tiptap-editor';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { updateContractContentAction } from '@/app/actions'; // We will create this action next
import { Loader2, SaveIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface ContractEditClientProps {
  contract: ContractDetail;
}

const ContractEditClient: React.FC<ContractEditClientProps> = ({ contract }) => {
  // Initialize state with potentially null content, fallback to default if needed
  const initialEditorContent = contract.content || { type: "doc", content: [{ type: "paragraph" }] };
  const [editorContent, setEditorContent] = useState<any>(initialEditorContent);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  // Ensure state updates if the prop changes (though less likely in this edit scenario)
  useEffect(() => {
    setEditorContent(contract.content || { type: "doc", content: [{ type: "paragraph" }] });
  }, [contract.content]);

  const handleContentChange = (content: any) => {
    setEditorContent(content);
  };

  const handleSaveChanges = () => {
    startTransition(async () => {
      const result = await updateContractContentAction({
        contractId: contract.id,
        newContent: editorContent,
      });

      if (result.error) {
        toast({
          title: "Error Saving Contract",
          description: result.error,
          variant: "destructive",
        });
      } else if (result.success) {
        toast({
          title: "Contract Saved",
          description: "Your changes have been saved successfully.",
        });
        // Optionally redirect back to the view page or stay on edit
        // router.push(`/dashboard/contracts/${contract.id}`);
        router.refresh(); // Refresh data on the current page
      } else {
        toast({
          title: "Error",
          description: "An unexpected error occurred while saving.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contract Content Editor</CardTitle>
        <CardDescription>Use the editor below to modify the contract terms.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <TiptapEditor
          initialContent={editorContent}
          onContentChange={handleContentChange}
          editable={true} // Ensure editor is editable
        />
        <div className="flex justify-end gap-2">
           <Button variant="outline" onClick={() => router.push(`/dashboard/contracts/${contract.id}`)} disabled={isPending}>
             Cancel
           </Button>
           <Button onClick={handleSaveChanges} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
               <>
                 <SaveIcon className="mr-2 h-4 w-4" />
                 Save Changes
               </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ContractEditClient;
