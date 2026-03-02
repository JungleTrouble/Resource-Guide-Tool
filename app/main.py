import json
import os
import random
import string
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.config import DRIVE_URL, IS_CLOUD, RESOURCES_DIR, UPLOAD_DIR
from app.embeddings import clear_index, get_index_count, get_source_counts, index_resources
from app.indexer import scan_resources
from app.recommender import recommend, recommend_multi, search_resources

app = FastAPI(title="Resource Guide AI")

# Static files and templates
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# Indexing state
_indexing_state = {"running": False, "progress": "", "error": None, "count": 0}


def _run_indexing():
    """Run the indexing process in a background thread."""
    global _indexing_state
    try:
        _indexing_state["progress"] = "Clearing old index..."
        clear_index()

        _indexing_state["progress"] = "Scanning resource folders..."
        resources = scan_resources()

        _indexing_state["progress"] = f"Generating embeddings for {len(resources)} resources (this takes a few minutes)..."
        count = index_resources(resources)

        _indexing_state["count"] = count
        _indexing_state["progress"] = "Done!"
        _indexing_state["error"] = None
    except Exception as e:
        _indexing_state["error"] = str(e)
        _indexing_state["progress"] = "Failed"
    finally:
        _indexing_state["running"] = False


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Render the upload page."""
    index_count = get_index_count()
    source_counts = get_source_counts()
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "index_count": index_count, "source_counts": source_counts},
    )


@app.post("/upload", response_class=HTMLResponse)
async def upload_pdf(request: Request, pdf: List[UploadFile] = File(...)):
    """Handle single or multiple PDF uploads and return recommendations."""
    # Check if resources are indexed
    if get_index_count() == 0:
        return templates.TemplateResponse(
            "index.html",
            {
                "request": request,
                "error": "Resources haven't been indexed yet. Click 'Index Resources' first.",
                "index_count": 0,
                "source_counts": {},
            },
        )

    # Validate and save uploaded files
    saved_files = []
    filenames = []
    try:
        for uploaded_file in pdf:
            if not uploaded_file.filename.lower().endswith(".pdf"):
                continue
            file_id = str(uuid.uuid4())
            save_path = UPLOAD_DIR / f"{file_id}.pdf"
            content = await uploaded_file.read()
            with open(save_path, "wb") as f:
                f.write(content)
            saved_files.append(save_path)
            filenames.append(uploaded_file.filename)

        if not saved_files:
            return templates.TemplateResponse(
                "index.html",
                {
                    "request": request,
                    "error": "Please upload at least one PDF file.",
                    "index_count": get_index_count(),
                    "source_counts": get_source_counts(),
                },
            )

        # Get recommendations
        if len(saved_files) == 1:
            results = recommend(str(saved_files[0]))
            display_name = filenames[0]
        else:
            results = recommend_multi(
                [str(p) for p in saved_files],
                filenames,
            )
            display_name = f"{len(filenames)} PDFs ({', '.join(filenames)})"

        return templates.TemplateResponse(
            "results.html",
            {
                "request": request,
                "filename": display_name,
                "results": results,
            },
        )
    finally:
        # Clean up uploaded files
        for path in saved_files:
            if path.exists():
                os.remove(path)


@app.post("/index")
async def run_indexing():
    """Start indexing in a background thread and return immediately."""
    global _indexing_state

    if _indexing_state["running"]:
        return JSONResponse({"status": "already_running"})

    _indexing_state["running"] = True
    _indexing_state["progress"] = "Starting..."
    _indexing_state["error"] = None

    thread = threading.Thread(target=_run_indexing, daemon=True)
    thread.start()

    return JSONResponse({"status": "started"})


@app.get("/index-status")
async def index_status():
    """Return current indexing progress."""
    return JSONResponse({
        "running": _indexing_state["running"],
        "progress": _indexing_state["progress"],
        "error": _indexing_state["error"],
        "indexed": _indexing_state["count"],
        "total_indexed": get_index_count(),
    })


@app.get("/search", response_class=HTMLResponse)
async def search(request: Request, q: str = ""):
    """Search for resources by topic keyword."""
    q = q.strip()
    if not q:
        return templates.TemplateResponse(
            "search.html",
            {"request": request, "query": "", "results": None, "index_count": get_index_count()},
        )

    if get_index_count() == 0:
        return templates.TemplateResponse(
            "search.html",
            {
                "request": request,
                "query": q,
                "results": None,
                "error": "Resources haven't been indexed yet. Go back and click 'Index Resources' first.",
                "index_count": 0,
            },
        )

    results = search_resources(q)
    return templates.TemplateResponse(
        "search.html",
        {"request": request, "query": q, "results": results, "index_count": get_index_count()},
    )


@app.get("/open")
async def open_file(path: str = ""):
    """Open a resource file using the system default application."""
    if not path:
        return JSONResponse({"error": "No path provided"}, status_code=400)

    if IS_CLOUD:
        # On cloud, we can't open local files — direct to Google Drive
        return JSONResponse({"status": "cloud", "path": path, "driveUrl": DRIVE_URL})

    # Resolve the full path within the resources directory
    full_path = RESOURCES_DIR / path

    # Security: ensure the path stays within RESOURCES_DIR
    try:
        full_path = full_path.resolve()
        if not str(full_path).startswith(str(RESOURCES_DIR.resolve())):
            return JSONResponse({"error": "Invalid path"}, status_code=403)
    except Exception:
        return JSONResponse({"error": "Invalid path"}, status_code=400)

    if not full_path.exists():
        return JSONResponse({"error": "File not found"}, status_code=404)

    # Open with system default application (Windows)
    os.startfile(str(full_path))
    return JSONResponse({"status": "opened", "path": str(full_path)})


@app.get("/status")
async def status():
    """Return current index status."""
    return {"indexed_resources": get_index_count()}


# === Playlists ===

PLAYLISTS_FILE = Path("data/playlists.json")
_playlist_lock = threading.Lock()


def _load_playlists() -> dict:
    """Load playlists from disk."""
    if PLAYLISTS_FILE.exists():
        with open(PLAYLISTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_playlists(playlists: dict):
    """Save playlists to disk."""
    PLAYLISTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PLAYLISTS_FILE, "w", encoding="utf-8") as f:
        json.dump(playlists, f, indent=2)


def _generate_code(existing_codes: set, length: int = 6) -> str:
    """Generate a unique short alphanumeric code."""
    chars = string.ascii_letters + string.digits
    for _ in range(100):
        code = "".join(random.choices(chars, k=length))
        if code not in existing_codes:
            return code
    raise RuntimeError("Could not generate unique code")


class PlaylistCreate(BaseModel):
    name: str
    resources: list[dict]


@app.post("/api/playlist")
async def create_playlist(data: PlaylistCreate):
    """Create a shareable playlist and return a short code."""
    name = data.name.strip()
    if not name:
        return JSONResponse({"error": "Playlist name is required"}, status_code=400)
    if not data.resources:
        return JSONResponse({"error": "Playlist must have at least one resource"}, status_code=400)
    if len(data.resources) > 100:
        return JSONResponse({"error": "Playlist too large (max 100 resources)"}, status_code=400)

    for r in data.resources:
        if "path" not in r or "filename" not in r:
            return JSONResponse({"error": "Each resource must have 'path' and 'filename'"}, status_code=400)

    with _playlist_lock:
        playlists = _load_playlists()
        code = _generate_code(set(playlists.keys()))
        playlists[code] = {
            "name": name,
            "resources": [
                {
                    "path": r.get("path", ""),
                    "filename": r.get("filename", ""),
                    "source": r.get("source", ""),
                    "fileType": r.get("fileType", ""),
                }
                for r in data.resources
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_playlists(playlists)

    return JSONResponse({"code": code, "url": f"/playlist/{code}"})


@app.get("/api/playlist/{code}")
async def get_playlist_api(code: str):
    """Return playlist data as JSON."""
    playlists = _load_playlists()
    playlist = playlists.get(code)
    if not playlist:
        return JSONResponse({"error": "Playlist not found"}, status_code=404)
    return JSONResponse({"code": code, "name": playlist["name"], "resources": playlist["resources"]})


@app.get("/playlist", response_class=HTMLResponse)
async def playlist_page(request: Request):
    """Render the playlist management page."""
    return templates.TemplateResponse(
        "playlist.html",
        {"request": request, "playlist": None, "code": None, "error": None},
    )


@app.get("/playlist/{code}", response_class=HTMLResponse)
async def view_playlist(request: Request, code: str):
    """Render a shared playlist page."""
    playlists = _load_playlists()
    playlist = playlists.get(code)
    return templates.TemplateResponse(
        "playlist.html",
        {
            "request": request,
            "playlist": playlist,
            "code": code,
            "error": "Playlist not found" if not playlist else None,
        },
    )
