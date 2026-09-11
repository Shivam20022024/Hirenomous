import { LegalPageLayout, Section } from '@/components/legal-page-layout';

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout title="Refund & Cancellation Policy" updated="September 2026">
      <Section heading="Free trial">
        <p>
          Every new Hireonomous account starts with a 7-day free trial from the date it is approved. No payment
          is required or collected during the trial, and you may stop using the platform at any time during
          this period at no cost.
        </p>
      </Section>

      <Section heading="Billing after the trial">
        <p>
          Once the free trial ends, continued access requires an active recharge. Recharges are billed in
          advance for a fixed period (currently ₹2,999 for 30 days — see our{' '}
          <a href="/pricing" className="text-primary hover:underline">Pricing</a> page for the current amount)
          and processed securely through Razorpay. Access remains active until the paid period ends.
        </p>
      </Section>

      <Section heading="Cancellation">
        <p>
          There is no long-term commitment — you can simply choose not to recharge at the end of a paid period,
          and your account will pause access automatically without any further charge. There are no
          cancellation fees.
        </p>
      </Section>

      <Section heading="Refunds">
        <p>
          Because access is granted immediately upon a successful recharge, payments are generally
          non-refundable, including for any unused portion of a paid period once access has been granted.
        </p>
        <p>Exceptions, considered case by case, include:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>A duplicate or erroneous charge caused by a technical issue;</li>
          <li>A charge that was never applied to your account (i.e. access was not restored after payment).</li>
        </ul>
        <p>
          If you believe you were charged in error, contact us within 7 days of the charge at{' '}
          <a href="mailto:info@novalantis.com" className="text-primary hover:underline">info@novalantis.com</a>{' '}
          with your company name and payment reference, and we will investigate promptly. Approved refunds are
          processed back to the original payment method via Razorpay, typically within 5–7 business days.
        </p>
      </Section>

      <Section heading="Failed or missed payments">
        <p>
          If your trial or paid period ends without a successful recharge, access to Hireonomous is paused
          (your data is retained) until you recharge. No charge is made without your explicit action to pay.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          For any billing question, email{' '}
          <a href="mailto:info@novalantis.com" className="text-primary hover:underline">info@novalantis.com</a>.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
