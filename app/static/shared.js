// === Dark Mode ===
function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('darkMode', isDark ? '1' : '0');
    document.querySelector('.theme-toggle').textContent = isDark ? '\u2600' : '\u263E';
}

// Apply saved theme on load
(function () {
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
            if (data.status === 'cloud') {
                if (data.fileUrl) {
                    // Direct per-file link (OneDrive)
                    window.open(data.fileUrl, '_blank');
                } else if (data.driveUrl) {
                    // Fallback: open generic Drive folder + copy path
                    navigator.clipboard.writeText(path);
                    window.open(data.driveUrl, '_blank');
                    const toast = document.getElementById('copyToast');
                    if (toast) {
                        toast.textContent = 'Path copied — find this file in the Drive folder';
                        toast.classList.add('show');
                        setTimeout(() => { toast.classList.remove('show'); toast.textContent = 'Path copied to clipboard'; }, 3000);
                    }
                }
            } else if (data.error) {
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
(function () {
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

// === Playlist ===
function getPlaylist() {
    try {
        return JSON.parse(localStorage.getItem('currentPlaylist') || 'null');
    } catch { return null; }
}

function savePlaylistRaw(playlist) {
    localStorage.setItem('currentPlaylist', JSON.stringify(playlist));
}

function savePlaylistToLocal(code, name, resources) {
    savePlaylistRaw({ code: code, name: name, resources: resources });
}

function getPlaylistResources() {
    const pl = getPlaylist();
    return pl ? pl.resources || [] : [];
}

function isInPlaylist(path) {
    return getPlaylistResources().some(r => r.path === path);
}

function addToPlaylist(path, filename, source, fileType, btn) {
    let pl = getPlaylist() || { code: null, name: 'My Playlist', resources: [] };
    if (pl.resources.some(r => r.path === path)) {
        // Remove (toggle off)
        pl.resources = pl.resources.filter(r => r.path !== path);
        if (btn) {
            btn.classList.remove('in-playlist');
            btn.innerHTML = '&#43;';
        }
    } else {
        // Add
        pl.resources.push({ path, filename, source, fileType });
        if (btn) {
            btn.classList.add('in-playlist');
            btn.innerHTML = '&#10003;';
        }
    }
    pl.code = null;
    savePlaylistRaw(pl);
    updatePlaylistCount();
}

function removeFromPlaylist(path) {
    let pl = getPlaylist();
    if (!pl) return;
    pl.resources = pl.resources.filter(r => r.path !== path);
    pl.code = null;
    savePlaylistRaw(pl);
    if (typeof renderLocalPlaylist === 'function') {
        renderLocalPlaylist();
    }
    updatePlaylistCount();
}

function clearPlaylist() {
    if (!confirm('Clear your entire playlist?')) return;
    localStorage.removeItem('currentPlaylist');
    if (typeof renderLocalPlaylist === 'function') {
        renderLocalPlaylist();
    }
    updatePlaylistCount();
}

function updatePlaylistCount() {
    const badge = document.getElementById('playlistBadge');
    if (!badge) return;
    const count = getPlaylistResources().length;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

function sharePlaylist() {
    const pl = getPlaylist();
    if (!pl || pl.resources.length === 0) {
        alert('Add resources to your playlist first.');
        return;
    }

    const name = prompt('Name your playlist:', pl.name || 'My Playlist');
    if (!name) return;

    fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, resources: pl.resources }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }
        pl.code = data.code;
        pl.name = name;
        savePlaylistRaw(pl);

        const resultEl = document.getElementById('shareResult');
        const resultText = document.getElementById('shareResultText');
        if (resultEl && resultText) {
            resultText.textContent = 'Share code: ' + data.code + '  \u2022  Link: ' + window.location.origin + data.url;
            resultEl.style.display = 'flex';
        }
    })
    .catch(() => alert('Could not save playlist. Try again.'));
}

function copyShareCode() {
    const pl = getPlaylist();
    if (!pl || !pl.code) return;
    navigator.clipboard.writeText(pl.code).then(() => {
        const toast = document.getElementById('copyToast');
        if (toast) {
            toast.textContent = 'Playlist code copied!';
            toast.classList.add('show');
            setTimeout(() => { toast.classList.remove('show'); toast.textContent = 'Path copied to clipboard'; }, 2000);
        }
    });
}

function loadPlaylistByCode() {
    const input = document.getElementById('playlistCodeInput');
    if (!input) return;
    const code = input.value.trim();
    if (!code) return;
    window.location.href = '/playlist/' + encodeURIComponent(code);
}

function renderLocalPlaylist() {
    const pl = getPlaylist();
    const container = document.getElementById('playlistResources');
    const emptyMsg = document.getElementById('playlistEmpty');
    const titleEl = document.getElementById('playlistTitle');
    const shareBtn = document.getElementById('shareBtn');
    const clearBtn = document.getElementById('clearBtn');

    if (!container) return;

    const resources = pl ? pl.resources || [] : [];

    if (resources.length === 0) {
        container.innerHTML = '';
        if (emptyMsg) emptyMsg.style.display = '';
        if (titleEl) titleEl.textContent = '0 resources';
        if (shareBtn) shareBtn.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';
    if (titleEl) titleEl.textContent = resources.length + ' resource' + (resources.length !== 1 ? 's' : '');
    if (shareBtn) shareBtn.style.display = '';
    if (clearBtn) clearBtn.style.display = '';

    container.innerHTML = resources.map(r => {
        const escapedPath = r.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const escapedFilename = r.filename.replace(/'/g, "\\'");
        const escapedSource = (r.source || '').replace(/'/g, "\\'");
        const icon = r.fileType === 'video' ? 'VID' :
                     r.fileType === 'pdf' ? 'PDF' :
                     r.fileType === 'anki' ? 'ANK' : 'DIR';
        return '<div class="resource-item" onclick="openResource(\'' + escapedPath + '\')">' +
            '<div class="resource-icon">' + icon + '</div>' +
            '<div class="resource-info">' +
                '<div class="resource-name resource-link">' + r.filename + '</div>' +
                '<div class="resource-meta"><span class="source-badge">' + (r.source || '') + '</span></div>' +
                '<div class="resource-path">' + r.path + '</div>' +
            '</div>' +
            '<div class="resource-actions" onclick="event.stopPropagation()">' +
                '<button class="action-icon" onclick="toggleBookmark(\'' + escapedPath + '\', \'' + escapedFilename + '\', \'' + escapedSource + '\', \'' + (r.fileType || '') + '\', this)" title="Bookmark">&#9734;</button>' +
                '<button class="action-icon" onclick="copyPath(\'' + escapedPath + '\')" title="Copy path">&#128203;</button>' +
                '<button class="action-icon playlist-remove" onclick="removeFromPlaylist(\'' + escapedPath + '\')" title="Remove">&#10006;</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

// Restore playlist button states on page load
(function() {
    document.querySelectorAll('.action-icon[title="Add to playlist"]').forEach(btn => {
        const item = btn.closest('.resource-item');
        if (!item) return;
        const onclick = item.getAttribute('onclick');
        if (!onclick) return;
        const match = onclick.match(/openResource\('(.+?)'\)/);
        if (match && isInPlaylist(match[1])) {
            btn.classList.add('in-playlist');
            btn.innerHTML = '&#10003;';
        }
    });
    updatePlaylistCount();
})();

// === Keyboard Shortcuts ===
document.addEventListener('keydown', function (e) {
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
