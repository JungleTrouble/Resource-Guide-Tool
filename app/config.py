import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "data" / "uploads"
INDEX_DIR = BASE_DIR / "data" / "index"

# Resource directory — set via env var or fall back to local Windows path
_resources_env = os.environ.get("RESOURCES_DIR")
if _resources_env:
    RESOURCES_DIR = Path(_resources_env)
else:
    RESOURCES_DIR = Path(r"C:\Users\micha\OneDrive\MedSchoolPlug")

# Detect if running in the cloud (no local resource files available)
IS_CLOUD = os.environ.get("REPL_ID") is not None or os.environ.get("RENDER") is not None or os.environ.get("SPACE_ID") is not None or os.environ.get("IS_CLOUD") == "1"

# Google Drive shared folder for cloud users to find resources
DRIVE_URL = os.environ.get(
    "DRIVE_URL",
    "https://drive.google.com/drive/folders/1BqUywZPB5tatpV0CKxus5OYquhkj-gXb?usp=sharing",
)

# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
INDEX_DIR.mkdir(parents=True, exist_ok=True)

# Embedding model (runs locally, free)
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# Supported file extensions
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}
PDF_EXTENSIONS = {".pdf"}
ANKI_EXTENSIONS = {".apkg"}
ARCHIVE_EXTENSIONS = {".zip", ".rar", ".7z"}
SUPPORTED_EXTENSIONS = VIDEO_EXTENSIONS | PDF_EXTENSIONS | ANKI_EXTENSIONS

# Top-level resource sources (folder names in MedSchoolPlug)
KNOWN_SOURCES = {
    "Boards&Beyond",
    "Books",
    "Bootcamp",
    "IBM",
    "Mehlman's ANKI",
    "Mehlman's PDF [Medicalstudyzone.com]",
    "Osmosis",
    "Pathoma",
    "Physeo Courses [Medicalstudyzone.com]",
    "Pixorize",
    "Sketchy",
}

# Gemini API for AI Study Guide
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash"

# Number of results per topic query
RESULTS_PER_TOPIC = 10

# Folders/files to skip during indexing
SKIP_FOLDERS = {"IBM", ".claude"}
SKIP_EXTENSIONS = ARCHIVE_EXTENSIONS | {".txt", ".exe", ".msi", ".dll"}
