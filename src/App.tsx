import Chat from './ui/Chat.tsx';

const features = [
  {
    title: 'Deterministic engine',
    body: 'A pure TypeScript engine builds and links the 3-statement model and DCF. The AI only converses and suggests assumptions — it never does the math.',
  },
  {
    title: 'Validation, first-class',
    body: 'Every figure is checked: the balance sheet balances, cash flow ties out, roll-forwards reconcile, and the revolver circularity converges.',
  },
  {
    title: 'Live Excel, not a snapshot',
    body: 'Download a real .xlsx with working formulas, named ranges, bank-grade formatting, and a Checks tab that re-validates as you edit.',
  },
];

function Logo() {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-xl font-semibold tracking-tight text-white">
        Pro<span className="text-citi-400">Forma</span>
      </span>
      <span className="hidden text-sm text-muted sm:inline">validated models, straight to Excel</span>
    </div>
  );
}

export default function App() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="aurora" aria-hidden="true">
        <span />
      </div>
      <div className="grid-veil" aria-hidden="true" />

      <div className="relative z-10">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Logo />
            <nav className="flex items-center gap-6 text-sm text-muted">
              <a href="#how" className="hidden transition-colors hover:text-white sm:inline">
                How it works
              </a>
              <a
                href="#build"
                className="rounded-full border border-citi-400/40 bg-citi-500/10 px-4 py-1.5 font-medium text-citi-200 transition-colors hover:bg-citi-500/20"
              >
                Build a model
              </a>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6">
          {/* Hero */}
          <section className="pt-16 pb-10 text-center sm:pt-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/5 px-4 py-1.5 text-xs text-muted backdrop-blur">
              <span className="size-1.5 rounded-full bg-citi-400 shadow-[0_0_10px_2px] shadow-citi-400/60" />
              Deterministic engine · the AI never does the math
            </span>

            <h1 className="mx-auto mt-7 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl">
              Describe a company.
              <br className="hidden sm:block" />{' '}
              <span className="bg-gradient-to-r from-citi-300 via-citi-400 to-citi-200 bg-clip-text text-transparent">
                Get a validated model in Excel.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">
              ProForma’s assistant turns a plain-English brief into an integrated 3-statement model and
              DCF, proves that it ties out, and exports a live{' '}
              <code className="rounded bg-white/5 px-1 text-citi-200">.xlsx</code> with working formulas —
              all in your browser.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#build"
                className="rounded-full bg-citi-500 px-6 py-3 font-medium text-white shadow-[0_0_30px_-4px] shadow-citi-500/60 transition-transform hover:scale-[1.02]"
              >
                Start building
              </a>
              <a
                href="#how"
                className="rounded-full border border-line bg-white/5 px-6 py-3 font-medium text-ink backdrop-blur transition-colors hover:bg-white/10"
              >
                How it works
              </a>
            </div>
          </section>

          {/* Builder (chat) */}
          <section id="build" className="scroll-mt-20 py-8">
            <Chat />
          </section>

          {/* Features */}
          <section id="how" className="scroll-mt-20 py-16">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              From a brief to a workbook that ties out
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {features.map((f) => (
                <article
                  key={f.title}
                  className="rounded-2xl border border-line bg-glass p-6 backdrop-blur-xl transition-colors hover:border-citi-400/30"
                >
                  <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
                </article>
              ))}
            </div>
          </section>
        </main>

        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted sm:flex-row">
            <span className="text-white/90">
              Pro<span className="text-citi-400">Forma</span> · MIT licensed
            </span>
            <span>Not investment advice · no proprietary templates or book content.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
