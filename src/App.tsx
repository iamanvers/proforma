import Builder from './ui/Builder.tsx';

const features = [
  {
    title: 'Deterministic engine',
    body: 'A pure TypeScript engine builds and links the 3-statement model and DCF. The LLM never does the math — the model generates with zero AI calls.',
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
      <span className="font-display text-xl tracking-tight text-citi-900">
        Pro<span className="text-citi-600">Forma</span>
      </span>
      <span className="hidden text-sm text-muted sm:inline">financial models, straight to Excel</span>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-dvh">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <nav className="flex items-center gap-6 text-sm text-citi-900">
            <a href="#how" className="hidden transition-colors hover:text-citi-600 sm:inline">
              How it works
            </a>
            <a
              href="#build"
              className="rounded-full bg-citi-700 px-4 py-1.5 font-medium text-white transition-colors hover:bg-citi-800"
            >
              Build a model
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        {/* Hero */}
        <section className="pt-16 pb-12 text-center sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-citi-200 bg-citi-50 px-4 py-1.5 text-xs font-medium text-citi-800">
            <span className="size-1.5 rounded-full bg-citi-500" />
            Deterministic engine · the LLM never does the math
          </span>

          <h1 className="font-display mx-auto mt-6 max-w-3xl text-4xl leading-[1.12] tracking-tight text-citi-950 sm:text-5xl">
            Validated IB/PE models, straight to a live Excel workbook.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            ProForma turns a few assumptions into an integrated 3-statement model and DCF, proves that it
            ties out, and exports a real <code className="rounded bg-citi-50 px-1 text-citi-800">.xlsx</code>{' '}
            with working formulas — all in your browser.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#build"
              className="rounded-full bg-citi-700 px-6 py-3 font-medium text-white shadow-sm transition-transform hover:scale-[1.02]"
            >
              Build a model
            </a>
            <a
              href="#how"
              className="rounded-full border border-citi-200 bg-white px-6 py-3 font-medium text-citi-800 transition-colors hover:bg-citi-50"
            >
              How it works
            </a>
          </div>
        </section>

        {/* Features */}
        <section id="how" className="scroll-mt-20">
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((f) => (
              <article key={f.title} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                <h3 className="font-display text-lg text-citi-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Builder */}
        <section id="build" className="scroll-mt-20 py-14">
          <div className="mb-6">
            <h2 className="font-display text-3xl tracking-tight text-citi-950">Build your model</h2>
            <p className="mt-2 max-w-2xl text-muted">
              Pick a template, adjust the drivers, and generate. The engine links the statements, solves the
              revolver circularity, validates the result, and hands you a live workbook.
            </p>
          </div>
          <Builder />
        </section>
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted sm:flex-row">
          <span className="font-display text-citi-900">
            Pro<span className="text-citi-600">Forma</span> · MIT licensed
          </span>
          <span>Not investment advice · no proprietary templates or book content.</span>
        </div>
      </footer>
    </div>
  );
}
