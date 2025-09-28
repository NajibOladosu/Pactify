import { ArrowUpRight, InfoIcon } from "lucide-react";
import Link from "next/link";

export function SmtpMessage() {
  return (
    <div className="bg-muted/50 px-5 py-3 border rounded-md flex gap-4">
      <InfoIcon size={16} className="mt-0.5" />
      <div className="flex flex-col gap-1">
        <small className="text-sm text-secondary-foreground">
          <strong> Note:</strong> Email delivery is powered by Gmail SMTP for reliable
          email sending.
        </small>
        <div>
          <Link
            href="https://support.google.com/accounts/answer/185833"
            target="_blank"
            className="text-primary/50 hover:text-primary flex items-center text-sm gap-1"
          >
            Learn about Gmail App Passwords <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
