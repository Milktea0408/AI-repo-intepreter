import { getRepoRelativePath } from "../utils/helpers";

export default function ChatSection({
  messages,
  question,
  setQuestion,
  handleQuestionSubmit,
  repoData,
  isAsking,
}) {
  return (
    <section className="flex h-[700px] flex-col rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-lg backdrop-blur-md contain-paint self-start">
      <div className="mb-4 flex items-start justify-between gap-3 shrink-0">
        <div>
          <p className="mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-violet-400">
            AI chat
          </p>
          <h2 className="m-0 text-lg font-semibold text-slate-50">
            Ask the repository
          </h2>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
          IBM Bob
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-5 min-h-0">
        {messages.map((message, index) => (
          <article
            key={`${message.role}-${index}`}
            className={`rounded-2xl border border-white/10 p-4 ${message.role === "user" ? "ml-[12%] bg-cyan-300/10 max-md:ml-0" : "mr-[12%] bg-violet-500/10 max-md:mr-0"}`}
          >
            <p className="m-0 mb-2 text-sm leading-6 text-slate-200/80 break-words whitespace-pre-wrap">
              {message.content}
            </p>
            {message.files?.length ? (
              <small className="block text-xs text-slate-300/60">
                Used files:{" "}
                {message.files.map(getRepoRelativePath).join(", ")}
              </small>
            ) : null}
          </article>
        ))}
      </div>

      <form
        className="mt-4 flex items-start gap-3 max-md:flex-col"
        onSubmit={handleQuestionSubmit}
      >
        <textarea
          className="min-w-0 flex-1 resize-none rounded-3xl border border-slate-300/10 bg-slate-950/45 px-4 py-3 text-slate-50 outline-none placeholder:text-slate-200/45 min-h-[48px] max-h-[200px] overflow-y-auto"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What is the purpose of this repository?"
          disabled={!repoData || isAsking}
          rows={1}
          onInput={(event) => {
            // Auto-resize textarea based on content
            event.target.style.height = "auto";
            event.target.style.height =
              Math.min(event.target.scrollHeight, 200) + "px";
          }}
          onKeyDown={(event) => {
            // Submit on Enter, new line on Shift+Enter
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleQuestionSubmit(event);
            }
          }}
        />
        <button
          className="rounded-full bg-[linear-gradient(135deg,#ffe16a,#86f1ff)] px-4 py-3 font-bold text-slate-900 shadow-[0_10px_28px_rgba(134,241,255,0.2)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-65 shrink-0"
          type="submit"
          disabled={!repoData || isAsking}
        >
          {isAsking ? "Asking..." : "Ask"}
        </button>
      </form>
    </section>
  );
}
