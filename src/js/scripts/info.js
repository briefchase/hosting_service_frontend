// website/src/js/scripts/info.js

import * as THREE from 'three';
import { SYSTEM } from '../strings.js';

let tooltipElement = null;
let tooltipTimeout = null;
let tooltipAnimationInterval = null;
let lastMouseEvent = null;

let isInfoModeActive = false;
let infoToggleButton = null;

// Three.js variables
let rendererMain, rendererLens, sceneMain, sceneLens, camera, cube, edges, iconPlane, animationFrameId;
let targetOpacity = 0;
let currentOpacity = 0;
let edgeMat, iconMat; // Shared material references for animation

let isDeploymentActive = false;
window.addEventListener('deploymentstatechange', (e) => {
    isDeploymentActive = !!e.detail.isActive;
    refreshInfoButtonPosition();
});

export function getIsInfoModeActive() {
    return isInfoModeActive;
}

function ensureTooltipElement() {
    if (tooltipElement && document.body.contains(tooltipElement)) {
        return;
    }
    tooltipElement = document.getElementById('tooltip');
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.id = 'tooltip';
        document.body.appendChild(tooltipElement);
    }
}

function initThreeJS(container) {
    const size = 30;
    const cubeSize = 18;

    // --- Scene Setup ---
    sceneMain = new THREE.Scene(); // For Wireframe & Icon
    sceneLens = new THREE.Scene(); // For the Inversion Mask (Cube Body)
    
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.z = 40;

    // --- Renderers ---
    // Main Renderer: Standard branding (Grey)
    rendererMain = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: false });
    rendererMain.setSize(size, size);
    rendererMain.setPixelRatio(window.devicePixelRatio);
    rendererMain.domElement.className = 'main-canvas';
    container.appendChild(rendererMain.domElement);

    // Lens Renderer: The Negative Effect (White Mask)
    // No antialiasing here to prevent blue fringes at the inversion edge
    rendererLens = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false });
    rendererLens.setSize(size, size);
    rendererLens.setPixelRatio(window.devicePixelRatio);
    rendererLens.domElement.className = 'lens-canvas';
    container.appendChild(rendererLens.domElement);

    // --- Meshes ---
    
    // 1. Cube Body (Lens) in sceneLens
    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const cubeMat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0 
    });
    cube = new THREE.Mesh(geometry, cubeMat);
    sceneLens.add(cube);

    // 2. Wireframe Edges in sceneMain
    edgeMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    edges = new THREE.Group();
    const edgeThickness = 0.8;
    const half = cubeSize / 2;
    
    const addEdge = (w, h, d, x, y, z) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, edgeMat);
        mesh.position.set(x, y, z);
        edges.add(mesh);
    };

    addEdge(cubeSize + edgeThickness, edgeThickness, edgeThickness, 0, half, half);
    addEdge(cubeSize + edgeThickness, edgeThickness, edgeThickness, 0, -half, half);
    addEdge(cubeSize + edgeThickness, edgeThickness, edgeThickness, 0, half, -half);
    addEdge(cubeSize + edgeThickness, edgeThickness, edgeThickness, 0, -half, -half);
    addEdge(edgeThickness, cubeSize + edgeThickness, edgeThickness, half, 0, half);
    addEdge(edgeThickness, cubeSize + edgeThickness, edgeThickness, -half, 0, half);
    addEdge(edgeThickness, cubeSize + edgeThickness, edgeThickness, half, 0, -half);
    addEdge(edgeThickness, cubeSize + edgeThickness, edgeThickness, -half, 0, -half);
    addEdge(edgeThickness, edgeThickness, cubeSize + edgeThickness, half, half, 0);
    addEdge(edgeThickness, edgeThickness, cubeSize + edgeThickness, -half, half, 0);
    addEdge(edgeThickness, edgeThickness, cubeSize + edgeThickness, half, -half, 0);
    addEdge(edgeThickness, edgeThickness, cubeSize + edgeThickness, -half, -half, 0);
    sceneMain.add(edges);

    // 3. "i" Icon in sceneMain
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#888888';
    ctx.font = "bold 48px 'Courier Prime', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('i', 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const iconGeo = new THREE.PlaneGeometry(cubeSize * 0.8, cubeSize * 0.8);
    iconMat = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true,
        side: THREE.FrontSide
    });
    iconPlane = new THREE.Mesh(iconGeo, iconMat);
    iconPlane.position.z = (cubeSize / 2) + 0.1;
    sceneMain.add(iconPlane);

    // Sync rotation via groups
    const groupMain = new THREE.Group();
    groupMain.add(edges);
    groupMain.add(iconPlane);
    sceneMain.add(groupMain);

    const groupLens = new THREE.Group();
    groupLens.add(cube);
    sceneLens.add(groupLens);

    const startTime = Date.now();
    let mouseX = 0;
    let mouseY = 0;

    // Randomize frequencies for individual waver effects
    const freqRotX = 0.4 + Math.random() * 0.6;
    const freqRotY = 0.4 + Math.random() * 0.6;
    const freqRotZ = 0.4 + Math.random() * 0.6;
    const freqPosX = 0.6 + Math.random() * 0.6;
    const freqPosY = 0.6 + Math.random() * 0.6;
    
    // Equalized amplitudes
    const ampRotXY = 0.3; // Pitch (X) and Yaw (Y) have equal amplitude
    const ampRotZ = 0.15; // Roll (Z)
    const ampPosXY = 0.8; // Position X and Y have equal amplitude

    // Magnetism / Mouse Influence
    window.addEventListener('mousemove', (e) => {
        if (!rendererMain || !rendererMain.domElement) return;
        const rect = rendererMain.domElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Tightened magnetic field: ramps up more sharply within ~200px
        const influence = Math.exp(-dist / 200); 
        
        // Directional vectors scaled by influence
        const dirX = dx / Math.max(1, dist);
        const dirY = dy / Math.max(1, dist);
        
        mouseX = dirX * influence;
        mouseY = dirY * influence;
    });

    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        const time = (Date.now() - startTime) * 0.001;

        // Target rotation from waver + tightened magnetism
        // Reduced multiplier to 0.7 to keep the peak rotation subtle at closest range
        const targetRotY = Math.sin(time * freqRotY) * ampRotXY + (mouseX * 0.7);
        const targetRotX = Math.sin(time * freqRotX) * ampRotXY + (mouseY * 0.7);
        const targetRotZ = Math.cos(time * freqRotZ) * ampRotZ;

        // Very slight position waver
        const targetPosX = Math.sin(time * freqPosX) * ampPosXY;
        const targetPosY = Math.cos(time * freqPosY) * ampPosXY;

        const rotLerp = 0.08; 
        
        // Sync both groups
        [groupMain, groupLens].forEach(g => {
            g.rotation.y += (targetRotY - g.rotation.y) * rotLerp;
            g.rotation.x += (targetRotX - g.rotation.x) * rotLerp;
            g.rotation.z += (targetRotZ - g.rotation.z) * rotLerp;
            
            g.position.x += (targetPosX - g.position.x) * rotLerp;
            g.position.y += (targetPosY - g.position.y) * rotLerp;
        });

        // Transitions
        const lerpFactor = 0.15;
        targetOpacity = isInfoModeActive ? 1 : 0;
        currentOpacity += (targetOpacity - currentOpacity) * lerpFactor;
        
        cube.material.opacity = currentOpacity;

        rendererLens.render(sceneLens, camera);
        rendererMain.render(sceneMain, camera);
    }

    animate();
}

function ensureInfoToggleButton() {
    if (infoToggleButton && document.body.contains(infoToggleButton)) {
        return;
    }
    infoToggleButton = document.getElementById('info-mode-toggle');
    if (!infoToggleButton) {
        infoToggleButton = document.createElement('div');
        infoToggleButton.id = 'info-mode-toggle';
        
        // We remove the old textContent and CSS waver
        // initThreeJS will handle everything 3D
        initThreeJS(infoToggleButton);

        infoToggleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleInfoMode();
        });
        document.body.appendChild(infoToggleButton);
    }
    refreshInfoButtonPosition();
}

export function toggleInfoMode() {
    isInfoModeActive = !isInfoModeActive;
    document.body.classList.toggle('info-mode-active', isInfoModeActive);
    
    if (isInfoModeActive) {
        console.log('[Info Mode] Activated');
    } else {
        console.log('[Info Mode] Deactivated');
        hideTooltip();
    }
}

/**
 * Determines the current active UI "context" and its corresponding anchor element.
 * Higher-priority contexts (like prompts) override lower-priority ones (like background menus).
 * @returns {HTMLElement|null} The element to anchor the info button to, or null if it should be hidden.
 */
function getCurrentContextAnchor() {
    // 1. Prompt Context (Highest priority - if a prompt is active, it defines the anchor)
    const promptContent = document.querySelector('.prompt-content-wrapper');
    if (document.body.classList.contains('prompt-active') && promptContent && promptContent.offsetParent) {
        return promptContent;
    }

    // 2. Blocked States (Hide the button if in a restricted full-screen mode without a prompt)
    const isTerminalActive = document.body.classList.contains('terminal-view-active');
    const isEditorActive = document.body.classList.contains('editor-view-active');
    const isDeploymentLoading = document.body.classList.contains('deployment-loading');
    const isTerminalOverlay = document.body.classList.contains('overlay-active'); // Non-prompt full-screen overlays
    const isLoading = document.querySelector('#menu-container')?.dataset.loading === 'true';

    if (isTerminalActive || isEditorActive || isDeploymentLoading || isTerminalOverlay || isLoading || isDeploymentActive) {
        return null;
    }

    // 3. Menu Context
    const menuList = document.getElementById('menu-list-container');
    if (menuList && menuList.offsetParent) {
        return menuList;
    }

    // 4. Landing Context (Lowest priority)
    const consoleButton = document.getElementById('console-button');
    if (consoleButton && consoleButton.offsetParent) {
        return consoleButton;
    }

    return null;
}

/**
 * Checks if a given container or any of its children have tooltips to explain.
 */
function containerHasTooltips(container) {
    if (!container) return false;
    // Check children
    if (container.querySelectorAll('[data-tooltip-text]').length > 0) return true;
    // Check the container itself (e.g., for single buttons)
    if (container.dataset.tooltipText) return true;
    
    // Special case: check other relevant interactive elements that might be adjacent
    // but not within the primary anchor (like the account button when a menu is open)
    const accountButton = document.getElementById('account-button');
    if (accountButton && accountButton.offsetParent && accountButton.dataset.tooltipText) return true;

    return false;
}

export function refreshInfoButtonPosition() {
    ensureInfoToggleButton();
    if (!infoToggleButton) return;

    const anchor = getCurrentContextAnchor();
    const shouldShow = anchor && containerHasTooltips(anchor);

    if (shouldShow) {
        const rect = anchor.getBoundingClientRect();
        infoToggleButton.style.display = 'flex';
        // Position the center exactly 20px up and 20px right from the corner
        // Button is 20x20, so we subtract 10px from the center for top/left
        infoToggleButton.style.top = `${window.scrollY + rect.top - 30}px`;
        infoToggleButton.style.left = `${window.scrollX + rect.right + 10}px`;
    } else {
        infoToggleButton.style.display = 'none';
        // If we are hiding the button, also ensure info mode is deactivated
        if (isInfoModeActive) {
            toggleInfoMode();
        }
        hideTooltip();
    }
}

// Initialize button position and listen for changes
window.addEventListener('resize', refreshInfoButtonPosition);
window.addEventListener('scroll', refreshInfoButtonPosition);

// Global Click Interceptor for Info Mode
// This ensures that when Info Mode is active, clicks on interactive elements
// across the entire site (menus, landing page, prompts) show tooltips instead of firing.
window.addEventListener('click', (event) => {
    // Always hide tooltip on click regardless of mode
    hideTooltip();
    updateLastMouseEvent(null);

    if (!isInfoModeActive) return;

    const target = event.target;
    // Find the closest interactive element
    const interactiveElement = target.closest('#account-button, .landing-button, .landing-option, li, .prompt-option-button, .prompt-input-text, select, .record.actionable');
    
    if (interactiveElement) {
        // If it's the info toggle itself, let it pass through
        if (interactiveElement.id === 'info-mode-toggle' || interactiveElement.closest('#info-mode-toggle')) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        
        const tooltipText = interactiveElement.dataset.tooltipText;
        if (tooltipText) {
            displayAndPositionTooltip(event, tooltipText, true);
        }
    }
}, true); // Use capture phase to intercept before other listeners

// --- Global Hover/Touch Tooltip Delegation ---
const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

if (isTouchDevice) {
    let pressHoldTimeout = null;
    let tooltipIsVisible = false;
    let currentTarget = null;

    const onTouchMove = (event) => {
        if (tooltipIsVisible) {
            displayAndPositionTooltip(event);
        }
    };

    const onTouchEnd = () => {
        clearTimeout(pressHoldTimeout);
        if (tooltipIsVisible) {
            hideTooltip();
            tooltipIsVisible = false;
        }
        if (currentTarget) {
            currentTarget.removeEventListener('touchmove', onTouchMove);
            currentTarget = null;
        }
    };

    document.addEventListener('touchstart', (event) => {
        if (tooltipIsVisible) return;
        
        const target = event.target.closest('[data-tooltip-text]');
        if (target && target.dataset.tooltipText) {
            currentTarget = target;
            pressHoldTimeout = setTimeout(() => {
                tooltipIsVisible = true;
                displayAndPositionTooltip(event, target.dataset.tooltipText, true);
                target.addEventListener('touchmove', onTouchMove, { passive: true });
            }, 500);
        }
    }, { passive: true });

    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
} else {
    let currentTarget = null;

    const onMouseMove = (event) => {
        updateLastMouseEvent(event);
        displayAndPositionTooltip(event);
    };

    const onMouseLeave = () => {
        hideTooltip();
        if (currentTarget) {
            currentTarget.removeEventListener('mousemove', onMouseMove);
            currentTarget.removeEventListener('mouseleave', onMouseLeave);
        }
        currentTarget = null;
        updateLastMouseEvent(null);
    };

    document.addEventListener('mouseover', (event) => {
        const target = event.target.closest('[data-tooltip-text]');
        if (!target || target === currentTarget) return;
        if (currentTarget) onMouseLeave();

        currentTarget = target;
        const tooltipText = target.dataset.tooltipText;
        if (tooltipText) {
            updateLastMouseEvent(event);
            displayAndPositionTooltip(event, tooltipText);
            currentTarget.addEventListener('mousemove', onMouseMove);
            currentTarget.addEventListener('mouseleave', onMouseLeave);
        }
    });
}

/**
 * Allows other modules to update the last known mouse event, enabling shared tooltip logic.
 * @param {MouseEvent|null} event - The latest mouse event, or null to clear it.
 */
export function updateLastMouseEvent(event) {
    lastMouseEvent = event;
}

/**
 * Displays and positions the tooltip. If infoText is provided, it shows the tooltip
 * after a delay. If infoText is null, it just updates the position of the visible tooltip.
 * @param {MouseEvent} event - The mouse event.
 * @param {string|null} infoText - The text to display in the tooltip.
 * @param {boolean} isImmediate - If true, bypasses the initial 500ms show delay.
 */
export function displayAndPositionTooltip(event, infoText = null, isImmediate = false) {
    ensureTooltipElement();
    if (!tooltipElement) return;

    const positionTooltip = (e) => {
        if (tooltipElement.style.display !== 'block') return;

        const isTouchEvent = e.type.startsWith('touch');
        const pos = isTouchEvent ? e.touches[0] : e;

        if (!pos) return; // Can happen on touchend

        const tooltipHeight = tooltipElement.offsetHeight;
        const tooltipWidth = tooltipElement.offsetWidth;
        const bodyRect = document.body.getBoundingClientRect();

        let top, left;

        if (isTouchEvent) {
            // Mobile: Horizontally centered ABOVE the finger, with more offset
            top = pos.pageY - tooltipHeight - 60; // Increased offset further
            left = pos.pageX - (tooltipWidth / 2);

            // Boundary checks
            if (left < bodyRect.left + 5) left = bodyRect.left + 5;
            if (left + tooltipWidth > bodyRect.right - 5) left = bodyRect.right - tooltipWidth - 5;
            if (top < bodyRect.top + 5) top = pos.pageY + 25; // Flip below
        } else {
            // Desktop: To the right of the cursor
            const offsetX = 15;
            top = pos.pageY - (tooltipHeight / 2);
            left = pos.pageX + offsetX;

            // Boundary checks
            if (left + tooltipWidth > bodyRect.right) left = pos.pageX - tooltipWidth - offsetX;
            if (left < bodyRect.left) left = bodyRect.left + 5;
            if (top < bodyRect.top) top = bodyRect.top + 5;
            if (top + tooltipHeight > bodyRect.bottom) top = bodyRect.bottom - tooltipHeight - 5;
        }

        tooltipElement.style.left = `${left}px`;
        tooltipElement.style.top = `${top}px`;
    };

    const showAndAnimate = () => {
        const isTouchEvent = event.type.startsWith('touch');

        // Prepare the tooltip element but keep it invisible.
        tooltipElement.textContent = '';
        tooltipElement.style.display = 'block';
        tooltipElement.style.visibility = 'hidden';

        let i = 0;
        clearInterval(tooltipAnimationInterval);
        
        // Fast animation in Info Mode
        const animSpeed = isInfoModeActive ? 10 : 35;

        tooltipAnimationInterval = setInterval(() => {
            if (i < infoText.length) {
                tooltipElement.textContent += infoText.charAt(i);

                // Position the tooltip based on its current content width.
                const currentPositionEvent = isTouchEvent ? event : lastMouseEvent;
                if (currentPositionEvent) {
                    positionTooltip(currentPositionEvent);
                }

                // Make the tooltip visible only on the first frame, after it has content and is positioned.
                if (i === 0) {
                    tooltipElement.style.visibility = 'visible';
                }

                i++;
            } else {
                clearInterval(tooltipAnimationInterval);
            }
        }, animSpeed);
    };

    if (infoText) { // This is a "show" request
        clearTimeout(tooltipTimeout);
        clearInterval(tooltipAnimationInterval);

        // Instant show in Info Mode or if isImmediate is true
        const delay = (isImmediate || isInfoModeActive) ? 0 : 500;
        tooltipTimeout = setTimeout(showAndAnimate, delay);

    } else { // This is a "reposition" request
        positionTooltip(event);
    }
}

export function hideTooltip() {
    clearTimeout(tooltipTimeout); // Clear any pending show requests
    clearInterval(tooltipAnimationInterval); // Stop any ongoing animation
    if (tooltipElement) {
        tooltipElement.style.display = 'none';
    }
}
