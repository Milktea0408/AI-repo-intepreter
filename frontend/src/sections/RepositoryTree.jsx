import { ChevronRight, ChevronDown } from "lucide-react";

export default function RepositoryTree({
  repoData,
  tree,
  collapsedFolders,
  toggleFolder,
}) {
  return (
    <aside className="rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-lg backdrop-blur-md contain-paint self-start flex flex-col">
      <div className="sticky top-0 z-10 mb-4 flex items-start justify-between gap-3 bg-slate-950/90 pb-3 backdrop-blur-md">
        <div>
          <p className="mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-violet-400">
            Repository tree
          </p>
          <h2 className="m-0 text-lg font-semibold text-slate-50">Structure</h2>
        </div>
        {repoData ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-100">
            {repoData.repo_id}
          </span>
        ) : null}
      </div>

      <div className="max-h-[70vh] overflow-y-auto pr-1 grid gap-3">
        {tree.length ? (
          renderTree(tree, 0, collapsedFolders, toggleFolder)
        ) : (
          <p className="text-slate-200/70">
            Upload a zip to see folders and files here.
          </p>
        )}
      </div>
    </aside>
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
              className={`group relative flex items-center gap-2 py-2 pl-4 transition-colors duration-200 before:absolute before:left-0 before:top-1/2 before:h-px before:w-2 before:-translate-y-1/2 before:bg-slate-300/20 ${isDirectory ? "text-amber-200" : "text-slate-200/80"}`}
            >
              {isDirectory && hasChildren && (
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  className="inline-flex shrink-0 items-center justify-center rounded bg-transparent p-1 text-slate-300/60 transition hover:bg-slate-300/5 hover:text-slate-100"
                  onClick={() => toggleFolder(nodePath)}
                >
                  {isCollapsed ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </button>
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
