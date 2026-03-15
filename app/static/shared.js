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
    _refreshPlaylistPanel();
}

function removeFromPlaylist(path) {
    const pl = getActivePlaylist();
    if (!pl) return;
    pl.resources = pl.resources.filter(r => r.path !== path);
    pl.code = null;
    savePlaylistRaw(pl);
    if (document.getElementById('playlistResources')) renderPlaylistPage();
    updatePlaylistCount();
    _refreshPlaylistPanel();
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
    _refreshPlaylistPanel();
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
    _refreshPlaylistPanel();
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
    _refreshPlaylistPanel();
}

function switchPlaylist(id) {
    setActivePlaylistId(id);
    renderPlaylistPage();
    updatePlaylistCount();
    _refreshPlaylistPanel();
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


// ============================================================
//  SLIDE-OUT PANELS
// ============================================================

let _browseHierarchy = null;  // cached hierarchy data
let _browsePanelState = { level: 'sources', source: null, subject: null };

// --- DOM Injection ---
(function injectPanels() {
    // Toggle bar
    const bar = document.createElement('div');
    bar.className = 'panel-toggle-bar';
    bar.innerHTML =
        '<button class="panel-toggle-btn" id="browseToggleBtn" onclick="toggleBrowsePanel()">' +
            '<span class="panel-toggle-icon">&#9776;</span> Browse' +
        '</button>' +
        '<button class="panel-toggle-btn" id="playlistToggleBtn" onclick="togglePlaylistPanel()">' +
            'Playlist <span class="panel-toggle-icon">&#9835;</span>' +
        '</button>';
    document.body.prepend(bar);

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'panel-backdrop';
    backdrop.id = 'panelBackdrop';
    backdrop.onclick = closePanels;
    document.body.appendChild(backdrop);

    // Left panel (Browse)
    const left = document.createElement('div');
    left.className = 'panel-slide panel-left';
    left.id = 'browsePanel';
    left.innerHTML =
        '<div class="panel-header" id="browsePanelHeader">' +
            '<div class="panel-header-row"><span class="panel-title">Browse</span></div>' +
        '</div>' +
        '<div class="panel-body" id="browsePanelBody">' +
            '<div class="panel-empty">Loading...</div>' +
        '</div>';
    document.body.appendChild(left);

    // Right panel (Playlist)
    const right = document.createElement('div');
    right.className = 'panel-slide panel-right';
    right.id = 'playlistPanel';
    right.innerHTML =
        '<div class="panel-header" id="playlistPanelHeader">' +
            '<div class="panel-header-row"><span class="panel-title">Playlist</span></div>' +
        '</div>' +
        '<div class="panel-body" id="playlistPanelBody">' +
            '<div class="panel-empty">Loading...</div>' +
        '</div>';
    document.body.appendChild(right);
})();

// --- Panel Toggle ---

function toggleBrowsePanel() {
    const panel = document.getElementById('browsePanel');
    const backdrop = document.getElementById('panelBackdrop');
    const btn = document.getElementById('browseToggleBtn');
    const otherPanel = document.getElementById('playlistPanel');
    const otherBtn = document.getElementById('playlistToggleBtn');

    if (panel.classList.contains('open')) {
        panel.classList.remove('open');
        btn.classList.remove('active');
        backdrop.classList.remove('show');
    } else {
        // Close other panel
        otherPanel.classList.remove('open');
        otherBtn.classList.remove('active');
        // Open this one
        panel.classList.add('open');
        btn.classList.add('active');
        backdrop.classList.add('show');
        // Load content on first open
        if (!_browseHierarchy) {
            _fetchBrowseHierarchy();
        }
    }
}

function togglePlaylistPanel() {
    const panel = document.getElementById('playlistPanel');
    const backdrop = document.getElementById('panelBackdrop');
    const btn = document.getElementById('playlistToggleBtn');
    const otherPanel = document.getElementById('browsePanel');
    const otherBtn = document.getElementById('browseToggleBtn');

    if (panel.classList.contains('open')) {
        panel.classList.remove('open');
        btn.classList.remove('active');
        backdrop.classList.remove('show');
    } else {
        // Close other panel
        otherPanel.classList.remove('open');
        otherBtn.classList.remove('active');
        // Open this one
        panel.classList.add('open');
        btn.classList.add('active');
        backdrop.classList.add('show');
        _renderPlaylistPanel();
    }
}

function closePanels() {
    document.getElementById('browsePanel').classList.remove('open');
    document.getElementById('playlistPanel').classList.remove('open');
    document.getElementById('panelBackdrop').classList.remove('show');
    document.getElementById('browseToggleBtn').classList.remove('active');
    document.getElementById('playlistToggleBtn').classList.remove('active');
}

// --- Browse Panel ---

function _fetchBrowseHierarchy() {
    fetch('/api/browse/hierarchy')
        .then(r => r.json())
        .then(data => {
            _browseHierarchy = data;
            _browsePanelState = { level: 'sources', source: null, subject: null };
            _renderBrowsePanel();
        })
        .catch(() => {
            document.getElementById('browsePanelBody').innerHTML =
                '<div class="panel-empty">Could not load browse data.</div>';
        });
}

function _renderBrowsePanel() {
    const header = document.getElementById('browsePanelHeader');
    const body = document.getElementById('browsePanelBody');
    const state = _browsePanelState;

    if (state.level === 'sources') {
        header.innerHTML =
            '<div class="panel-header-row"><span class="panel-title">Sources</span></div>';
        if (!_browseHierarchy || _browseHierarchy.length === 0) {
            body.innerHTML = '<div class="panel-empty">No indexed resources.</div>';
            return;
        }
        body.innerHTML = _browseHierarchy.map(src =>
            '<div class="panel-list-item" onclick="_browseDrillSource(\'' + src.name.replace(/'/g, "\\'") + '\')">' +
                '<div style="min-width:0;flex:1;">' +
                    '<div class="panel-list-name">' + src.name + '</div>' +
                    '<div class="panel-list-subtitle">' + src.subjects.length + ' subject' + (src.subjects.length !== 1 ? 's' : '') + '</div>' +
                '</div>' +
                '<span class="panel-list-count">' + src.count + '</span>' +
            '</div>'
        ).join('');
    } else if (state.level === 'subjects') {
        const src = _browseHierarchy.find(s => s.name === state.source);
        header.innerHTML =
            '<div class="panel-header-row">' +
                '<button class="panel-back" onclick="_browseDrillBack(\'sources\')">&larr; Sources</button>' +
                '<span class="panel-title">' + state.source + '</span>' +
            '</div>';
        if (!src || src.subjects.length === 0) {
            body.innerHTML = '<div class="panel-empty">No subjects found.</div>';
            return;
        }
        body.innerHTML = src.subjects.map(subj =>
            '<div class="panel-list-item" onclick="_browseDrillSubject(\'' + subj.name.replace(/'/g, "\\'") + '\')">' +
                '<span class="panel-list-name">' + subj.name + '</span>' +
                '<span class="panel-list-count">' + subj.count + '</span>' +
            '</div>'
        ).join('');
    } else if (state.level === 'resources') {
        header.innerHTML =
            '<div class="panel-header-row">' +
                '<button class="panel-back" onclick="_browseDrillBack(\'subjects\')">&larr; ' + state.source + '</button>' +
                '<span class="panel-title">' + state.subject + '</span>' +
            '</div>';
        body.innerHTML = '<div class="panel-empty"><div class="spinner-small"></div> Loading...</div>';

        fetch('/api/browse/resources?source=' + encodeURIComponent(state.source) + '&subject=' + encodeURIComponent(state.subject))
            .then(r => r.json())
            .then(resources => {
                if (resources.length === 0) {
                    body.innerHTML = '<div class="panel-empty">No resources found.</div>';
                    return;
                }
                body.innerHTML = '<div class="resources-list">' + resources.map(r => {
                    const ep = (r.relative_path || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    const ef = (r.filename || '').replace(/'/g, "\\'");
                    const es = (r.source || '').replace(/'/g, "\\'");
                    const ft = r.file_type || '';
                    const icon = ft === 'video' ? 'VID' : ft === 'pdf' ? 'PDF' : ft === 'anki' ? 'ANK' : 'DIR';
                    return '<div class="resource-item" onclick="openResource(\'' + ep + '\')">' +
                        '<div class="resource-icon">' + icon + '</div>' +
                        '<div class="resource-info">' +
                            '<div class="resource-name resource-link">' + r.filename + '</div>' +
                            '<div class="resource-path">' + (r.relative_path || '') + '</div>' +
                        '</div>' +
                        '<div class="resource-actions" onclick="event.stopPropagation()">' +
                            '<button class="action-icon" onclick="toggleBookmark(\'' + ep + '\', \'' + ef + '\', \'' + es + '\', \'' + ft + '\', this)" title="Bookmark">&#9734;</button>' +
                            '<button class="action-icon" onclick="copyPath(\'' + ep + '\')" title="Copy path">&#128203;</button>' +
                            '<button class="action-icon" onclick="addToPlaylist(\'' + ep + '\', \'' + ef + '\', \'' + es + '\', \'' + ft + '\', this)" title="Add to playlist">&#43;</button>' +
                        '</div>' +
                    '</div>';
                }).join('') + '</div>';

                // Restore bookmark + playlist states
                body.querySelectorAll('.action-icon[title="Bookmark"]').forEach(btn => {
                    const item = btn.closest('.resource-item');
                    if (!item) return;
                    const onclick = item.getAttribute('onclick');
                    if (!onclick) return;
                    const match = onclick.match(/openResource\('(.+?)'\)/);
                    if (match && isBookmarked(match[1])) { btn.classList.add('bookmarked'); btn.innerHTML = '&#9733;'; }
                });
                body.querySelectorAll('.action-icon[title="Add to playlist"]').forEach(btn => {
                    const item = btn.closest('.resource-item');
                    if (!item) return;
                    const onclick = item.getAttribute('onclick');
                    if (!onclick) return;
                    const match = onclick.match(/openResource\('(.+?)'\)/);
                    if (match && isInPlaylist(match[1])) { btn.classList.add('in-playlist'); btn.innerHTML = '&#10003;'; }
                });
            })
            .catch(() => {
                body.innerHTML = '<div class="panel-empty">Could not load resources.</div>';
            });
    }
}

function _browseDrillSource(sourceName) {
    _browsePanelState = { level: 'subjects', source: sourceName, subject: null };
    _renderBrowsePanel();
}

function _browseDrillSubject(subjectName) {
    _browsePanelState.level = 'resources';
    _browsePanelState.subject = subjectName;
    _renderBrowsePanel();
}

function _browseDrillBack(toLevel) {
    if (toLevel === 'sources') {
        _browsePanelState = { level: 'sources', source: null, subject: null };
    } else if (toLevel === 'subjects') {
        _browsePanelState.level = 'subjects';
        _browsePanelState.subject = null;
    }
    _renderBrowsePanel();
}

// --- Playlist Panel ---

function _renderPlaylistPanel() {
    const header = document.getElementById('playlistPanelHeader');
    const body = document.getElementById('playlistPanelBody');
    if (!body) return;

    migratePlaylistStorage();
    const all = getAllPlaylists();
    const pl = getActivePlaylist();

    // Header with selector
    let headerHtml = '<div class="panel-header-row"><span class="panel-title">Playlist</span></div>';
    if (all.length > 0) {
        headerHtml += '<select class="panel-playlist-selector" onchange="panelSwitchPlaylist(this.value)">';
        headerHtml += all.map(p =>
            '<option value="' + p.id + '"' + (pl && p.id === pl.id ? ' selected' : '') + '>' +
            p.name + ' (' + (p.resources ? p.resources.length : 0) + ')' +
            '</option>'
        ).join('');
        headerHtml += '</select>';
    }
    // Share code input
    headerHtml += '<div class="panel-code-row">' +
        '<input class="panel-code-input" id="panelCodeInput" placeholder="Paste share code..." maxlength="8">' +
        '<button class="btn btn-primary btn-sm" onclick="panelLoadCode()">Load</button>' +
    '</div>';
    // NotebookLM button (below code row)
    headerHtml += '<button class="btn btn-notebooklm" onclick="exportToNotebookLM()" title="Generate a Claude Code prompt to create a NotebookLM study notebook from your playlist">' +
        '<span class="notebooklm-icon">&#128218;</span> Study with NotebookLM' +
    '</button>';
    header.innerHTML = headerHtml;

    // Body: resource list
    const resources = pl ? pl.resources || [] : [];
    if (resources.length === 0) {
        body.innerHTML = '<div class="panel-empty">Your playlist is empty.<br><span style="font-size:0.7rem;color:var(--text-muted);">Add resources using the + button.</span></div>';
        return;
    }

    body.innerHTML = '<div class="resources-list">' + resources.map(r => {
        const ep = r.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const ef = r.filename.replace(/'/g, "\\'");
        const es = (r.source || '').replace(/'/g, "\\'");
        const icon = r.fileType === 'video' ? 'VID' : r.fileType === 'pdf' ? 'PDF' : r.fileType === 'anki' ? 'ANK' : 'DIR';
        return '<div class="resource-item" onclick="openResource(\'' + ep + '\')">' +
            '<div class="resource-icon">' + icon + '</div>' +
            '<div class="resource-info">' +
                '<div class="resource-name resource-link">' + r.filename + '</div>' +
                '<div class="resource-meta"><span class="source-badge">' + (r.source || '') + '</span></div>' +
            '</div>' +
            '<div class="resource-actions" onclick="event.stopPropagation()">' +
                '<button class="action-icon playlist-remove" onclick="removeFromPlaylist(\'' + ep + '\')" title="Remove">&#10006;</button>' +
            '</div>' +
        '</div>';
    }).join('') + '</div>';
}

function _refreshPlaylistPanel() {
    const panel = document.getElementById('playlistPanel');
    if (panel && panel.classList.contains('open')) {
        _renderPlaylistPanel();
    }
}

function panelSwitchPlaylist(id) {
    setActivePlaylistId(id);
    _renderPlaylistPanel();
    // Also update the full playlist page if it exists
    if (document.getElementById('playlistResources')) renderPlaylistPage();
    updatePlaylistCount();
}

function panelLoadCode() {
    const input = document.getElementById('panelCodeInput');
    if (!input) return;
    const code = input.value.trim();
    if (!code) return;
    // Fetch the shared playlist and show its resources in the panel
    fetch('/api/playlist/' + encodeURIComponent(code))
        .then(r => r.json())
        .then(data => {
            if (data.error) { showToast('Playlist not found', 2000); return; }
            // Render shared playlist resources in the panel body
            const body = document.getElementById('playlistPanelBody');
            const header = document.getElementById('playlistPanelHeader');
            header.innerHTML =
                '<div class="panel-header-row">' +
                    '<button class="panel-back" onclick="_renderPlaylistPanel()">&larr; My Playlists</button>' +
                    '<span class="panel-title">' + data.name + '</span>' +
                '</div>' +
                '<button class="btn btn-primary btn-sm" style="width:100%;margin-top:0.5rem;" onclick="importSharedPlaylist(\'' + code + '\', ' + JSON.stringify(data).replace(/'/g, "\\'") + ')">Import to My Playlists</button>';

            if (data.description) {
                header.innerHTML += '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem;">' + data.description + '</div>';
            }

            const resources = data.resources || [];
            if (resources.length === 0) {
                body.innerHTML = '<div class="panel-empty">This playlist is empty.</div>';
                return;
            }
            body.innerHTML = '<div class="resources-list">' + resources.map(r => {
                const ep = (r.path || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const icon = r.fileType === 'video' ? 'VID' : r.fileType === 'pdf' ? 'PDF' : r.fileType === 'anki' ? 'ANK' : 'DIR';
                return '<div class="resource-item" onclick="openResource(\'' + ep + '\')">' +
                    '<div class="resource-icon">' + icon + '</div>' +
                    '<div class="resource-info">' +
                        '<div class="resource-name resource-link">' + (r.filename || '') + '</div>' +
                        '<div class="resource-meta"><span class="source-badge">' + (r.source || '') + '</span></div>' +
                    '</div>' +
                '</div>';
            }).join('') + '</div>';
        })
        .catch(() => showToast('Could not load playlist', 2000));
}


// === NotebookLM Workflow Bridge ===

function exportToNotebookLM() {
    const pl = getActivePlaylist();
    if (!pl || !pl.resources || pl.resources.length === 0) {
        showToast('Add resources to your playlist first', 2000);
        return;
    }

    fetch('/api/notebooklm/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            playlist_name: pl.name || 'Study Playlist',
            resources: pl.resources,
        }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) { showToast(data.error, 2000); return; }
        // Copy the prompt to clipboard
        navigator.clipboard.writeText(data.prompt).then(() => {
            _showNotebookLMModal(data);
        }).catch(() => {
            // Fallback: show the prompt in a modal for manual copy
            _showNotebookLMModal(data);
        });
    })
    .catch(() => showToast('Could not generate NotebookLM prompt', 2000));
}

function _showNotebookLMModal(data) {
    // Remove existing modal if any
    const existing = document.getElementById('notebooklmModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'notebooklmModal';
    modal.className = 'nlm-modal-backdrop';
    modal.innerHTML =
        '<div class="nlm-modal">' +
            '<div class="nlm-modal-header">' +
                '<span class="nlm-modal-title">Study with NotebookLM</span>' +
                '<button class="nlm-modal-close" onclick="document.getElementById(\'notebooklmModal\').remove()">&times;</button>' +
            '</div>' +
            '<div class="nlm-modal-body">' +
                '<p class="nlm-step"><strong>Step 1:</strong> The prompt has been copied to your clipboard.</p>' +
                '<p class="nlm-step"><strong>Step 2:</strong> Open Claude Code and paste the prompt.</p>' +
                '<p class="nlm-step"><strong>Step 3:</strong> Claude will use NotebookLM MCP to create your study notebook with Gemini 2.5.</p>' +
                '<div class="nlm-summary">' +
                    '<div class="nlm-stat">' + data.resource_count + ' resources</div>' +
                    '<div class="nlm-stat">' + data.sources.join(', ') + '</div>' +
                '</div>' +
                '<textarea class="nlm-prompt-box" readonly onclick="this.select()">' + data.prompt + '</textarea>' +
                '<button class="btn btn-primary" style="width:100%;margin-top:0.5rem;" onclick="navigator.clipboard.writeText(document.querySelector(\'.nlm-prompt-box\').value);showToast(\'Prompt copied!\',1500);">Copy Prompt</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
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
        // Close panels first
        const browseOpen = document.getElementById('browsePanel')?.classList.contains('open');
        const playlistOpen = document.getElementById('playlistPanel')?.classList.contains('open');
        if (browseOpen || playlistOpen) {
            closePanels();
            return;
        }
        const input = document.querySelector('.search-input');
        if (input && document.activeElement === input) {
            input.blur();
        }
        document.querySelectorAll('.tag-input-inline').forEach(el => el.remove());
    }
});
