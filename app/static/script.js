// === Drop zone interactions ===
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");
const uploadBtn = document.getElementById("uploadBtn");
const uploadForm = document.getElementById("uploadForm");
const loadingOverlay = document.getElementById("loadingOverlay");

if (dropZone) {
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        const files = e.dataTransfer.files;
        const pdfs = Array.from(files).filter(f => f.name.toLowerCase().endsWith(".pdf"));
        if (pdfs.length > 0) {
            // Create a new DataTransfer to set on the input
            const dt = new DataTransfer();
            pdfs.forEach(f => dt.items.add(f));
            fileInput.files = dt.files;
            updateFileName(pdfs);
        }
    });

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            updateFileName(Array.from(fileInput.files));
        }
    });

    uploadForm.addEventListener("submit", (e) => {
        if (fileInput.files.length === 0) {
            e.preventDefault();
            return;
        }
        uploadBtn.disabled = true;
        uploadBtn.textContent = "Processing...";
        loadingOverlay.classList.add("active");

        // Update loading text based on mode
        const loadingText = document.getElementById("loadingText");
        const sgCheckbox = document.getElementById("useStudyGuide");
        if (loadingText && sgCheckbox && sgCheckbox.checked) {
            loadingText.textContent = "Generating AI Study Guide with Gemini 2.5... This may take 10-20 seconds.";
        }
    });
}

function updateFileName(files) {
    if (files.length === 1) {
        fileName.textContent = files[0].name;
    } else {
        fileName.textContent = files.length + " PDFs selected: " + files.map(f => f.name).join(", ");
    }
    uploadBtn.disabled = false;
}

// === Indexing with progress polling ===
let pollInterval = null;

function startIndexing() {
    const btn = document.getElementById("indexBtn");
    const progress = document.getElementById("indexProgress");
    const progressText = document.getElementById("indexProgressText");
    const alert = document.getElementById("indexAlert");

    btn.disabled = true;
    btn.textContent = "Indexing...";
    progress.style.display = "flex";
    alert.style.display = "none";

    fetch("/index", { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
            if (data.status === "already_running") {
                progressText.textContent = "Indexing already in progress...";
            }
            pollInterval = setInterval(pollIndexStatus, 2000);
        })
        .catch((err) => {
            progressText.textContent = "Error starting indexing: " + err;
            btn.disabled = false;
            btn.textContent = "Index Resources";
        });
}

// === AI Study Guide toggle ===
function toggleStudyGuideMode() {
    const cb = document.getElementById("useStudyGuide");
    const form = document.getElementById("uploadForm");
    const btn = document.getElementById("uploadBtn");
    if (!cb || !form) return;

    if (cb.checked) {
        form.action = "/study-guide";
        if (btn) btn.textContent = "Generate AI Study Guide";
    } else {
        form.action = "/upload";
        if (btn) btn.textContent = "Get Recommendations";
    }
}

function pollIndexStatus() {
    const btn = document.getElementById("indexBtn");
    const progress = document.getElementById("indexProgress");
    const progressText = document.getElementById("indexProgressText");
    const statusBadge = document.getElementById("statusBadge");
    const alert = document.getElementById("indexAlert");

    fetch("/index-status")
        .then((r) => r.json())
        .then((data) => {
            progressText.textContent = data.progress;

            if (!data.running) {
                clearInterval(pollInterval);
                pollInterval = null;
                progress.style.display = "none";
                btn.disabled = false;

                if (data.error) {
                    alert.className = "alert alert-error";
                    alert.textContent = "Indexing failed: " + data.error;
                    alert.style.display = "block";
                    btn.textContent = "Retry Indexing";
                } else {
                    alert.className = "alert alert-success";
                    alert.textContent =
                        "Successfully indexed " + data.total_indexed + " resources!";
                    alert.style.display = "block";
                    statusBadge.innerHTML =
                        '<span class="status-ready">' +
                        data.total_indexed +
                        " resources indexed</span>";
                    btn.textContent = "Re-index Resources";
                }
            }
        })
        .catch(() => {
            // Network error, keep polling
        });
}
