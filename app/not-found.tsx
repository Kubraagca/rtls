import Link from 'next/link';

export default function NotFound(): JSX.Element {
  return (
    <main
      className="pc-world"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <section
        className="pc-glass pc-glass--dark"
        style={{ padding: '28px 32px', textAlign: 'center', maxWidth: 420 }}
      >
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--pc-font-display)',
            fontWeight: 700,
            color: 'var(--pc-paper)',
            letterSpacing: 'var(--pc-tr-caps)',
            textTransform: 'uppercase',
            fontSize: 16,
          }}
        >
          Sayfa bulunamadı
        </p>
        <p
          style={{
            margin: '0 0 20px',
            fontFamily: 'var(--pc-font-body)',
            color: 'var(--pc-paper-soft)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Aradığınız sayfa mevcut değil.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: 8,
            padding: '10px 18px',
            background: 'var(--pc-cyan-glow, #22d3ee)',
            color: '#0f172a',
            fontFamily: 'var(--pc-font-display)',
            fontWeight: 700,
            letterSpacing: 'var(--pc-tr-caps)',
            textTransform: 'uppercase',
            fontSize: 12,
            textDecoration: 'none',
          }}
        >
          Ana sayfaya dön
        </Link>
      </section>
    </main>
  );
}
