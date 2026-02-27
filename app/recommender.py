from collections import OrderedDict

from app.pdf_parser import extract_text, extract_topics
from app.embeddings import query_similar, keyword_search

# Preferred display order for sources
SOURCE_ORDER = [
    "Pathoma",
    "Boards and Beyond",
    "Sketchy",
    "Osmosis",
    "Bootcamp",
    "Pixorize",
    "Physeo Courses",
    "Mehlman's PDF",
    "Mehlman's ANKI",
    "Books",
]


def _source_sort_key(source_name: str) -> int:
    """Return sort priority for a source (lower = shown first)."""
    for i, name in enumerate(SOURCE_ORDER):
        if name.lower() in source_name.lower() or source_name.lower() in name.lower():
            return i
    return len(SOURCE_ORDER)


def _group_by_source(resources: list[dict]) -> list[dict]:
    """Group a flat list of resources into source groups, sorted by preferred order."""
    by_source = OrderedDict()
    for res in resources:
        src = res["source"]
        if src not in by_source:
            by_source[src] = []
        by_source[src].append(res)

    sorted_sources = sorted(
        by_source.items(),
        key=lambda item: _source_sort_key(item[0]),
    )

    source_groups = []
    for source_name, group_resources in sorted_sources:
        source_groups.append({
            "source": source_name,
            "resources": group_resources,
        })

    return source_groups


def recommend(pdf_path: str) -> dict:
    """Process an uploaded PDF and return topic-based resource recommendations.

    Results are organized by topic, then grouped by source within each topic.
    """
    # Step 1: Extract text from PDF
    text = extract_text(pdf_path)
    if not text.strip():
        return {"topics": [], "error": "Could not extract any text from this PDF."}

    # Step 2: Split into topics
    topics = extract_topics(text, pdf_path=pdf_path)
    if not topics:
        return {"topics": [], "error": "Could not identify any topics in this PDF."}

    # Step 3: For each topic, find matching resources
    results = []
    seen_paths = set()

    for topic in topics:
        matches = query_similar(topic["text"], n_results=20)

        # Filter and deduplicate
        topic_resources = []
        for match in matches:
            path = match["relative_path"]
            if match["relevance"] < 0.3:
                continue
            if path in seen_paths and match["relevance"] < 0.7:
                continue
            topic_resources.append(match)
            seen_paths.add(path)

        # Sort by relevance and limit
        topic_resources.sort(key=lambda r: -r["relevance"])
        topic_resources = topic_resources[:15]

        source_groups = _group_by_source(topic_resources)

        # Build a snippet from the topic text
        snippet = topic["text"][:200]
        if len(topic["text"]) > 200:
            snippet += "..."

        if source_groups:
            results.append({
                "name": topic["name"],
                "text_snippet": snippet,
                "source_groups": source_groups,
            })

    return {"topics": results}


def recommend_multi(pdf_paths: list[str], filenames: list[str]) -> dict:
    """Process multiple uploaded PDFs and return combined recommendations."""
    all_topics = []

    for pdf_path, filename in zip(pdf_paths, filenames):
        text = extract_text(pdf_path)
        if not text.strip():
            continue
        topics = extract_topics(text, pdf_path=pdf_path)
        all_topics.extend(topics)

    if not all_topics:
        return {"topics": [], "error": "Could not extract any topics from the uploaded PDFs."}

    # Deduplicate similar topic names
    seen_names = set()
    unique_topics = []
    for topic in all_topics:
        name_key = topic["name"].lower().strip()
        if name_key not in seen_names:
            seen_names.add(name_key)
            unique_topics.append(topic)

    results = []
    seen_paths = set()

    for topic in unique_topics:
        matches = query_similar(topic["text"], n_results=20)

        topic_resources = []
        for match in matches:
            path = match["relative_path"]
            if match["relevance"] < 0.3:
                continue
            if path in seen_paths and match["relevance"] < 0.7:
                continue
            topic_resources.append(match)
            seen_paths.add(path)

        topic_resources.sort(key=lambda r: -r["relevance"])
        topic_resources = topic_resources[:15]

        source_groups = _group_by_source(topic_resources)

        snippet = topic["text"][:200]
        if len(topic["text"]) > 200:
            snippet += "..."

        if source_groups:
            results.append({
                "name": topic["name"],
                "text_snippet": snippet,
                "source_groups": source_groups,
            })

    return {"topics": results}


def search_resources(query: str, max_results: int = 30) -> dict:
    """Search the resource index using hybrid keyword + embedding search.

    Combines semantic embedding search with keyword substring matching
    to handle both conceptual queries and specific terms.
    """
    # Get embedding-based results
    embedding_matches = query_similar(query, n_results=max_results)

    # Get keyword-based results
    kw_matches = keyword_search(query, n_results=max_results)

    # Merge: use embedding results as base, add keyword matches not already present
    seen_paths = set()
    merged = []

    for match in embedding_matches:
        if match["relevance"] >= 0.25:
            merged.append(match)
            seen_paths.add(match["relative_path"])

    for match in kw_matches:
        if match["relative_path"] not in seen_paths:
            merged.append(match)
            seen_paths.add(match["relative_path"])

    # Also boost: if a keyword match exists in embedding results, ensure minimum relevance
    kw_paths = {m["relative_path"] for m in kw_matches}
    for match in merged:
        if match["relative_path"] in kw_paths and match["relevance"] < 0.4:
            match["relevance"] = 0.4

    # Sort by relevance
    merged.sort(key=lambda r: -r["relevance"])
    merged = merged[:max_results]

    source_groups = _group_by_source(merged)

    total = sum(len(g["resources"]) for g in source_groups)
    return {"source_groups": source_groups, "total": total}
