import hashlib
import os
import re
from pathlib import Path

import fitz  # PyMuPDF

from app.config import (
    RESOURCES_DIR,
    SKIP_EXTENSIONS,
    SKIP_FOLDERS,
    SUPPORTED_EXTENSIONS,
    PDF_EXTENSIONS,
    VIDEO_EXTENSIONS,
    ANKI_EXTENSIONS,
)


def scan_resources() -> list[dict]:
    """Walk the MedSchoolPlug directory and build a list of indexable resources.

    Each resource dict has:
        - id: unique hash of the relative path
        - document: searchable description string
        - source: top-level resource name (e.g. "Boards&Beyond")
        - subject: subject/system folder (e.g. "Cardiology")
        - filename: the file name
        - relative_path: path relative to MedSchoolPlug root
        - file_type: "video", "pdf", or "anki"
    """
    resources = []

    for root, dirs, files in os.walk(RESOURCES_DIR):
        root_path = Path(root)
        rel_root = root_path.relative_to(RESOURCES_DIR)

        # Skip excluded folders
        dirs[:] = [d for d in dirs if d not in SKIP_FOLDERS]

        for filename in files:
            # Skip macOS resource fork files (._filename)
            if filename.startswith("._"):
                continue

            ext = Path(filename).suffix.lower()
            if ext in SKIP_EXTENSIONS or ext not in SUPPORTED_EXTENSIONS:
                continue

            file_path = root_path / filename
            relative_path = str(rel_root / filename)

            # Determine file type
            if ext in VIDEO_EXTENSIONS:
                file_type = "video"
            elif ext in PDF_EXTENSIONS:
                file_type = "pdf"
            elif ext in ANKI_EXTENSIONS:
                file_type = "anki"
            else:
                continue

            # Parse the path to extract source, subject, and topic info
            parts = Path(relative_path).parts
            source = parts[0] if len(parts) > 0 else "Unknown"
            subject = parts[1] if len(parts) > 1 else ""
            subfolder = parts[2] if len(parts) > 2 else ""

            # Clean up names for the searchable description
            clean_name = _clean_filename(filename)
            clean_source = _clean_folder_name(source)
            clean_subject = _clean_folder_name(subject)
            clean_subfolder = _clean_folder_name(subfolder)

            # Build the searchable description
            description_parts = [clean_source]
            if clean_subject:
                description_parts.append(clean_subject)
            if clean_subfolder and clean_subfolder != clean_subject:
                description_parts.append(clean_subfolder)
            if clean_name and clean_name.lower() not in clean_subject.lower():
                description_parts.append(clean_name)

            document = " - ".join(description_parts)

            # For PDF resources, try to extract some text content to enrich the description
            pdf_snippet = ""
            if file_type == "pdf" and file_path.stat().st_size < 50_000_000:  # <50MB
                pdf_snippet = _extract_pdf_snippet(str(file_path))

            if pdf_snippet:
                document += f" | Content: {pdf_snippet}"

            # Generate unique ID from relative path
            resource_id = hashlib.md5(relative_path.encode()).hexdigest()

            resources.append({
                "id": resource_id,
                "document": document,
                "source": clean_source,
                "subject": clean_subject,
                "filename": filename,
                "relative_path": relative_path,
                "file_type": file_type,
            })

    print(f"Scanned {len(resources)} resources from {RESOURCES_DIR}")
    return resources


def _clean_filename(filename: str) -> str:
    """Remove extension, numbering prefixes, and clean up a filename."""
    name = Path(filename).stem
    # Remove common suffixes like " atf", " [Medicalstudyzone.com]"
    name = re.sub(r"\s*atf$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s*\[.*?\]$", "", name)
    # Remove leading numbering (e.g., "01 ", "1.2 ", "01. ")
    name = re.sub(r"^\d+[\.\)]\s*", "", name)
    name = re.sub(r"^\d+\.\d+\s+", "", name)
    return name.strip()


def _clean_folder_name(folder_name: str) -> str:
    """Clean up folder names by removing common suffixes and special chars."""
    name = folder_name
    # Remove [Medicalstudyzone.com] and similar
    name = re.sub(r"\s*\[.*?\]", "", name)
    # Remove leading numbering
    name = re.sub(r"^\d+[\.\)]\s*", "", name)
    # Replace special chars
    name = name.replace("&", " and ")
    name = name.replace("$", "s")  # Phy$e0 → Physeo
    # Clean up extra spaces
    name = re.sub(r"\s+", " ", name).strip()
    return name


def _extract_pdf_snippet(pdf_path: str, max_chars: int = 500) -> str:
    """Extract a short text snippet from a PDF for enriching the index."""
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
            if len(text) >= max_chars:
                break
        doc.close()
        # Clean and truncate
        text = re.sub(r"\s+", " ", text).strip()
        return text[:max_chars]
    except Exception:
        return ""
