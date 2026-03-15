"""AI Study Guide generator using Gemini + RAG.

Takes uploaded PDFs, extracts topics, matches against the resource library
via semantic search, then sends everything to Gemini for intelligent synthesis.
"""

import json
import logging
import traceback

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY, GEMINI_MODEL
from app.embeddings import query_similar
from app.pdf_parser import extract_text, extract_topics

logger = logging.getLogger(__name__)

# Maximum limits to stay within Gemini context / cost bounds
MAX_TOPICS = 15
MAX_RESOURCES_PER_TOPIC = 8
MAX_DOC_CHARS = 30_000


def is_available() -> bool:
    """Check if the Gemini API key is configured."""
    return bool(GEMINI_API_KEY)


def generate_study_guide(pdf_path: str, filename: str = "document") -> dict:
    """Generate an AI-powered study guide from a PDF.

    Pipeline:
    1. Extract text + topics from the PDF (reuse existing pdf_parser)
    2. Semantic search each topic against the 7,056 resource embeddings
    3. Send document + matched resources to Gemini for synthesis
    4. Return structured study guide

    Returns dict with keys: summary, topics, study_order, estimated_hours, error
    """
    # Step 1: Extract text
    text = extract_text(pdf_path)
    if not text.strip():
        return {"error": "Could not extract any text from this PDF."}

    # Step 2: Extract topics
    topics = extract_topics(text, pdf_path=pdf_path)
    if not topics:
        return {"error": "Could not identify any topics in this PDF."}

    # Cap topics
    topics = topics[:MAX_TOPICS]

    # Step 3: RAG — semantic search for each topic
    topic_matches = []
    seen_paths = set()

    for topic in topics:
        matches = query_similar(topic["text"], n_results=20)

        # Filter and deduplicate
        resources = []
        for match in matches:
            path = match["relative_path"]
            if match["relevance"] < 0.3:
                continue
            if path in seen_paths and match["relevance"] < 0.6:
                continue
            resources.append(match)
            seen_paths.add(path)

        resources.sort(key=lambda r: -r["relevance"])
        resources = resources[:MAX_RESOURCES_PER_TOPIC]

        topic_matches.append({
            "name": topic["name"],
            "text": topic["text"][:500],
            "resources": resources,
        })

    # Step 4: Call Gemini
    if not is_available():
        return _fallback_result(topic_matches, filename)

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)

        prompt = _build_prompt(text, topic_matches, filename)

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )

        result = json.loads(response.text)

        # Attach the actual resource objects (Gemini returns references, we need full data)
        result = _enrich_result(result, topic_matches)
        result["error"] = None
        result["gemini_powered"] = True
        return result

    except Exception as e:
        logger.error("Gemini API error: %s\n%s", e, traceback.format_exc())
        # Fall back to structured results without AI synthesis
        fallback = _fallback_result(topic_matches, filename)
        fallback["gemini_error"] = str(e)
        return fallback


def generate_study_guide_multi(pdf_paths: list[str], filenames: list[str]) -> dict:
    """Generate study guide from multiple PDFs."""
    all_text_parts = []
    all_topics = []

    for pdf_path, fname in zip(pdf_paths, filenames):
        text = extract_text(pdf_path)
        if not text.strip():
            continue
        all_text_parts.append(f"--- {fname} ---\n{text}")
        topics = extract_topics(text, pdf_path=pdf_path)
        all_topics.extend(topics)

    if not all_topics:
        return {"error": "Could not extract any topics from the uploaded PDFs."}

    # Deduplicate topic names
    seen_names = set()
    unique_topics = []
    for topic in all_topics:
        key = topic["name"].lower().strip()
        if key not in seen_names:
            seen_names.add(key)
            unique_topics.append(topic)

    unique_topics = unique_topics[:MAX_TOPICS]
    combined_text = "\n\n".join(all_text_parts)
    display_name = f"{len(filenames)} PDFs ({', '.join(filenames)})"

    # RAG search
    topic_matches = []
    seen_paths = set()

    for topic in unique_topics:
        matches = query_similar(topic["text"], n_results=20)
        resources = []
        for match in matches:
            path = match["relative_path"]
            if match["relevance"] < 0.3:
                continue
            if path in seen_paths and match["relevance"] < 0.6:
                continue
            resources.append(match)
            seen_paths.add(path)
        resources.sort(key=lambda r: -r["relevance"])
        resources = resources[:MAX_RESOURCES_PER_TOPIC]
        topic_matches.append({
            "name": topic["name"],
            "text": topic["text"][:500],
            "resources": resources,
        })

    if not is_available():
        return _fallback_result(topic_matches, display_name)

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = _build_prompt(combined_text, topic_matches, display_name)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )
        result = json.loads(response.text)
        result = _enrich_result(result, topic_matches)
        result["error"] = None
        result["gemini_powered"] = True
        return result
    except Exception as e:
        logger.error("Gemini API error: %s\n%s", e, traceback.format_exc())
        fallback = _fallback_result(topic_matches, display_name)
        fallback["gemini_error"] = str(e)
        return fallback


def _build_prompt(full_text: str, topic_matches: list[dict], filename: str) -> str:
    """Build the Gemini prompt with document content and matched resources."""
    # Truncate document text
    doc_text = full_text[:MAX_DOC_CHARS]
    if len(full_text) > MAX_DOC_CHARS:
        doc_text += "\n\n[Document truncated...]"

    # Build resource context
    resource_sections = []
    for tm in topic_matches:
        lines = [f"### {tm['name']}"]
        for r in tm["resources"]:
            relevance_pct = round(r["relevance"] * 100)
            lines.append(
                f"- [{r.get('file_type', 'file').upper()}] {r['filename']} "
                f"(Source: {r['source']}, Subject: {r.get('subject', 'N/A')}, "
                f"Relevance: {relevance_pct}%) "
                f"[path: {r['relative_path']}]"
            )
        resource_sections.append("\n".join(lines))

    resources_text = "\n\n".join(resource_sections)

    return f"""You are a medical education study planner. A student has uploaded "{filename}" and our system matched resources from their study library using semantic search.

## Document Content
{doc_text}

## Matched Resources by Topic
{resources_text}

## Instructions
Analyze this document and produce a JSON response with this exact structure:
{{
  "summary": "2-3 sentence overview of what this document covers and its scope",
  "topics": [
    {{
      "name": "Topic Name",
      "importance": "high" | "medium" | "low",
      "description": "1-2 sentence explanation of what this topic covers and why it matters",
      "study_tips": "Brief, actionable study advice specific to this topic",
      "resource_paths": ["path/to/resource1", "path/to/resource2"]
    }}
  ],
  "study_order": ["Topic Name 1", "Topic Name 2"],
  "estimated_hours": 5
}}

Rules:
- Use ONLY resource paths from the matched resources above — do not invent paths
- Rank topics by clinical/exam importance for medical students
- "importance" should reflect how heavily tested or clinically relevant each topic is
- "study_order" should list topic names in the optimal sequence (foundational concepts first)
- "estimated_hours" is a rough total study time estimate for all topics
- Include 2-8 resource_paths per topic, selecting the most relevant ones
- Keep descriptions concise and clinically oriented"""


def _enrich_result(gemini_result: dict, topic_matches: list[dict]) -> dict:
    """Attach full resource objects to the Gemini result.

    Gemini returns resource_paths; we need to map those back to the full
    resource dicts (with filename, source, relevance, etc.) from our RAG results.
    """
    # Build a lookup from path -> resource dict
    path_lookup = {}
    for tm in topic_matches:
        for r in tm["resources"]:
            path_lookup[r["relative_path"]] = r

    # Enrich each topic
    for topic in gemini_result.get("topics", []):
        paths = topic.get("resource_paths", [])
        resources = []
        for p in paths:
            if p in path_lookup:
                resources.append(path_lookup[p])
        topic["resources"] = resources

        # If Gemini didn't return good paths, fall back to RAG matches
        if not resources:
            topic_name = topic.get("name", "").lower()
            for tm in topic_matches:
                if tm["name"].lower() == topic_name or topic_name in tm["name"].lower():
                    topic["resources"] = tm["resources"][:MAX_RESOURCES_PER_TOPIC]
                    break

    return gemini_result


def _fallback_result(topic_matches: list[dict], filename: str) -> dict:
    """Build a study guide result without Gemini (RAG-only fallback)."""
    topics = []
    for tm in topic_matches:
        topics.append({
            "name": tm["name"],
            "importance": "medium",
            "description": tm["text"][:200] + ("..." if len(tm["text"]) > 200 else ""),
            "study_tips": "Review the matched resources below, focusing on key concepts.",
            "resources": tm["resources"],
            "resource_paths": [r["relative_path"] for r in tm["resources"]],
        })

    return {
        "summary": f"Study guide for {filename}. {len(topics)} topics identified with matched resources from your library.",
        "topics": topics,
        "study_order": [t["name"] for t in topics],
        "estimated_hours": max(1, len(topics) * 2),
        "error": None,
        "gemini_powered": False,
    }
