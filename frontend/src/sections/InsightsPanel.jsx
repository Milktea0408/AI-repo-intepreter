import { ChevronRight, ChevronDown } from "lucide-react";
import { getRepoRelativePath } from "../utils/helpers";

function normalizeSummaryPaths(text) {
  if (!text) return text;

  return text.replace(/\/(?:[^/\s]+\/)+[^/\s]+/g, (match) =>
    getRepoRelativePath(match),
  );
}

export default function InsightsPanel({
  techStack,
  summary,
  importantFiles,
  isOnboardingSummaryCollapsed,
  setIsOnboardingSummaryCollapsed,
  isImportantFilesCollapsed,
  setIsImportantFilesCollapsed,
}) {
  return (
    <aside className="rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-lg backdrop-blur-md contain-paint self-start">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-violet-400">
            Generated insights
          </p>
          <h2 className="m-0 text-lg font-semibold text-slate-50">
            What Bob found
          </h2>
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="m-0 text-lg font-semibold text-slate-50">Tech stack</h3>
        <div className="flex flex-wrap gap-2">
          {techStack.length ? (
            techStack.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-100"
              >
                {item}
              </span>
            ))
          ) : (
            <span className="text-slate-200/75">Upload a repo first.</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <button
          type="button"
          aria-expanded={!isOnboardingSummaryCollapsed}
          className="m-0 flex items-center gap-2 bg-transparent p-0 text-left text-lg font-semibold text-slate-50 transition-colors hover:text-violet-300"
          onClick={() =>
            setIsOnboardingSummaryCollapsed(!isOnboardingSummaryCollapsed)
          }
        >
          {isOnboardingSummaryCollapsed ? (
            <ChevronRight size={20} />
          ) : (
            <ChevronDown size={20} />
          )}
          Onboarding summary
        </button>
        {!isOnboardingSummaryCollapsed && (
          <>
            {summary ? (
              <div className="grid gap-3">
                <p className="m-0 leading-7 text-slate-200/80">
                  {normalizeSummaryPaths(summary.project_overview)}
                </p>
                <p className="m-0 leading-7 text-slate-200/80">
                  {normalizeSummaryPaths(summary.architecture_explanation)}
                </p>
                <h4 className="m-0 pt-1 text-sm font-semibold uppercase tracking-[0.18em] text-slate-300/70">
                  Notes
                </h4>
                <ul className="m-0 grid list-none gap-2 p-0">
                  {summary.learning_roadmap.map((step) => (
                    <li key={step} className="leading-6 text-slate-200/80">
                      {normalizeSummaryPaths(step)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-slate-200/75">
                Bob will generate the summary after upload.
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-4 grid gap-3">
        <button
          type="button"
          aria-expanded={!isImportantFilesCollapsed}
          className="m-0 flex items-center gap-2 bg-transparent p-0 text-left text-lg font-semibold text-slate-50 transition-colors hover:text-violet-300"
          onClick={() =>
            setIsImportantFilesCollapsed(!isImportantFilesCollapsed)
          }
        >
          {isImportantFilesCollapsed ? (
            <ChevronRight size={20} />
          ) : (
            <ChevronDown size={20} />
          )}
          Important files
        </button>
        {!isImportantFilesCollapsed && (
          <div className="max-h-105 overflow-y-auto pr-1 space-y-3">
            {importantFiles.length ? (
              importantFiles.map((file) => (
                <article
                  key={file.path}
                  className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 overflow-hidden"
                >
                  <strong className="block text-slate-50 wrap-break-word overflow-wrap-anywhere">
                    {getRepoRelativePath(file.path)}
                  </strong>
                  <p className="m-0 mt-2 block text-sm leading-6 text-slate-200/80 wrap-break-word">
                    {file.summary || "Analyzing file purpose..."}
                  </p>
                </article>
              ))
            ) : (
              <p className="text-slate-200/75">
                The backend will surface entry points, config, routes, and
                auth-related files here.
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
