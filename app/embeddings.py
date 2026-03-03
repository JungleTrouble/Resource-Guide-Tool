import json
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

from app.config import INDEX_DIR, EMBEDDING_MODEL, RESULTS_PER_TOPIC
EMBEDDINGS_FILE = INDEX_DIR / "embeddings.npy"
METADATA_FILE = INDEX_DIR / "metadata.json"

# Module-level cache
_model = None
_embeddings = None
_metadata = None


def _get_model() -> SentenceTransformer:
    """Load the sentence-transformers model (cached)."""
    global _model
    if _model is None:
        print(f"Loading embedding model: {EMBEDDING_MODEL}...")
        _model = SentenceTransformer(EMBEDDING_MODEL)
        print("Model loaded.")
    return _model


def _load_index():
    """Load persisted embeddings and metadata from disk."""
    global _embeddings, _metadata
    if _embeddings is not None:
        return

    if EMBEDDINGS_FILE.exists() and METADATA_FILE.exists():
        _embeddings = np.load(str(EMBEDDINGS_FILE))
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            _metadata = json.load(f)
        print(f"Loaded index: {len(_metadata)} resources")
    else:
        _embeddings = None
        _metadata = []


def index_resources(resources: list[dict]) -> int:
    """Index resources by generating embeddings and saving to disk.

    Each resource must have: id, document, source, subject, filename,
    relative_path, file_type.

    Returns the number of resources indexed.
    """
    global _embeddings, _metadata

    if not resources:
        return 0

    model = _get_model()

    # Extract documents for embedding
    documents = [r["document"] for r in resources]

    # Generate embeddings using sentence-transformers
    print(f"Generating embeddings for {len(documents)} resources...")
    embeddings = model.encode(documents, batch_size=128, show_progress_bar=True)

    # Normalize embeddings for cosine similarity via dot product
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1  # avoid division by zero
    embeddings = embeddings / norms

    # Save embeddings as numpy array
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    np.save(str(EMBEDDINGS_FILE), embeddings)

    # Save metadata (everything except the embedding itself)
    metadata = []
    for r in resources:
        metadata.append({
            "id": r["id"],
            "document": r["document"],
            "source": r["source"],
            "subject": r["subject"],
            "filename": r["filename"],
            "relative_path": r["relative_path"],
            "file_type": r["file_type"],
        })

    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f)

    # Update cache
    _embeddings = embeddings
    _metadata = metadata

    print(f"Indexed {len(metadata)} resources.")
    return len(metadata)


def query_similar(query_text: str, n_results: int = RESULTS_PER_TOPIC) -> list[dict]:
    """Find resources similar to the query text using cosine similarity.

    Returns a list of dicts with: source, subject, filename, relative_path,
    file_type, relevance (0-1), description.
    """
    _load_index()

    if _embeddings is None or len(_metadata) == 0:
        return []

    model = _get_model()

    # Encode query using sentence-transformers
    query_embedding = model.encode([query_text])[0]

    # Normalize
    norm = np.linalg.norm(query_embedding)
    if norm > 0:
        query_embedding = query_embedding / norm

    # Cosine similarity (since embeddings are normalized, dot product = cosine sim)
    similarities = np.dot(_embeddings, query_embedding)

    # Get top N indices
    n = min(n_results, len(_metadata))
    top_indices = np.argsort(similarities)[::-1][:n]

    results = []
    for idx in top_indices:
        meta = _metadata[idx]
        score = float(similarities[idx])

        results.append({
            "source": meta["source"],
            "subject": meta["subject"],
            "filename": meta["filename"],
            "relative_path": meta["relative_path"],
            "file_type": meta["file_type"],
            "relevance": round(score, 3),
            "description": meta["document"],
        })

    return results


def keyword_search(query: str, n_results: int = 20) -> list[dict]:
    """Find resources containing the query as a substring in their description or filename."""
    _load_index()
    if not _metadata:
        return []

    query_lower = query.lower()
    results = []
    for meta in _metadata:
        if query_lower in meta["document"].lower() or query_lower in meta["filename"].lower():
            results.append({
                "source": meta["source"],
                "subject": meta["subject"],
                "filename": meta["filename"],
                "relative_path": meta["relative_path"],
                "file_type": meta["file_type"],
                "relevance": 0.5,
                "description": meta["document"],
            })

    return results[:n_results]


def get_file_link(relative_path: str) -> str | None:
    """Get the direct OneDrive link for a resource by its relative path."""
    _load_index()
    if not _metadata:
        return None
    # Normalize to both slash formats for matching
    fwd = relative_path.replace("\\", "/")
    bk = relative_path.replace("/", "\\")
    for meta in _metadata:
        rp = meta.get("relative_path", "")
        if rp == relative_path or rp == fwd or rp == bk:
            return meta.get("onedrive_link")
    return None


def get_index_count() -> int:
    """Return the number of resources currently indexed."""
    _load_index()
    if _metadata is None:
        return 0
    return len(_metadata)


def get_source_counts() -> dict[str, int]:
    """Return a dict of source name -> count of resources."""
    _load_index()
    if not _metadata:
        return {}
    counts = {}
    for meta in _metadata:
        src = meta["source"]
        counts[src] = counts.get(src, 0) + 1
    return counts


def get_all_sources() -> list[str]:
    """Return a sorted list of all unique source names in the index."""
    _load_index()
    if not _metadata:
        return []
    sources = sorted(set(meta["source"] for meta in _metadata))
    return sources


def clear_index():
    """Clear the index files and cache."""
    global _embeddings, _metadata

    if EMBEDDINGS_FILE.exists():
        EMBEDDINGS_FILE.unlink()
    if METADATA_FILE.exists():
        METADATA_FILE.unlink()

    _embeddings = None
    _metadata = None
