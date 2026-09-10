interface BrandLogoProps {
  className?: string;
}

/** Novalantis mark — the metallic "N" swirl. */
export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      src="/novalantis-mark.png"
      alt="Novalantis"
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
}
