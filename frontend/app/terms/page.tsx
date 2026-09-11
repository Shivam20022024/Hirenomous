import { LegalPageLayout, Section } from '@/components/legal-page-layout';

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms & Conditions" updated="September 2026">
      <p className="text-muted-foreground">
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your use of Hireonomous, an AI-powered
        hiring automation platform provided by Novalantis (&ldquo;Novalantis&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;). By creating an account or using Hireonomous, you agree to these Terms.
      </p>

      <Section heading="1. The service">
        <p>
          Hireonomous helps companies (&ldquo;Customers&rdquo;) screen, interview, and evaluate job candidates
          using AI — including resume analysis, AI phone screening calls, AI video interviews, and hiring
          analytics. Customers act as the employer of record for candidates they process through the platform;
          Novalantis provides the software only.
        </p>
      </Section>

      <Section heading="2. Accounts and access">
        <p>
          A Customer account is created either directly or after Novalantis approves a submitted access
          request. You are responsible for the accuracy of the information you provide and for maintaining the
          confidentiality of your login credentials, and for all activity under your account.
        </p>
      </Section>

      <Section heading="3. Free trial and billing">
        <p>
          New Customer accounts receive a free trial period (currently 7 days) from the date their account is
          approved. After the trial ends, continued access requires an active recharge processed through our
          payment partner, Razorpay. Subscription pricing is shown on our{' '}
          <a href="/pricing" className="text-primary hover:underline">Pricing</a> page and may change with
          notice. Recharges are not automatically recurring unless explicitly enabled — see our{' '}
          <a href="/refund-policy" className="text-primary hover:underline">Refund &amp; Cancellation Policy</a>{' '}
          for full billing terms.
        </p>
      </Section>

      <Section heading="4. Acceptable use">
        <p>You agree not to use Hireonomous to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Discriminate against candidates on any legally protected basis;</li>
          <li>Upload content you do not have the right to share, or that infringes another party&rsquo;s rights;</li>
          <li>Attempt to disrupt, reverse-engineer, or gain unauthorized access to the platform or other Customers&rsquo; data;</li>
          <li>Use the platform for any unlawful purpose.</li>
        </ul>
      </Section>

      <Section heading="5. Candidate data">
        <p>
          Candidate information submitted through Hireonomous (resumes, contact details, interview recordings
          and transcripts, evaluation scores) belongs to the Customer that collected it. Novalantis processes
          this data solely to provide the service, as described in our{' '}
          <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>. Customers are
          responsible for ensuring they have a lawful basis to collect and process candidate data under
          applicable law.
        </p>
      </Section>

      <Section heading="6. Intellectual property">
        <p>
          Hireonomous, its underlying software, and all associated branding are the property of Novalantis.
          Customers retain ownership of the data they upload to the platform.
        </p>
      </Section>

      <Section heading="7. Availability and limitation of liability">
        <p>
          We aim to keep Hireonomous available and reliable but do not guarantee uninterrupted access. AI
          outputs (screening scores, evaluations, recommendations) are decision-support tools, not a
          replacement for human judgment — Customers remain responsible for their own hiring decisions. To the
          maximum extent permitted by law, Novalantis is not liable for indirect, incidental, or consequential
          damages arising from use of the service.
        </p>
      </Section>

      <Section heading="8. Termination">
        <p>
          Either party may stop using/providing the service at any time. Novalantis may suspend or terminate an
          account for violation of these Terms or non-payment after the trial/paid period ends.
        </p>
      </Section>

      <Section heading="9. Changes to these Terms">
        <p>
          We may update these Terms from time to time. Continued use of Hireonomous after a change constitutes
          acceptance of the updated Terms.
        </p>
      </Section>

      <Section heading="10. Governing law">
        <p>These Terms are governed by the laws of India.</p>
      </Section>

      <Section heading="11. Contact">
        <p>
          Questions about these Terms can be sent to{' '}
          <a href="mailto:info@novalantis.com" className="text-primary hover:underline">info@novalantis.com</a>.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
