import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Pactify",
  description: "Terms of Service and conditions for using the Pactify platform.",
};

export default function TermsPage() {
  const lastUpdated = "June 15, 2024";

  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <div className="mb-12 text-center">
        <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4">Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: {lastUpdated}</p>
      </div>

      <div className="prose prose-stone dark:prose-invert max-w-none">
        <p>
          Welcome to Pactify. These Terms of Service ("Terms") govern your access to and use of the Pactify platform, 
          including our website, services, and applications (collectively, the "Service"). By accessing or using the Service, 
          you agree to be bound by these Terms. If you do not agree to these Terms, do not access or use the Service.
        </p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using the Service, you represent and warrant that you have the legal capacity to enter into these Terms. 
          If you are using the Service on behalf of a company, organization, or other entity, you represent and warrant that 
          you have the authority to bind that entity to these Terms, in which case "you" will refer to that entity.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          Pactify provides a platform for creating, managing, and executing legally binding contracts between freelancers and clients. 
          The Service includes features such as contract creation, electronic signatures, payment processing, and communications tools.
        </p>
        <p>
          We reserve the right to modify, suspend, or discontinue the Service or any part thereof at any time, with or without notice. 
          We shall not be liable to you or any third party for any modification, suspension, or discontinuation of the Service.
        </p>

        <h2>3. User Accounts</h2>
        <p>
          To access certain features of the Service, you must register for an account. When registering, you agree to provide accurate, 
          current, and complete information about yourself. You are responsible for maintaining the confidentiality of your account 
          credentials and for all activities that occur under your account.
        </p>
        <p>
          You agree to immediately notify us of any unauthorized use of your account or any other breach of security. 
          We will not be liable for any loss or damage arising from your failure to comply with this section.
        </p>

        <h2>4. User Content</h2>
        <p>
          The Service allows you to create, upload, store, and share content, including contracts, messages, and 
          other materials (collectively, "User Content"). You retain all rights in and to your User Content, and you 
          are solely responsible for your User Content and the consequences of posting or publishing it.
        </p>
        <p>
          By posting or publishing User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, 
          reproduce, modify, adapt, publish, translate, create derivative works from, distribute, and display such User Content 
          in connection with providing and promoting the Service.
        </p>

        <h2>5. Payments and Fees</h2>
        <p>
          Certain features of the Service may require payment of fees. You agree to pay all applicable fees as described 
          on the Service. All payments are non-refundable except as otherwise provided in these Terms or as required by applicable law.
        </p>
        <p>
          Pactify may change the fees for the Service at any time by posting the changes on the Service or by notifying you directly. 
          Your continued use of the Service after the fee change becomes effective constitutes your agreement to pay the changed amount.
        </p>

        <h2>6. Escrow Services</h2>
        <p>
          The Service may include escrow payment services, which allow clients to deposit funds that are released to 
          freelancers upon completion of specified milestones or deliverables. When using these services, you agree to 
          comply with our Escrow Payment Terms, which are incorporated by reference into these Terms.
        </p>

        <h2>7. Intellectual Property</h2>
        <p>
          The Service and its original content, features, and functionality are owned by Pactify and are protected by 
          international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws.
        </p>
        <p>
          You may not copy, modify, create derivative works of, publicly display, publicly perform, republish, or transmit 
          any of the material on our Service, or distribute or otherwise use the Service in any way for any public or 
          commercial purpose without our prior written consent.
        </p>

        <h2>8. Disclaimer of Warranties</h2>
        <p>
          THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
          TO THE FULLEST EXTENT PERMISSIBLE PURSUANT TO APPLICABLE LAW, PACTIFY DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED,
          INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          IN NO EVENT SHALL PACTIFY, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS, BE LIABLE FOR ANY INDIRECT, INCIDENTAL, 
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE, GOODWILL, 
          OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE SERVICE.
        </p>

        <h2>10. Indemnification</h2>
        <p>
          You agree to defend, indemnify, and hold harmless Pactify and its officers, directors, employees, and agents, 
          from and against any claims, liabilities, damages, losses, and expenses, including, without limitation, reasonable 
          legal and accounting fees, arising out of or in any way connected with your access to or use of the Service or your 
          violation of these Terms.
        </p>

        <h2>11. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of the State of California, 
          without regard to its conflict of law provisions. You agree to submit to the personal jurisdiction of the 
          courts located within San Francisco County, California for the purpose of litigating all such claims.
        </p>

        <h2>12. Changes to Terms</h2>
        <p>
          We reserve the right to modify these Terms at any time. We will provide notice of any material changes by posting 
          the new Terms on the Service or by notifying you directly. Your continued use of the Service after the changes are 
          posted constitutes your agreement to the changes.
        </p>

        <h2>13. Termination</h2>
        <p>
          We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, 
          for any reason, including without limitation if you breach these Terms. Upon termination, your right to use the 
          Service will immediately cease.
        </p>

        <h2>14. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at legal@pactify.io.
        </p>
      </div>

      <div className="mt-12 text-center">
        <Button asChild>
          <Link href="/contact">Contact Us With Questions</Link>
        </Button>
      </div>
    </div>
  );
}
