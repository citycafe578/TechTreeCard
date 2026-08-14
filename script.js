const MY_CARD_STORAGE_KEY = 'ssi-card:my-card:v1';
const CARD_BOOK_STORAGE_KEY = 'ssi-card:card-book:v1';
const LEGACY_STORAGE_KEY = 'mySkillTreeMaster';

let currentNodeData = null;
let isEditingProfile = false;
let isPreviewMode = false; 
let currentViewingCard = null;
let pendingImportData = null;

const defaultProfileData = {
    name: "",
    org: "",
    edu: "",
    intro: "",
    imgUrl: "",
    introUrl: ""
};

let profileData = { ...defaultProfileData };

function normalizeProfileData(data = {}) {
    return { ...defaultProfileData, ...data };
}

function buildCardData() {
    if (!profileData.id) profileData.id = `did:local:${crypto.randomUUID ? crypto.randomUUID() : generateId()}`;
    return {
version: 1,
id: profileData.id,
profile: { ...profileData },
nodes: nodes.map(node => ({
    id: node.id, parentIds: node.parentIds, title: node.title, desc: node.desc,
    tags: node.tags, category: node.category, level: node.level, x: Math.round(node.targetX * 10) / 10,
    y: Math.round(node.targetY * 10) / 10, z: Math.round(node.targetZ * 10) / 10
})),
updatedAt: new Date().toISOString()
    };
}

function buildSharedCardData() {
    const sharedData = buildCardData();
    const fields = new Set(Array.from(document.querySelectorAll('[data-share-field]:checked')).map(input => input.dataset.shareField));
    Object.keys(sharedData.profile).forEach(key => {
if (key !== 'id' && !fields.has(key)) sharedData.profile[key] = '';
    });
    if (!fields.has('descriptions')) sharedData.nodes.forEach(node => { node.desc = ''; });
    return sharedData;
}

function updateIdentityCard() {
    document.getElementById('identity-name').textContent = profileData.name || 'YOUR NAME';
    document.getElementById('identity-org').textContent = profileData.org || 'Personal Technology Tree';
}

function getCardBook() {
    try { return JSON.parse(localStorage.getItem(CARD_BOOK_STORAGE_KEY) || '[]'); }
    catch { return []; }
}

function setPreviewMode(enabled) {
    isPreviewMode = enabled;
    document.getElementById('preview-btn').innerText = enabled ? 'Preview: ON' : 'Preview: OFF';
    document.getElementById('add-node-btn').style.display = enabled ? 'none' : 'block';
    document.getElementById('edit-mode-btn').style.display = enabled ? 'none' : 'block';
    document.getElementById('share-btn').style.display = enabled ? 'none' : 'block';
    document.getElementById('share-options').style.display = enabled ? 'none' : 'flex';
    document.getElementById('export-btn').style.display = enabled ? 'none' : 'block';
    document.getElementById('import-btn').style.display = enabled ? 'none' : 'block';
    document.getElementById('info-panel').style.display = 'none';
}

function isValidCardData(data) {
    return Array.isArray(data) || (data && typeof data === 'object' && Array.isArray(data.nodes) && (!data.profile || typeof data.profile === 'object'));
}

function loadCardIntoEditor(cardData) {
    disposeAndClearNodes();
    profileData = { ...defaultProfileData };
    parseAndRenderData(JSON.stringify(cardData));
    currentViewingCard = null;
    setPreviewMode(false);
    document.getElementById('preview-btn').style.display = 'block';
    saveSkillsToLocal();
}

function encodeCardForUrl(cardData) {
    const bytes = new TextEncoder().encode(JSON.stringify(cardData));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCardFromUrl(encodedCard) {
    const base64 = encodedCard.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encodedCard.length % 4) % 4);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
}

function generateId() { return 'node_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

function getAllUniqueTags() {
    const tagSet = new Set();
    nodes.forEach(node => {
        if (node.tags && Array.isArray(node.tags)) {
            node.tags.forEach(tagText => {
                const trimmedTag = (tagText || '').toString().trim();
                if (trimmedTag) tagSet.add(trimmedTag);
            });
        }
    });
    return Array.from(tagSet);
}

let searchModeIsList = false;
let editModeIsList = false;

const menuShell = document.getElementById('menu-shell');
const menuToggleBtn = document.getElementById('menu-toggle-btn');

function openMenu() {
    menuShell.classList.add('open');
    menuToggleBtn.setAttribute('aria-expanded', 'true');
}

function closeMenu() {
    menuShell.classList.remove('open');
    menuToggleBtn.setAttribute('aria-expanded', 'false');
}

menuToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuShell.classList.contains('open') ? closeMenu() : openMenu();
});

document.addEventListener('click', (event) => {
    if (!menuShell.contains(event.target)) closeMenu();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
});

document.getElementById('search-mode-btn').addEventListener('click', () => {
    searchModeIsList = !searchModeIsList;
    document.getElementById('search-input').style.display = searchModeIsList ? 'none' : 'block';
    document.getElementById('search-tag-cloud').style.display = searchModeIsList ? 'flex' : 'none';
    if(searchModeIsList) renderSearchTags();
});

document.getElementById('edit-mode-btn').addEventListener('click', () => {
    if(isPreviewMode) return;
    editModeIsList = !editModeIsList;
    document.getElementById('node-tags').style.display = editModeIsList ? 'none' : 'block';
    document.getElementById('edit-tag-cloud').style.display = editModeIsList ? 'flex' : 'none';
    if(editModeIsList) renderEditTags();
});

function renderSearchTags() {
    const container = document.getElementById('search-tag-cloud');
    container.innerHTML = '';
    const allTags = getAllUniqueTags();
    const currentSearch = document.getElementById('search-input').value.toLowerCase().trim();

    allTags.forEach(tag => {
        const tagButton = document.createElement('button');
        tagButton.className = 'tag-pill' + (currentSearch === tag.toLowerCase() ? ' active' : '');
        tagButton.innerText = tag;
        tagButton.onclick = () => {
            const searchInput = document.getElementById('search-input');
            if (searchInput.value.toLowerCase().trim() === tag.toLowerCase()) searchInput.value = "";
            else searchInput.value = tag;
            renderSearchTags();
            updateTargets();
        };
        container.appendChild(tagButton);
    });
}

function renderEditTags() {
    const container = document.getElementById('edit-tag-cloud');
    container.innerHTML = '';
    const allTags = getAllUniqueTags();
    const currentTags = document.getElementById('node-tags').value.split(',').map(tagText => tagText.trim()).filter(tagText => tagText);

    allTags.forEach(tag => {
        const tagButton = document.createElement('button');
        tagButton.className = 'tag-pill' + (currentTags.includes(tag) ? ' active' : '');
        tagButton.innerText = tag;
        tagButton.onclick = () => {
            let tagsArray = document.getElementById('node-tags').value.split(',').map(tagText => tagText.trim()).filter(tagText => tagText);
            if (tagsArray.includes(tag)) tagsArray = tagsArray.filter(currentTag => currentTag !== tag);
            else tagsArray.push(tag);
            document.getElementById('node-tags').value = tagsArray.join(', ');
            renderEditTags();
        };
        container.appendChild(tagButton);
    });
}

function saveSkillsToLocal() {
    if(isPreviewMode) return;
    localStorage.setItem(MY_CARD_STORAGE_KEY, JSON.stringify(buildCardData()));
}

function parseAndRenderData(savedDataStr) {
    const parsedData = JSON.parse(savedDataStr);
    let nodesData = Array.isArray(parsedData) ? parsedData : (parsedData.nodes || []);
    if (parsedData.profile) profileData = normalizeProfileData(parsedData.profile);
    nodesData.forEach(data => {
        let parentIds = data.parentIds || data.p || [data.parentId || 'center'];
        if (!Array.isArray(parentIds)) parentIds = [parentIds];
        const x = typeof data.x === 'number' ? data.x : (typeof data.x === 'string' ? parseFloat(data.x) : 0);
        const y = typeof data.y === 'number' ? data.y : (typeof data.y === 'string' ? parseFloat(data.y) : 0);
        const z = typeof data.z === 'number' ? data.z : (typeof data.z === 'string' ? parseFloat(data.z) : 0);
        createNodeMesh(data.id || data.i || generateId(), parentIds, x, y, z, data.title || data.t, data.desc || data.d, data.tags || data.tg || "", data.category || 'skill', data.level || 2);
    });
    updateIdentityCard();
}

async function loadSkills() {
    const sharedCard = new URLSearchParams(window.location.search).get('card');
    if (sharedCard) {
        setPreviewMode(true);
        try {
            const cardData = decodeCardFromUrl(sharedCard);
            parseAndRenderData(JSON.stringify(cardData));
            currentViewingCard = { data: cardData, sourceUrl: window.location.href, sourceType: 'link' };
            document.getElementById('preview-btn').style.display = 'none';
            return;
        } catch (e) { alert("Contact data failed to deserialize. The share URL is probably broken."); }
    }
    const savedData = localStorage.getItem(MY_CARD_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (savedData) { parseAndRenderData(savedData); }
}
loadSkills();
window.addEventListener('load', () => {
    document.body.classList.add('ready');
});

function addSkillNode() {
    if(isPreviewMode) return;
    const randomX = (Math.random() - 0.5) * 6;
    const randomY = (Math.random() - 0.5) * 6;
    const randomZ = (Math.random() - 0.5) * 6;
    createNodeMesh(generateId(), ['center'], randomX, randomY, is2DMode ? 0 : randomZ, "New Node", "", "");
    saveSkillsToLocal();
}

document.getElementById('share-btn').addEventListener('click', () => {
    const shareButton = document.getElementById('share-btn'); shareButton.innerText = "CREATING...";
    const dataToShare = buildSharedCardData();
    try {
        const sharePage = new URL(window.location.href);
        sharePage.search = '';
        sharePage.hash = '';
        sharePage.searchParams.set('card', encodeCardForUrl(dataToShare));
        const shareUrl = sharePage.toString();
        if (shareUrl.length > 7500) {
            alert("Payload too large. Reduce the node count or metadata before serialization.");
            return;
        }
        
        document.getElementById('share-link-input').value = shareUrl;
        const qrContainer = document.getElementById('qr-container'); qrContainer.innerHTML = ''; qrContainer.style.cssText = '';
        document.getElementById('qr-modal-overlay').style.display = 'flex';
        try {
            if (typeof QRCodeStyling === 'undefined') throw new Error('QR Code library unavailable');
            new QRCodeStyling({ 
                width: 250, height: 250, type: "svg", data: shareUrl, 
                dotsOptions: { color: "#222", type: "square" }, 
                cornersSquareOptions: { type: "square", color: "#222" }, 
                backgroundOptions: { color: "#fff" } 
            }).append(qrContainer);
        } catch (qrError) {
            qrContainer.textContent = 'QR Code service is temporarily unavailable. Please use the fallback URL below.';
            qrContainer.style.cssText = 'color: var(--text-color); background: transparent; padding: 28px 0; font-size: 13px;';
        }
    } catch (error) { alert("分享連結產生失敗"); } finally { shareButton.innerText = "Share"; }
});

document.getElementById('close-qr-btn').addEventListener('click', () => document.getElementById('qr-modal-overlay').style.display = 'none');

document.getElementById('copy-link-btn').addEventListener('click', () => {
    const shareLinkInput = document.getElementById('share-link-input');
    shareLinkInput.select();
    shareLinkInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(shareLinkInput.value);
    
    const copyLinkButton = document.getElementById('copy-link-btn');
    copyLinkButton.innerText = "Copied!";
    copyLinkButton.style.background = "var(--text-color)";
    copyLinkButton.style.color = "var(--bg-color)";
    setTimeout(() => {
        copyLinkButton.innerText = "Copy";
        copyLinkButton.style.background = "var(--heading-color)";
    }, 2000);
});

function cardName(card) {
    return card.data?.profile?.name || 'Unnamed Card';
}

function renderCardBook() {
    const list = document.getElementById('card-book-list');
    list.innerHTML = '';
    const query = document.getElementById('card-book-search').value.toLowerCase().trim();
    const allCards = getCardBook();
    const filters = document.getElementById('card-book-filters');
    filters.innerHTML = '';
    const allTags = Array.from(new Set(allCards.flatMap(card => (card.data?.nodes || []).flatMap(node => node.tags || [])))).sort();
    ['全部', ...allTags].forEach(tag => {
        const button = document.createElement('button');
        button.className = 'tag-pill' + ((tag === 'ALL' && !query) || tag.toLowerCase() === query ? ' active' : '');
        button.textContent = tag;
        button.onclick = () => {
            document.getElementById('card-book-search').value = tag === 'ALL' ? '' : tag;
            renderCardBook();
        };
        filters.appendChild(button);
    });
    const cards = allCards.filter(card => {
        if (!query) return true;
        const searchable = [cardName(card), card.data?.profile?.org || '', ...(card.data?.nodes || []).flatMap(node => node.tags || [])].join(' ').toLowerCase();
        return searchable.includes(query);
    });
    if (!cards.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-card-book';
        empty.textContent = 'It’s not a bug. You just haven’t initialized the relationship.';
        list.appendChild(empty);
        return;
    }
    cards.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt)).forEach((card, index) => {
        const item = document.createElement('article');
        item.className = 'saved-card';
        item.tabIndex = 0;
        item.style.zIndex = String(index + 1);
        item.setAttribute('aria-label', `Card Saved：${cardName(card)}`);
        const details = document.createElement('div');
        const title = document.createElement('h3'); title.textContent = cardName(card);
        const meta = document.createElement('p');
        const nodeCount = card.data?.nodes?.length || 0;
        const organization = card.data?.profile?.org?.trim();
        meta.textContent = organization || `${nodeCount} nodes are saved in ${new Date(card.savedAt).toLocaleDateString('zh-TW')}`;
        details.append(title, meta);
        const actions = document.createElement('div'); actions.className = 'saved-card-actions';
        const openButton = document.createElement('button'); openButton.textContent = 'Open';
        openButton.onclick = () => openSavedCard(card.id);
        const removeButton = document.createElement('button'); removeButton.textContent = 'Remove'; removeButton.className = 'danger-button';
        removeButton.onclick = () => {
            localStorage.setItem(CARD_BOOK_STORAGE_KEY, JSON.stringify(getCardBook().filter(saved => saved.id !== card.id)));
            renderCardBook();
        };
        actions.append(openButton, removeButton); item.append(details, actions); list.appendChild(item);
        item.addEventListener('click', event => {
            if (!window.matchMedia('(max-width: 768px)').matches || event.target.closest('button')) return;
            const wasPeeking = item.classList.contains('is-peeking');
            list.querySelectorAll('.saved-card.is-peeking').forEach(savedCard => savedCard.classList.remove('is-peeking'));
            if (!wasPeeking) item.classList.add('is-peeking');
        });
    });
}

function openSavedCard(cardId) {
    const saved = getCardBook().find(card => card.id === cardId);
    if (!saved?.data) return;
    disposeAndClearNodes();
    profileData = { ...defaultProfileData };
    parseAndRenderData(JSON.stringify(saved.data));
    currentViewingCard = saved;
    setPreviewMode(true);
    document.getElementById('preview-btn').style.display = 'none';
    document.getElementById('card-book-overlay').style.display = 'none';
}

function saveCurrentCardToBook() {
    if (!currentViewingCard?.data) return;
    const sourceUrl = currentViewingCard.sourceUrl || window.location.href;
    const id = currentViewingCard.id || currentViewingCard.data.id || sourceUrl;
    const cards = getCardBook();
    const card = { id, data: currentViewingCard.data, sourceUrl, savedAt: new Date().toISOString() };
    const index = cards.findIndex(saved => saved.id === id);
    if (index >= 0) cards[index] = card; else cards.push(card);
    localStorage.setItem(CARD_BOOK_STORAGE_KEY, JSON.stringify(cards));
    document.getElementById('save-card-btn').innerText = 'Card Saved';
    renderCardBook();
}

document.getElementById('card-book-btn').addEventListener('click', () => {
    renderCardBook();
    document.getElementById('card-book-overlay').style.display = 'flex';
    closeMenu();
});
document.getElementById('card-book-search').addEventListener('input', renderCardBook);
document.getElementById('close-card-book-btn').addEventListener('click', () => document.getElementById('card-book-overlay').style.display = 'none');
document.getElementById('card-book-overlay').addEventListener('click', event => {
    if (event.target.id === 'card-book-overlay') event.currentTarget.style.display = 'none';
});
document.getElementById('save-card-btn').addEventListener('click', saveCurrentCardToBook);

document.getElementById('export-btn').addEventListener('click', () => {
    const file = new Blob([JSON.stringify(buildCardData(), null, 2)], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `ssi-card-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
    closeMenu();
});

document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-card-input').click());
document.getElementById('import-card-input').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const imported = JSON.parse(reader.result);
            if (!isValidCardData(imported)) throw new Error('Invalid card data');
            pendingImportData = imported;
            const name = imported.profile?.name || 'Unnamed Card';
            const nodeCount = Array.isArray(imported) ? imported.length : imported.nodes.length;
            document.getElementById('import-preview-text').textContent = `Importing "${name}" with ${nodeCount} nodes. This will overwrite your current state. No rollback.`;
            document.getElementById('import-modal-overlay').style.display = 'flex';
        } catch {
            alert('Invalid contact JSON. Schema validation failed.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
});
document.getElementById('cancel-import-btn').addEventListener('click', () => {
    pendingImportData = null;
    document.getElementById('import-modal-overlay').style.display = 'none';
});
document.getElementById('confirm-import-btn').addEventListener('click', () => {
    if (pendingImportData) loadCardIntoEditor(pendingImportData);
    pendingImportData = null;
    document.getElementById('import-modal-overlay').style.display = 'none';
});

document.getElementById('preview-btn').addEventListener('click', (event) => {
    setPreviewMode(!isPreviewMode);
});

document.getElementById('search-input').addEventListener('input', () => {
    updateTargets();
    if(searchModeIsList) renderSearchTags();
});
document.getElementById('reset-search-btn').addEventListener('click', () => { 
    document.getElementById('search-input').value = ""; 
    updateTargets(); 
    if(searchModeIsList) renderSearchTags();
});
document.getElementById('add-node-btn').addEventListener('click', () => {
    addSkillNode(); closeMenu();
});

document.getElementById('profile-img-url').addEventListener('input', (e) => {
    const value = e.target.value.trim();
    document.getElementById('profile-img-preview').src = value || 'https://via.placeholder.com/150';
});

const profileIntroUrlInput = document.getElementById('profile-intro-urls');
profileIntroUrlInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (value && !/^https?:\/\//i.test(value)) {
        e.target.setCustomValidity('Please enter a valid URL starting with http:// or https://');
    } else {
        e.target.setCustomValidity('');
    }
});

document.getElementById('save-btn').addEventListener('click', () => {
    if (isPreviewMode) return;
    if (isEditingProfile) {
        profileData.name = document.getElementById('profile-name').value;
        profileData.org = document.getElementById('profile-org').value;
        profileData.edu = document.getElementById('profile-edu').value;
        profileData.intro = document.getElementById('profile-intro').value;
        profileData.introUrl = document.getElementById('profile-intro-urls').value.trim();
        profileData.imgUrl = document.getElementById('profile-img-url').value || 'https://via.placeholder.com/150';
        updateIdentityCard();
    } else if (currentNodeData) {
        const selectedParentOptions = Array.from(document.getElementById('node-parent').selectedOptions).map(option => option.value);
        currentNodeData.parentIds = selectedParentOptions.length > 0 ? selectedParentOptions : ['center'];
        
        currentNodeData.title = document.getElementById('node-title').value;
        updateNodeLabel(currentNodeData, currentNodeData.title);
        currentNodeData.category = document.getElementById('node-category').value;
        currentNodeData.level = Number(document.getElementById('node-level').value);
        applyNodeVisual(currentNodeData);

        // parse comma-separated input into tags array
        currentNodeData.tags = document.getElementById('node-tags').value.split(',').map(t => t.trim()).filter(t => t);
        currentNodeData.desc = document.getElementById('node-desc').value;
        updateNodeLines(currentNodeData); 
    }
    document.getElementById('info-panel').style.display = 'none';
    saveSkillsToLocal();
    
    if(searchModeIsList) renderSearchTags();
});

document.getElementById('delete-btn').addEventListener('click', () => {
    removeCurrentNode();
});

document.getElementById('physics-btn').addEventListener('click', (e) => {
    togglePhysicsMode(e.target);
    closeMenu();
});

document.getElementById('toggle-view-btn').addEventListener('click', (e) => {
    toggleViewMode(e.target);
    updateTargets();
    closeMenu();
});

document.getElementById('theme-btn').addEventListener('click', () => {
    toggleThemeMode();
    closeMenu();
});
