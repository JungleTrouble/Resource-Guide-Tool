// === Dark Mode ===
function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('darkMode', isDark ? '1' : '0');
    document.querySelector('.theme-toggle').textContent = isDark ? '\u2600' : '\u263E';
}

// Apply saved theme on load
(function() {
    if (localStorage.getItem('darkMode') === '1') {
        document.body.classList.add('dark');
        const btn = document.querySelector('.theme-toggle');
        if (btn) btn.textContent = '\u2600';
    }
})();

// === Open Resource ===
function openResource(path) {
    fetch('/open?path=' + encodeURIComponent(path))
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                alert('Could not open file: ' + data.error);
            }
        })
        .catch(() => alert('Could not open file.'));
}

// === Copy Path ===
function copyPath(path) {
    navigator.clipboard.writeText(path).then(() => {
        const toast = document.getElementById('copyToast');
        if (toast) {
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        }
    });
}

// === Bookmarks ===
function getBookmarks() {
    try {
        return JSON.parse(localStorage.getItem('bookmarks') || '[]');
    } catch { return []; }
}

function saveBookmarks(bookmarks) {
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
}

function isBookmarked(path) {
    return getBookmarks().some(b => b.path === path);
}

function toggleBookmark(path, filename, source, fileType, btn) {
    let bookmarks = getBookmarks();
    const idx = bookmarks.findIndex(b => b.path === path);
    if (idx >= 0) {
        bookmarks.splice(idx, 1);
        btn.classList.remove('bookmarked');
        btn.innerHTML = '&#9734;';
    } else {
        bookmarks.push({ path, filename, source, fileType, savedAt: Date.now() });
        btn.classList.add('bookmarked');
        btn.innerHTML = '&#9733;';
    }
    saveBookmarks(bookmarks);
}

// Restore bookmark states on page load
(function() {
    document.querySelectorAll('.action-icon[title="Bookmark"]').forEach(btn => {
        // Extract path from the onclick attribute of the parent resource-item
        const item = btn.closest('.resource-item');
        if (!item) return;
        const onclick = item.getAttribute('onclick');
        if (!onclick) return;
        const match = onclick.match(/openResource\('(.+?)'\)/);
        if (match && isBookmarked(match[1])) {
            btn.classList.add('bookmarked');
            btn.innerHTML = '&#9733;';
        }
    });
})();

// === Source Filtering ===
function filterSources() {
    const labels = document.querySelectorAll('.source-filter-label');
    const activeSources = new Set();

    labels.forEach(label => {
        const cb = label.querySelector('input[type="checkbox"]');
        if (cb.checked) {
            label.classList.add('active');
            activeSources.add(label.dataset.source);
        } else {
            label.classList.remove('active');
        }
    });

    // Show/hide source groups
    document.querySelectorAll('.source-group[data-source]').forEach(group => {
        if (activeSources.size === 0 || activeSources.has(group.dataset.source)) {
            group.style.display = '';
        } else {
            group.style.display = 'none';
        }
    });
}

// === Export Checklist ===
function exportChecklist() {
    let text = 'Study Resource Checklist\n';
    text += '========================\n\n';

    // Check if we're on search page or results page
    const topicCards = document.querySelectorAll('.topic-card');

    if (topicCards.length > 0) {
        // Results page — export by topic
        topicCards.forEach(card => {
            const topicName = card.querySelector('.topic-title h2')?.textContent || 'Topic';
            text += '## ' + topicName + '\n';
            card.querySelectorAll('.source-group').forEach(group => {
                if (group.style.display === 'none') return;
                const source = group.querySelector('.source-group-name')?.textContent || '';
                text += '\n  ' + source + ':\n';
                group.querySelectorAll('.resource-item').forEach(item => {
                    const name = item.querySelector('.resource-name')?.textContent || '';
                    const path = item.querySelector('.resource-path')?.textContent || '';
                    text += '    [ ] ' + name + '\n';
                    if (path) text += '        ' + path + '\n';
                });
            });
            text += '\n';
        });
    } else {
        // Search page — export flat list
        document.querySelectorAll('.source-group').forEach(group => {
            if (group.style.display === 'none') return;
            const source = group.querySelector('.source-group-name')?.textContent || '';
            text += '## ' + source + '\n';
            group.querySelectorAll('.resource-item').forEach(item => {
                const name = item.querySelector('.resource-name')?.textContent || '';
                const path = item.querySelector('.resource-path')?.textContent || '';
                text += '  [ ] ' + name + '\n';
                if (path) text += '      ' + path + '\n';
            });
            text += '\n';
        });
    }

    // Download as text file
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'study-checklist.txt';
    a.click();
    URL.revokeObjectURL(url);
}

// === Recent Searches ===
function getRecentSearches() {
    try {
        return JSON.parse(localStorage.getItem('recentSearches') || '[]');
    } catch { return []; }
}

function saveRecentSearch(query) {
    let recent = getRecentSearches();
    // Remove if already exists
    recent = recent.filter(q => q.toLowerCase() !== query.toLowerCase());
    // Add to front
    recent.unshift(query);
    // Keep only 5
    recent = recent.slice(0, 5);
    localStorage.setItem('recentSearches', JSON.stringify(recent));
}

function renderRecentSearches() {
    const container = document.getElementById('recentSearches');
    if (!container) return;
    const recent = getRecentSearches();
    if (recent.length === 0) return;

    container.innerHTML = '<span class="recent-label">Recent:</span>' +
        recent.map(q => '<a href="/search?q=' + encodeURIComponent(q) + '" class="recent-chip">' + q + '</a>').join('');
}

// === Keyboard Shortcuts ===
document.addEventListener('keydown', function(e) {
    // "/" to focus search
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const input = document.querySelector('.search-input');
        if (input && document.activeElement !== input) {
            e.preventDefault();
            input.focus();
        }
    }
    // Escape to blur search
    if (e.key === 'Escape') {
        const input = document.querySelector('.search-input');
        if (input && document.activeElement === input) {
            input.blur();
        }
    }
});
