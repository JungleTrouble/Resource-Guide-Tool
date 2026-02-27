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

# Detect if running on Replit (no local resource files available)
IS_CLOUD = os.environ.get("REPL_ID") is not None

# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
INDEX_DIR.mkdir(parents=True, exist_ok=True)

# Embedding model (runs locally, free)
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

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

# Number of results per topic query
RESULTS_PER_TOPIC = 10

# Folders/files to skip during indexing
SKIP_FOLDERS = {"IBM", ".claude"}
SKIP_EXTENSIONS = ARCHIVE_EXTENSIONS | {".txt", ".exe", ".msi", ".dll"}
