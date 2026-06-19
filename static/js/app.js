document.addEventListener('DOMContentLoaded', () => {
    // State management
    let allReleases = [];
    let selectedNoteId = null;
    let currentFilterType = 'all';
    let searchQuery = '';

    // DOM Elements - Feed
    const refreshBtn = document.getElementById('refresh-btn');
    const refreshSpinner = document.getElementById('refresh-spinner');
    const lastUpdatedText = document.getElementById('last-updated-text');
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const filterContainer = document.getElementById('filter-container');
    
    // States
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const errorMessage = document.getElementById('error-message');
    const retryBtn = document.getElementById('retry-btn');
    const emptyState = document.getElementById('empty-state');
    const notesList = document.getElementById('notes-list');

    // DOM Elements - Composer
    const composerEmptyState = document.getElementById('composer-empty-state');
    const composerActiveState = document.getElementById('composer-active-state');
    const composerBadge = document.getElementById('composer-badge');
    const composerDate = document.getElementById('composer-date');
    const tweetTextarea = document.getElementById('tweet-textarea');
    const charCount = document.getElementById('char-count');
    const progressRingCircle = document.getElementById('progress-ring-circle');
    const copyBtn = document.getElementById('copy-btn');
    const copyBtnText = document.getElementById('copy-btn-text');
    const copyIcon = copyBtn.querySelector('.icon-copy');
    const checkIcon = copyBtn.querySelector('.icon-check');
    const tweetBtn = document.getElementById('tweet-btn');
    const deselectBtn = document.getElementById('deselect-btn');
    const tweetPreviewText = document.getElementById('tweet-preview-text');

    // Progress Ring Configurations
    const RING_RADIUS = 14;
    const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
    
    // Initialize Progress Ring
    progressRingCircle.style.strokeDasharray = `${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;
    progressRingCircle.style.strokeDashoffset = RING_CIRCUMFERENCE;

    // Type classes mapping for UI badges
    const typeClassMap = {
        'feature': 'type-feature',
        'announcement': 'type-announcement',
        'issue': 'type-issue',
        'deprecation': 'type-deprecation',
        'fix': 'type-fix',
        'update': 'type-default'
    };

    // Initialize application
    fetchReleases(false);

    // ==========================================================================
    // Event Listeners
    // ==========================================================================
    
    // Refresh button
    refreshBtn.addEventListener('click', () => {
        fetchReleases(true);
    });

    // Retry button on error
    retryBtn.addEventListener('click', () => {
        fetchReleases(true);
    });

    // Search input
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().stripHtml(); // Custom filter function
        toggleClearSearchButton();
        applyFilters();
    });

    // Clear Search button
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        toggleClearSearchButton();
        searchInput.focus();
        applyFilters();
    });

    // Textarea input for tweet limit validation
    tweetTextarea.addEventListener('input', () => {
        updateCharCounter();
    });

    // Deselect release button
    deselectBtn.addEventListener('click', deselectActiveNote);

    // Clipboard copy button
    copyBtn.addEventListener('click', handleCopyText);

    // Tweet/Post button
    tweetBtn.addEventListener('click', handlePostToX);

    // Helper to strip HTML tags from query inputs just in case
    String.prototype.stripHtml = function() {
        return this.replace(/<[^>]*>?/gm, '');
    };

    // Toggle Visibility of the clear search cross
    function toggleClearSearchButton() {
        if (searchInput.value.length > 0) {
            clearSearchBtn.style.display = 'flex';
        } else {
            clearSearchBtn.style.display = 'none';
        }
    }

    // ==========================================================================
    // API Fetch & Feed Rendering
    // ==========================================================================
    
    async function fetchReleases(forceRefresh = false) {
        showLoadingState();
        deselectActiveNote();
        
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Server returned status: ${response.status}`);
            }
            
            const payload = await response.json();
            
            if (payload.status === 'error') {
                throw new Error(payload.message || 'Failed to retrieve notes');
            }
            
            allReleases = payload.releases;
            
            // Format Last Updated string
            if (payload.last_updated) {
                const date = new Date(payload.last_updated);
                lastUpdatedText.textContent = `Last sync: ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
            }
            
            renderFilters();
            applyFilters();
            
        } catch (error) {
            console.error('Fetch error:', error);
            showErrorState(error.message);
        }
    }

    function showLoadingState() {
        loadingState.classList.remove('hidden');
        errorState.classList.add('hidden');
        emptyState.classList.add('hidden');
        notesList.classList.add('hidden');
        refreshBtn.classList.add('refreshing');
        refreshBtn.disabled = true;
    }

    function showErrorState(msg) {
        loadingState.classList.add('hidden');
        errorState.classList.remove('hidden');
        errorMessage.textContent = msg;
        notesList.classList.add('hidden');
        refreshBtn.classList.remove('refreshing');
        refreshBtn.disabled = false;
        lastUpdatedText.textContent = 'Sync failed';
    }

    function renderFilters() {
        // Compute frequencies of types
        const counts = { all: allReleases.length };
        
        allReleases.forEach(item => {
            const typeKey = item.type.toLowerCase();
            counts[typeKey] = (counts[typeKey] || 0) + 1;
        });

        // Clear filter list
        filterContainer.innerHTML = '';

        // Standard categories sorted by importance
        const order = ['all', 'feature', 'announcement', 'issue', 'deprecation', 'fix'];
        
        // Find categories present in data plus the standard ones
        const typesToShow = new Set(order);
        Object.keys(counts).forEach(type => typesToShow.add(type));

        // Create buttons
        typesToShow.forEach(type => {
            const count = counts[type] || 0;
            if (count === 0 && type !== 'all') return; // Skip zero counts except 'all'

            const button = document.createElement('button');
            const displayTitle = type.charAt(0).toUpperCase() + type.slice(1);
            button.className = `filter-btn ${currentFilterType === type ? 'active' : ''}`;
            button.setAttribute('data-type', type);
            button.innerHTML = `${displayTitle} <span class="badge">${count}</span>`;
            
            button.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                currentFilterType = type;
                applyFilters();
            });

            filterContainer.appendChild(button);
        });
    }

    function applyFilters() {
        let filtered = allReleases;

        // 1. Filter by Category Type
        if (currentFilterType !== 'all') {
            filtered = filtered.filter(item => item.type.toLowerCase() === currentFilterType);
        }

        // 2. Filter by Search Query
        if (searchQuery) {
            filtered = filtered.filter(item => {
                const titleMatch = item.date.toLowerCase().includes(searchQuery);
                const typeMatch = item.type.toLowerCase().includes(searchQuery);
                // Strip tags from content text for cleaner text search match
                const cleanContent = item.content.replace(/<[^>]*>/g, '').toLowerCase();
                const contentMatch = cleanContent.includes(searchQuery);
                return titleMatch || typeMatch || contentMatch;
            });
        }

        // Render Cards
        renderNotes(filtered);
    }

    function renderNotes(items) {
        loadingState.classList.add('hidden');
        refreshBtn.classList.remove('refreshing');
        refreshBtn.disabled = false;

        if (items.length === 0) {
            emptyState.classList.remove('hidden');
            notesList.classList.add('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        notesList.classList.remove('hidden');
        notesList.innerHTML = '';

        items.forEach((item, index) => {
            const card = document.createElement('article');
            const isSelected = selectedNoteId === item.id;
            card.className = `note-card ${isSelected ? 'selected' : ''}`;
            card.setAttribute('data-id', item.id);
            
            // Set delay to staggered fade-in animations on load (cap at 15 items for performance)
            if (index < 15) {
                card.style.animationDelay = `${index * 0.04}s`;
            } else {
                card.style.animationDelay = '0s';
            }

            const typeLower = item.type.toLowerCase();
            const badgeClass = typeClassMap[typeLower] || 'type-default';

            card.innerHTML = `
                <div class="note-header">
                    <div class="note-meta">
                        <span class="type-badge ${badgeClass}">${item.type}</span>
                        <span class="note-date">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            ${item.date}
                        </span>
                    </div>
                    <div class="card-selector"></div>
                </div>
                <div class="note-body">
                    ${item.content}
                </div>
            `;

            // Card click listener
            card.addEventListener('click', (e) => {
                // Ignore clicks directly on nested anchors so users can navigate links
                if (e.target.tagName === 'A') return;
                
                if (selectedNoteId === item.id) {
                    deselectActiveNote();
                } else {
                    selectNote(item);
                }
            });

            notesList.appendChild(card);
        });
    }

    // ==========================================================================
    // Composer and Sharing Actions
    // ==========================================================================

    function selectNote(note) {
        selectedNoteId = note.id;
        
        // Highlight active card
        document.querySelectorAll('.note-card').forEach(card => {
            if (card.getAttribute('data-id') === note.id) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });

        // Display Active Composer
        composerEmptyState.classList.add('hidden');
        composerActiveState.classList.remove('hidden');

        // Setup Composer fields
        const typeLower = note.type.toLowerCase();
        composerBadge.className = `type-badge ${typeClassMap[typeLower] || 'type-default'}`;
        composerBadge.textContent = note.type;
        composerDate.textContent = note.date;

        // Auto-generate optimized tweet text
        // Format HTML content to plain text
        let plainContent = note.content
            .replace(/<[^>]*>/g, '') // Strip tags
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        // X post max limit is 280 characters.
        // Let's compose: 📢 BigQuery [Type] ([Date]): [Content] #BigQuery #GoogleCloud
        const prefix = `📢 BigQuery ${note.type} (${note.date}): `;
        const suffix = `\n\n#BigQuery #GoogleCloud`;
        const reservedLen = prefix.length + suffix.length;
        const availableChars = 280 - reservedLen;

        if (plainContent.length > availableChars) {
            // Need to truncate. Subtracting 3 for the ellipsis "..."
            plainContent = plainContent.slice(0, availableChars - 3) + '...';
        }

        const draftTweet = `${prefix}${plainContent}${suffix}`;
        tweetTextarea.value = draftTweet;
        
        updateCharCounter();
        
        // Scroll composer into view on mobile screens
        if (window.innerWidth <= 1024) {
            composerActiveState.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }

    function deselectActiveNote() {
        selectedNoteId = null;
        
        // Remove selections in list
        document.querySelectorAll('.note-card').forEach(card => {
            card.classList.remove('selected');
        });

        // Revert composer views
        composerActiveState.classList.add('hidden');
        composerEmptyState.classList.remove('hidden');
    }

    function updateCharCounter() {
        const text = tweetTextarea.value;
        const currentLen = text.length;
        const limit = 280;
        const remaining = limit - currentLen;
        
        // Write count text
        charCount.textContent = remaining;

        // Update X Post Live Preview
        if (tweetPreviewText) {
            tweetPreviewText.innerHTML = formatTweetPreview(text);
        }

        // Visual Ring Progress Math
        // Circular progress represents ratio of filled text
        const percent = (currentLen / limit) * 100;
        const offset = RING_CIRCUMFERENCE - (Math.min(percent, 100) / 100) * RING_CIRCUMFERENCE;
        progressRingCircle.style.strokeDashoffset = offset;

        // Handle states past limit
        if (remaining < 0) {
            charCount.style.color = 'var(--color-issue)';
            progressRingCircle.style.stroke = 'var(--color-issue)';
            tweetBtn.disabled = true;
            tweetBtn.style.opacity = '0.5';
            
            // Add shake class for active warning
            tweetTextarea.classList.add('shake');
            charCount.classList.add('shake');
            setTimeout(() => {
                tweetTextarea.classList.remove('shake');
                charCount.classList.remove('shake');
            }, 350);
        } else {
            // Adjust ring color dynamically based on remaining space
            if (remaining <= 20) {
                progressRingCircle.style.stroke = 'var(--color-deprecation)';
                charCount.style.color = 'var(--color-deprecation)';
            } else {
                progressRingCircle.style.stroke = 'var(--color-fix)';
                charCount.style.color = 'var(--text-secondary)';
            }
            tweetBtn.disabled = false;
            tweetBtn.style.opacity = '1';
        }
    }

    async function handleCopyText() {
        const tweetText = tweetTextarea.value;
        try {
            await navigator.clipboard.writeText(tweetText);
            
            // Show check status
            copyIcon.classList.add('hidden');
            checkIcon.classList.remove('hidden');
            copyBtnText.textContent = 'Copied!';
            copyBtn.classList.add('type-fix'); // Green background splash
            
            setTimeout(() => {
                copyIcon.classList.remove('hidden');
                checkIcon.classList.add('hidden');
                copyBtnText.textContent = 'Copy Text';
                copyBtn.classList.remove('type-fix');
            }, 2000);
        } catch (err) {
            console.error('Clipboard copy failed:', err);
            alert('Failed to copy text. Please copy it manually.');
        }
    }

    function handlePostToX() {
        const tweetText = tweetTextarea.value;
        if (tweetText.length > 280) {
            // Double check validation
            alert('Your post is too long for X (Twitter). Please edit and shorten it.');
            return;
        }

        const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
        window.open(shareUrl, '_blank', 'width=550,height=420,toolbar=0,status=0');
    }

    // Live X / Twitter Post markup formatter
    function formatTweetPreview(text) {
        if (!text) return "";
        let escaped = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
            
        // Highlight hashtags
        escaped = escaped.replace(/(#[a-zA-Z0-9_]+)/g, '<span class="tweet-hashtag">$1</span>');
        // Highlight mentions
        escaped = escaped.replace(/(@[a-zA-Z0-9_]+)/g, '<span class="tweet-hashtag">$1</span>');
        return escaped;
    }
});
