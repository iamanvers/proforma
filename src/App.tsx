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
    body: 'Export a real .xlsx with working formulas, named ranges, bank-grade formatting, and a Checks tab that re-validates as you edit.',
  },
];

const steps = [
  { n: '01', title: 'Provide inputs', body: 'Fill a guided form or upload a doc — parsed entirely in your browser.' },
  { n: '02', title: 'Engine builds it', body: 'Statements link and the revolver circular reference solves to convergence.' },
  { n: '03', title: 'Validation runs', body: 'Math, assumptions, and financial logic are checked and reported.' },
  { n: '04', title: 'Download', body: 'Take away a live Excel workbook plus a README that explains it.' },
];

function Logo() {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-xl tracking-tight text-white">
        Pro<span className="text-citi-400">Forma</span>
      </span>
      <span className="hidden text-sm text-slate-400 sm:inline">
        financial models, straight to Excel
      </span>
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
        {/* Nav */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Logo />
          <nav className="flex items-center gap-6 text-sm text-slate-300">
            <a href="#how" className="hidden transition-colors hover:text-white sm:inline">
              How it works
            </a>
            <a href="#features" className="hidden transition-colors hover:text-white sm:inline">
              Features
            </a>
            <a
              href="#build"
              className="rounded-full border border-citi-400/40 bg-citi-400/10 px-4 py-1.5 font-medium text-citi-200 transition-colors hover:bg-citi-400/20"
            >
              Build a model
            </a>
          </nav>
        </header>

        {/* Hero */}
        <main className="mx-auto max-w-6xl px-6">
          <section className="pt-20 pb-24 text-center sm:pt-28">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-300 backdrop-blur">
              <span className="size-1.5 rounded-full bg-citi-400 shadow-[0_0_10px_2px] shadow-citi-400/60" />
              Deterministic engine · the LLM never does the math
            </span>

            <h1 className="mx-auto mt-8 max-w-4xl text-4xl leading-[1.1] tracking-tight text-white sm:text-6xl">
              Validated IB/PE models,
              <br className="hidden sm:block" />{' '}
              <span className="bg-gradient-to-r from-citi-300 via-citi-400 to-citi-200 bg-clip-text text-transparent">
                straight to a live Excel workbook.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
              ProForma turns a few inputs into an integrated 3-statement model and DCF, proves
              that it ties out, and exports a real <code className="text-citi-200">.xlsx</code> with
              working formulas — all in your browser, hosted on GitHub Pages.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <a
                href="#build"
                className="rounded-full bg-citi-400 px-6 py-3 font-medium text-citi-950 shadow-[0_0_30px_-4px] shadow-citi-400/50 transition-transform hover:scale-[1.03]"
              >
                Build a model
              </a>
              <a
                href="#how"
                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/10"
              >
                See how it works
              </a>
            </div>
          </section>

          {/* Features */}
          <section id="features" className="scroll-mt-24">
            <div className="grid gap-5 md:grid-cols-3">
              {features.map((f) => (
                <article
                  key={f.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition-colors hover:border-citi-400/30 hover:bg-white/[0.06]"
                >
                  <h3 className="text-xl text-white">{f.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">{f.body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* How it works */}
          <section id="how" className="scroll-mt-24 py-24">
            <h2 className="text-center text-3xl tracking-tight text-white sm:text-4xl">
              From inputs to a workbook that ties out
            </h2>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s) => (
                <div key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <span className="text-sm font-medium text-citi-400">{s.n}</span>
                  <h3 className="mt-3 text-lg text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Build placeholder */}
          <section id="build" className="scroll-mt-24 pb-24">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center backdrop-blur">
              <h2 className="text-3xl tracking-tight text-white">The builder is under construction</h2>
              <p className="mx-auto mt-4 max-w-xl text-slate-300">
                The deterministic engine and validation layer are live in code. The assumption
                editor, Excel export, and AI-assisted inputs are landing next.
              </p>
              <div className="mx-auto mt-8 max-w-2xl rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-5 py-4 text-left text-sm text-amber-100/90">
                <strong className="text-amber-200">Not investment advice.</strong> ProForma is an
                educational modeling tool. Outputs are illustrative and depend entirely on the
                assumptions you provide.
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-slate-400 sm:flex-row">
            <span>
              Pro<span className="text-citi-400">Forma</span> · MIT licensed
            </span>
            <span>Built with a deterministic engine — no proprietary templates, no book content.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
