import { LegalPageLayout, Section } from '@/components/legal-page-layout';
import { Mail } from 'lucide-react';

export default function ContactPage() {
  return (
    <LegalPageLayout title="Contact Us">
      <p className="text-muted-foreground">
        Hirenomous is built and operated by Novalantis. We&rsquo;re happy to help with account access,
        billing questions, or anything else about the product.
      </p>

      <Section heading="Support">
        <a
          href="mailto:info@novalantis.com"
          className="flex items-center gap-2.5 text-base font-semibold text-primary hover:underline"
        >
          <Mail size={18} />
          info@novalantis.com
        </a>
        <p>We aim to respond to all support and billing queries within 1–2 business days.</p>
      </Section>

      <Section heading="Sales and custom integrations">
        <p>
          Need custom interview rubrics, ATS integrations (Greenhouse, Lever, Ashby), or higher volume
          calling plans? Send us an email at{' '}
          <a href="mailto:info@novalantis.com" className="text-primary hover:underline">info@novalantis.com</a>{' '}
          and our team will get back to you within 24 hours.
        </p>
      </Section>

      <Section heading="Security and data privacy">
        <p>
          For data deletion requests, GDPR queries, or security reports, reach our security team directly at{' '}
          <a href="mailto:info@novalantis.com" className="text-primary hover:underline">info@novalantis.com</a>.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
