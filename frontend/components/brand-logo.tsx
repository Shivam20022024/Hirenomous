interface BrandLogoProps {
  className?: string;
}

/** HirePilot brand logo — supersonic pilot flight mark. */
export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      src="/hirepilot-logo.png"
      alt="HirePilot"
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
}
