export default function HeroSection() {
  return (
    <div>
      <p className="mb-6 text-[0.72rem] uppercase tracking-[0.14em] text-violet-400">
        IBM Bob repo interpreter
      </p>
      <h1 className="max-w-[10ch] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[0.95] tracking-tight">
        Upload a repo. Get the architecture, summary, and answers.
      </h1>
      <p className="mt-4 max-w-[62ch] text-[1.05rem] leading-7 text-slate-200/80">
        This application extracts a zip, detects the stack, highlights important
        files, and uses Bob to generate onboarding notes and repository Q&A.
      </p>
    </div>
  );
}
