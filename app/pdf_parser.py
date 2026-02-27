import re
from collections import Counter

import fitz  # PyMuPDF


# Medical concept groups — map specific terms to broader topic names
CONCEPT_MAP = {
    # Cardiac
    "ischemic heart disease": ["ischemic", "angina", "coronary", "atherosclerosis", "stenosis", "infarct", "mi ", "nstemi", "stemi", "troponin"],
    "myocardial infarction": ["myocardial infarct", "infarction", "necrosis", "reperfusion", "thrombus formation", "mural thrombi"],
    "heart failure": ["heart failure", "chf", "cardiomegaly", "systolic dysfunction", "diastolic dysfunction", "ejection fraction"],
    "valvular heart disease": ["valve", "valvular", "stenosis", "regurgitation", "mitral", "aortic", "tricuspid", "pulmonic", "murmur", "endocarditis", "vegetation"],
    "cardiomyopathy": ["cardiomyopathy", "hypertrophic", "dilated", "restrictive", "myocardial disarray", "amyloid"],
    "myocarditis & pericarditis": ["myocarditis", "pericarditis", "pericardial", "tamponade", "coxsackie", "fibrinous"],
    "rheumatic heart disease": ["rheumatic", "aschoff", "jones criteria", "strep"],
    "congenital heart disease": ["vsd", "asd", "tetralogy", "patent ductus", "coarctation", "congenital"],
    "arrhythmia": ["arrhythmia", "fibrillation", "flutter", "tachycardia", "bradycardia", "bundle branch", "av block"],
    # Pulmonary
    "obstructive lung disease": ["copd", "emphysema", "chronic bronchitis", "asthma", "bronchiectasis"],
    "restrictive lung disease": ["restrictive", "fibrosis", "pneumoconiosis", "sarcoidosis", "interstitial"],
    "pneumonia": ["pneumonia", "consolidation", "lobar", "bronchopneumonia", "atypical"],
    "pulmonary vascular disease": ["pulmonary embolism", "pulmonary hypertension", "infarction"],
    "lung cancer": ["lung cancer", "bronchogenic", "small cell", "squamous cell", "adenocarcinoma", "pancoast"],
    # Renal
    "glomerular disease": ["glomerulonephritis", "nephrotic", "nephritic", "glomerular", "proteinuria", "hematuria"],
    "acute kidney injury": ["acute kidney", "aki", "acute tubular", "prerenal", "postrenal"],
    "chronic kidney disease": ["chronic kidney", "ckd", "dialysis", "uremia"],
    # GI
    "esophageal disorders": ["esophageal", "gerd", "barrett", "achalasia", "varices", "esophagitis"],
    "gastric disorders": ["gastric", "peptic ulcer", "gastritis", "h pylori", "zollinger"],
    "inflammatory bowel disease": ["crohn", "ulcerative colitis", "inflammatory bowel", "ibd"],
    "liver disease": ["cirrhosis", "hepatitis", "jaundice", "hepatic", "portal hypertension", "ascites"],
    "pancreatic disease": ["pancreatitis", "pancreatic cancer", "insulinoma", "glucagonoma"],
    # Neuro
    "cerebrovascular disease": ["stroke", "cerebrovascular", "ischemic stroke", "hemorrhagic", "aneurysm", "tia"],
    "neurodegenerative disease": ["alzheimer", "parkinson", "huntington", "dementia", "demyelinating", "ms "],
    "cns tumors": ["meningioma", "glioblastoma", "astrocytoma", "schwannoma", "brain tumor"],
    # Heme/Onc
    "anemia": ["anemia", "iron deficiency", "b12", "folate", "hemolytic", "sickle cell", "thalassemia", "spherocytosis"],
    "leukemia & lymphoma": ["leukemia", "lymphoma", "hodgkin", "non-hodgkin", "all ", "aml", "cll", "cml"],
    "coagulation disorders": ["coagulation", "hemophilia", "von willebrand", "dic", "thrombocytopenia", "platelet"],
    # Endocrine
    "thyroid disorders": ["thyroid", "hypothyroid", "hyperthyroid", "graves", "hashimoto", "goiter", "thyroiditis"],
    "adrenal disorders": ["adrenal", "cushing", "addison", "pheochromocytoma", "aldosterone", "conn"],
    "diabetes": ["diabetes", "insulin", "glucose", "hba1c", "diabetic ketoacidosis", "dka"],
    "pituitary disorders": ["pituitary", "acromegaly", "prolactinoma", "diabetes insipidus", "siadh"],
    # Immune
    "autoimmune disease": ["autoimmune", "sle", "lupus", "rheumatoid", "scleroderma", "sjogren"],
    "immunodeficiency": ["immunodeficiency", "hiv", "aids", "scid", "common variable"],
    "hypersensitivity": ["hypersensitivity", "type i", "anaphylaxis", "type iv", "delayed"],
    # Inflammation & Pathology
    "inflammation": ["inflammation", "inflammatory", "acute inflammation", "chronic inflammation", "granuloma", "giant cell"],
    "neoplasia": ["neoplasia", "neoplasm", "benign", "malignant", "metastasis", "tumor suppressor", "oncogene"],
    "cell injury & death": ["necrosis", "apoptosis", "cell injury", "ischemia", "free radical", "infarction"],
    # Micro
    "bacterial infection": ["bacterial", "gram positive", "gram negative", "staphylococcus", "streptococcus", "e coli"],
    "viral infection": ["viral", "virus", "hiv", "hepatitis", "herpes", "influenza", "covid"],
    "fungal infection": ["fungal", "candida", "aspergillus", "histoplasma", "cryptococcus"],
    # Pharm
    "cardiovascular pharmacology": ["ace inhibitor", "arb", "beta blocker", "calcium channel", "diuretic", "antiarrhythmic", "statin"],
    "antibiotic pharmacology": ["antibiotic", "penicillin", "cephalosporin", "macrolide", "fluoroquinolone", "aminoglycoside"],
}


def extract_text(pdf_path: str) -> str:
    """Extract all text from a PDF file."""
    doc = fitz.open(pdf_path)
    text_parts = []
    for page in doc:
        text_parts.append(page.get_text())
    doc.close()
    return "\n".join(text_parts)


def extract_text_by_page(pdf_path: str) -> list[str]:
    """Extract text from each page separately."""
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return pages


def extract_topics(text: str, pdf_path: str = None) -> list[dict]:
    """Split extracted PDF text into topic chunks for embedding.

    Uses concept-based grouping: analyze all text, identify distinct medical
    concepts, then group content by concept.
    """
    text = text.strip()
    if not text:
        return []

    # Get page-level text if possible (better for slide decks)
    pages = []
    if pdf_path:
        pages = extract_text_by_page(pdf_path)

    # If we have pages, use concept-based page grouping
    if pages and len(pages) >= 3:
        topics = _group_pages_by_concept(pages)
        if len(topics) >= 2:
            return topics

    # Clean up the text
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Try heading-based splitting for text-heavy documents
    topics = _split_by_headings(text)
    if len(topics) >= 2:
        return topics

    # Fall back to paragraph-based chunking
    return _split_by_paragraphs(text)


def _group_pages_by_concept(pages: list[str]) -> list[dict]:
    """Group pages by medical concept they discuss.

    Strategy: first combine pages into larger text chunks (since individual
    slides often have very little text), then classify and group by concept.
    """
    # Step 1: combine pages into chunks with enough text to classify
    chunks = []
    current_text_parts = []
    current_word_count = 0

    for page_text in pages:
        text = page_text.strip()
        if text:
            current_text_parts.append(text)
            current_word_count += len(text.split())

        # Create a chunk every ~50+ words or every 8 pages
        if current_word_count >= 50 or len(current_text_parts) >= 8:
            if current_text_parts:
                chunks.append("\n\n".join(current_text_parts))
            current_text_parts = []
            current_word_count = 0

    if current_text_parts:
        chunks.append("\n\n".join(current_text_parts))

    if not chunks:
        return []

    # Step 2: classify each chunk by medical concept
    chunk_concepts = [_classify_page_concept(c) for c in chunks]

    # Step 3: group consecutive chunks with the same concept
    groups = []
    current_concept = chunk_concepts[0]
    current_chunks = [chunks[0]]

    for i in range(1, len(chunks)):
        if chunk_concepts[i] == current_concept or chunk_concepts[i] is None:
            current_chunks.append(chunks[i])
        elif current_concept is None:
            current_concept = chunk_concepts[i]
            current_chunks.append(chunks[i])
        else:
            groups.append((current_concept, current_chunks))
            current_concept = chunk_concepts[i]
            current_chunks = [chunks[i]]

    groups.append((current_concept, current_chunks))

    # Step 4: build topic list
    topics = []
    for concept, group_chunks in groups:
        combined_text = "\n\n".join(group_chunks)
        if len(combined_text.split()) < 10:
            continue

        if concept:
            name = concept.title()
        else:
            name = _derive_topic_name_from_content(combined_text)
            name = _clean_topic_name(name) if name else "General Content"

        topics.append({"name": name, "text": combined_text})

    # Merge adjacent topics with the same name
    merged = []
    for topic in topics:
        if merged and merged[-1]["name"] == topic["name"]:
            merged[-1]["text"] += "\n\n" + topic["text"]
        else:
            merged.append(topic)

    return merged


def _classify_page_concept(page_text: str) -> str | None:
    """Classify a page's content into one of the known medical concepts."""
    text_lower = page_text.lower()
    if len(text_lower.split()) < 3:
        return None

    best_concept = None
    best_score = 0

    for concept_name, keywords in CONCEPT_MAP.items():
        score = 0
        for keyword in keywords:
            count = text_lower.count(keyword)
            if count > 0:
                # Weight longer keywords more (they're more specific)
                score += count * len(keyword.split())
        if score > best_score:
            best_score = score
            best_concept = concept_name

    # Only return if we have a reasonable confidence
    if best_score >= 2:
        return best_concept
    return None


def _split_by_headings(text: str) -> list[dict]:
    """Split text by lines that look like headings."""
    lines = text.split("\n")
    heading_pattern = re.compile(
        r"^(?:"
        r"(?:Chapter|Section|Part|Module|Unit|Lecture|Topic|Objective)\s*\d*[:\.\s]|"
        r"\d{1,3}[\.\)]\s+[A-Z]|"
        r"[A-Z][A-Z\s&\-]{5,}$|"
        r"[IVXLC]+[\.\)]\s+"
        r")",
        re.IGNORECASE,
    )

    topics = []
    current_heading = None
    current_lines = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            current_lines.append("")
            continue

        is_heading = (
            heading_pattern.match(stripped)
            or (len(stripped) < 80 and stripped.isupper() and len(stripped.split()) >= 2)
        )

        if is_heading and current_lines:
            chunk_text = "\n".join(current_lines).strip()
            if chunk_text and len(chunk_text.split()) >= 10:
                name = current_heading or _derive_topic_name_from_content(chunk_text)
                name = _clean_topic_name(name or "General Content")
                topics.append({"name": name, "text": chunk_text})
            current_heading = stripped
            current_lines = [stripped]
        else:
            current_lines.append(stripped)

    if current_lines:
        chunk_text = "\n".join(current_lines).strip()
        if chunk_text and len(chunk_text.split()) >= 10:
            name = current_heading or _derive_topic_name_from_content(chunk_text)
            name = _clean_topic_name(name or "General Content")
            topics.append({"name": name, "text": chunk_text})

    return topics


def _split_by_paragraphs(text: str, target_words: int = 300) -> list[dict]:
    """Split text into chunks of roughly target_words size."""
    paragraphs = re.split(r"\n\s*\n", text)
    topics = []
    current_chunk = []
    current_word_count = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        word_count = len(para.split())
        current_chunk.append(para)
        current_word_count += word_count

        if current_word_count >= target_words:
            chunk_text = "\n\n".join(current_chunk)
            name = _derive_topic_name_from_content(chunk_text)
            name = _clean_topic_name(name or "General Content")
            topics.append({"name": name, "text": chunk_text})
            current_chunk = []
            current_word_count = 0

    if current_chunk:
        chunk_text = "\n\n".join(current_chunk)
        if len(chunk_text.split()) >= 10:
            name = _derive_topic_name_from_content(chunk_text)
            name = _clean_topic_name(name or "General Content")
            topics.append({"name": name, "text": chunk_text})

    return topics


def _derive_topic_name_from_content(text: str) -> str:
    """Derive a topic name by checking concept map first, then keywords."""
    concept = _classify_page_concept(text)
    if concept:
        return concept.title()

    # Fallback: use the first meaningful short line
    for line in text.split("\n"):
        line = line.strip()
        if line and 4 < len(line) < 80 and len(line.split()) >= 2:
            return line
    return ""


def _clean_topic_name(name: str) -> str:
    """Clean up a topic name to be presentable."""
    name = re.sub(r"^\d+[\.\)]\s*", "", name)
    name = re.sub(r"^\d+\.\d+\s+", "", name)
    name = name.strip(" .:;,")
    if name.islower() or name.isupper():
        name = name.title()
    if len(name) > 70:
        name = name[:67] + "..."
    return name if name else "General Content"
