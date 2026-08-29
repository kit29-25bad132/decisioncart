const STEPS = [
  {
    number: "01",
    title: "Ask",
    description: "Tell us what you need in plain language.",
  },
  {
    number: "02",
    title: "Compare",
    description: "We score and rank products using transparent criteria.",
  },
  {
    number: "03",
    title: "Understand",
    description: "See exactly why each product scored the way it did.",
  },
  {
    number: "04",
    title: "Refine",
    description: "Adjust your preferences and watch the ranking update.",
  },
  {
    number: "05",
    title: "Decide",
    description: "Purchase with confidence, backed by data.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-100">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-zinc-900 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">DC</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">
              DecisionCart
            </span>
          </div>
          <span className="text-sm text-zinc-400">
            AI-Powered Purchase Decisions
          </span>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 pt-24 pb-20">
          <p className="text-sm font-medium text-zinc-400 mb-4 tracking-wide uppercase">
            Built for the Razorpay Buildathon
          </p>
          <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight leading-[1.1] mb-6 max-w-2xl">
            Make purchase decisions
            <br />
            <span className="text-zinc-400">with clarity.</span>
          </h1>
          <p className="text-lg text-zinc-500 leading-relaxed max-w-xl mb-10">
            DecisionCart is your AI-powered purchase decision agent. It helps
            you discover, compare, and purchase products through conversational
            AI with deterministic scoring — no guesswork, no hype.
          </p>
          <div className="flex gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-zinc-900 text-white px-5 py-2.5 text-sm font-medium">
              Coming Soon
            </span>
            <a
              href="https://github.com/kit29-25bad132/decisioncart"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </section>

        {/* Flow */}
        <section className="border-t border-zinc-100">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <h2 className="text-sm font-medium text-zinc-400 mb-10 tracking-wide uppercase">
              How It Works
            </h2>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((step) => (
                <div key={step.number} className="group">
                  <span className="text-xs font-mono text-zinc-300 mb-2 block">
                    {step.number}
                  </span>
                  <h3 className="text-lg font-semibold mb-1.5">{step.title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="border-t border-zinc-100 bg-zinc-50">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <h2 className="text-sm font-medium text-zinc-400 mb-10 tracking-wide uppercase">
              Principles
            </h2>
            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <h3 className="font-semibold mb-2">Category-Agnostic</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  The same engine powers every product category. No hard-coded
                  rules for specific types of products.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Transparent Scoring</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Deterministic, reproducible scores. You see exactly how each
                  product is ranked and why.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">No Invented Data</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Missing product data stays missing. We never fabricate
                  attributes or fill gaps with guesses.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-100">
        <div className="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between text-sm text-zinc-400">
          <span>© 2026 DecisionCart</span>
          <span>Razorpay Buildathon — Track 01</span>
        </div>
      </footer>
    </div>
  );
}
