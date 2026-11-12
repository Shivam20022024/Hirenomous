import { LegalPageLayout, Section } from '@/components/legal-page-layout';
import { Mail } from 'lucide-react';

export default function ContactPage() {
  return (
    <LegalPageLayout title="Contact Us">
      <p className="text-muted-foreground">
        HirePilot is an autonomous AI recruitment platform. We&rsquo;re happy to help with account access,
        billing questions, or anything else about the product.
      </p>

      <Section heading="Support">
        <a
          href="mailto:support@hirepilot.ai"
          className="flex items-center gap-2.5 text-base font-semibold text-primary hover:underline"
        >
          <Mail size={18} />
          support@hirepilot.ai
        </a>
        <p>We aim to respond to all support and billing queries within 1–2 business days.</p>
      </Section>

      <Section heading="Billing & payments">
        <p>
          For questions about a charge, recharge, or your subscription status, email us at the address above
          with your company name and we&rsquo;ll look into it promptly. See also our{' '}
          <a href="/refund-policy" className="text-primary hover:underline">Refund &amp; Cancellation Policy</a>.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
