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
                    window.open(data.fileUrl, '_blank');
                } else if (data.driveUrl) {
                    navigator.clipboard.writeText(path);
                    window.open(data.driveUrl, '_blank');
                    showToast('Path copied — find this file in the Drive folder', 3000);
                }
            } else if (data.error) {
                alert('Could not open file: ' + data.error);
            }
        })
        .catch(() => alert('Could not open file.'));
}

// === Toast ===
function showToast(msg, duration) {
    duration = duration || 2000;
    const toast = document.getElementById('copyToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); toast.textContent = 'Path copied to clipboard'; }, duration);
}

// === Copy Path ===
function copyPath(path) {
    navigator.clipboard.writeText(path).then(() => showToast('Path copied to clipboard'));
}

// === Bookmarks ===
function getBookmarks() {
    try { return JSON.parse(localStorage.getItem('bookmarks') || '[]'); }
    catch { return []; }
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

    document.querySelectorAll('.source-group[data-source]').forEach(group => {
        group.style.display = (activeSources.size === 0 || activeSources.has(group.dataset.source)) ? '' : 'none';
    });
}

// === Export Checklist ===
function exportChecklist() {
    let text = 'Study Resource Checklist\n========================\n\n';
    const topicCards = document.querySelectorAll('.topic-card');

    if (topicCards.length > 0) {
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
    try { return JSON.parse(localStorage.getItem('recentSearches') || '[]'); }
    catch { return []; }
}

function saveRecentSearch(query) {
    let recent = getRecentSearches();
    recent = recent.filter(q => q.toLowerCase() !== query.toLowerCase());
    recent.unshift(query);
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


// ============================================================
//  MULTI-PLAYLIST SYSTEM
// ============================================================

function _generateId() {
    return 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// -- Storage helpers --

function getAllPlaylists() {
    try { return JSON.parse(localStorage.getItem('playlists') || '[]'); }
    catch { return []; }
}

function _saveAllPlaylists(playlists) {
    localStorage.setItem('playlists', JSON.stringify(playlists));
}

function getActivePlaylistId() {
    return localStorage.getItem('activePlaylistId') || '';
}

function setActivePlaylistId(id) {
    localStorage.setItem('activePlaylistId', id);
}

// -- Migration from old single-playlist format --

function migratePlaylistStorage() {
    if (localStorage.getItem('playlists')) return; // already migrated
    const old = localStorage.getItem('currentPlaylist');
    if (!old) {
        // No old data — create default empty playlist
        const id = _generateId();
        _saveAllPlaylists([{ id: id, code: null, name: 'My Playlist', description: '', resources: [], createdAt: Date.now() }]);
        setActivePlaylistId(id);
        return;
    }
    try {
        const parsed = JSON.parse(old);
        const id = _generateId();
        const migrated = {
            id: id,
            code: parsed.code || null,
            name: parsed.name || 'My Playlist',
            description: '',
            resources: parsed.resources || [],
            createdAt: Date.now(),
        };
        _saveAllPlaylists([migrated]);
        setActivePlaylistId(id);
        localStorage.removeItem('currentPlaylist');
    } catch {
        const id = _generateId();
        _saveAllPlaylists([{ id: id, code: null, name: 'My Playlist', description: '', resources: [], createdAt: Date.now() }]);
        setActivePlaylistId(id);
        localStorage.removeItem('currentPlaylist');
    }
}

// -- Playlist accessors --

function getActivePlaylist() {
    const all = getAllPlaylists();
    const activeId = getActivePlaylistId();
    return all.find(p => p.id === activeId) || all[0] || null;
}

// Backward-compatible wrappers
function getPlaylist() {
    migratePlaylistStorage();
    return getActivePlaylist();
}

function getPlaylistResources() {
    const pl = getPlaylist();
    return pl ? pl.resources || [] : [];
}

function isInPlaylist(path) {
    return getPlaylistResources().some(r => r.path === path);
}

function savePlaylistRaw(playlist) {
    const all = getAllPlaylists();
    const idx = all.findIndex(p => p.id === playlist.id);
    if (idx >= 0) {
        all[idx] = playlist;
    } else {
        all.push(playlist);
    }
    _saveAllPlaylists(all);
}

function savePlaylistToLocal(code, name, resources) {
    migratePlaylistStorage();
    const pl = getActivePlaylist();
    if (pl) {
        pl.code = code;
        pl.name = name;
        pl.resources = resources;
        savePlaylistRaw(pl);
    }
}

// -- Playlist operations --

function addToPlaylist(path, filename, source, fileType, btn) {
    migratePlaylistStorage();
    let pl = getActivePlaylist();
    if (!pl) {
        const id = _generateId();
        pl = { id: id, code: null, name: 'My Playlist', description: '', resources: [], createdAt: Date.now() };
        const all = getAllPlaylists();
        all.push(pl);
        _saveAllPlaylists(all);
        setActivePlaylistId(id);
    }
    if (pl.resources.some(r => r.path === path)) {
        pl.resources = pl.resources.filter(r => r.path !== path);
        if (btn) { btn.classList.remove('in-playlist'); btn.innerHTML = '&#43;'; }
    } else {
        pl.resources.push({ path, filename, source, fileType });
        if (btn) { btn.classList.add('in-playlist'); btn.innerHTML = '&#10003;'; }
    }
    pl.code = null;
    savePlaylistRaw(pl);
    updatePlaylistCount();
}

function removeFromPlaylist(path) {
    const pl = getActivePlaylist();
    if (!pl) return;
    pl.resources = pl.resources.filter(r => r.path !== path);
    pl.code = null;
    savePlaylistRaw(pl);
    if (document.getElementById('playlistResources')) renderPlaylistPage();
    updatePlaylistCount();
}

function clearPlaylist() {
    if (!confirm('Clear all resources from this playlist?')) return;
    const pl = getActivePlaylist();
    if (!pl) return;
    pl.resources = [];
    pl.code = null;
    savePlaylistRaw(pl);
    if (document.getElementById('playlistResources')) renderPlaylistPage();
    updatePlaylistCount();
}

function createNewPlaylist() {
    const name = prompt('Playlist name:', 'New Playlist');
    if (!name) return;
    const id = _generateId();
    const pl = { id: id, code: null, name: name.trim(), description: '', resources: [], createdAt: Date.now() };
    const all = getAllPlaylists();
    all.push(pl);
    _saveAllPlaylists(all);
    setActivePlaylistId(id);
    renderPlaylistPage();
    updatePlaylistCount();
}

function deleteActivePlaylist() {
    const all = getAllPlaylists();
    if (all.length <= 1) {
        alert('You need at least one playlist.');
        return;
    }
    if (!confirm('Delete this playlist?')) return;
    const activeId = getActivePlaylistId();
    const filtered = all.filter(p => p.id !== activeId);
    _saveAllPlaylists(filtered);
    setActivePlaylistId(filtered[0].id);
    renderPlaylistPage();
    updatePlaylistCount();
}

function switchPlaylist(id) {
    setActivePlaylistId(id);
    renderPlaylistPage();
    updatePlaylistCount();
}

function importSharedPlaylist(code, playlistData) {
    migratePlaylistStorage();
    const id = _generateId();
    const pl = {
        id: id,
        code: code,
        name: playlistData.name + ' (imported)',
        description: playlistData.description || '',
        resources: playlistData.resources || [],
        createdAt: Date.now(),
    };
    const all = getAllPlaylists();
    all.push(pl);
    _saveAllPlaylists(all);
    setActivePlaylistId(id);
    showToast('Playlist imported!', 2000);
    window.location.href = '/playlist';
}

function updatePlaylistCount() {
    const badge = document.getElementById('playlistBadge');
    if (!badge) return;
    const count = getPlaylistResources().length;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

function sharePlaylist() {
    const pl = getActivePlaylist();
    if (!pl || pl.resources.length === 0) {
        alert('Add resources to your playlist first.');
        return;
    }

    const name = prompt('Name your playlist:', pl.name || 'My Playlist');
    if (!name) return;
    const description = prompt('Add a description (optional):', pl.description || '') || '';

    fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, description: description, resources: pl.resources }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) { alert('Error: ' + data.error); return; }
        pl.code = data.code;
        pl.name = name;
        pl.description = description;
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
    const pl = getActivePlaylist();
    if (!pl || !pl.code) return;
    navigator.clipboard.writeText(pl.code).then(() => showToast('Playlist code copied!'));
}

function loadPlaylistByCode() {
    const input = document.getElementById('playlistCodeInput');
    if (!input) return;
    const code = input.value.trim();
    if (!code) return;
    window.location.href = '/playlist/' + encodeURIComponent(code);
}

// -- Playlist Page Rendering --

function renderPlaylistPage() {
    const selector = document.getElementById('playlistSelector');
    const container = document.getElementById('playlistResources');
    const emptyMsg = document.getElementById('playlistEmpty');
    const shareBtn = document.getElementById('shareBtn');
    const deleteBtn = document.getElementById('deletePlaylistBtn');

    if (!container) return;

    const all = getAllPlaylists();
    const pl = getActivePlaylist();

    // Render selector
    if (selector) {
        selector.innerHTML = all.map(p =>
            '<option value="' + p.id + '"' + (pl && p.id === pl.id ? ' selected' : '') + '>' +
            p.name + ' (' + p.resources.length + ')' +
            '</option>'
        ).join('');
    }

    const resources = pl ? pl.resources || [] : [];

    if (resources.length === 0) {
        container.innerHTML = '';
        if (emptyMsg) emptyMsg.style.display = '';
        if (shareBtn) shareBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = all.length > 1 ? '' : 'none';
        return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';
    if (shareBtn) shareBtn.style.display = '';
    if (deleteBtn) deleteBtn.style.display = all.length > 1 ? '' : 'none';

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

// Backward compat
function renderLocalPlaylist() {
    migratePlaylistStorage();
    renderPlaylistPage();
}

// Restore playlist button states on page load
(function() {
    migratePlaylistStorage();
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


// ============================================================
//  TAGS SYSTEM
// ============================================================

let _allTagNames = null;

function loadTagsForPaths(paths) {
    if (!paths || paths.length === 0) return;
    fetch('/api/tags')
        .then(r => r.json())
        .then(allTags => {
            paths.forEach(path => {
                const tags = allTags[path] || [];
                renderTagsForPath(path, tags);
            });
        })
        .catch(() => {});
}

function renderTagsForPath(path, tags) {
    // Use attribute selector with proper escaping
    document.querySelectorAll('.resource-tags').forEach(container => {
        if (container.dataset.path !== path) return;
        if (tags.length === 0) {
            container.innerHTML = '';
            return;
        }
        const escapedPath = path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        container.innerHTML = tags.map(tag =>
            '<span class="tag-pill" onclick="event.stopPropagation(); removeTag(\'' + escapedPath + '\', \'' + tag.replace(/'/g, "\\'") + '\')" title="Click to remove">' +
            tag + ' &times;</span>'
        ).join('');
    });
}

function showTagInput(btn, path) {
    const existing = btn.closest('.resource-actions')?.querySelector('.tag-input-inline');
    if (existing) { existing.remove(); return; }

    const wrapper = document.createElement('div');
    wrapper.className = 'tag-input-inline';
    wrapper.onclick = function(e) { e.stopPropagation(); };

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tag-input';
    input.placeholder = 'tag...';
    input.maxLength = 50;

    const dropdown = document.createElement('div');
    dropdown.className = 'tag-autocomplete';

    input.addEventListener('input', function() {
        const val = input.value.trim().toLowerCase();
        if (!val) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
        if (!_allTagNames) {
            fetch('/api/tags/all-names').then(r => r.json()).then(names => {
                _allTagNames = names;
                showAutocomplete(val, names, dropdown, input, path);
            });
        } else {
            showAutocomplete(val, _allTagNames, dropdown, input, path);
        }
    });

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const tag = input.value.trim();
            if (tag) addTag(path, tag, wrapper);
        }
        if (e.key === 'Escape') {
            wrapper.remove();
        }
    });

    wrapper.appendChild(input);
    wrapper.appendChild(dropdown);
    btn.closest('.resource-actions').appendChild(wrapper);
    input.focus();
}

function showAutocomplete(val, names, dropdown, input, path) {
    const matches = names.filter(n => n.includes(val) && n !== val).slice(0, 5);
    if (matches.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.style.display = '';
    dropdown.innerHTML = matches.map(m =>
        '<div class="tag-autocomplete-item">' + m + '</div>'
    ).join('');
    dropdown.querySelectorAll('.tag-autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', function(e) {
            e.preventDefault();
            input.value = item.textContent;
            const wrapper = input.closest('.tag-input-inline');
            addTag(path, item.textContent, wrapper);
        });
    });
}

function addTag(path, tag, inputWrapper) {
    tag = tag.trim().toLowerCase().slice(0, 50);
    if (!tag) return;

    fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_path: path, tag: tag }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) { alert(data.error); return; }
        renderTagsForPath(path, data.tags);
        if (_allTagNames && !_allTagNames.includes(tag)) {
            _allTagNames.push(tag);
            _allTagNames.sort();
        }
        if (inputWrapper) inputWrapper.remove();
    })
    .catch(() => alert('Could not add tag.'));
}

function removeTag(path, tag) {
    fetch('/api/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_path: path, tag: tag }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) { alert(data.error); return; }
        renderTagsForPath(path, data.tags);
    })
    .catch(() => alert('Could not remove tag.'));
}


// === Keyboard Shortcuts ===
document.addEventListener('keydown', function (e) {
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
        document.querySelectorAll('.tag-input-inline').forEach(el => el.remove());
    }
});
