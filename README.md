```
██████ ██████ ██████ ██████ ██████ ██████ ██  ██ ██████
██  ██ ██  ██ ██  ██ ██     ██  ██ ██  ██ ██████ ██  ██
██████ ██████ ██  ██ █████  ██  ██ ██████ ██████ ██████
██     ██ ██  ██  ██ ██     ██  ██ ██ ██  ██  ██ ██  ██
██     ██  ██ ██████ ██     ██████ ██  ██ ██  ██ ██  ██

  ✻  ProForma — AI-assisted, validated financial models → Excel
     Deterministic engine · the LLM never does the math · runs in your browser
```

# ProForma

Turn a few inputs into an IB/PE-grade financial model (integrated **3-statement + DCF** to
start), prove that it **ties out**, and export a **live `.xlsx`** workbook with real formulas —
all in your browser, hosted on GitHub Pages.

> **Not investment advice.** Educational tool; outputs depend entirely on your assumptions.

- **Deterministic engine** builds and links every statement — the LLM never does the math.
- **Validation engine** checks math/tie-outs, the revolver circularity, financial logic, and
  assumption sanity.
- **Live Excel** export (formulas + cached results + a self-validating Checks tab).

See [`docs/README.md`](docs/README.md) for full usage, configuration, and deployment, the
[`docs/PRD.md`](docs/PRD.md) for product scope, and [`CLAUDE.md`](CLAUDE.md) for the architecture
rules.

## Quick start
```bash
npm install
npm run dev        # start the app
npm run test:run   # engine + validation test suites
npm run build      # production build to dist/
```

## License
MIT (see [`LICENSE`](LICENSE)). No proprietary bank templates or copyrighted book content.
