# IBM Bob Repository Interpreter

An AI-powered repository analyzer built for the IBM Bob Hackathon that helps developers understand codebases quickly by analyzing repository structure, detecting tech stacks, and providing intelligent Q&A capabilities.
<img width="1894" height="951" alt="Screenshot 2026-05-17 at 8 49 34 PM" src="https://github.com/user-attachments/assets/3a32da65-4c9d-4257-9f1f-8c21fefbc68c" />

## Features

- 📦 **Repository Upload**: Upload any codebase as a .zip file
- 🔍 **Tech Stack Detection**: Automatically identifies technologies used (React, Python, FastAPI, etc.)
- 🌳 **Interactive File Tree**: Collapsible directory structure for easy navigation
- 💬 **AI Chat**: Ask questions about the codebase and get intelligent answers
- 📊 **Smart Insights**: Auto-generated onboarding summary and important files analysis
- 🎯 **File Summaries**: AI-generated descriptions of what each important file does
- 📄 **PDF Export**: Export the generated onboarding report as a PDF from the insights panel

## Tech Stack

### Frontend

- React 19
- Vite 8
- Tailwind CSS

### Backend

- Python 3.10+
- FastAPI
- Uvicorn
- IBM Watsonx AI (Granite 8B Code Instruct model)

## Setup

### Prerequisites

- Node.js (LTS recommended)
- Python 3.10 or newer
- IBM Watsonx AI credentials

### Backend Setup

1. Navigate to the backend directory:

```bash
cd backend
```

2. Create a `.env` file with your IBM Watsonx credentials:

```env
WATSONX_API_KEY=your_api_key_here
WATSONX_PROJECT_ID=your_project_id_here
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=ibm/granite-8b-code-instruct
```

3. Install dependencies and run:

```bash
make install    # Creates virtual environment and installs dependencies
make run-dev    # Starts FastAPI with auto-reload at http://127.0.0.1:8000
```

Other useful commands:

```bash
make run      # Run without auto-reload
make freeze   # Update requirements.txt with installed versions
make clean    # Remove virtual environment
```

### Frontend Setup

1. Navigate to the frontend directory:

```bash
cd frontend
```

2. Install dependencies:

```bash
npm install
```

3. Configure the backend URL. For local development, copy `frontend/.env.example` or create:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

4. Start the development server:

```bash
npm run dev     # Starts Vite dev server at http://localhost:5173
```

Other commands:

```bash
npm run build   # Build for production
npm run preview # Preview production build
```

## Usage

1. Start both the backend and frontend servers
2. Open http://localhost:5173 in your browser
3. Upload a repository .zip file
4. Explore the generated dashboard:
   - **Repository Tree**: Browse the file structure
   - **AI Chat**: Ask questions about the codebase
   - **Generated Insights**: View tech stack, onboarding summary, important files, and export the report as PDF

## Deployment Environment Variables

### Backend

Set these on your backend host:

```env
WATSONX_API_KEY=your_api_key_here
WATSONX_PROJECT_ID=your_project_id_here
WATSONX_URL=https://au-syd.ml.cloud.ibm.com
WATSONX_MODEL_ID=ibm/granite-8b-code-instruct
```

### Frontend

Set this on your frontend host. In production, the app requires it and will not fall back to localhost:

```env
VITE_API_BASE_URL=https://your-deployed-backend.example.com
```

## Project Structure

```
IBM_Hackathon/
├── backend/
│   ├── .env.example      # Sample Watsonx environment variables
│   ├── api/
│   │   └── index.py      # Vercel serverless entry point
│   ├── index.py          # Backend entry point
│   ├── main.py           # FastAPI application and endpoints
│   ├── requirements.txt  # Python dependencies
│   └── Makefile         # Build and run commands
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── src/
│   │   ├── App.jsx              # Main application component
│   │   ├── main.jsx             # React entry point
│   │   ├── index.css            # Global styles
│   │   ├── assets/
│   │   ├── sections/            # UI section components
│   │   │   ├── DashboardHeader.jsx
│   │   │   ├── HeroSection.jsx
│   │   │   ├── UploadSection.jsx
│   │   │   ├── RepositoryTree.jsx
│   │   │   ├── ChatSection.jsx
│   │   │   └── InsightsPanel.jsx
│   │   └── utils/
│   │       └── helpers.js       # Frontend utility functions
└── README.md
```

## Key Features Explained

### Repository Analysis

- Extracts and analyzes uploaded .zip files
- Builds a hierarchical file tree
- Detects programming languages and frameworks
- Identifies important files (configs, entry points, etc.)

### AI-Powered Insights

- Generates onboarding summaries using IBM Watsonx AI
- Creates file-specific descriptions
- Provides intelligent answers to codebase questions
- Uses context-aware document matching for accurate responses

### Interactive UI

- Collapsible folder tree (collapsed by default)
- Expandable insight sections
- Real-time chat with loading indicators
- Responsive design for all screen sizes

## API Endpoints

- `POST /upload` - Upload and analyze a repository
- `POST /summary` - Generate onboarding summary
- `POST /ask` - Ask questions about the repository
- `GET /repo-tree` - Get repository structure
- `GET /health` - Check backend and Watsonx environment status without exposing secrets

## License

See [LICENSE](LICENSE) file for details.

## Acknowledgments

Built for the IBM Bob Hackathon using IBM Watsonx AI.
