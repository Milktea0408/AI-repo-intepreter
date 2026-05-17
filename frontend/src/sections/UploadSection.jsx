import { Upload, Loader2 } from "lucide-react";

export default function UploadSection({
  selectedFile,
  setSelectedFile,
  handleUpload,
  isUploading,
  isSummarizing,
  error,
  repoData,
}) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-lg backdrop-blur-md">
      <label className="flex cursor-pointer flex-col gap-2 rounded-[20px] border border-dashed border-slate-300/20 bg-[linear-gradient(180deg,rgba(112,88,255,0.14),rgba(112,88,255,0.03))] p-5">
        <span className="text-[0.82rem] uppercase tracking-[0.08em] text-slate-300/80">
          Repository zip · 50 MB max
        </span>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(event) =>
            setSelectedFile(event.target.files?.[0] || null)
          }
          className="sr-only"
        />
        <div className="flex items-center gap-3">
          <Upload size={24} className="text-violet-400" />
          <strong className="text-[1.08rem] font-semibold text-slate-50">
            {selectedFile ? selectedFile.name : "Choose a .zip file"}
          </strong>
        </div>
        <span className="text-slate-200/75">
          Upload a .zip repository up to 50 MB and let Bob analyse it
        </span>
      </label>

      <button
        className="rounded-full bg-[linear-gradient(135deg,#ffe16a,#86f1ff)] px-4 py-3 font-bold text-slate-900 shadow-[0_10px_28px_rgba(134,241,255,0.2)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-65 flex items-center justify-center gap-2"
        type="button"
        onClick={handleUpload}
        disabled={!selectedFile || isUploading || isSummarizing}
      >
        {(isUploading || isSummarizing) && (
          <Loader2 size={18} className="animate-spin" />
        )}
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
    </div>
  );
}
