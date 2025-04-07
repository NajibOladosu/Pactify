import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Pactify",
  description: "Privacy Policy for Pactify - Learn how we collect, use, and protect your personal information.",
};

export default function PrivacyPage() {
  const lastUpdated = "June 15, 2024";

  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <div className="mb-12 text-center">
        <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4">Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: {lastUpdated}</p>
      </div>

      <div className="prose prose-stone dark:prose-invert max-w-none">
        <p>
          At Pactify, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, 
          and safeguard your information when you use our platform. Please read this policy carefully. If you disagree 
          with its terms, please discontinue use of our platform immediately.
        </p>

        <h2>1. Information We Collect</h2>
        <p>
          We collect information that you provide directly to us when you:
        </p>
        <ul>
          <li>Register for an account</li>
          <li>Complete a profile</li>
          <li>Create or sign contracts</li>
          <li>Make or receive payments</li>
          <li>Communicate with other users</li>
          <li>Contact our support team</li>
          <li>Respond to surveys or promotions</li>
        </ul>

        <p>
          This information may include:
        </p>
        <ul>
          <li>Name, email address, and phone number</li>
          <li>Billing information and payment details</li>
          <li>Professional experience and portfolio information</li>
          <li>Contract terms and conditions</li>
          <li>Messages and communications</li>
          <li>Profile photos and other uploaded content</li>
        </ul>

        <h3>Automatically Collected Information</h3>
        <p>
          When you access or use our platform, we automatically collect certain information, including:
        </p>
        <ul>
          <li>Log information (IP address, browser type, pages visited, time spent)</li>
          <li>Device information (hardware model, operating system, unique device identifiers)</li>
          <li>Location information (derived from your IP address)</li>
          <li>Usage data (features used, actions taken, interactions with the platform)</li>
          <li>Cookies and similar tracking technologies</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>
          We use the information we collect to:
        </p>
        <ul>
          <li>Provide, maintain, and improve our platform</li>
          <li>Process transactions and send related information</li>
          <li>Verify your identity and prevent fraud</li>
          <li>Send administrative messages, updates, and security alerts</li>
          <li>Respond to your comments, questions, and requests</li>
          <li>Provide customer service and technical support</li>
          <li>Monitor and analyze trends, usage, and activities</li>
          <li>Personalize and improve your experience</li>
          <li>Comply with legal obligations</li>
        </ul>

        <h2>3. Information Sharing and Disclosure</h2>
        <p>
          We may share your information with:
        </p>
        <ul>
          <li><strong>Other Users:</strong> When you create contracts, the information you include is shared with the other parties to the contract.</li>
          <li><strong>Service Providers:</strong> Third-party vendors who provide services on our behalf, such as payment processing, data analysis, email delivery, hosting, and customer service.</li>
          <li><strong>Business Transfers:</strong> If we are involved in a merger, acquisition, or sale of all or a portion of our assets, your information may be transferred as part of that transaction.</li>
          <li><strong>Legal Requirements:</strong> If required to do so by law or in response to valid requests by public authorities (e.g., a court or government agency).</li>
          <li><strong>Protection of Rights:</strong> If we believe disclosure is necessary to protect the rights, property, or safety of Pactify, our users, or others.</li>
        </ul>

        <h2>4. Data Security</h2>
        <p>
          We implement appropriate technical and organizational measures to protect the security of your personal information. 
          However, please be aware that no method of transmission over the Internet or method of electronic storage is 100% 
          secure and we cannot guarantee the absolute security of your information.
        </p>

        <h2>5. Your Rights and Choices</h2>
        <p>
          Depending on your location, you may have certain rights regarding your personal information, including:
        </p>
        <ul>
          <li>Accessing, correcting, or deleting your personal information</li>
          <li>Restricting or objecting to our processing of your personal information</li>
          <li>Portability of your personal information</li>
          <li>Withdrawing consent for future processing</li>
        </ul>
        <p>
          To exercise these rights, please contact us at privacy@pactify.io.
        </p>

        <h2>6. Account Information</h2>
        <p>
          You may update, correct, or delete your account information at any time by logging into your online account. 
          If you wish to delete your account, please note that we may retain certain information as required by law or 
          for legitimate business purposes.
        </p>

        <h2>7. Cookies and Tracking Technologies</h2>
        <p>
          We use cookies and similar tracking technologies to track the activity on our platform and hold certain information. 
          You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do 
          not accept cookies, you may not be able to use some portions of our platform.
        </p>

        <h2>8. International Data Transfers</h2>
        <p>
          Your information may be transferred to, and processed in, countries other than the country in which you reside. 
          These countries may have data protection laws that are different from the laws of your country. We ensure appropriate 
          safeguards are in place to protect your information when transferred internationally.
        </p>

        <h2>9. Children's Privacy</h2>
        <p>
          Our platform is not intended for use by children under the age of 18. We do not knowingly collect personal 
          information from children under 18. If we learn we have collected personal information from a child under 18, 
          we will delete that information promptly.
        </p>

        <h2>10. Third-Party Links and Services</h2>
        <p>
          Our platform may contain links to third-party websites and services. We are not responsible for the privacy 
          practices employed by these third parties, and we encourage you to read their privacy policies before providing 
          any information to them.
        </p>

        <h2>11. Changes to This Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new 
          Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy 
          periodically for any changes.
        </p>

        <h2>12. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy, please contact us at privacy@pactify.io.
        </p>

        <h2>13. California Privacy Rights</h2>
        <p>
          California residents may have additional privacy rights under the California Consumer Privacy Act (CCPA) 
          and other California privacy laws. For more information about these rights and how to exercise them, 
          please contact us at privacy@pactify.io.
        </p>

        <h2>14. European Privacy Rights</h2>
        <p>
          If you are located in the European Economic Area (EEA), you have certain rights under the General Data Protection 
          Regulation (GDPR). For more information about these rights and how to exercise them, please contact us at 
          privacy@pactify.io.
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
