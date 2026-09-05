from __future__ import annotations

import os
import re
import shutil
import tempfile
import zipfile
from html import escape
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import logging
from google import genai
from google.genai import types

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_EXTRACTED_BYTES = 150 * 1024 * 1024
MAX_ARCHIVE_FILES = 4000
MAX_DOCUMENTS = 30
MAX_DOCUMENT_CHARS = 4000
DEBUG_LLM_ERRORS = os.getenv("DEBUG_LLM_ERRORS", "").lower() in {"1", "true", "yes"}


def _get_gemini_client():
    missing = _missing_gemini_env()
    if missing:
        raise RuntimeError(f"Missing Gemini environment variables: {', '.join(missing)}")
    return genai.Client(api_key=GEMINI_API_KEY)


def _missing_gemini_env() -> list[str]:
    required = {"GEMINI_API_KEY": GEMINI_API_KEY}
    return [name for name, value in required.items() if not value]


def _gemini_env_status() -> dict[str, Any]:
    missing = _missing_gemini_env()
    return {
        "configured": not missing,
        "missing": missing,
        "model": GEMINI_MODEL,
    }


def _classify_gemini_error(error: Exception) -> str:
    message = str(error).lower()
    if isinstance(error, TimeoutError) or "timeout" in message or "timed out" in message:
        return "timeout_or_network"
    if "missing gemini environment variables" in message:
        return "missing_env"
    if "401" in message or "403" in message or "unauthorized" in message or "forbidden" in message:
        return "auth_or_permission"
    if "404" in message or "model" in message:
        return "model_not_found"
    return "gemini_request_failed"


def _safe_error_detail(error: Exception) -> dict[str, str]:
    detail = {
        "type": type(error).__name__,
        "category": _classify_gemini_error(error),
    }
    if DEBUG_LLM_ERRORS:
        safe_message = re.sub(
            r"(?i)(api[_-]?key|token|password|secret)[^,\s}]*",
            "[redacted]",
            str(error),
        )
        detail["message"] = escape(safe_message[:240])
    return detail


def _messages_to_prompt(messages: list[dict[str, str]]) -> str:
    role_labels = {
        "system": "System",
        "user": "User",
        "assistant": "Assistant",
    }
    rendered_messages = []
    for message in messages:
        role = role_labels.get(message.get("role", "user"), "User")
        rendered_messages.append(f"{role}: {message.get('content', '')}")
    rendered_messages.append("Assistant:")
    return "\n\n".join(rendered_messages)


def _extract_model_text(response: Any) -> str:
    if isinstance(response, str):
        return response.strip()

    if not isinstance(response, dict):
        logger.warning("Unexpected response type from Gemini: %s — value: %r", type(response), response)
        return ""

    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0]
        if isinstance(first_choice, dict):
            message = first_choice.get("message")
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()
            text = first_choice.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()

    results = response.get("results")
    if isinstance(results, list) and results:
        first_result = results[0]
        if isinstance(first_result, dict):
            for key in ("generated_text", "text"):
                value = first_result.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

    for key in ("generated_text", "text", "output"):
        value = response.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    logger.warning("Could not extract text from Gemini response shape: %s", list(response.keys()))
    return ""


def _generate_with_gemini(
    messages: list[dict[str, str]],
    *,
    max_output_tokens: int = 400,
    client: Any | None = None,
) -> str:
    client = client or _get_gemini_client()
    system_instruction = next(
        (message["content"] for message in messages if message.get("role") == "system"),
        None,
    )
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=_messages_to_prompt(
            [message for message in messages if message.get("role") != "system"]
        ),
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            max_output_tokens=max_output_tokens,
            temperature=0.2,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    generated_text = response.text.strip() if response.text else ""
    finish_reason = getattr(response.candidates[0], "finish_reason", None) if response.candidates else None
    if finish_reason and str(finish_reason).upper().endswith("MAX_TOKENS"):
        logger.warning("Gemini response reached the output token limit")
    if not generated_text:
        raise RuntimeError("Gemini returned an empty response")
    return generated_text

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
    documents: list[dict[str, str]] = Field(default_factory=list)
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


def _validate_zip_contents(zip_file: zipfile.ZipFile) -> None:
    members = zip_file.infolist()
    if len(members) > MAX_ARCHIVE_FILES:
        raise HTTPException(
            status_code=413,
            detail=f"Repository zip has too many files. Please upload fewer than {MAX_ARCHIVE_FILES} files.",
        )

    total_size = sum(member.file_size for member in members)
    if total_size > MAX_EXTRACTED_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Repository is too large after extraction. Please upload a smaller repository zip.",
        )


def _normalize_name(name: str) -> str:
    return name.lower().replace("\\", "/")


def _is_text_file(path: Path) -> bool:
    if path.suffix.lower() in TEXT_EXTENSIONS:
        return True
    return path.name.lower() in {"dockerfile", "makefile", "license", "readme"}


def _should_skip_path(path: Path) -> bool:
    ignored_dirs = {"__MACOSX", ".git", ".hg", ".svn", "node_modules", ".venv", "venv"}
    for part in path.parts:
        if part in ignored_dirs:
            return True
        if part.startswith(".") and part != ".env.example":
            return True
    return False


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
        if _should_skip_path(Path(child.name)):
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


def _display_path(path: Path, root_dir: Path) -> str:
    try:
        return path.relative_to(root_dir).as_posix()
    except ValueError:
        return path.name


def _detect_important_files(files: list[Path], root_dir: Path) -> list[dict[str, Any]]:
    scored_files = sorted(files, key=lambda path: (_score_file(path), len(path.parts)), reverse=True)
    selected_files = [path for path in scored_files if _score_file(path) > 0][:8]
    important_files: list[dict[str, Any]] = []
    for path in selected_files:
        snippet = _read_text(path, limit=1200)
        important_files.append(
            {
                "path": _display_path(path, root_dir),
                "score": _score_file(path),
                "snippet": snippet,
                "summary": "",  # Will be filled by _generate_file_summaries
            }
        )
    return important_files


def _generate_file_summaries(important_files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach quick local summaries during upload; /summary does the AI work."""
    for file_entry in important_files:
        file_name = Path(file_entry["path"]).name
        file_entry["summary"] = f"Key repository file: {file_name}"
    return important_files


def _collect_text_documents(files: list[Path], root_dir: Path) -> list[dict[str, str]]:
    documents: list[dict[str, str]] = []
    for path in files:
        if len(documents) >= MAX_DOCUMENTS:
            break
        if not _is_text_file(path):
            continue
        content = _read_text(path, limit=MAX_DOCUMENT_CHARS)
        if content:
            documents.append({"path": _display_path(path, root_dir), "content": content})
    return documents


def _extract_summary_section(text: str, start_marker: str, end_markers: list[str]) -> str:
    marker_pattern = re.escape(start_marker).replace(r"\ ", r"\s*")
    start_match = re.search(
        rf"^[\s#*_`-]*{marker_pattern}",
        text,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    if not start_match:
        start_match = re.search(marker_pattern, text, flags=re.IGNORECASE)
    if not start_match:
        return ""

    start_index = start_match.end()
    end_index = len(text)
    for marker in end_markers:
        marker_pattern = re.escape(marker).replace(r"\ ", r"\s*")
        marker_match = re.search(
            rf"^[\s#*_`-]*{marker_pattern}",
            text[start_index:],
            flags=re.IGNORECASE | re.MULTILINE,
        )
        if marker_match:
            end_index = min(end_index, start_index + marker_match.start())

    return re.sub(r"[*_`#]", "", text[start_index:end_index]).strip("\n :-")


def _path_segments(path: str) -> list[str]:
    return [segment.lower() for segment in Path(path).parts if segment and segment not in {".", ".."}]


def _analyze_repository(root_dir: Path, repo_name: str) -> RepoRecord:
    files = [
        path
        for path in root_dir.rglob("*")
        if path.is_file() and not _should_skip_path(path.relative_to(root_dir))
    ]
    tree = _build_tree(root_dir)
    tech_stack = _detect_tech_stack(files)
    important_files = _detect_important_files(files, root_dir)
    important_files = _generate_file_summaries(important_files)
    documents = _collect_text_documents(files, root_dir)

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
    target_id = repo_id or latest_repo_id
    if target_id and target_id in repository_store:
        return repository_store[target_id]

    if snapshot:
        return _record_from_snapshot(snapshot)

    if not target_id:
        raise HTTPException(
            status_code=404,
            detail="No repository data was provided. Upload a repository first or send the repo snapshot with the request.",
        )
    raise HTTPException(
        status_code=404,
        detail="Repository context expired on the server. Please upload the repository again.",
    )


def _render_summary(record: RepoRecord) -> dict[str, Any]:
    important_paths = [entry["path"] for entry in record.important_files]
    context_paths = [doc["path"] for doc in record.documents[:8]]

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

Use the labels exactly as written, do not add Markdown fences, and keep the response under 350 words.

Repository: {record.repo_name}
Tech Stack: {', '.join(record.tech_stack)}
Important Files: {', '.join(important_paths[:5])}
Available Context Files: {', '.join(context_paths)}
Structure: {len(record.tree)} top-level entries

Key File Contents:{file_context}"""
    
    llm_available = True
    llm_error = None
    try:
        messages = [{"role": "user", "content": prompt}]
        generated_text = _generate_with_gemini(messages, max_output_tokens=900)
            
    except Exception as exc:
        logger.warning("Summary Gemini fallback category=%s", _classify_gemini_error(exc.__cause__ or exc))
        llm_available = False
        llm_error = _safe_error_detail(exc.__cause__ or exc)
        generated_text = f"""PROJECT_OVERVIEW:
Unable to reach Gemini right now, so this summary uses local repository metadata for {record.repo_name}.

ARCHITECTURE_EXPLANATION:
The repository appears to use {', '.join(record.tech_stack)}. Review the important files list and repository tree for the main entry points.

LEARNING_ROADMAP:
- Review key files
- Trace data flow
- Understand API structure"""
    
    return {
        "repo_id": record.repo_id,
        "generated_by": "IBM Bob (Gemini)" if llm_available else "Local fallback",
        "llm_available": llm_available,
        "llm_error": llm_error,
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

    llm_available = True
    llm_error = None
    try:
        answer = _generate_with_gemini([system_msg, user_msg], max_output_tokens=450)
        if not answer:
            raise ValueError("Empty response from model")
    except Exception as exc:
        logger.warning("Ask Gemini fallback category=%s", _classify_gemini_error(exc.__cause__ or exc))
        llm_available = False
        llm_error = _safe_error_detail(exc.__cause__ or exc)
        answer = (
            "I couldn't get a Gemini response right now. Open the matching files to inspect their contents. "
            f"Matched files: {', '.join(Path(d['path']).name for d in matched_files)}"
        )

    return {
        "repo_id": record.repo_id,
        "generated_by": "IBM Bob (Gemini)" if llm_available else "Local fallback",
        "llm_available": llm_available,
        "llm_error": llm_error,
        "question": question,
        "answer": answer,
        "used_files": [d["path"] for d in matched_files],
    }

@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "The backend is running."}


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "gemini": _gemini_env_status(),
    }


@app.post("/upload", response_model=UploadResponse)
async def upload_repo(
    file: UploadFile = File(...),
    content_length: int | None = Header(default=None),
) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Please upload a zip file.")
    if content_length and content_length > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Repository zip is too large. Please upload a .zip file under 50 MB.",
        )

    upload_root = Path(tempfile.mkdtemp(prefix="repo-analyzer-"))
    archive_path = upload_root / Path(file.filename).name
    try:
        contents = await file.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Repository zip is too large. Please upload a .zip file under 50 MB.",
            )
        archive_path.write_bytes(contents)
        if not zipfile.is_zipfile(archive_path):
            raise HTTPException(status_code=400, detail="Only zip files are supported.")

        extract_dir = upload_root / "extracted"
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive_path) as zip_file:
            _validate_zip_contents(zip_file)
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
        shutil.rmtree(upload_root, ignore_errors=True)


@app.post("/summary")
def generate_summary(payload: SummaryRequest) -> dict[str, Any]:
    try:
        record = _find_record(payload.repo_id, payload.repo)
        return _render_summary(record)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Summary generation failed. Check backend Gemini configuration and try again.",
        ) from exc


@app.post("/ask")
def ask_repo_question(payload: AskRequest) -> dict[str, Any]:
    try:
        record = _find_record(payload.repo_id, payload.repo)
        if not payload.question.strip():
            raise HTTPException(status_code=400, detail="Question cannot be empty.")
        return _answer_question(record, payload.question.strip())
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Question answering failed. Check backend Gemini configuration and try again.",
        ) from exc


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
