import { LegalPageLayout, Section } from '@/components/legal-page-layout';

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" updated="September 2026">
      <p className="text-muted-foreground">
        This Privacy Policy explains what information Hireonomous (operated by Novalantis) collects, how it is
        used, and how it is protected — for both Customer (hiring company) users and the candidates they
        process through the platform.
      </p>

      <Section heading="1. Information we collect">
        <p><strong>Account data:</strong> name, work email, password (stored hashed), company name, and role.</p>
        <p>
          <strong>Candidate data, uploaded by our Customers:</strong> resumes, contact details, job application
          details, AI phone/video interview recordings, transcripts, and AI-generated evaluation scores.
        </p>
        <p><strong>Payment data:</strong> billing status and subscription dates. Card and payment details are
          collected and processed directly by our payment partner, Razorpay — Novalantis does not store your
          card number, CVV, or bank details.</p>
        <p><strong>Usage data:</strong> log-in activity and basic technical logs (IP address, browser) used for
          security and interview-integrity checks (e.g. detecting unusual tab-switching or multiple devices
          during an AI interview).</p>
      </Section>

      <Section heading="2. How we use this information">
        <ul className="list-disc space-y-1 pl-5">
          <li>To provide the core service — AI resume screening, AI interviews, hiring analytics, and communication with candidates;</li>
          <li>To detect and flag possible interview integrity issues;</li>
          <li>To process payments and manage free trials/subscriptions;</li>
          <li>To send transactional email (interview invitations, decisions) and, where relevant, calls;</li>
          <li>To maintain security, prevent abuse, and improve the platform.</li>
        </ul>
      </Section>

      <Section heading="3. Third-party processors">
        <p>We share data with the following processors, solely to operate the service:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>OpenAI</strong> — resume parsing, interview transcription (speech-to-text), and AI evaluation;</li>
          <li><strong>Bolna</strong> — AI phone screening calls;</li>
          <li><strong>Razorpay</strong> — payment processing;</li>
          <li><strong>MongoDB Atlas / AWS</strong> — database and application hosting;</li>
          <li>Standard email delivery infrastructure for transactional emails.</li>
        </ul>
        <p>These providers are contractually restricted from using your data for any purpose other than providing their service to us.</p>
      </Section>

      <Section heading="4. Data retention">
        <p>
          We retain candidate and account data for as long as the Customer&rsquo;s account is active, or as
          needed to comply with legal obligations. Customers can request deletion of candidate records they no
          longer need by contacting us.
        </p>
      </Section>

      <Section heading="5. Security">
        <p>
          Passwords are stored hashed, not in plain text. Access to candidate data is scoped per company —
          one Customer cannot see another Customer&rsquo;s candidates or interviews. We use industry-standard
          encryption in transit (HTTPS) for all traffic.
        </p>
      </Section>

      <Section heading="6. Candidate rights">
        <p>
          If you are a candidate who was interviewed through Hireonomous and want to know what data was
          collected about you or request its deletion, please contact the hiring company directly, or reach us
          at the email below and we will route your request appropriately.
        </p>
      </Section>

      <Section heading="7. Cookies and local storage">
        <p>
          We use browser local storage to keep you signed in (an authentication token) — we do not use
          third-party advertising or tracking cookies.
        </p>
      </Section>

      <Section heading="8. Children's privacy">
        <p>Hireonomous is a business hiring tool and is not directed at, or knowingly used by, children.</p>
      </Section>

      <Section heading="9. Changes to this policy">
        <p>We may update this Privacy Policy from time to time; material changes will be reflected here with an updated date.</p>
      </Section>

      <Section heading="10. Contact">
        <p>
          For privacy questions or requests, email{' '}
          <a href="mailto:info@novalantis.com" className="text-primary hover:underline">info@novalantis.com</a>.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
