import { ChevronRight, ChevronDown, FileDown } from "lucide-react";
import { getRepoRelativePath } from "../utils/helpers";
import jsPDF from "jspdf";

function normalizeSummaryPaths(text) {
  if (!text) return text;

  return text.replace(/\/(?:[^/\s]+\/)+[^/\s]+/g, (match) =>
    getRepoRelativePath(match),
  );
}

export default function InsightsPanel({
  repoName,
  techStack,
  summary,
  importantFiles,
  isOnboardingSummaryCollapsed,
  setIsOnboardingSummaryCollapsed,
  isImportantFilesCollapsed,
  setIsImportantFilesCollapsed,
}) {
  const handleExportPDF = () => {
    if (!summary || !techStack.length) {
      alert("Please wait for the repository analysis to complete before exporting.");
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    let yPosition = margin;

    // Helper function to add text with word wrap
    const addText = (text, fontSize, isBold = false, color = [0, 0, 0]) => {
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      doc.setTextColor(...color);
      
      const lines = doc.splitTextToSize(text, maxWidth);
      lines.forEach((line) => {
        if (yPosition > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(line, margin, yPosition);
        yPosition += fontSize * 0.5;
      });
      yPosition += 5;
    };

    // Title
    addText("Repository Onboarding Report", 20, true, [124, 58, 237]);
    yPosition += 5;

    // Repository Name
    addText(`Repository: ${repoName || "Unknown"}`, 14, true);
    yPosition += 5;

    // Tech Stack Section
    addText("Tech Stack", 16, true, [124, 58, 237]);
    addText(techStack.join(", "), 11);
    yPosition += 5;

    // Project Overview Section
    if (summary?.project_overview) {
      addText("Project Overview", 16, true, [124, 58, 237]);
      addText(normalizeSummaryPaths(summary.project_overview), 11);
      yPosition += 5;
    }

    // Architecture Explanation Section
    if (summary?.architecture_explanation) {
      addText("Architecture Explanation", 16, true, [124, 58, 237]);
      addText(normalizeSummaryPaths(summary.architecture_explanation), 11);
      yPosition += 5;
    }

    // Learning Roadmap Section
    if (summary?.learning_roadmap?.length) {
      addText("Learning Roadmap", 16, true, [124, 58, 237]);
      summary.learning_roadmap.forEach((step, index) => {
        addText(`${index + 1}. ${normalizeSummaryPaths(step)}`, 11);
      });
      yPosition += 5;
    }

    // Important Files Section
    if (importantFiles.length) {
      addText("Important Files", 16, true, [124, 58, 237]);
      importantFiles.forEach((file) => {
        addText(getRepoRelativePath(file.path), 12, true);
        if (file.summary) {
          addText(file.summary, 10);
        }
        yPosition += 3;
      });
    }

    // Save the PDF
    const fileName = `${repoName || "repository"}_onboarding_report.pdf`;
    doc.save(fileName);
  };

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
        {summary && techStack.length > 0 && (
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition-all hover:border-violet-500/50 hover:bg-violet-500/20 hover:text-violet-200"
            title="Export onboarding report as PDF"
          >
            <FileDown size={16} />
            Export Report
          </button>
        )}
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
        <h3
          className="m-0 text-lg font-semibold text-slate-50 flex items-center gap-2 cursor-pointer hover:text-violet-300 transition-colors"
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
        </h3>
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
        <h3
          className="m-0 text-lg font-semibold text-slate-50 flex items-center gap-2 cursor-pointer hover:text-violet-300 transition-colors"
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
        </h3>
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
