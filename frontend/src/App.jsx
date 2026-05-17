import { useState, useCallback, useEffect } from "react";
import HeroSection from "./sections/HeroSection";
import UploadSection from "./sections/UploadSection";
import DashboardHeader from "./sections/DashboardHeader";
import RepositoryTree from "./sections/RepositoryTree";
import ChatSection from "./sections/ChatSection";
import InsightsPanel from "./sections/InsightsPanel";

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
  const [isImportantFilesCollapsed, setIsImportantFilesCollapsed] =
    useState(false);
  const [isOnboardingSummaryCollapsed, setIsOnboardingSummaryCollapsed] =
    useState(false);

  const techStack = repoData?.tech_stack || [];
  const importantFiles =
    summary?.important_files || repoData?.important_files || [];
  const tree = repoData?.tree || [];

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

  // Collapse Important files section when repository is uploaded
  useEffect(() => {
    if (repoData) {
      setIsImportantFilesCollapsed(true);
    }
  }, [repoData]);

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
    <main className="min-h-screen overflow-x-hidden px-8 py-12 text-slate-50 max-md:p-4">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.9fr)]">
        <HeroSection />
        <UploadSection
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          handleUpload={handleUpload}
          isUploading={isUploading}
          isSummarizing={isSummarizing}
          error={error}
          repoData={repoData}
        />
      </section>

      <DashboardHeader />

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.1fr)_minmax(280px,0.9fr)] xl:items-start">
        <RepositoryTree
          repoData={repoData}
          tree={tree}
          collapsedFolders={collapsedFolders}
          toggleFolder={toggleFolder}
        />

        <ChatSection
          messages={messages}
          question={question}
          setQuestion={setQuestion}
          handleQuestionSubmit={handleQuestionSubmit}
          repoData={repoData}
          isAsking={isAsking}
        />

        <InsightsPanel
          repoName={repoData?.repo_name}
          techStack={techStack}
          summary={summary}
          importantFiles={importantFiles}
          isOnboardingSummaryCollapsed={isOnboardingSummaryCollapsed}
          setIsOnboardingSummaryCollapsed={setIsOnboardingSummaryCollapsed}
          isImportantFilesCollapsed={isImportantFilesCollapsed}
          setIsImportantFilesCollapsed={setIsImportantFilesCollapsed}
        />
      </section>
    </main>
  );
}

export default App;
