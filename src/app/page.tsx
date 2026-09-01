import Link from "next/link";

const STEPS = [
  {
    number: "01",
    title: "Understand",
    emoji: "🧠",
    description: "Describe what you need in natural language. DecisionCart understands your intent, budget, and priorities.",
  },
  {
    number: "02",
    title: "Analyze",
    emoji: "🔍",
    description: "Extracts structured parameters and evaluates eligible products using transparent criteria.",
  },
  {
    number: "03",
    title: "Compare",
    emoji: "⚖️",
    description: "Multi-attribute scoring ranks products fairly. You see exactly how each product performs.",
  },
  {
    number: "04",
    title: "Recommend",
    emoji: "🏆",
    description: "Explains why the winner won — with contribution points, trade-offs, and what-if scenarios.",
  },
  {
    number: "05",
    title: "Purchase",
    emoji: "💳",
    description: "Confidently proceed to secure Razorpay checkout. Understand → Decide → Purchase.",
  },
];

const PRINCIPLES = [
  {
    title: "Category-Agnostic",
    description: "The same engine powers every product category. No hard-coded rules. Add a category = add a config.",
  },
  {
    title: "Transparent Scoring",
    description: "Deterministic, reproducible scores. You see exactly how each product is ranked and why.",
  },
  {
    title: "No Invented Data",
    description: "Missing product data stays missing. We never fabricate attributes or fill gaps with guesses.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-100/80">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-zinc-900 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-xs tracking-tight">DC</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">
              DecisionCart
            </span>
          </div>
          <span className="text-sm text-zinc-400 hidden sm:inline">
            AI-Powered Purchase Decisions
          </span>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-14 sm:pb-20">
          <p className="text-xs sm:text-sm font-medium text-zinc-400 mb-3 sm:mb-4 tracking-wide uppercase">
            Built for the Razorpay Buildathon — Track 01
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.1] mb-4 sm:mb-6 max-w-2xl">
            Make purchase decisions
            <br />
            <span className="text-zinc-400">with clarity.</span>
          </h1>
          <p className="text-base sm:text-lg text-zinc-500 leading-relaxed max-w-xl mb-8 sm:mb-10">
            DecisionCart is your AI-powered purchase decision agent. Describe what you need,
            and it helps you discover, compare, and purchase products through
            conversational AI with deterministic scoring — no guesswork, no hype.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/workspace"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 text-white px-6 py-2.5 text-sm font-medium hover:bg-zinc-800 active:bg-zinc-950 transition-colors shadow-sm"
            >
              Start Deciding
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="https://github.com/kit29-25bad132/decisioncart"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 hover:shadow-sm transition-all"
            >
              View on GitHub
            </a>
          </div>
        </section>

        {/* The Decision Journey — Key value proposition for judges */}
        <section className="border-t border-zinc-100 bg-zinc-50">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20">
            <div className="mb-10 sm:mb-12">
              <h2 className="text-xs sm:text-sm font-medium text-zinc-400 mb-2 tracking-wide uppercase">
                The Decision Journey
              </h2>
              <p className="text-base sm:text-lg text-zinc-600 max-w-xl">
                Don&apos;t just compare products. <span className="font-semibold text-zinc-900">Make better decisions.</span>
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((step, i) => (
                <div key={step.number} className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{step.emoji}</span>
                    <span className="text-[10px] font-mono text-zinc-300">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold mb-1.5">{step.title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    {step.description}
                  </p>
                  {/* Connector arrow (hidden on last) */}
                  {i < STEPS.length - 1 && (
                    <div className="hidden lg:block absolute top-6 -right-3 text-zinc-200">
                      →
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="border-t border-zinc-100">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20">
            <h2 className="text-xs sm:text-sm font-medium text-zinc-400 mb-10 tracking-wide uppercase">
              How It Works
            </h2>
            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center mb-4">
                  <span className="text-lg">💬</span>
                </div>
                <h3 className="font-semibold mb-1.5">Natural Language</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Just say what you need. &ldquo;Best phone under ₹30,000 with great camera&rdquo; —
                  DecisionCart understands your intent, priorities, and budget.
                </p>
              </div>
              <div>
                <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center mb-4">
                  <span className="text-lg">📊</span>
                </div>
                <h3 className="font-semibold mb-1.5">Transparent Scoring</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Every product is scored on the same criteria. You see the exact weights,
                  normalized values, and contribution points for each attribute.
                </p>
              </div>
              <div>
                <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center mb-4">
                  <span className="text-lg">🎯</span>
                </div>
                <h3 className="font-semibold mb-1.5">Confident Purchase</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  When you&apos;re ready, proceed directly to secure Razorpay checkout.
                  The entire journey from question to purchase — in one place.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="border-t border-zinc-100 bg-zinc-50">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20">
            <h2 className="text-xs sm:text-sm font-medium text-zinc-400 mb-10 tracking-wide uppercase">
              Principles
            </h2>
            <div className="grid gap-8 sm:grid-cols-3">
              {PRINCIPLES.map((p) => (
                <div key={p.title}>
                  <h3 className="font-semibold mb-2">{p.title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    {p.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-zinc-100">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20 text-center">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
              Ready to decide?
            </h2>
            <p className="text-zinc-500 mb-8 max-w-md mx-auto">
              Try DecisionCart with a real product decision. Describe what you need and
              see the intelligence in action.
            </p>
            <Link
              href="/workspace"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 text-white px-8 py-3 text-sm font-medium hover:bg-zinc-800 active:bg-zinc-950 transition-colors shadow-sm"
            >
              Start Deciding
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-100">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 flex items-center justify-between text-sm text-zinc-400">
          <span>© 2026 DecisionCart</span>
          <span>Razorpay Buildathon — Track 01</span>
        </div>
      </footer>
    </div>
  );
}
