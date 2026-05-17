import { useState, useCallback } from "react";
import HeroSection from "./sections/HeroSection";
import UploadSection from "./sections/UploadSection";
import DashboardHeader from "./sections/DashboardHeader";
import RepositoryTree from "./sections/RepositoryTree";
import ChatSection from "./sections/ChatSection";
import InsightsPanel from "./sections/InsightsPanel";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl =
  configuredApiBaseUrl?.replace(/\/+$/, "") ||
  (!import.meta.env.PROD ? "http://127.0.0.1:8000" : "");

function getAllFolderPaths(nodes, parentPath = "") {
  const paths = [];
  nodes.forEach((node) => {
    const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
    if (node.type === "directory" && node.children?.length > 0) {
      paths.push(nodePath);
      paths.push(...getAllFolderPaths(node.children, nodePath));
    }
  });
  return paths;
}

function getApiBaseUrl() {
  if (!apiBaseUrl) {
    throw new Error(
      "Missing VITE_API_BASE_URL. Set it to your deployed backend URL before using the production frontend.",
    );
  }
  return apiBaseUrl;
}

function debugApi(label, details) {
  if (import.meta.env.DEV) {
    // console.info(`[api] ${label}`, details);
  }
}

function describeLlmError(llmError) {
  if (!llmError?.category) {
    return "Watsonx did not respond, so Bob returned a local fallback.";
  }

  const messages = {
    missing_env:
      "Watsonx is missing required environment variables on the backend.",
    auth_or_permission:
      "Watsonx rejected the request. Check the API key, project ID, and project access.",
    model_project_or_region:
      "Watsonx could not use the configured model/project/region. Check WATSONX_MODEL_ID, WATSONX_PROJECT_ID, and WATSONX_URL.",
    timeout_or_network:
      "Watsonx timed out or could not be reached from the backend.",
    watsonx_request_failed:
      "Watsonx request failed on the backend.",
  };

  return `${messages[llmError.category] || messages.watsonx_request_failed} Bob returned a local fallback.`;
}

async function readApiResponse(response, fallbackMessage) {
  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.detail || fallbackMessage);
  }

  return data;
}

async function postJson(path, payload, fallbackMessage) {
  const baseUrl = getApiBaseUrl();
  debugApi(path, {
    url: `${baseUrl}${path}`,
    hasRepoSnapshot: Boolean(payload.repo),
    repoId: payload.repo_id,
  });

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await readApiResponse(response, fallbackMessage);
  } catch (apiError) {
    if (apiError instanceof TypeError) {
      throw new Error(
        `${fallbackMessage} The backend could not be reached. Check VITE_API_BASE_URL and backend deployment.`,
        { cause: apiError },
      );
    }
    throw apiError;
  }
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
    useState(false);
  const [isOnboardingSummaryCollapsed, setIsOnboardingSummaryCollapsed] =
    useState(false);

  const techStack = repoData?.tech_stack || [];
  const importantFiles =
    summary?.important_files || repoData?.important_files || [];
  const tree = repoData?.tree || [];

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

      const baseUrl = getApiBaseUrl();
      const uploadResponse = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        body: formData,
      });

      const uploadData = await readApiResponse(uploadResponse, "Upload failed.");

      setRepoData(uploadData);
      setSummary(null);
      setCollapsedFolders(new Set(getAllFolderPaths(uploadData.tree || [])));
      setIsImportantFilesCollapsed(true);
      setMessages([
        {
          role: "assistant",
          content: `IBM Bob analyzed ${uploadData.repo_name} and found ${uploadData.tech_stack.join(", ")}.`,
        },
      ]);

      setIsSummarizing(true);
      const summaryData = await postJson(
        "/summary",
        {
          repo_id: uploadData.repo_id,
          repo: uploadData,
        },
        "Summary generation failed.",
      );

      setSummary(summaryData);
      if (summaryData.llm_available === false) {
        setError(describeLlmError(summaryData.llm_error));
      }
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setIsUploading(false);
      setIsSummarizing(false);
    }
  };

  const handleQuestionSubmit = async (event) => {
    event?.preventDefault();
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
      const questionData = await postJson(
        "/ask",
        {
          repo_id: repoData.repo_id,
          repo: repoData,
          question: trimmedQuestion,
        },
        "Question request failed.",
      );

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: questionData.answer,
          files: questionData.used_files,
        },
      ]);
      if (questionData.llm_available === false) {
        setError(describeLlmError(questionData.llm_error));
      }
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
