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

function writeCardBook(cards) {
    try {
        localStorage.setItem(CARD_BOOK_STORAGE_KEY, JSON.stringify(cards));
        return true;
    } catch (e) {
        console.error(e);
        alert('Could not save to this browser (storage full or blocked). Remove some cards and try again.');
        return false;
    }
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

// Share-link parameters
//   z    compact card -> ZipURL                       (ZipURL output percent-encoded by the URL)
//   zb   compact card -> ZipURL -> UTF-8 -> base64url (much shorter when the text is CJK:
//                                                      percent-encoding costs 9 chars per CJK
//                                                      character, base64 only ~4)
//   c    compact card -> base64url                    (no library needed)
//   card full card -> base64url                       (old links, decode only)
const SHARE_PARAM_ZIP = 'z';
const SHARE_PARAM_ZIP_B64 = 'zb';
const SHARE_PARAM_COMPACT = 'c';
const SHARE_PARAM_LEGACY = 'card';

function textToBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToText(encoded) {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const binary = atob(base64);
    return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

function decodeCardLegacy(encodedCard) {
    return JSON.parse(base64UrlToText(encodedCard));
}

// ---- Compact share format (v2) ------------------------------------------------
// The full card repeats long keys / ids on every node. For sharing we flatten it to
// positional arrays, reference parents by index and round positions (the force layout
// re-settles them anyway), which shrinks the payload before ZipURL even runs.
const CATEGORY_CODES = ['skill', 'experience', 'credential', 'explore'];
const PROFILE_FIELDS = ['name', 'org', 'edu', 'intro', 'imgUrl', 'introUrl'];

function compactCard(card) {
    const indexById = new Map(card.nodes.map((node, i) => [node.id, i]));
    const profile = [card.id || '', ...PROFILE_FIELDS.map(key => card.profile?.[key] || '')];
    while (profile.length > 1 && profile[profile.length - 1] === '') profile.pop();
    return {
        v: 2,
        p: profile,
        n: card.nodes.map(node => [
            node.title || '',
            node.desc || '',
            (node.tags || []).join(','),
            Math.max(0, CATEGORY_CODES.indexOf(node.category || 'skill')),
            node.level || 2,
            (node.parentIds || []).map(id => indexById.has(id) ? indexById.get(id) : -1), // -1 = center
            Math.round(node.x || 0), Math.round(node.y || 0), Math.round(node.z || 0)
        ])
    };
}

function expandCard(data) {
    const [id, ...rest] = data.p || [];
    const profile = {};
    PROFILE_FIELDS.forEach((key, i) => { profile[key] = rest[i] || ''; });
    if (id) profile.id = id;
    const ids = data.n.map((_, i) => `node_s${i}`);
    return {
        version: 1,
        id,
        profile,
        nodes: data.n.map((row, i) => {
            const parentIds = (row[5] || []).map(p => (p >= 0 && ids[p]) ? ids[p] : 'center');
            return {
                id: ids[i], parentIds: parentIds.length ? parentIds : ['center'],
                title: row[0], desc: row[1], tags: row[2] ? row[2].split(',') : [],
                category: CATEGORY_CODES[row[3]] || 'skill', level: row[4] || 2,
                x: row[6] || 0, y: row[7] || 0, z: row[8] || 0
            };
        })
    };
}

// Returns [paramName, paramValue]: whichever candidate gives the shortest final URL.
function encodeCardForUrl(cardData) {
    const json = JSON.stringify(compactCard(cardData));
    const candidates = [[SHARE_PARAM_COMPACT, textToBase64Url(json)]];
    if (typeof ZipURL !== 'undefined') {
        try {
            const packed = ZipURL.compress(json);
            // never ship a lossy link
            if (ZipURL.decompress(packed) === json) {
                candidates.push([SHARE_PARAM_ZIP, packed], [SHARE_PARAM_ZIP_B64, textToBase64Url(packed)]);
            }
        } catch (e) {
            console.warn('ZipURL compress failed, using the uncompressed compact format', e);
        }
    }
    const size = pair => new URLSearchParams([pair]).toString().length;
    return candidates.reduce((best, candidate) => size(candidate) < size(best) ? candidate : best);
}

function decodeCardFromParams(params) {
    const unpack = text => {
        if (typeof ZipURL === 'undefined') throw new Error('ZipURL library failed to load');
        return ZipURL.decompress(text);
    };
    let parsed = null;
    if (params.get(SHARE_PARAM_ZIP)) parsed = JSON.parse(unpack(params.get(SHARE_PARAM_ZIP)));
    else if (params.get(SHARE_PARAM_ZIP_B64)) parsed = JSON.parse(unpack(base64UrlToText(params.get(SHARE_PARAM_ZIP_B64))));
    else if (params.get(SHARE_PARAM_COMPACT)) parsed = JSON.parse(base64UrlToText(params.get(SHARE_PARAM_COMPACT)));
    else if (params.get(SHARE_PARAM_LEGACY)) return decodeCardLegacy(params.get(SHARE_PARAM_LEGACY));
    else return null;
    return parsed && parsed.v === 2 && Array.isArray(parsed.n) ? expandCard(parsed) : parsed;
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
        // never let a missing / non-numeric coordinate become NaN (it would poison the whole physics layout)
        const toCoord = v => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : 0; };
        const x = toCoord(data.x), y = toCoord(data.y), z = toCoord(data.z);
        createNodeMesh(data.id || data.i || generateId(), parentIds, x, y, z, data.title || data.t, data.desc || data.d, data.tags || data.tg || "", data.category || 'skill', data.level || 2);
    });
    updateIdentityCard();
}

async function loadSkills() {
    const params = new URLSearchParams(window.location.search);
    if ([SHARE_PARAM_ZIP, SHARE_PARAM_ZIP_B64, SHARE_PARAM_COMPACT, SHARE_PARAM_LEGACY].some(name => params.has(name))) {
        setPreviewMode(true);
        try {
            const cardData = decodeCardFromParams(params);
            if (!isValidCardData(cardData)) throw new Error('Invalid card data');
            parseAndRenderData(JSON.stringify(cardData));
            currentViewingCard = { data: cardData, sourceUrl: window.location.href, sourceType: 'link' };
            document.getElementById('preview-btn').style.display = 'none';
            return;
        } catch (e) {
            console.error(e);
            disposeAndClearNodes(); // drop any half-rendered nodes
            profileData = { ...defaultProfileData };
            setPreviewMode(false);  // don't leave the editor stuck in read-only mode
            alert("Contact data failed to deserialize. The share URL is probably broken.");
        }
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

const QR_MAX_URL_LENGTH = 2900; // QR capacity at the lowest error-correction level is ~2953 bytes

function makeShareUrl(cardData) {
    const sharePage = new URL(window.location.href);
    sharePage.search = '';
    sharePage.hash = '';
    const [paramName, paramValue] = encodeCardForUrl(cardData);
    sharePage.searchParams.set(paramName, paramValue);
    return sharePage.toString();
}

// A big card cannot fit in a QR code, so progressively strip the heaviest parts until it does.
// Returns { url, note } or null if even the skeleton is too large.
function makeQrShare(fullData, fullUrl) {
    if (fullUrl.length <= QR_MAX_URL_LENGTH) return { url: fullUrl, note: '' };
    const lite = JSON.parse(JSON.stringify(fullData));
    lite.nodes.forEach(node => { node.desc = ''; });
    let url = makeShareUrl(lite);
    if (url.length <= QR_MAX_URL_LENGTH) return { url, note: 'QR contains a lite version (no node descriptions). The link above has everything.' };
    lite.nodes.forEach(node => { node.tags = []; });
    lite.profile.intro = '';
    url = makeShareUrl(lite);
    if (url.length <= QR_MAX_URL_LENGTH) return { url, note: 'QR contains a minimal version (no descriptions, tags or intro). The link above has everything.' };
    return null;
}

document.getElementById('share-btn').addEventListener('click', () => {
    const shareButton = document.getElementById('share-btn'); shareButton.innerText = "CREATING...";
    const dataToShare = buildSharedCardData();
    try {
        const shareUrl = makeShareUrl(dataToShare);
        if (shareUrl.length > 12000) {
            alert("Payload too large. Reduce the node count or metadata before serialization.");
            return;
        }

        document.getElementById('share-link-input').value = shareUrl;
        const qrContainer = document.getElementById('qr-container'); qrContainer.innerHTML = ''; qrContainer.style.cssText = '';
        const qrNote = document.getElementById('qr-note'); qrNote.textContent = '';
        document.getElementById('qr-modal-overlay').style.display = 'flex';
        try {
            if (typeof QRCodeStyling === 'undefined') throw new Error('QR Code library unavailable');
            const qrShare = makeQrShare(dataToShare, shareUrl);
            if (!qrShare) throw new Error('Link too long for a QR code');
            qrNote.textContent = qrShare.note;
            const size = qrShare.url.length > 1200 ? 320 : 250; // denser codes need more pixels to scan
            new QRCodeStyling({
                width: size, height: size, type: "svg", data: qrShare.url, qrOptions: { errorCorrectionLevel: 'L' },
                dotsOptions: { color: "#222", type: "square" },
                cornersSquareOptions: { type: "square", color: "#222" },
                backgroundOptions: { color: "#fff" }
            }).append(qrContainer);
        } catch (qrError) {
            qrContainer.textContent = shareUrl.length > QR_MAX_URL_LENGTH
                ? 'This card is too large for a QR code. Please copy the link below instead.'
                : 'QR Code service is temporarily unavailable. Please use the fallback URL below.';
            qrContainer.style.cssText = 'color: var(--text-color); background: transparent; padding: 28px 0; font-size: 13px;';
        }
    } catch (error) { alert("分享連結產生失敗"); } finally { shareButton.innerText = "Share"; }
});

document.getElementById('close-qr-btn').addEventListener('click', () => document.getElementById('qr-modal-overlay').style.display = 'none');

document.getElementById('copy-link-btn').addEventListener('click', async () => {
    const shareLinkInput = document.getElementById('share-link-input');
    shareLinkInput.select();
    shareLinkInput.setSelectionRange(0, shareLinkInput.value.length);
    const copyLinkButton = document.getElementById('copy-link-btn');
    try {
        await navigator.clipboard.writeText(shareLinkInput.value);
    } catch (e) {
        // clipboard API unavailable (http / permissions): fall back to the selected text
        if (!document.execCommand || !document.execCommand('copy')) {
            copyLinkButton.innerText = "Press Ctrl+C";
            setTimeout(() => { copyLinkButton.innerText = "Copy"; }, 2000);
            return;
        }
    }
    copyLinkButton.innerText = "Copied!";
    copyLinkButton.style.background = "var(--text-color)";
    copyLinkButton.style.color = "var(--bg-color)";
    setTimeout(() => {
        copyLinkButton.innerText = "Copy";
        copyLinkButton.style.background = "var(--heading-color)";
    }, 2000);
});

const ALL_TAG = '全部';
let cardBookTag = ''; // exact-match tag filter ('' = all)

function cardTags(card) {
    const tags = (card.data?.nodes || []).flatMap(node => Array.isArray(node.tags) ? node.tags : (node.tags ? String(node.tags).split(',') : []));
    return tags.map(tag => String(tag).trim()).filter(Boolean);
}

function setSaveCardButtonState() {
    const button = document.getElementById('save-card-btn');
    if (!button) return;
    const id = currentViewingCard?.id || currentViewingCard?.data?.id || currentViewingCard?.sourceUrl;
    const saved = !!id && getCardBook().some(card => card.id === id);
    button.innerText = saved ? 'Update Saved Card' : 'Save This Card';
}

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
    const allTags = Array.from(new Set(allCards.flatMap(cardTags))).sort((x, y) => x.localeCompare(y));
    if (cardBookTag && !allTags.includes(cardBookTag)) cardBookTag = ''; // tag vanished (card removed)
    [ALL_TAG, ...allTags].forEach(tag => {
        const isAll = tag === ALL_TAG;
        const button = document.createElement('button');
        button.className = 'tag-pill' + ((isAll ? !cardBookTag : tag === cardBookTag) ? ' active' : '');
        button.textContent = tag;
        button.onclick = () => {
            cardBookTag = isAll || tag === cardBookTag ? '' : tag; // click an active tag again to clear it
            renderCardBook();
        };
        filters.appendChild(button);
    });
    const cards = allCards.filter(card => {
        if (cardBookTag && !cardTags(card).includes(cardBookTag)) return false;
        if (!query) return true;
        const searchable = [cardName(card), card.data?.profile?.org || '', ...cardTags(card)].join(' ').toLowerCase();
        return searchable.includes(query);
    });
    if (!cards.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-card-book';
        empty.textContent = allCards.length
            ? 'No cards match this search.'
            : 'It’s not a bug. You just haven’t initialized the relationship.';
        list.appendChild(empty);
        return;
    }
    cards.sort((a, b) => (Date.parse(a.savedAt) || 0) - (Date.parse(b.savedAt) || 0)).forEach((card, index) => {
        const item = document.createElement('article');
        item.className = 'saved-card';
        item.tabIndex = 0;
        item.style.zIndex = String(index + 1);
        item.setAttribute('aria-label', `Saved card: ${cardName(card)}`);
        const details = document.createElement('div');
        const title = document.createElement('h3'); title.textContent = cardName(card);
        const meta = document.createElement('p');
        const nodeCount = card.data?.nodes?.length || 0;
        const organization = card.data?.profile?.org?.trim();
        meta.textContent = organization || `${nodeCount} nodes · saved ${Number.isNaN(Date.parse(card.savedAt)) ? '' : new Date(card.savedAt).toLocaleDateString('zh-TW')}`.trim();
        details.append(title, meta);
        const actions = document.createElement('div'); actions.className = 'saved-card-actions';
        const openButton = document.createElement('button'); openButton.textContent = 'Open';
        openButton.onclick = () => openSavedCard(card.id);
        const removeButton = document.createElement('button'); removeButton.textContent = 'Remove'; removeButton.className = 'danger-button';
        removeButton.onclick = () => {
            if (!confirm(`Remove "${cardName(card)}" from your Cards book? The saved snapshot will be deleted.`)) return;
            if (!writeCardBook(getCardBook().filter(saved => saved.id !== card.id))) return;
            renderCardBook();
            setSaveCardButtonState();
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
    setSaveCardButtonState();
}

function saveCurrentCardToBook() {
    if (!currentViewingCard?.data) return;
    const sourceUrl = currentViewingCard.sourceUrl || window.location.href;
    const id = currentViewingCard.id || currentViewingCard.data.id || sourceUrl;
    const cards = getCardBook();
    const card = { id, data: currentViewingCard.data, sourceUrl, savedAt: new Date().toISOString() };
    const index = cards.findIndex(saved => saved.id === id);
    if (index >= 0) cards[index] = card; else cards.push(card);
    if (!writeCardBook(cards)) return;
    const button = document.getElementById('save-card-btn');
    button.innerText = 'Card Saved';
    setTimeout(setSaveCardButtonState, 1500);
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
    document.getElementById('profile-img-preview').src = safeImageUrl(value);
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
        const introUrl = document.getElementById('profile-intro-urls').value.trim();
        if (introUrl && !/^https?:\/\//i.test(introUrl)) {
            alert('Intro URL must start with http:// or https://');
            return;
        }
        profileData.introUrl = introUrl;
        profileData.imgUrl = document.getElementById('profile-img-url').value.trim(); // keep empty instead of saving a placeholder URL
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
