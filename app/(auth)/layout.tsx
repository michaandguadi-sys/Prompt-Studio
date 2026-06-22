import Link from "next/link";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-paper-50 p-6 text-graphite">
      <div className="pointer-events-none absolute inset-0" aria-hidden style={{ background: "radial-gradient(70% 50% at 50% 0%, rgba(110,123,255,0.10), transparent 60%)" }} />
      <Link href="/" className="relative mb-7 flex flex-col items-center gap-3 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg,#6E7BFF,#4F59E0)", boxShadow: "0 10px 26px -8px rgba(110,123,255,0.6)" }}>
          <span className="text-lg font-black tracking-tight">M</span>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-graphite/45">Mapanisy</div>
          <div className="mt-1 text-xl tracking-tight text-graphite" style={{ fontFamily: SERIF }}>The AI Story-Map Editor</div>
        </div>
      </Link>
      <div className="relative">{children}</div>
      <p className="relative mt-8 text-xs text-graphite/35">
        <Link href="/" className="transition-colors hover:text-graphite/60">Home</Link>
        <span className="mx-2">·</span>
        <Link href="/pricing" className="transition-colors hover:text-graphite/60">Pricing</Link>
      </p>
    </div>
  );
}
