# AI Repo intepreter

## Summary

A repo interpreter for built for the IBM BOB Hackathon which helps users understand codebases quickly by analyzing repository structure and content.

## Setup

### Frontend

The frontend uses React + Vite + Tailwind CSS.

#### Prerequisites
- Node.js (LTS recommended)
- npm (comes with Node)

#### Install dependencies

From the project root:

```bash
cd frontend
npm install
```

#### Commands for running the frontend

```bash
cd frontend
npm run dev     # starts the Vite dev server at http://localhost:5173
npm run build   # Build for production
```

### Backend

The backend uses FastAPI + Uvicorn.

#### Prerequisites
- Python 3.10+ (or newer)
- macOS/Linux terminal (commands below)

#### Setup commands

From the project root:

```bash
cd backend
make install    # creates .venv and installs dependencies from requirements.txt
make run-dev    # starts FastAPI with auto-reload at http://127.0.0.1:8000
```

Other useful commands:
```bash
cd backend
make run      # run without auto-reload
make freeze   # update requirements.txt with installed versions
make clean    # remove virtual environment
```
