from __future__ import annotations

import os
import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from ibm_watsonx_ai import Credentials, APIClient
from ibm_watsonx_ai.foundation_models import ModelInference

load_dotenv()

WATSONX_API_KEY = os.getenv("WATSONX_API_KEY")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID")
WATSONX_URL = os.getenv("WATSONX_URL")

def _get_watsonx_client():
    if not WATSONX_API_KEY or not WATSONX_PROJECT_ID:
        raise RuntimeError("WATSONX_API_KEY and WATSONX_PROJECT_ID must be set")

    credentials = Credentials(
        url=WATSONX_URL,
        api_key=WATSONX_API_KEY,
    )
    api_client = APIClient(credentials, project_id=WATSONX_PROJECT_ID)

    return ModelInference(
        api_client=api_client,
        model_id="ibm/granite-8b-code-instruct", # AI model used (can be changed)
    )

app = FastAPI(title="IBM Hackathon Repo Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


TEXT_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".md",
    ".txt",
    ".yml",
    ".yaml",
    ".toml",
    ".ini",
    ".cfg",
    ".html",
    ".css",
    ".scss",
    ".xml",
    ".cs",
    ".meta",
    ".unity",
    ".cpp",
    ".h",
    ".hpp",
    ".swift",
    ".rb",
    ".go",
}

IMPORTANT_NAME_HINTS = (
    "readme",
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "poetry.lock",
    "pipfile",
    "dockerfile",
    "main",
    "app",
    "server",
    "routes",
    "route",
    "auth",
    "config",
    "api",
    "index",
)

TECH_STACK_RULES = [
    ("React", lambda names: any(name.endswith((".jsx", ".tsx")) for name in names) or "package.json" in names),
    ("FastAPI", lambda names: any(name.endswith(".py") for name in names) and "requirements.txt" in names),
    ("Node.js", lambda names: "package.json" in names),
    ("Python", lambda names: any(name.endswith(".py") for name in names)),
    ("Tailwind CSS", lambda names: "tailwind.config.js" in names or any("tailwind" in name for name in names)),
    ("Docker", lambda names: any(name == "dockerfile" or name.endswith("dockerfile") for name in names)),
    ("Java", lambda names: "pom.xml" in names or "build.gradle" in names),
    ("Go", lambda names: any(name.endswith(".go") for name in names)),
    ("Unity / C#", lambda names: any(name.endswith(".cs") for name in names) or any(name.endswith(".unity") for name in names)),
    ("Rust", lambda names: "cargo.toml" in names),
    ("C++", lambda names: any(name.endswith((".cpp", ".h", ".hpp")) for name in names)),
    ("Swift", lambda names: any(name.endswith(".swift") for name in names)),
    ("Ruby", lambda names: "gemfile" in names),
]


class UploadResponse(BaseModel):
    repo_id: str
    repo_name: str
    tree: list[dict[str, Any]]
    tech_stack: list[str]
    important_files: list[dict[str, Any]]
    documents: list[dict[str, str]]
    generated_by: str


class RepoSnapshot(BaseModel):
    repo_id: str | None = None
    repo_name: str
    tree: list[dict[str, Any]]
    tech_stack: list[str]
    important_files: list[dict[str, Any]]
    documents: list[dict[str, str]] = Field(default_factory=list)


class AskRequest(BaseModel):
    repo_id: str | None = None
    repo: RepoSnapshot | None = None
    question: str


class SummaryRequest(BaseModel):
    repo_id: str | None = None
    repo: RepoSnapshot | None = None


@dataclass
class RepoRecord:
    repo_id: str
    repo_name: str
    root_dir: Path
    tree: list[dict[str, Any]]
    tech_stack: list[str]
    important_files: list[dict[str, Any]]
    documents: list[dict[str, str]] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


repository_store: dict[str, RepoRecord] = {}
latest_repo_id: str | None = None


def _safe_extract(zip_file: zipfile.ZipFile, target_dir: Path) -> None:
    for member in zip_file.infolist():
        member_path = Path(member.filename)
        if member_path.is_absolute() or ".." in member_path.parts:
            continue
        destination = target_dir / member_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        if member.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
            continue
        with zip_file.open(member) as source, destination.open("wb") as sink:
            shutil.copyfileobj(source, sink)


def _normalize_name(name: str) -> str:
    return name.lower().replace("\\", "/")


def _is_text_file(path: Path) -> bool:
    if path.suffix.lower() in TEXT_EXTENSIONS:
        return True
    return path.name.lower() in {"dockerfile", "makefile", "license", "readme"}


def _read_text(path: Path, limit: int = 12000) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")[:limit]
    except OSError:
        return ""


def _build_tree(current_dir: Path, depth: int = 0, max_depth: int = 5) -> list[dict[str, Any]]:
    if depth > max_depth:
        return []

    children: list[dict[str, Any]] = []
    for child in sorted(current_dir.iterdir(), key=lambda item: (item.is_file(), item.name.lower())):
        if child.name.startswith(".") and child.name not in {".env", ".env.example"}:
            continue
        if child.is_dir():
            children.append(
                {
                    "name": child.name,
                    "type": "directory",
                    "children": _build_tree(child, depth + 1, max_depth),
                }
            )
            continue
        children.append({"name": child.name, "type": "file"})
    return children


def _detect_tech_stack(files: list[Path]) -> list[str]:
    names = {_normalize_name(path.name) for path in files}
    tech_stack: list[str] = []
    for label, predicate in TECH_STACK_RULES:
        if predicate(names):
            tech_stack.append(label)

    if "package.json" in names:
        package_json = next((path for path in files if path.name == "package.json"), None)
        if package_json:
            content = _read_text(package_json, limit=6000).lower()
            if '"react"' in content and "React" not in tech_stack:
                tech_stack.insert(0, "React")
            if '"vite"' in content and "Vite" not in tech_stack:
                tech_stack.append("Vite")
    if "requirements.txt" in names and "FastAPI" not in tech_stack:
        requirements = next((path for path in files if path.name == "requirements.txt"), None)
        if requirements and "fastapi" in _read_text(requirements).lower():
            tech_stack.append("FastAPI")

    return list(dict.fromkeys(tech_stack)) or ["Unknown stack"]


def _score_file(path: Path) -> int:
    score = 0
    normalized_name = _normalize_name(path.name)
    normalized_path = _normalize_name(path.as_posix())
    
    # Apply penalties for junk files first
    if path.suffix.lower() == ".meta":
        score -= 10
    if ".idea" in normalized_path:
        score -= 10
    if "fonts" in normalized_path:
        score -= 10
    if "license" in normalized_name and path.suffix.lower() != ".md":
        score -= 8
    
    # Add positive scores for important files
    for hint in IMPORTANT_NAME_HINTS:
        if hint in normalized_name:
            score += 4
    if path.name.lower() in {"readme.md", "package.json", "requirements.txt", "pyproject.toml", "makefile"}:
        score += 6
    if path.suffix.lower() in {".py", ".js", ".jsx", ".ts", ".tsx", ".cs", ".cpp", ".swift", ".kt", ".rb", ".go"}:
        score += 2
    return score


def _detect_important_files(files: list[Path]) -> list[dict[str, Any]]:
    scored_files = sorted(files, key=lambda path: (_score_file(path), len(path.parts)), reverse=True)
    selected_files = [path for path in scored_files if _score_file(path) > 0][:8]
    important_files: list[dict[str, Any]] = []
    for path in selected_files:
        snippet = _read_text(path, limit=1200)
        important_files.append(
            {
                "path": path.as_posix(),
                "score": _score_file(path),
                "snippet": snippet,
                "summary": "",  # Will be filled by _generate_file_summaries
            }
        )
    return important_files


def _generate_file_summaries(important_files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Generate AI summaries for important files."""
    try:
        client = _get_watsonx_client()
        
        for file_entry in important_files:
            file_name = Path(file_entry["path"]).name
            snippet = file_entry.get("snippet", "")[:800]  # Limit snippet size for prompt
            
            prompt = f"""Analyze this file and provide a brief 1 sentence summary of what it does:

File: {file_name}
Content preview:
{snippet}

Summary (1 sentence only):"""
            
            try:
                messages = [{"role": "user", "content": prompt}]
                response = client.chat(messages=messages)
                summary = response.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                
                if not summary:
                    summary = f"Configuration or code file: {file_name}"
                    
                file_entry["summary"] = summary
            except Exception as e:
                print(f"Error generating summary for {file_name}: {e}")
                file_entry["summary"] = f"Important file in the repository: {file_name}"
                
    except Exception as e:
        print(f"Error initializing Watsonx client for summaries: {e}")
        # Fallback summaries
        for file_entry in important_files:
            file_name = Path(file_entry["path"]).name
            file_entry["summary"] = f"Key file in the repository: {file_name}"
    
    return important_files


def _collect_text_documents(files: list[Path]) -> list[dict[str, str]]:
    documents: list[dict[str, str]] = []
    for path in files:
        if not _is_text_file(path):
            continue
        content = _read_text(path)
        if content:
            documents.append({"path": path.as_posix(), "content": content})
    return documents


def _extract_summary_section(text: str, start_marker: str, end_markers: list[str]) -> str:
    lower_text = text.lower()
    start_index = lower_text.find(start_marker.lower())
    if start_index == -1:
        return ""

    start_index += len(start_marker)
    end_index = len(text)
    for marker in end_markers:
        marker_index = lower_text.find(marker.lower(), start_index)
        if marker_index != -1 and marker_index < end_index:
            end_index = marker_index

    return text[start_index:end_index].strip("\n :-")


def _path_segments(path: str) -> list[str]:
    return [segment.lower() for segment in Path(path).parts if segment and segment not in {".", ".."}]


def _analyze_repository(root_dir: Path, repo_name: str) -> RepoRecord:
    files = [path for path in root_dir.rglob("*") if path.is_file()]
    tree = _build_tree(root_dir)
    tech_stack = _detect_tech_stack(files)
    important_files = _detect_important_files(files)
    important_files = _generate_file_summaries(important_files)  # Generate AI summaries
    documents = _collect_text_documents(files)

    repo_id = uuid4().hex[:12]
    return RepoRecord(
        repo_id=repo_id,
        repo_name=repo_name,
        root_dir=root_dir,
        tree=tree,
        tech_stack=tech_stack,
        important_files=important_files,
        documents=documents,
    )


def _record_from_snapshot(snapshot: RepoSnapshot) -> RepoRecord:
    return RepoRecord(
        repo_id=snapshot.repo_id or uuid4().hex[:12],
        repo_name=snapshot.repo_name,
        root_dir=Path("."),
        tree=snapshot.tree,
        tech_stack=snapshot.tech_stack,
        important_files=snapshot.important_files,
        documents=snapshot.documents,
    )


def _find_record(repo_id: str | None, snapshot: RepoSnapshot | None = None) -> RepoRecord:
    if snapshot:
        return _record_from_snapshot(snapshot)

    target_id = repo_id or latest_repo_id
    if not target_id or target_id not in repository_store:
        raise HTTPException(
            status_code=404,
            detail="No repository data was provided. Upload a repository first or send the repo snapshot with the request.",
        )
    return repository_store[target_id]


def _render_summary(record: RepoRecord) -> dict[str, Any]:
    important_paths = [entry["path"] for entry in record.important_files]
    
    # Build file content snippets for context
    file_context = ""
    for entry in record.important_files[:3]:
        file_context += f"\n\n=== {entry['path']} ===\n{entry['snippet'][:500]}"
    
    prompt = f"""Based on this repository analysis, return the summary in this exact format:

PROJECT_OVERVIEW:
2-3 complete sentences.

ARCHITECTURE_EXPLANATION:
2-3 complete sentences.

LEARNING_ROADMAP:
- Step 1
- Step 2
- Step 3

Repository: {record.repo_name}
Tech Stack: {', '.join(record.tech_stack)}
Important Files: {', '.join(important_paths[:5])}
Structure: {len(record.tree)} top-level entries

Key File Contents:{file_context}"""
    
    try:
        client = _get_watsonx_client()
        messages = [{"role": "user", "content": prompt}]
        response = client.chat(messages=messages)
        
        generated_text = response.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not generated_text:
            generated_text = str(response)
            
    except Exception as e:
        print(f"ERROR in _render_summary: {type(e).__name__}: {e}")
        generated_text = f"(Watsonx error: {str(e)}. Falling back to local analysis.)"
    
    return {
        "repo_id": record.repo_id,
        "generated_by": "IBM Bob (Watsonx)",
        "project_overview": _extract_summary_section(
            generated_text,
            "PROJECT_OVERVIEW:",
            ["ARCHITECTURE_EXPLANATION:", "LEARNING_ROADMAP:"]
        ) or "Unable to generate overview.",
        "architecture_explanation": _extract_summary_section(
            generated_text,
            "ARCHITECTURE_EXPLANATION:",
            ["LEARNING_ROADMAP:"]
        ) or "Unable to generate architecture explanation.",
        "learning_roadmap": [
            line.lstrip("-• ").strip()
            for line in _extract_summary_section(generated_text, "LEARNING_ROADMAP:", []).splitlines()
            if line.strip()
        ][:3] or ["Review key files", "Trace data flow", "Understand API structure"],
        "important_files": record.important_files,
    }


def _match_documents(record: RepoRecord, question: str) -> list[dict[str, str]]:
    tokens = {token for token in re.findall(r"[a-zA-Z0-9_]+", question.lower()) if len(token) > 2}

    ranked: list[tuple[int, dict[str, str]]] = []
    for document in record.documents:
        path = document["path"].lower()
        filename = Path(document["path"]).name.lower()
        segments = _path_segments(document["path"])
        content = document["content"].lower()

        score = 0
        for token in tokens:
            if token == filename:
                score += 12
            if token in filename:
                score += 8
            if token in segments:
                score += 10
            if token in path:
                score += 4
            if token in content:
                score += 1

        if score:
            ranked.append((score, document))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return [document for _, document in ranked[:5]]


def _answer_question(record: RepoRecord, question: str) -> dict[str, Any]:
    matched_files = _match_documents(record, question)
    # build short labelled snippets (trim long content)
    contexts = []
    for doc in matched_files:
        snippet = doc["content"][:1000].strip()
        name = Path(doc["path"]).name
        contexts.append(f"=== {name} ({doc['path']}) ===\n{snippet}")

    tree_context = "\n".join(
        f"- {entry['name']}" for entry in record.tree[:20]
    )

    system_msg = {
        "role": "system",
        "content": (
            "You are a concise codebase assistant. Answer only from the provided repository context. "
            "If the relevant files are not present in the snippets, say so clearly instead of guessing. "
            "Do NOT output raw file system paths. If referencing a file, use only the filename."
        ),
    }
    user_msg = {
        "role": "user",
        "content": (
            f"Question: {question}\n\n"
            "Repository tree (top-level and nearby entries):\n"
            f"{tree_context}\n\n"
            "Here are relevant file snippets:\n\n" + "\n\n".join(contexts) +
            "\n\nAnswer concisely (1-3 short paragraphs) referencing filenames if helpful."
        ),
    }

    try:
        client = _get_watsonx_client()
        response = client.chat(messages=[system_msg, user_msg])
        answer = response.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        if not answer:
            raise ValueError("Empty response from model")
    except Exception:
        answer = (
            "I couldn't get a model response; open the matching files to inspect their contents. "
            f"Matched files: {', '.join(Path(d['path']).name for d in matched_files)}"
        )

    return {
        "repo_id": record.repo_id,
        "generated_by": "IBM Bob (Watsonx)",
        "question": question,
        "answer": answer,
        "used_files": [d["path"] for d in matched_files],
    }

@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "The backend is running."}


@app.post("/upload", response_model=UploadResponse)
async def upload_repo(file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Please upload a zip file.")

    upload_root = Path(tempfile.mkdtemp(prefix="repo-analyzer-"))
    archive_path = upload_root / file.filename
    try:
        contents = await file.read()
        archive_path.write_bytes(contents)
        if not zipfile.is_zipfile(archive_path):
            raise HTTPException(status_code=400, detail="Only zip files are supported.")

        extract_dir = upload_root / "extracted"
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive_path) as zip_file:
            _safe_extract(zip_file, extract_dir)

        extracted_items = [path for path in extract_dir.iterdir() if path.name != "__MACOSX"]
        repo_root = extract_dir
        if len(extracted_items) == 1 and extracted_items[0].is_dir():
            repo_root = extracted_items[0]

        record = _analyze_repository(repo_root, Path(file.filename).stem or "uploaded-repository")
        repository_store[record.repo_id] = record
        global latest_repo_id
        latest_repo_id = record.repo_id

        return UploadResponse(
            repo_id=record.repo_id,
            repo_name=record.repo_name,
            tree=record.tree,
            tech_stack=record.tech_stack,
            important_files=record.important_files,
            documents=record.documents,
            generated_by="IBM Bob",
        )
    except HTTPException:
        raise
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Invalid zip archive.") from exc
    finally:
        try:
            if archive_path.exists():
                archive_path.unlink()
        except OSError:
            pass


@app.post("/summary")
def generate_summary(payload: SummaryRequest) -> dict[str, Any]:
    record = _find_record(payload.repo_id, payload.repo)
    return _render_summary(record)


@app.post("/ask")
def ask_repo_question(payload: AskRequest) -> dict[str, Any]:
    record = _find_record(payload.repo_id, payload.repo)
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    return _answer_question(record, payload.question.strip())


@app.get("/repo-tree")
def get_repo_tree(repo_id: str | None = None) -> dict[str, Any]:
    record = _find_record(repo_id)
    return {
        "repo_id": record.repo_id,
        "repo_name": record.repo_name,
        "tree": record.tree,
        "tech_stack": record.tech_stack,
        "important_files": record.important_files,
        "generated_by": "IBM Bob",
    }
