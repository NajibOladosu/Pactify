import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { TemplatesListClient } from "@/components/dashboard/templates-list-client";
import { Database } from "@/types/supabase";

// Define the type for fetched templates
export type TemplateWithData = Database['public']['Tables']['contract_templates']['Row'];

export default async function TemplatesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Fetch all available templates from database
  const { data: templates, error: fetchError } = await supabase
    .from("contract_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (fetchError) {
    console.error("Error fetching templates:", fetchError);
  }

  const availableTemplates: TemplateWithData[] = templates || [];

  // Get unique categories for filter
  const categories = Array.from(new Set(availableTemplates.map(t => t.category).filter(Boolean)));

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Contract Templates</h1>
          <p className="text-muted-foreground mt-1">Browse and manage your contract templates.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/templates/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            Create Template
          </Link>
        </Button>
      </div>

      {/* Pass templates and categories to client component for filtering and display */}
      <TemplatesListClient initialTemplates={availableTemplates} categories={categories as string[]} />

      {/* Template Gallery Promo */}
      <Card className="bg-gradient-to-r from-primary-500/10 to-secondary-500/10 border-0 shadow-md mt-12">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-medium mb-2">Need more templates?</h3>
              <p className="text-muted-foreground">
                Explore our template gallery for industry-specific contracts and agreements.
                Upgrade to a paid plan to access premium templates.
              </p>
            </div>
            <Button asChild>
              <Link href="/templates">
                View Template Gallery
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
