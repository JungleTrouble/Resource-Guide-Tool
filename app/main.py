import os
import threading
import uuid
from typing import List

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import IS_CLOUD, ONEDRIVE_CID, RESOURCES_DIR, UPLOAD_DIR
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
        # Build a OneDrive link from the relative path
        # The path is relative to RESOURCES_DIR (e.g., "Sketchy/Pharmacology/video.mp4")
        # Convert backslashes to forward slashes for URL
        clean_path = path.replace("\\", "/")
        # URL-encode the path for OneDrive
        from urllib.parse import quote
        onedrive_folder = "/".join(clean_path.split("/")[:-1])  # parent folder
        if ONEDRIVE_CID:
            onedrive_url = f"https://onedrive.live.com/?cid={ONEDRIVE_CID}&id=root&path=/{quote(clean_path)}"
        else:
            # Fallback: open OneDrive root — user can navigate from there
            onedrive_url = f"https://onedrive.live.com/"
        return JSONResponse({
            "status": "cloud",
            "path": path,
            "onedrive_url": onedrive_url,
            "message": "Opening in OneDrive...",
        })

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
