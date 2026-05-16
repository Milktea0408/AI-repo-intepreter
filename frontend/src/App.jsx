import { useState, useCallback, useEffect } from "react";
import { ChevronRight, ChevronDown, Upload } from "lucide-react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Extract the repository-relative path from a full file path
function getRepoRelativePath(fullPath) {
  if (!fullPath) return fullPath;

  // Look for common patterns that indicate the start of the repo content
  // Pattern: /extracted/{repo-name}/
  const extractedMatch = fullPath.match(/\/extracted\/[^/]+\/(.+)$/);
  if (extractedMatch) {
    return extractedMatch[1];
  }

  // Fallback: just return the filename if no pattern matches
  const parts = fullPath.split("/");
  return parts[parts.length - 1];
}

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [repoData, setRepoData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Upload a repository zip and ask me how the codebase works.",
    },
  ]);
  const [question, setQuestion] = useState(
    "What is the purpose of this repository?",
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());
  const [isImportantFilesCollapsed, setIsImportantFilesCollapsed] =
    useState(true);

  const techStack = repoData?.tech_stack || [];
  const importantFiles =
    summary?.important_files || repoData?.important_files || [];
  const tree = repoData?.tree || [];
  const isDashboardReady = Boolean(repoData);

  // Get all folder paths to collapse them by default
  const getAllFolderPaths = useCallback((nodes, parentPath = "") => {
    const paths = [];
    nodes.forEach((node) => {
      const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
      if (node.type === "directory" && node.children?.length > 0) {
        paths.push(nodePath);
        if (node.children) {
          paths.push(...getAllFolderPaths(node.children, nodePath));
        }
      }
    });
    return paths;
  }, []);

  // Initialize collapsed folders when tree data is loaded
  useEffect(() => {
    if (tree.length > 0 && collapsedFolders.size === 0) {
      const allFolderPaths = getAllFolderPaths(tree);
      setCollapsedFolders(new Set(allFolderPaths));
    }
  }, [tree, collapsedFolders.size, getAllFolderPaths]);

  const toggleFolder = useCallback((folderPath) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Choose a zip file first.");
      return;
    }

    setError("");
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const uploadResponse = await fetch(`${apiBaseUrl}/upload`, {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok) {
        throw new Error(uploadData.detail || "Upload failed.");
      }

      setRepoData(uploadData);
      setMessages([
        {
          role: "assistant",
          content: `IBM Bob analyzed ${uploadData.repo_name} and found ${uploadData.tech_stack.join(", ")}.`,
        },
      ]);

      setIsSummarizing(true);
      const summaryResponse = await fetch(`${apiBaseUrl}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_id: uploadData.repo_id }),
      });

      const summaryData = await summaryResponse.json();
      if (!summaryResponse.ok) {
        throw new Error(summaryData.detail || "Summary generation failed.");
      }

      setSummary(summaryData);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setIsUploading(false);
      setIsSummarizing(false);
    }
  };

  const handleQuestionSubmit = async (event) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || !repoData) {
      return;
    }

    setError("");
    setIsAsking(true);
    setMessages((currentMessages) => [
      ...currentMessages,
      { role: "user", content: trimmedQuestion },
    ]);

    // Reset textarea height
    const textarea = event.target.querySelector("textarea");
    if (textarea) {
      textarea.style.height = "auto";
    }

    try {
      const questionResponse = await fetch(`${apiBaseUrl}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_id: repoData.repo_id,
          question: trimmedQuestion,
        }),
      });

      const questionData = await questionResponse.json();
      if (!questionResponse.ok) {
        throw new Error(questionData.detail || "Question request failed.");
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: questionData.answer,
          files: questionData.used_files,
        },
      ]);
      setQuestion("");
    } catch (questionError) {
      setError(questionError.message);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden p-8 text-slate-50 max-md:p-4">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.9fr)]">
        <div>
          <p className="mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-violet-400">
            IBM Bob repo interpreter
          </p>
          <h1 className="max-w-[10ch] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[0.95] tracking-tight">
            Upload a repository. Get the architecture, the summary, and the
            answers.
          </h1>
          <p className="mt-4 max-w-[62ch] text-[1.05rem] leading-7 text-slate-200/80">
            This MVP extracts a zip, detects the stack, highlights important
            files, and uses Bob to generate onboarding notes and repository Q&A.
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-lg backdrop-blur-md">
          <label className="flex cursor-pointer flex-col gap-2 rounded-[20px] border border-dashed border-slate-300/20 bg-[linear-gradient(180deg,rgba(112,88,255,0.14),rgba(112,88,255,0.03))] p-5">
            <span className="text-[0.82rem] uppercase tracking-[0.08em] text-slate-300/80">
              Repository zip
            </span>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] || null)
              }
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <Upload size={24} className="text-violet-400" />
              <strong className="text-[1.08rem] font-semibold text-slate-50">
                {selectedFile ? selectedFile.name : "Choose a .zip file"}
              </strong>
            </div>
            <span className="text-slate-200/75">
              Upload a repository and let Bob analyse it
            </span>
          </label>

          <button
            className="rounded-full bg-[linear-gradient(135deg,#ffe16a,#86f1ff)] px-4 py-3 font-bold text-slate-900 shadow-[0_10px_28px_rgba(134,241,255,0.2)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-65"
            type="button"
            onClick={handleUpload}
            disabled={isUploading}
          >
            {isUploading
              ? "Uploading..."
              : isSummarizing
                ? "Analyzing..."
                : "Analyze Repository"}
          </button>

          {error ? <p className="m-0 text-sm text-rose-200">{error}</p> : null}
          {repoData ? (
            <p className="m-0 text-sm text-emerald-200">
              Uploaded {repoData.repo_name}. Bob generated the dashboard below.
            </p>
          ) : null}

          {!repoData && (
            <div className="mt-2 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4">
              <h3 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wider text-violet-300">
                Using the Application
              </h3>
              <ol className="m-0 space-y-2 pl-5 text-sm leading-6 text-slate-200/75 list-decimal">
                <li className="pl-2">Download or create a .zip file of your repository</li>
                <li className="pl-2">Click "Choose a .zip file" above to select it</li>
                <li className="pl-2">Click "Analyze Repository" to upload and process</li>
                <li className="pl-2">Explore the repository structure in the tree view</li>
                <li className="pl-2">Ask questions about the codebase in the AI chat</li>
                <li className="pl-2">Review generated insights and important files</li>
              </ol>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.1fr)_minmax(280px,0.9fr)] xl:items-start">
        <aside className="rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-lg backdrop-blur-md contain-paint self-start">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-violet-400">
                Repository tree
              </p>
              <h2 className="m-0 text-lg font-semibold text-slate-50">
                Structure
              </h2>
            </div>
            {repoData ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-100">
                {repoData.repo_id}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3">
            {tree.length ? (
              renderTree(tree, 0, collapsedFolders, toggleFolder)
            ) : (
              <p className="text-slate-200/70">
                Upload a zip to see folders and files here.
              </p>
            )}
          </div>
        </aside>

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
            <h3 className="m-0 text-lg font-semibold text-slate-50">
              Tech stack
            </h3>
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
            <h3 className="m-0 text-lg font-semibold text-slate-50">
              Onboarding summary
            </h3>
            {summary ? (
              <div className="grid gap-3">
                <p className="m-0 leading-7 text-slate-200/80">
                  {summary.project_overview}
                </p>
                <p className="m-0 leading-7 text-slate-200/80">
                  {summary.architecture_explanation}
                </p>
                <h4 className="m-0 pt-1 text-sm font-semibold uppercase tracking-[0.18em] text-slate-300/70">
                  Notes
                </h4>
                <ul className="m-0 grid list-none gap-2 p-0">
                  {summary.learning_roadmap.map((step) => (
                    <li key={step} className="leading-6 text-slate-200/80">
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-slate-200/75">
                Bob will generate the summary after upload.
              </p>
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
              <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3">
                {importantFiles.length ? (
                  importantFiles.map((file) => (
                    <article
                      key={file.path}
                      className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 overflow-hidden"
                    >
                      <strong className="block text-slate-50 break-words overflow-wrap-anywhere">
                        {getRepoRelativePath(file.path)}
                      </strong>
                      <p className="m-0 mt-2 block text-sm leading-6 text-slate-200/80 break-words">
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
      </section>
    </main>
  );
}

function renderTree(
  nodes,
  depth = 0,
  collapsedFolders = new Set(),
  toggleFolder = () => {},
  parentPath = "",
) {
  return (
    <ul
      className="m-0 list-none border-l border-slate-300/10 pl-3"
      style={{ paddingLeft: depth ? "0.75rem" : 0 }}
    >
      {nodes.map((node) => {
        const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
        const isDirectory = node.type === "directory";
        const isCollapsed = collapsedFolders.has(nodePath);
        const hasChildren = node.children?.length > 0;

        return (
          <li key={nodePath}>
            <div
              className={`group relative flex items-center gap-2 py-2 pl-4 transition-colors duration-200 before:absolute before:left-0 before:top-1/2 before:h-px before:w-2 before:-translate-y-1/2 before:bg-slate-300/20 ${isDirectory && hasChildren ? "cursor-pointer rounded-lg px-3 hover:bg-slate-300/5" : ""} ${isDirectory ? "text-amber-200" : "text-slate-200/80"}`}
              onClick={
                isDirectory && hasChildren
                  ? () => toggleFolder(nodePath)
                  : undefined
              }
            >
              {isDirectory && hasChildren && (
                <span className="inline-flex shrink-0 items-center justify-center text-slate-300/60 transition group-hover:text-slate-100">
                  {isCollapsed ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </span>
              )}
              <span>{node.name}</span>
            </div>
            {hasChildren && !isCollapsed
              ? renderTree(
                  node.children,
                  depth + 1,
                  collapsedFolders,
                  toggleFolder,
                  nodePath,
                )
              : null}
          </li>
        );
      })}
    </ul>
  );
}

export default App;
