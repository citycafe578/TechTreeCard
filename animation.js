// Inline SVG avatar placeholder (the old via.placeholder.com host is gone)
const AVATAR_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">' +
    '<rect width="150" height="150" fill="#2a2a2a"/><circle cx="75" cy="58" r="26" fill="#555"/>' +
    '<path d="M25 135c4-30 26-44 50-44s46 14 50 44z" fill="#555"/></svg>');

// Only allow http(s) image URLs coming from (possibly untrusted) card data
function safeImageUrl(url) {
    return /^https?:\/\//i.test(url || '') ? url : AVATAR_PLACEHOLDER;
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const centerGeometry = new THREE.SphereGeometry(0.6, 16, 16);
const centerMaterial = new THREE.MeshBasicMaterial({ color: 0x555555, wireframe: true, transparent: true, opacity: 0.9 });
const centerSphere = new THREE.Mesh(centerGeometry, centerMaterial);
scene.add(centerSphere);
camera.position.set(0, 0, 25);

const nodes = [];
let isLightMode = false;
let is2DMode = false;
let isPhysicsEnabled = true;
let isSearching = false;

let isResettingCamera = false;
const targetCameraPos = new THREE.Vector3();
const targetControlsCenter = new THREE.Vector3(0, 0, 0);

let lastInteractionTime = Date.now();
let isDragging2D = false;
let previousAngle = 0;

function getNodeStyle(node) {
    const levelScale = { 1: 0.8, 2: 1, 3: 1.3 }[node.level] || 1;
    const darkColors = { skill: 0xa3a3a3, experience: 0xcc9933, credential: 0x8db9d4, explore: 0xcc5555 };
    const lightColors = { skill: 0x222222, experience: 0xa66d00, credential: 0x236b93, explore: 0xb33636 };
    return { color: (isLightMode ? lightColors : darkColors)[node.category] || (isLightMode ? 0x222222 : 0xa3a3a3), scale: levelScale };
}

function applyNodeVisual(node) {
    const style = getNodeStyle(node);
    node.baseScale = style.scale;
    node.mesh.material.color.setHex(style.color);
    node.mesh.material.opacity = node.isSelected ? 1 : 1;
    if (!isSearching) node.mesh.scale.set(style.scale, style.scale, style.scale);
}

function disposeAndClearNodes() {
    nodes.forEach(node => {
        node.lines.forEach(lObj => { scene.remove(lObj.line); lObj.line.geometry.dispose(); lObj.line.material.dispose(); });
        if (node.labelSprite) { node.labelSprite.material.map.dispose(); node.labelSprite.material.dispose(); }
        scene.remove(node.mesh); node.mesh.geometry.dispose(); node.mesh.material.dispose();
    });
    nodes.length = 0;
}

function updateNodeLabel(node, text) {
    if (!node.labelCanvas) {
        node.labelCanvas = document.createElement('canvas');
        node.labelCanvas.width = 512;
        node.labelCanvas.height = 128;
        node.labelContext = node.labelCanvas.getContext('2d');
        node.labelTexture = new THREE.CanvasTexture(node.labelCanvas);
        node.labelTexture.minFilter = THREE.LinearFilter;

        const material = new THREE.SpriteMaterial({ map: node.labelTexture, transparent: true, opacity: 1 });
        node.labelSprite = new THREE.Sprite(material);
        node.labelSprite.scale.set(2.4, 0.6, 1);
        node.labelSprite.position.set(0, 0.45, 0);
        node.mesh.add(node.labelSprite);
    }

    const labelContext = node.labelContext;
    labelContext.clearRect(0, 0, 512, 128);
    let fontSize = 52;
    const fontFor = size => `bold ${size}px "Helvetica Neue", Arial, "PingFang TC", "Microsoft JhengHei", sans-serif`;
    labelContext.font = fontFor(fontSize);
    while (fontSize > 24 && labelContext.measureText(text || 'New Node').width > 480) {
        fontSize -= 4;
        labelContext.font = fontFor(fontSize);
    }
    labelContext.textAlign = 'center';
    labelContext.textBaseline = 'middle';
    labelContext.fillStyle = isLightMode ? '#222222' : '#e5e5e5';
    labelContext.fillText(text || 'New Node', 256, 64);
    node.labelTexture.needsUpdate = true;
}

function updateSelectionVisual() {
    nodes.forEach(node => {
        const isSelected = currentNodeData && node.id === currentNodeData.id;
        node.isSelected = isSelected;
        if (node.labelSprite) {
            node.labelSprite.material.opacity = isSelected ? 1 : 0.95;
        }
        if (node.mesh) {
            const targetScale = (node.baseScale || 1) * (isSelected ? 1.16 : 1);
            const speed = 0.12;
            node.mesh.scale.lerp(
                new THREE.Vector3(targetScale, targetScale, targetScale),
                speed
            );
        }
    });
}

function updateNodeLines(node) {
    if (node.lines) {
        node.lines.forEach(lObj => { scene.remove(lObj.line); lObj.line.geometry.dispose(); lObj.line.material.dispose(); });
    }
    node.lines = [];
    const lineMat = new THREE.LineBasicMaterial({ color: isLightMode ? 0xaaaaaa : 0x333333, transparent: true, opacity: 1 });
    node.parentIds.forEach(parentId => {
        const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)];
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat);
        scene.add(line);
        node.lines.push({ parentId, line });
    });
}

function createNodeMesh(id, parentIds, x, y, z, title, desc, tags, category = 'skill', level = 2) {
    const nodeGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const nodeMat = new THREE.MeshBasicMaterial({ color: isLightMode ? 0x222222 : 0xa3a3a3, transparent: true, opacity: 1 });
    const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
    nodeMesh.position.set(x, y, is2DMode ? 0 : z);
    scene.add(nodeMesh);

    let tagsArray = [];
    if (Array.isArray(tags)) tagsArray = tags.map(t => (t || '').toString().trim()).filter(Boolean);
    else if (typeof tags === 'string') tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);

    const node = {
        id,
        parentIds,
        mesh: nodeMesh,
        lines: [],
        targetX: x,
        targetY: y,
        targetZ: is2DMode ? 0 : z,
        vx: 0,
        vy: 0,
        vz: 0,
        title,
        desc,
        tags: tagsArray,
        category,
        level: Number(level) || 2,
        driftPhaseX: Math.random() * Math.PI * 2,
        driftPhaseY: Math.random() * Math.PI * 2,
        driftPhaseZ: Math.random() * Math.PI * 2
    };

    updateNodeLabel(node, title);
    applyNodeVisual(node);
    nodes.push(node);
    updateNodeLines(node);
    updateSelectionVisual();
}

// Stable pseudo-random number from any id string (ids may be imported and not follow node_<timestamp>_<n>)
function idSeed(id) {
    let hash = 0;
    for (const ch of String(id)) hash = (hash * 31 + ch.codePointAt(0)) % 100000;
    return hash;
}

function applyForceLayout() {
    if (isSearching || !isPhysicsEnabled) return;
    const kRepel = 25, kAttract = 0.05, damping = 0.82, gravity = 0.015;

    nodes.forEach(node => { node.fx = 0; node.fy = 0; node.fz = 0; });

    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex++) {
        for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex++) {
            const firstNode = nodes[firstIndex];
            const secondNode = nodes[secondIndex];
            const deltaX = firstNode.targetX - secondNode.targetX;
            const deltaY = firstNode.targetY - secondNode.targetY;
            const deltaZ = is2DMode ? 0 : (firstNode.targetZ - secondNode.targetZ);
            let distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ) || 0.1;

            const minRepelDistance = 2.5;
            const effectiveDistance = Math.max(distance, minRepelDistance);

            const repulsionForce = kRepel / (effectiveDistance * effectiveDistance);
            const forceX = (deltaX / distance) * repulsionForce;
            const forceY = (deltaY / distance) * repulsionForce;
            const forceZ = is2DMode ? 0 : ((deltaZ / distance) * repulsionForce);
            firstNode.fx += forceX; firstNode.fy += forceY; firstNode.fz += forceZ;
            secondNode.fx -= forceX; secondNode.fy -= forceY; secondNode.fz -= forceZ;
        }
    }

    nodes.forEach(node => {
        node.parentIds.forEach(parentId => {
            let parentX = 0, parentY = 0, parentZ = 0, parentNode = null;
            if (parentId !== 'center') {
                parentNode = nodes.find(nodeItem => nodeItem.id === parentId);
                if (parentNode) { parentX = parentNode.targetX; parentY = parentNode.targetY; parentZ = parentNode.targetZ; }
            }
            const deltaX = parentX - node.targetX;
            const deltaY = parentY - node.targetY;
            const deltaZ = is2DMode ? 0 : (parentZ - node.targetZ);
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ) || 0.1;

            const customSpringLength = 5 + (Math.sin(idSeed(node.id)) * 2.5);
            const attractionForce = (distance - customSpringLength) * kAttract;
            const forceX = (deltaX / distance) * attractionForce;
            const forceY = (deltaY / distance) * attractionForce;
            const forceZ = is2DMode ? 0 : ((deltaZ / distance) * attractionForce);

            node.fx += forceX; node.fy += forceY; node.fz += forceZ;
            if (parentNode) { parentNode.fx -= forceX; parentNode.fy -= forceY; parentNode.fz -= forceZ; }
        });
    });

    const isIdle = (Date.now() - lastInteractionTime) > 3000;
    const timeValue = Date.now() * 0.0005;

    nodes.forEach(node => {
        node.fx += (0 - node.targetX) * gravity;
        node.fy += (0 - node.targetY) * gravity;
        if (!is2DMode) node.fz += (0 - node.targetZ) * gravity;

        if (isIdle) {
            node.fx += Math.sin(timeValue * 0.5 + node.driftPhaseX) * 0.015;
            node.fy += Math.cos(timeValue * 0.6 + node.driftPhaseY) * 0.015;
            if (!is2DMode) node.fz += Math.sin(timeValue * 0.4 + node.driftPhaseZ) * 0.015;
        }

        node.vx = (node.vx + node.fx) * damping;
        node.vy = (node.vy + node.fy) * damping;
        node.vz = is2DMode ? 0 : (node.vz + node.fz) * damping;

        const maxSpeed = 1.5;
        if (node.vx > maxSpeed) node.vx = maxSpeed; if (node.vx < -maxSpeed) node.vx = -maxSpeed;
        if (node.vy > maxSpeed) node.vy = maxSpeed; if (node.vy < -maxSpeed) node.vy = -maxSpeed;
        if (node.vz > maxSpeed) node.vz = maxSpeed; if (node.vz < -maxSpeed) node.vz = -maxSpeed;

        node.targetX += node.vx;
        node.targetY += node.vy;

        if (is2DMode) {
            node.targetZ = 0;
        } else {
            node.targetZ += node.vz;
        }
    });
}

function updateTargets() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
    isSearching = searchTerm !== '';
    if (isSearching) {
        nodes.forEach(node => {
            let matched = false;
            if (node.tags && Array.isArray(node.tags)) matched = node.tags.some(tag => tag.toLowerCase().includes(searchTerm));
            else if (node.tags && typeof node.tags === 'string') matched = node.tags.toLowerCase().includes(searchTerm);
            node.mesh.material.opacity = matched ? 1 : 0.35;
            node.labelSprite.material.opacity = matched ? 1 : 0.35;
            const scale = node.baseScale || 1;
            const searchScale = matched ? scale : scale * 0.85;
            node.mesh.scale.set(searchScale, searchScale, searchScale);
            node.lines.forEach(l => l.line.material.opacity = matched ? 1 : 0.18);
        });
    } else {
        nodes.forEach(node => {
            node.mesh.material.opacity = 1;
            node.labelSprite.material.opacity = 1;
            const scale = node.baseScale || 1;
            node.mesh.scale.set(scale, scale, scale);
            node.lines.forEach(l => l.line.material.opacity = 1);
            if (!isPhysicsEnabled && !is2DMode && node.targetZ < -5) node.targetZ = 0;
        });
    }
}

function resetIdleTimer() {
    lastInteractionTime = Date.now();
}

controls.addEventListener('change', resetIdleTimer);

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    if (isResettingCamera) {
        camera.position.lerp(targetCameraPos, 0.03);
        controls.target.lerp(targetControlsCenter, 0.03);

        let diff = 0 - scene.rotation.z;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        scene.rotation.z += diff * 0.03;

        if (camera.position.distanceTo(targetCameraPos) < 0.01 && controls.target.distanceTo(targetControlsCenter) < 0.01 && Math.abs(diff) < 0.001) {
            isResettingCamera = false;
            camera.position.copy(targetCameraPos);
            controls.target.copy(targetControlsCenter);
            scene.rotation.z = 0;
            previousAngle = 0;
        }
    }

    applyForceLayout();
    nodes.forEach(node => {
        node.mesh.position.x += (node.targetX - node.mesh.position.x) * 0.1;
        node.mesh.position.y += (node.targetY - node.mesh.position.y) * 0.1;
        node.mesh.position.z += (node.targetZ - node.mesh.position.z) * 0.1;

        node.lines.forEach(lObj => {
            let parentX = 0, parentY = 0, parentZ = 0;
            if (lObj.parentId !== 'center') {
                const parentNode = nodes.find(n => n.id === lObj.parentId);
                if (parentNode) { parentX = parentNode.mesh.position.x; parentY = parentNode.mesh.position.y; parentZ = parentNode.mesh.position.z; }
            }
            const positions = lObj.line.geometry.attributes.position.array;
            positions[0] = parentX; positions[1] = parentY; positions[2] = parentZ;
            positions[3] = node.mesh.position.x; positions[4] = node.mesh.position.y; positions[5] = node.mesh.position.z;
            lObj.line.geometry.attributes.position.needsUpdate = true;
        });
    });

    // keep labels readable: grow them as the camera moves away (more on small screens)
    const cameraDistance = camera.position.distanceTo(controls.target);
    const labelFactor = THREE.MathUtils.clamp(cameraDistance / 22, 0.8, 2.0);
    nodes.forEach(node => { if (node.labelSprite) node.labelSprite.scale.set(2.4 * labelFactor, 0.6 * labelFactor, 1); });

    const lerpFactor = 0.12;
    centerSphere.rotation.x += (scene.rotation.x - centerSphere.rotation.x) * lerpFactor;
    centerSphere.rotation.y += (scene.rotation.y - centerSphere.rotation.y) * lerpFactor;
    centerSphere.rotation.z += (scene.rotation.z - centerSphere.rotation.z) * lerpFactor;
    centerSphere.scale.setScalar(1 + Math.sin(Date.now() * 0.001) * 0.008);

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function populateParentSelect(currentNodeId, selectedIds = []) {
    const list = document.getElementById('node-parent');
    list.innerHTML = '';
    const addRow = (value, text) => {
        const row = document.createElement('label');
        row.className = 'check-row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = value;
        box.checked = selectedIds.includes(value);
        const name = document.createElement('span');
        name.textContent = text;
        row.append(box, name);
        list.appendChild(row);
    };
    addRow('center', 'Center');
    nodes.forEach(node => {
        if (node.id !== currentNodeId) addRow(node.id, node.title || 'Untitled');
    });
}

function togglePhysicsMode(button) {
    isPhysicsEnabled = !isPhysicsEnabled;
    if (button) button.innerText = isPhysicsEnabled ? 'Physics: ON' : 'Physics: OFF';
}

function toggleViewMode(button) {
    is2DMode = !is2DMode;
    if (button) button.innerText = is2DMode ? '3D View' : '2D View';

    if (is2DMode) {
        controls.enableRotate = false;
        centerSphere.rotation.set(0, 0, 0);
        centerSphere.scale.set(1, 1, 0.01);
        camera.position.set(0, 0, 35);
        controls.target.set(0, 0, 0);
        scene.rotation.set(0, 0, 0);
        nodes.forEach(node => {
            node.targetZ = 0;
            node.vx += (Math.random() - 0.5) * 8;
            node.vy += (Math.random() - 0.5) * 8;
        });
    } else {
        controls.enableRotate = true;
        centerSphere.scale.set(1, 1, 1);
        scene.rotation.set(0, 0, 0);
        nodes.forEach(node => {
            node.targetZ = (Math.random() - 0.5) * 15;
            node.vz += (Math.random() - 0.5) * 8;
        });
    }
    updateTargets();
}

function toggleThemeMode() {
    isLightMode = !isLightMode;
    document.documentElement.setAttribute('data-theme', isLightMode ? 'light' : 'dark');
    centerSphere.material.color.setHex(isLightMode ? 0x999999 : 0x555555);
    nodes.forEach(node => {
        node.lines.forEach(line => line.line.material.color.setHex(isLightMode ? 0xaaaaaa : 0x333333));
        applyNodeVisual(node);
        updateNodeLabel(node, node.title);
    });
}

const CATEGORY_LABELS = { skill: 'Skill', experience: 'Experience', credential: 'Credential', explore: 'Exploring' };
const LEVEL_LABELS = { 1: 'Hello World', 2: 'Production', 3: 'Critical Dependency' };

// Someone else's card (or Preview mode) is shown as plain read-only text, not a greyed-out form.
function renderPanelMode(isProfile) {
    const readonlyView = document.getElementById('readonly-view');
    const actions = document.getElementById('panel-actions');
    if (isPreviewMode) {
        document.getElementById('skill-view').style.display = 'none';
        document.getElementById('profile-view').style.display = 'none';
        document.getElementById('save-btn').style.display = 'none';
        document.getElementById('delete-btn').style.display = 'none';
        readonlyView.style.display = 'block';
        document.getElementById('ro-node').style.display = isProfile ? 'none' : 'block';
        document.getElementById('ro-profile').style.display = isProfile ? 'block' : 'none';
        if (isProfile) {
            document.getElementById('ro-avatar').src = safeImageUrl(profileData.imgUrl);
            document.getElementById('ro-name').textContent = profileData.name || 'Unnamed';
            document.getElementById('ro-org').textContent = profileData.org || '';
            document.getElementById('ro-edu').textContent = profileData.edu || '';
            document.getElementById('ro-intro').textContent = profileData.intro || '';
            const link = document.getElementById('ro-link');
            const url = (profileData.introUrl || '').trim();
            if (/^https?:\/\//i.test(url)) { link.href = url; link.textContent = url; link.style.display = 'block'; }
            else { link.removeAttribute('href'); link.style.display = 'none'; }
        } else if (currentNodeData) {
            const node = currentNodeData;
            document.getElementById('ro-title').textContent = node.title || 'Untitled';
            const badges = document.getElementById('ro-badges');
            badges.innerHTML = '';
            [CATEGORY_LABELS[node.category] || 'Skill', LEVEL_LABELS[node.level] || 'Production'].forEach(text => {
                const badge = document.createElement('span');
                badge.textContent = text;
                badges.appendChild(badge);
            });
            document.getElementById('ro-desc').textContent = node.desc || 'No details.';
            const tagBox = document.getElementById('ro-tags');
            tagBox.innerHTML = '';
            (node.tags || []).forEach(tag => {
                const pill = document.createElement('span');
                pill.className = 'tag-pill static';
                pill.textContent = tag;
                tagBox.appendChild(pill);
            });
            const names = node.parentIds.map(id => id === 'center' ? 'Center' : (nodes.find(n => n.id === id)?.title || 'Untitled'));
            document.getElementById('ro-parents').textContent = names.length ? `Builds on: ${names.join(', ')}` : '';
        }
    } else {
        readonlyView.style.display = 'none';
    }
    const anyAction = Array.from(actions.children).some(button => button.style.display !== 'none');
    actions.style.display = anyAction ? 'block' : 'none';
}

// ---- camera fitting ----------------------------------------------------------------
let userMovedCamera = false;
controls.addEventListener('start', () => { userMovedCamera = true; isResettingCamera = false; });

// Distance at which every node fits inside the screen (works for tall phone screens too).
function fitDistance() {
    let maxX = 4, maxY = 4, maxZ = 0;
    nodes.forEach(node => {
        maxX = Math.max(maxX, Math.abs(node.mesh.position.x), Math.abs(node.targetX));
        maxY = Math.max(maxY, Math.abs(node.mesh.position.y), Math.abs(node.targetY));
        if (!is2DMode) maxZ = Math.max(maxZ, Math.abs(node.mesh.position.z), Math.abs(node.targetZ));
    });
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    const distance = Math.max((maxX + 2) / tanH, (maxY + 2) / tanV) + maxZ;
    return THREE.MathUtils.clamp(distance, 14, 120);
}

function fitView() {
    isResettingCamera = true;
    targetCameraPos.set(0, 0, fitDistance());
    controls.enableDamping = true;
}

let autoFitTimers = [];
// After a card is loaded the layout needs a moment to settle; frame it twice unless the user
// has already started moving the camera themselves.
function scheduleAutoFit() {
    autoFitTimers.forEach(clearTimeout);
    userMovedCamera = false;
    autoFitTimers = [1800, 4500].map(delay => setTimeout(() => {
        if (!userMovedCamera && nodes.length) fitView();
    }, delay));
}

function handleSceneDoubleClick(event) {
    if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'IMG'].includes(event.target.tagName)) return;
    fitView();
}

function syncInfoPanelLayout() {
    const panel = document.getElementById('info-panel');
    if (!panel) return;
    const isMobileViewport = window.innerWidth <= 768;
    panel.classList.toggle('is-mobile-layout', isMobileViewport && panel.style.display === 'block');
}

// Pick the node nearest to the tap/click in screen space (finger-sized hit area), then fall back
// to a normal ray cast so labels still work.
function pickObject(event) {
    const slop = event.pointerType === 'touch' ? 30 : 12;
    let best = null, bestDistance = slop;
    const world = new THREE.Vector3();
    [centerSphere, ...nodes.map(node => node.mesh)].forEach(object => {
        object.getWorldPosition(world);
        const projected = world.clone().project(camera);
        if (projected.z > 1) return;
        const screenX = (projected.x + 1) / 2 * window.innerWidth;
        const screenY = (1 - projected.y) / 2 * window.innerHeight;
        const distance = Math.hypot(screenX - event.clientX, screenY - event.clientY);
        if (distance < bestDistance) { best = object; bestDistance = distance; }
    });
    if (best) return best;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const targets = nodes.flatMap(node => [node.mesh, node.labelSprite].filter(Boolean));
    targets.push(centerSphere);
    const hits = raycaster.intersectObjects(targets);
    return hits.length ? hits[0].object : null;
}

function handleScenePointerDown(event) {
    if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(event.target.tagName)) return;
    // taps on panels / dialogs must not fall through to the 3D scene behind them
    if (event.target.closest && event.target.closest('#info-panel, #menu-shell, #quick-actions, .modal-overlay, #qr-modal-overlay')) return;

    isResettingCamera = false;

    const picked = pickObject(event);
    const intersects = picked ? [{ object: picked }] : [];
    const panel = document.getElementById('info-panel');

    const isMobileViewport = window.innerWidth <= 768;

    if (intersects.length > 0) {
        const clickedObj = intersects[0].object;
        panel.style.display = 'block';
        panel.classList.toggle('is-mobile-layout', isMobileViewport);
        panel.style.opacity = '0';
        panel.style.transform = isMobileViewport ? 'translateX(-50%) translateY(10px)' : 'translateY(10px)';
        requestAnimationFrame(() => {
            panel.style.transition = 'opacity 180ms ease, transform 180ms ease';
            panel.style.opacity = '1';
            panel.style.transform = isMobileViewport ? 'translateX(-50%) translateY(0)' : 'translateY(0)';
        });

        const inputs = document.querySelectorAll('#info-panel input, #info-panel textarea, #info-panel select');
        inputs.forEach(element => element.disabled = isPreviewMode);
        document.getElementById('save-btn').style.display = isPreviewMode ? 'none' : 'block';
        document.getElementById('save-card-btn').style.display = isPreviewMode && currentViewingCard ? 'block' : 'none';
        if (typeof setSaveCardButtonState === 'function') setSaveCardButtonState();

        if (clickedObj === centerSphere) {
            isEditingProfile = true;
            document.getElementById('skill-view').style.display = 'none';
            document.getElementById('profile-view').style.display = 'block';
            document.getElementById('delete-btn').style.display = 'none';
            document.getElementById('profile-title').innerText = 'My Profile';

            document.getElementById('profile-name').value = profileData.name;
            document.getElementById('profile-org').value = profileData.org;
            document.getElementById('profile-edu').value = profileData.edu;
            document.getElementById('profile-intro').value = profileData.intro;
            document.getElementById('profile-intro-urls').value = profileData.introUrl || '';
            document.getElementById('profile-img-url').style.display = isPreviewMode ? 'none' : 'block';
            document.getElementById('profile-img-url').value = profileData.imgUrl || '';
            document.getElementById('profile-img-preview').src = safeImageUrl(profileData.imgUrl);
        } else {
            isEditingProfile = false;
            document.getElementById('skill-view').style.display = 'block';
            document.getElementById('profile-view').style.display = 'none';
            document.getElementById('delete-btn').style.display = isPreviewMode ? 'none' : 'block';
            document.getElementById('skill-title').innerText = 'Node Info';

            currentNodeData = nodes.find(node => node.mesh === clickedObj || node.labelSprite === clickedObj);
            updateSelectionVisual();
            if (!currentNodeData) return;
            populateParentSelect(currentNodeData.id, currentNodeData.parentIds);
            document.getElementById('node-title').value = currentNodeData.title;
            document.getElementById('node-category').value = currentNodeData.category || 'skill';
            document.getElementById('node-level').value = String(currentNodeData.level || 2);
            document.getElementById('node-tags').value = Array.isArray(currentNodeData.tags) ? currentNodeData.tags.join(', ') : (currentNodeData.tags || '');
            document.getElementById('node-desc').value = currentNodeData.desc;

            if (editModeIsList) renderEditTags();
        }
        renderPanelMode(clickedObj === centerSphere);
    } else {
        panel.style.opacity = '0';
        panel.style.transition = 'opacity 140ms ease, transform 140ms ease';
        panel.style.transform = isMobileViewport ? 'translateX(-50%) translateY(8px)' : 'translateY(8px)';
        setTimeout(() => {
            if (panel.style.opacity === '0') {
                panel.style.display = 'none';
                panel.classList.remove('is-mobile-layout');
            }
        }, 150);
        if (is2DMode && event.button === 0) {
            isDragging2D = true;
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            previousAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
        }
    }
}

function handleScenePointerMove(event) {
    if (is2DMode && isDragging2D) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const currentAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
        let deltaAngle = currentAngle - previousAngle;
        if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
        scene.rotation.z -= deltaAngle;
        previousAngle = currentAngle;
        resetIdleTimer();
    }
}

function handleScenePointerUp() {
    isDragging2D = false;
}

function removeCurrentNode() {
    if (!currentNodeData || isPreviewMode || isEditingProfile) return;
    if (currentNodeData.labelSprite) {
        currentNodeData.labelSprite.material.map.dispose();
        currentNodeData.labelSprite.material.dispose();
    }

    scene.remove(currentNodeData.mesh);
    currentNodeData.mesh.geometry.dispose();
    currentNodeData.mesh.material.dispose();
    currentNodeData.lines.forEach(lineObject => {
        scene.remove(lineObject.line);
        lineObject.line.geometry.dispose();
        lineObject.line.material.dispose();
    });

    nodes.forEach(node => {
        const parentIndex = node.parentIds.indexOf(currentNodeData.id);
        if (parentIndex > -1) {
            node.parentIds.splice(parentIndex, 1);
            if (node.parentIds.length === 0) node.parentIds.push('center');
            updateNodeLines(node);
        }
    });

    const index = nodes.indexOf(currentNodeData);
    if (index > -1) nodes.splice(index, 1);
    document.getElementById('info-panel').style.display = 'none';
    saveSkillsToLocal();
    currentNodeData = null;
    updateSelectionVisual();

    if (typeof renderSearchTags === 'function' && searchModeIsList) renderSearchTags();
}

window.addEventListener('dblclick', handleSceneDoubleClick);
// Select on TAP only: a finger that starts on a node to rotate/pinch must not pop up the panel.
const tapState = { active: new Set(), start: null, multi: false };
function handleSceneTapDown(event) {
    if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(event.target.tagName)) return;
    if (event.target.closest && event.target.closest('#info-panel, #menu-shell, #quick-actions, .modal-overlay, #qr-modal-overlay')) return;
    tapState.active.add(event.pointerId);
    if (tapState.active.size > 1) { tapState.multi = true; tapState.start = null; return; }
    tapState.multi = false;
    tapState.start = { x: event.clientX, y: event.clientY, t: performance.now(), pointerId: event.pointerId, pointerType: event.pointerType, button: event.button, target: event.target, clientX: event.clientX, clientY: event.clientY, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, metaKey: event.metaKey };
    // 2D mode needs the drag-rotate set-up immediately when pressing empty space
    if (is2DMode && !pickObject(event)) { tapState.start = null; handleScenePointerDown(event); }
}
function handleSceneTapUp(event) {
    const st = tapState.start;
    tapState.active.delete(event.pointerId);
    if (tapState.active.size === 0) { tapState.start = null; }
    if (!st || tapState.multi || st.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - st.x, event.clientY - st.y);
    const limit = st.pointerType === 'touch' ? 12 : 5;
    if (moved <= limit && performance.now() - st.t < 600) handleScenePointerDown(st);
}
function handleSceneTapCancel(event) { tapState.active.delete(event.pointerId); tapState.start = null; }
window.addEventListener('pointerdown', handleSceneTapDown);
window.addEventListener('pointerup', handleSceneTapUp);
window.addEventListener('pointercancel', handleSceneTapCancel);
window.addEventListener('pointermove', handleScenePointerMove);
window.addEventListener('pointerup', handleScenePointerUp);
window.addEventListener('resize', syncInfoPanelLayout);
