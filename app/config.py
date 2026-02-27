from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
RESOURCES_DIR = Path(r"C:\Users\micha\OneDrive\MedSchoolPlug")
UPLOAD_DIR = BASE_DIR / "data" / "uploads"
CHROMA_DIR = BASE_DIR / "data" / "index"

# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

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
