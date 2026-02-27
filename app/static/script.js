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

// === Dark Mode (also in shared.js, but needed on index page) ===
function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('darkMode', isDark ? '1' : '0');
    document.querySelector('.theme-toggle').textContent = isDark ? '\u2600' : '\u263E';
}

(function() {
    if (localStorage.getItem('darkMode') === '1') {
        document.body.classList.add('dark');
        const btn = document.querySelector('.theme-toggle');
        if (btn) btn.textContent = '\u2600';
    }
})();

// === Keyboard shortcuts for index page ===
document.addEventListener('keydown', function(e) {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const input = document.querySelector('.search-input');
        if (input && document.activeElement !== input) {
            e.preventDefault();
            input.focus();
        }
    }
    if (e.key === 'Escape') {
        const input = document.querySelector('.search-input');
        if (input && document.activeElement === input) {
            input.blur();
        }
    }
});

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
