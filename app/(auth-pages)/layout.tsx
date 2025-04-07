export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-[80vh] items-center justify-center py-10 px-4">
      <div className="w-full max-w-md bg-background border border-border rounded-lg shadow-sm p-8">
        {children}
      </div>
    </div>
  );
}
