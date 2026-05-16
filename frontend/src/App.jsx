import { useState, useCallback, useMemo, useEffect } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import "./App.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

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
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">IBM Bob repo interpreter</p>
          <h1>
            Upload a repository. Get the architecture, the summary, and the
            answers.
          </h1>
          <p className="hero-copy">
            This MVP extracts a zip, detects the stack, highlights important
            files, and uses Bob to generate onboarding notes and repository Q&A.
          </p>
        </div>

        <div className="upload-card">
          <label className="file-dropzone">
            <span className="dropzone-label">Repository zip</span>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] || null)
              }
            />
            <strong>
              {selectedFile ? selectedFile.name : "Choose a .zip file"}
            </strong>
            <span>Backend will extract and analyze it.</span>
          </label>

          <button
            className="primary-button"
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

          {error ? <p className="status-message error">{error}</p> : null}
          {repoData ? (
            <p className="status-message success">
              Uploaded {repoData.repo_name}. Bob generated the dashboard below.
            </p>
          ) : null}
        </div>
      </section>

      <section
        className={`dashboard ${isDashboardReady ? "visible" : "empty"}`}
      >
        <aside className="panel tree-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Repository tree</p>
              <h2>Structure</h2>
            </div>
            {repoData ? <span className="pill">{repoData.repo_id}</span> : null}
          </div>

          <div className="tree-wrap">
            {tree.length ? (
              renderTree(tree, 0, collapsedFolders, toggleFolder)
            ) : (
              <p className="empty-state">
                Upload a zip to see folders and files here.
              </p>
            )}
          </div>
        </aside>

        <section className="panel chat-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">AI chat</p>
              <h2>Ask the repository</h2>
            </div>
            <span className="pill accent">IBM Bob</span>
          </div>

          <div className="chat-stream">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`chat-bubble ${message.role}`}
              >
                <p>{message.content}</p>
                {message.files?.length ? (
                  <small>Used files: {message.files.join(", ")}</small>
                ) : null}
              </article>
            ))}
          </div>

          <form className="chat-form" onSubmit={handleQuestionSubmit}>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What is the purpose of this repository?"
              disabled={!repoData || isAsking}
            />
            <button
              className="primary-button"
              type="submit"
              disabled={!repoData || isAsking}
            >
              {isAsking ? "Asking..." : "Ask"}
            </button>
          </form>
        </section>

        <aside className="panel insights-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Generated insights</p>
              <h2>What Bob found</h2>
            </div>
          </div>

          <div className="insight-group">
            <h3>Tech stack</h3>
            <div className="tag-row">
              {techStack.length ? (
                techStack.map((item) => (
                  <span key={item} className="tag">
                    {item}
                  </span>
                ))
              ) : (
                <span className="muted">Upload a repo first.</span>
              )}
            </div>
          </div>

          <div className="insight-group">
            <h3>Onboarding summary</h3>
            {summary ? (
              <div className="summary-copy">
                <p>{summary.project_overview}</p>
                <p>{summary.architecture_explanation}</p>
                <ul>
                  {summary.learning_roadmap.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted">
                Bob will generate the summary after upload.
              </p>
            )}
          </div>

          <div className="insight-group">
            <h3>Important files</h3>
            <div className="files-list">
              {importantFiles.length ? (
                importantFiles.map((file) => (
                  <article key={file.path} className="file-card">
                    <strong>{file.path}</strong>
                    <p>
                      {file.snippet
                        ? file.snippet.slice(0, 140)
                        : "No preview available."}
                    </p>
                  </article>
                ))
              ) : (
                <p className="muted">
                  The backend will surface entry points, config, routes, and
                  auth-related files here.
                </p>
              )}
            </div>
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
    <ul className="tree-list" style={{ "--depth": depth }}>
      {nodes.map((node) => {
        const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
        const isDirectory = node.type === "directory";
        const isCollapsed = collapsedFolders.has(nodePath);
        const hasChildren = node.children?.length > 0;

        return (
          <li key={nodePath}>
            <div
              className={`tree-node ${node.type} ${isDirectory && hasChildren ? "has-children" : ""} ${isCollapsed ? "collapsed" : ""}`}
              onClick={
                isDirectory && hasChildren
                  ? () => toggleFolder(nodePath)
                  : undefined
              }
              style={{
                cursor: isDirectory && hasChildren ? "pointer" : "default",
              }}
            >
              {isDirectory && hasChildren && (
                <span className="tree-toggle">
                  {isCollapsed ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </span>
              )}
              <span className="tree-name">{node.name}</span>
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
