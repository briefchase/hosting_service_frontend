import { DOMAINS, SYSTEM, BILLING } from '../strings.js';
import { prompt, dismissPrompt } from '/js/pages/prompt.js';
import { applyWaveEffect } from '/js/scripts/effects.js';

/**
 * Shows a modal loading prompt with a wave effect on the text.
 * @param {string} text - The message to display.
 * @param {object} options - Options for the prompt (id, replace).
 * @returns {Promise} - The prompt promise.
 */
export function showLoadingPrompt(text, options = {}) {
    return prompt({
        id: options.id || 'global-loading-prompt',
        type: 'form',
        text: text,
        replace: options.replace !== undefined ? options.replace : true,
        buttons: [],
        hideBackButton: true,
        onMount: (wrapper) => {
            const textEl = wrapper.querySelector('.prompt-text');
            if (textEl) applyWaveEffect(textEl);
        }
    });
}

// Central registry for menu configurations - Moved from menus/common.js
export const menus = {};

// Define the base API URL - Moved to variables.js
// export const API_BASE_URL = 'http://localhost:5000/api';

// Import the base API URL
// import { API_BASE_URL } from '../variables.js'; // REMOVED - Now importing from main.js
import { updateSiteTitleVisibility, updateAccountButtonVisibility, loadLandingView } from "/js/main.js";
import { CONFIG } from "/js/config.js";

const API_BASE_URL = CONFIG.API_BASE_URL;
import { 
    getIsInfoModeActive, 
    refreshInfoButtonPosition 
} from '/js/scripts/info.js';
import { pushBackHandler, popBackHandler, clearBackHandlers } from '/js/scripts/back.js';

// Import the fetch handler - needed for auto-fetching on render
// import { handleFetchResources } from './instance-menu.js'; // Keep this relative path assumption in mind

import { getHandlers } from '/js/scripts/registry.js';

// Store action handlers provided during initialization
let menuContainerElement = null;
let dynamicMenuTitleElement = null; // Renamed to avoid confusion with static site title
let currentAuthState = null; // Store user authentication state
let currentMenuId = null; // Store the ID of the currently rendered menu

// --- Deployment State Listener ---
// Listens for events from deploy.js to know when to hide the site title.
let isDeploymentActive = false;
window.addEventListener('deploymentstatechange', (e) => {
    isDeploymentActive = !!e.detail.isActive;
    // When the state changes, immediately re-run the collision check.
    checkHeaderCollision();
});


/**
 * Updates the authentication state within the menu module.
 * @param {object} newUserState - The new user state object.
 */
export function updateAuthState(newUserState) {
    currentAuthState = newUserState;
}

/**
 * Checks for collision between the site title and header buttons.
 * Hides the site title if it overlaps with either the back or account buttons.
 */
export function checkHeaderCollision() {
    // If the menu is in a loading state, or if the terminal is active, do not interfere.
    // The functions that manage these states are responsible for title visibility.
    if ((menuContainerElement && menuContainerElement.dataset.loading === 'true') || document.body.classList.contains('terminal-view-active') || isDeploymentActive) {
        return;
    }

    const siteTitle = document.getElementById('site-title');
    const accountButton = document.getElementById('account-button');
    const backButton = document.getElementById('back-button');

    // Ensure all elements are present
    if (!siteTitle || !accountButton || !backButton) {
        return;
    }

    // Reset visibility to get accurate measurements
    updateSiteTitleVisibility(true);

    const siteTitleRect = siteTitle.getBoundingClientRect();
    const accountButtonRect = accountButton.getBoundingClientRect();
    const backButtonRect = backButton.getBoundingClientRect();

    const isAccountButtonVisible = window.getComputedStyle(accountButton).display !== 'none';
    const isBackButtonVisible = window.getComputedStyle(backButton).display !== 'none';

    let collision = false;
    // Check for overlap with account button
    if (isAccountButtonVisible && siteTitleRect.right > accountButtonRect.left) {
        collision = true;
    }

    // Check for overlap with back button
    if (isBackButtonVisible && siteTitleRect.left < backButtonRect.right + 10) { // Add 10px buffer
        collision = true;
    }

    // Set visibility based on collision detection
    updateSiteTitleVisibility(!collision);
}

// Function to generate HTML for a list of items
function generateListItemsHTML(items) {
    return items.map(item => {
        const itemType = item.type || 'button';
        const itemId = item.id ? ` id="${item.id}"` : '';

        if (itemType === 'record-group') {
            const subItemsHTML = item.items.map(subItem => {
                const text = (subItem.text === undefined || subItem.text === null || subItem.text === '') ? '&nbsp;' : subItem.text;
                // Note: sub-items in a group do not currently support actions or individual IDs.
                return `<span class="menu-record-group-item">${text}</span>`;
            }).join('');
            return `<li${itemId} class="menu-record">${subItemsHTML}</li>`;
        }

        if (itemType === 'horizontal-container') {
            const subItemsHTML = generateListItemsHTML(item.items || []);
            return `<li${itemId} class="menu-item-container"><ul class="menu-horizontal-list">${subItemsHTML}</ul></li>`;
        }

        // Collect all data attributes from the item object, excluding reserved keys.
        const reservedKeys = ['type', 'id', 'text', 'targetMenu', 'action'];
        let customDataAttrs = '';
        for (const key in item) {
            if (item.hasOwnProperty(key) && !reservedKeys.includes(key)) {
                // Convert camelCase to kebab-case for data attribute names
                const kebabKey = key.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
                // Escape attribute value to be safe
                const attrValue = String(item[key]).replace(/"/g, '&quot;');
                customDataAttrs += ` data-${kebabKey}="${attrValue}"`;
            }
        }

        // These attributes determine if an item is interactive
        const targetAttr = item.targetMenu ? ` data-target-menu="${item.targetMenu}"` : '';
        const actionAttr = item.action ? ` data-action="${item.action}"` : '';
        const tooltipDataAttr = item.tooltip ? ` data-tooltip-text="${String(item.tooltip).replace(/"/g, '&quot;')}"` : '';
        let allDataAttrs = `${targetAttr}${actionAttr}${customDataAttrs}${tooltipDataAttr}`;
        
        // Add a class for the loading indicator
        if (item.showLoading) {
            allDataAttrs += ` data-show-loading="true"`;
        }
        
        // The class determines the visual style
        const isActionable = !!(item.targetMenu || item.action);
        const classList = [item.type === 'button' ? 'menu-button' : 'record-container'];
        if (isActionable && classList[0] === 'record-container') {
            classList.push('actionable'); // For hover/cursor styling
        }
        if (item.className) {
            classList.push(item.className);
        }

        const text = (item.text === undefined || item.text === null || item.text === '') ? '&nbsp;' : item.text;
        
        if (classList.includes('record-container')) {
            const recordClass = isActionable ? 'record actionable' : 'record';
            
            // If it has a custom className, ensure it's on the inner div EXCEPT for spacing classes 
            // that are already on the <li> container to avoid double-application.
            const spacingClasses = ['details-last-record'];
            const filteredClassName = item.className ? item.className.split(' ').filter(c => !spacingClasses.includes(c)).join(' ') : '';
            const finalRecordClass = filteredClassName ? `${recordClass} ${filteredClassName}` : recordClass;
            
            return `<li${itemId} class="${classList.join(' ')}"${allDataAttrs}><div class="${finalRecordClass}">${text}</div></li>`;
        }
        
        return `<li${itemId} class="${classList.join(' ')}"${allDataAttrs}>${text}</li>`;
    }).join('');
}

// Generalized function to generate HTML for any menu
function generateMenuHTML(menuConfig, menuId) {
    if (!menuConfig) {
        console.error(`Menu configuration for "${menuId}" not found.`);
        return SYSTEM.MENU.ERRORS.NOT_FOUND;
    }

    // Get items HTML - Back/Account buttons are now static in index.html
    const listItemsHTML = generateListItemsHTML(menuConfig.items);

    return `
        <div id="${menuId}-view">
            <ul class="menu" id="${menuId}">
                ${listItemsHTML}
            </ul>
        </div>
    `;
}

// Function to render a specific menu
// Exporting renderMenu in case action handlers need it directly
/**
 * Initiates the loading state for the menu and races the provided work against a back-button cancellation.
 * Clears items, hides titles, sets data-loading, and manages the back-stack handler.
 * @param {Function} workFn - A function that returns the async work promise.
 * @returns {Promise} - The result of the work, or rejects with 'user_cancelled'.
 */
export async function startLoading(workFn) {
    if (menuContainerElement) {
        const listContainer = menuContainerElement.querySelector('#menu-list-container');
        if (listContainer) {
            listContainer.innerHTML = ''; // Just clear the menu buttons
        }
        menuContainerElement.dataset.loading = "true";
        menuContainerElement.dataset.previousMenu = currentMenuId;
        
        // Hide info button immediately when loading starts
        refreshInfoButtonPosition();
    }
    // Hide both titles
    if (dynamicMenuTitleElement) {
        dynamicMenuTitleElement.style.display = 'none';
    }
    updateSiteTitleVisibility(false);
    updateAccountButtonVisibility(false);

    // If no work function is provided, just setup the UI and return (legacy/manual mode)
    if (!workFn) return;

    const { pushBackHandler, popBackHandler, getStack } = await import('/js/scripts/back.js');
    
    let cancelAction;
    const cancelPromise = new Promise((_, reject) => {
        cancelAction = () => {
            console.log('[Menu] Loading cancelled via back button');
            reject(new Error(SYSTEM.ERRORS.USER_CANCELLED));
        };
        pushBackHandler(cancelAction);
    });

    try {
        // Start the work ONLY after the UI and back-handler are ready
        const work = workFn();
        return await Promise.race([work, cancelPromise]);
    } finally {
        // The Ballet: Ensure we only pop our own handler
        const stack = getStack();
        if (stack[stack.length - 1] === cancelAction) {
            popBackHandler();
        } else {
            // If the top isn't ours, it means a sub-action (like a prompt or sub-menu)
            // pushed something and didn't pop it, or we re-rendered too early.
            console.warn(`[Menu] NOT popping loading handler. Stack top is different!`);
            console.log(`[Menu] Current stack top:`, stack[stack.length - 1]);
        }
    }
}

export async function renderMenu(menuIdOrConfig) {
    // Pure Final Boss: No more clearBackHandlers() anchor.
    // We trust the ballet: every push is matched by a pop.
    
    if (menuContainerElement) {
        delete menuContainerElement.dataset.loading;
        delete menuContainerElement.dataset.previousMenu;
    }
    if (!menuContainerElement) {
         console.error("Menu container not initialized.");
         return;
    }

    let menuConfig;
    let menuId;

    if (typeof menuIdOrConfig === 'string') {
        menuId = menuIdOrConfig;
        // Check if the menu config is a function that returns a promise
        const configOrFunction = menus[menuId];
        if (typeof configOrFunction === 'function') { // It's a generator function
            // Render a loading state immediately, and then fetch the real menu
            // in the background.
            const loadingConfig = {
                id: menuId,
                text: SYSTEM.STATUS.LOADING,
                items: [{ text: SYSTEM.MENU.FETCHING(menuId), type: 'record' }],
                backTarget: 'dashboard-menu' // Assume it returns to dashboard
            };

            // Don't await. Let it run in the background.
            configOrFunction()
                .then(resolvedConfig => {
                    // Cache the resolved config, replacing the function
                    menus[menuId] = resolvedConfig;
                    
                    // Re-render only if the user hasn't navigated away
                    const currentMenu = menuContainerElement.querySelector('.menu');
                    if (currentMenu && currentMenu.id === menuId) {
                        renderMenu(menuId);
                    }
                })
                .catch(error => {
                    console.error(`Error executing menu generator function for "${menuId}":`, error);
                    // Create and cache an error menu
                    menus[menuId] = {
                        id: menuId,
                        text: SYSTEM.STATUS.ERROR,
                        items: [{ text: SYSTEM.ERRORS.LOAD_RESOURCES_FAILED, type: 'record' }],
                        backTarget: 'dashboard-menu'
                    };
                    // Re-render to show the error
                    const currentMenu = menuContainerElement.querySelector('.menu');
                    if (currentMenu && currentMenu.id === menuId) {
                        renderMenu(menuId);
                    }
                });
            
            // Use the temporary loading config for the initial render
            menuConfig = loadingConfig;
        } else if (configOrFunction && typeof configOrFunction.then === 'function') { // It's a direct promise
            try {
                // If it's a promise, wait for it to resolve
                menuConfig = await configOrFunction;
                // Since the promise is now resolved, replace it with the actual config
                // to avoid re-fetching unless the page is reloaded.
                menus[menuId] = menuConfig;
            } catch (error) {
                console.error(`Error resolving menu promise for "${menuId}":`, error);
                menuContainerElement.innerHTML = SYSTEM.MENU.ERRORS.GENERIC;
                return;
            }
        } else {
            menuConfig = configOrFunction;
        }
    } else if (typeof menuIdOrConfig === 'object' && menuIdOrConfig !== null) {
        // This is a dynamically generated config object (e.g., from domain.js)
        menuConfig = menuIdOrConfig;
        menuId = menuConfig.id || 'dynamic-menu'; // Use an ID from the config or a generic one
    } else {
        console.error("Invalid argument passed to renderMenu. Must be a menu ID string or a config object.");
        return;
    }
    
    if (!menuConfig) {
        console.error(`Menu configuration for "${menuId}" not found.`);
        menuContainerElement.innerHTML = SYSTEM.MENU.ERRORS.NOT_FOUND;
        if (dynamicMenuTitleElement) dynamicMenuTitleElement.textContent = SYSTEM.STATUS.ERROR; // Update dynamic title on error
        return;
    }

    // Call onLeave for the previous menu if it exists
    if (currentMenuId && currentMenuId !== menuId) {
        const previousMenuConfig = menus[currentMenuId];
        if (previousMenuConfig && typeof previousMenuConfig.onLeave === 'function') {
            try {
                previousMenuConfig.onLeave();
            } catch (error) {
                console.error(`Error during onLeave callback for menu "${currentMenuId}":`, error);
            }
        }
    }

    currentMenuId = menuId; // Store the current menu ID

    // Update static header buttons based on current menu
    // Find buttons dynamically as they might be added/removed
    const isAuthenticated = currentAuthState && !currentAuthState.guest;

    if (menuConfig.backTarget) {
        const { pushBackHandler, popBackHandler, getStack } = await import('/js/scripts/back.js');
        // Pure Final Boss: Pop the current menu handler before pushing the new one
        if (getStack().length > 0) {
            try { popBackHandler(); } catch (_) {} 
        }
        
        pushBackHandler(() => {
            console.log(`Navigating (back) to menu: ${menuConfig.backTarget}`);
            renderMenu(menuConfig.backTarget);
        });
    } else if (menuId === 'dashboard-menu') {
        // Special case: Show back button on main menu, but don't set target (handled by main.js)
        const { pushBackHandler, popBackHandler, getStack } = await import('/js/scripts/back.js');
        // Pure Final Boss: Pop the current menu handler before pushing the new one
        if (getStack().length > 0) {
            try { popBackHandler(); } catch (_) {}
        }

        pushBackHandler(() => {
            // Main JS will handle this case
            console.log("🔙 Default menu navigation - returning to landing");
            if (typeof loadLandingView === 'function') {
                loadLandingView();
            } else {
                console.error("loadLandingView is not a function!", loadLandingView);
                import('/js/main.js').then(m => m.loadLandingView && m.loadLandingView());
            }
        });
    }

    // Centralized account button logic
    if (menuId === 'account-menu' || isDeploymentActive) {
        updateAccountButtonVisibility(false);
    } else {
        updateAccountButtonVisibility(true, isAuthenticated);
    }


    // Check for header collision after updating button visibility and content
    checkHeaderCollision();

    // Render the menu based on the current state of the config
    if (dynamicMenuTitleElement) { // Update dynamic title
        dynamicMenuTitleElement.style.display = ''; // Ensure title is visible
        if (typeof menuConfig.text === 'function') {
            dynamicMenuTitleElement.textContent = menuConfig.text(); // Call the function for dynamic title
        } else if (menuConfig.text) {
            dynamicMenuTitleElement.textContent = menuConfig.text; // Use static text
        } else {
        dynamicMenuTitleElement.textContent = ''; // Clear title if none provided
        }
    }
    // Find the dedicated list container and update its HTML
    const listContainer = menuContainerElement.querySelector('#menu-list-container');
    if (listContainer) {
        // Clear any prior status when navigating
        clearStatusDisplay();
        listContainer.innerHTML = generateMenuHTML(menuConfig, menuId);
        
        // Refresh info button position after rendering new menu items
        refreshInfoButtonPosition();
    } else {
        console.error("Could not find #menu-list-container within #menu-container.");
        menuContainerElement.innerHTML = SYSTEM.MENU.ERRORS.INCOMPLETE; 
    }

    // After rendering, check if there's an onRender callback for the menu
    if (typeof menuConfig.onRender === 'function') {
        try {
            await menuConfig.onRender();
        } catch (error) {
            console.error(`Error during onRender callback for menu "${menuId}":`, error);
        }
    }
}

// --- Tooltip Handling --- END ---

// --- Status Display Function --- START ---
/**
 * Updates the standard menu status bar at the bottom.
 * Handles both raw strings and status objects with effects.
 * @param {string|object} status - The status to display.
 * @param {string} type - Class type (info, error, success, warning).
 */
export function updateStatusDisplay(status, type = 'info') {
    const message = typeof status === 'object' ? status.text : status;
    const effect = typeof status === 'object' ? status.effect : null;

    // Keep console output concise and avoid leaking IDs/URLs
    const condensed = typeof message === 'string' ? message
        .replace(/\b\w{8}-\w{4}-\w{4}-\w{4}-\w{12}\b/g, '[id]')
        .replace(/wss?:\/\/[^\s)]+/g, '[url]')
        : message;
    console.log(`[Status][${type}]`, condensed);

    // If the menu container isn't initialized (e.g., on the landing page),
    // just log the message to the console and do not attempt to manipulate the DOM.
    if (!menuContainerElement) {
        return;
    }

    let statusElement = menuContainerElement.querySelector('#menu-status-message');
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'menu-status-message';
        
        // Try to insert it in a reasonable place, e.g., before the menu list or at the end of the container.
        const listContainer = menuContainerElement.querySelector('#menu-list-container');
        if (listContainer) {
            // Insert after the list container, or adjust as needed for layout
            listContainer.parentNode.insertBefore(statusElement, listContainer.nextSibling);
        } else {
            // Fallback: append to the main menu container
            menuContainerElement.appendChild(statusElement);
        }
    }

    // Clear existing ellipsis interval if any
    if (statusElement.dataset.ellipsisInterval) {
        clearInterval(parseInt(statusElement.dataset.ellipsisInterval));
        delete statusElement.dataset.ellipsisInterval;
    }

    statusElement.textContent = message;
    statusElement.className = ''; // Clear existing classes
    statusElement.classList.add('menu-status-message'); // Base class for styling

    // Add type-specific class for styling
    if (type === 'error') {
        statusElement.classList.add('menu-status-error');
    } else if (type === 'success') {
        statusElement.classList.add('menu-status-success');
    } else if (type === 'warning') {
        statusElement.classList.add('menu-status-warning');
    } else { // 'info' or other types
        statusElement.classList.add('menu-status-info');
    }

    // Apply specific effects if defined
    if (effect === 'wave') {
        delete statusElement.dataset.waveInitialized;
        applyWaveEffect(statusElement);
    } else if (effect === 'ellipsis') {
        let dots = 1;
        statusElement.textContent = message + '.';
        const intervalId = setInterval(() => {
            if (!document.body.contains(statusElement)) {
                clearInterval(intervalId);
                return;
            }
            dots = (dots % 3) + 1;
            statusElement.textContent = message + '.'.repeat(dots);
        }, 500);
        statusElement.dataset.ellipsisInterval = intervalId.toString();
    }
}
// Clear status helper
export function clearStatusDisplay() {
    if (!menuContainerElement) return;
    
    const clearEllipsis = (el) => {
        if (el && el.dataset.ellipsisInterval) {
            clearInterval(parseInt(el.dataset.ellipsisInterval));
            delete el.dataset.ellipsisInterval;
        }
    };

    const menuStatus = menuContainerElement.querySelector('#menu-status-message');
    if (menuStatus) {
        clearEllipsis(menuStatus);
        menuStatus.textContent = '';
        menuStatus.className = 'menu-status-message';
    }
}
// --- Status Display Function --- END ---

// Cleanup function to call onLeave for current menu
export function cleanupCurrentMenu() {
    if (currentMenuId) {
        const currentMenuConfig = menus[currentMenuId];
        if (currentMenuConfig && typeof currentMenuConfig.onLeave === 'function') {
            try {
                currentMenuConfig.onLeave();
            } catch (error) {
                console.error(`Error during onLeave cleanup for menu "${currentMenuId}":`, error);
            }
        }
        currentMenuId = null;
    }
}

// Re-apply header back button state based on the current menu configuration
export function refreshHeaderButtonsForCurrentMenu() {
    try {
        const isAuthenticated = currentAuthState && !currentAuthState.guest;
        const menuConfig = menus[currentMenuId];

        const isLoading = menuContainerElement && menuContainerElement.dataset.loading === 'true';

        // Centralized account button logic
        if (currentMenuId === 'account-menu' || isLoading || !currentMenuId) {
            updateAccountButtonVisibility(false);
        } else {
            updateAccountButtonVisibility(true, isAuthenticated);
        }

        // Re-run header collision check
        checkHeaderCollision();
    } catch (_) {}
}

// Exported function to initialize the menu
export function initializeMenu(containerElement, userState) {
    if (!containerElement) {
        console.error("Menu container element is required for initialization.");
        return;
    }
    menuContainerElement = containerElement;
    // Search for the title element *within* the provided container
    dynamicMenuTitleElement = containerElement.querySelector('#menu-text'); 
    currentAuthState = userState;         // Store the user authentication state

    // The new info.js module handles its own element creation.
    // No setup is needed here anymore.
    refreshInfoButtonPosition();

    // Initial Render - Start with the main menu (assuming it's registered)
    if (menus['dashboard-menu']) {
         renderMenu('dashboard-menu');
    } else {
        console.error("Main menu configuration not found. Ensure main-menu.js is imported before initialization.");
        menuContainerElement.innerHTML = SYSTEM.MENU.ERRORS.MAIN_NOT_LOADED;
        if (dynamicMenuTitleElement) dynamicMenuTitleElement.textContent = SYSTEM.STATUS.ERROR;
    }

    // Event Listener using Delegation - Attach to a higher-level static element (#console-container)
    // Ensure listener is only added once
    const siteContainer = document.getElementById('console-container');
    if (siteContainer && !siteContainer.dataset.listenerAttached) {
        siteContainer.dataset.listenerAttached = 'true'; // Mark as attached

        // --- Main Click Handler ---
        siteContainer.addEventListener('click', async (event) => {
            const target = event.target;
            
            // Throttling to prevent double-clicks or rapid event firing
            if (siteContainer.dataset.actionInFlight === 'true') {
                console.log("[Menu] Action already in flight, ignoring click.");
                return;
            }

            // Account button clicks are now handled differently:
            // - If text is 'authenticate', main.js listener handles it.
            // - If text is 'account', it has data-target-menu, so this listener handles it.
            if (target.id === 'account-button' && target.dataset.targetMenu) {
                 siteContainer.dataset.actionInFlight = 'true';
                 console.log(`Navigating to menu via account button: ${target.dataset.targetMenu}`);
                 try {
                     await renderMenu(target.dataset.targetMenu);
                 } finally {
                     delete siteContainer.dataset.actionInFlight;
                 }
                 return; // Handled
            }

            // Then handle dynamic menu item clicks (LI elements) using closest to support nested clicks/text nodes
            const li = (target && target.closest) ? target.closest('li') : null;
            if (!li) return;
            if (!li.dataset.targetMenu && !li.dataset.action) return;

            const targetMenu = li.dataset.targetMenu;
            const action = li.dataset.action;
            
            if (targetMenu) {
                // Set lock to prevent rapid navigation/event firing
                siteContainer.dataset.actionInFlight = 'true';

                // Clear status before navigating to a new menu
                try { clearStatusDisplay(); } catch (_) {}
                console.log(`Navigating to menu: ${targetMenu}`);
                
                // renderMenu is typically synchronous for state but might have async generator
                // We wrap it in a try-finally to ensure the lock is released
                try {
                    await renderMenu(targetMenu);
                } finally {
                    delete siteContainer.dataset.actionInFlight;
                }
            } else if (action) {
                // Set lock to prevent double-firing
                siteContainer.dataset.actionInFlight = 'true';

                // Construct params object by collecting all data attributes from the element
                const params = { ...li.dataset }; // Clone the dataset object
                
                // Pass other necessary context if needed by handlers
                params.renderMenu = renderMenu;
                params.updateStatusDisplay = updateStatusDisplay;
                params.menuContainer = menuContainerElement;
                params.menuTitle = dynamicMenuTitleElement;
                
                console.log(`Action triggered: ${action} with params:`, params);
                
                // Call the appropriate handler from the central registry
                const actionHandlers = getHandlers();
                if (actionHandlers[action]) {
                    let postActionCallback = null;

                    try {
                        let actionResult;

                        // --- Generic Loading UI ---
                        if (li.dataset.showLoading === 'true') {
                            // Pass a function that returns the promise, so startLoading controls execution timing
                            const workFn = () => actionHandlers[action](params);
                            
                            // startLoading handles UI, back-handler, and racing
                            actionResult = await startLoading(workFn);
                        } else {
                            // Non-loading action
                            clearStatusDisplay();
                            actionResult = await actionHandlers[action](params);
                        }

                        // The Pure Ballet Handoff: Handle the result once, regardless of how it was fetched
                        if (typeof actionResult === 'function') {
                            postActionCallback = actionResult;
                        } else if (actionResult && actionResult.handled) {
                            // Action handled its own UI/navigation (e.g. TaskOrchestrator)
                            console.log(`[Menu] Action '${action}' handled internally.`);
                        } else if (actionResult && typeof actionResult === 'string') {
                            params.nextMenuTarget = actionResult;
                        } else if (actionResult && typeof actionResult === 'object') {
                            // Dynamic menu config object
                            params.nextMenuTarget = actionResult;
                        }

                    } catch (error) {
                        const isCancellation = error.message === SYSTEM.ERRORS.USER_CANCELLED;
                        if (isCancellation) {
                            const previousMenuId = menuContainerElement.dataset.previousMenu;
                            if (previousMenuId) {
                                // The Ballet: Store the target to render AFTER the finally block pops the handler
                                params.nextMenuTarget = previousMenuId;
                            }
                        } else if (error.id === BILLING.ERRORS.PROJECT_NOT_INITIALIZED_ID) {
                            updateStatusDisplay(DOMAINS.ERRORS.NO_DEPLOYMENTS_ACCESS, 'info');
                            
                            // The Ballet: Since we aren't auto-navigating away (to let the user read the message),
                            // we must push a back handler that restores the menu buttons. Otherwise, 'back' 
                            // would skip this menu entirely and go to the landing page.
                            const previousMenuId = menuContainerElement.dataset.previousMenu;
                            if (previousMenuId) {
                                pushBackHandler(() => renderMenu(previousMenuId));
                            }
                        } else {
                            console.error(`Error executing action "${action}":`, error);
                            const previousMenuId = menuContainerElement.dataset.previousMenu;
                            if (previousMenuId) {
                                // The Ballet: Store the target to render AFTER the finally block pops the handler
                                params.nextMenuTarget = previousMenuId;
                            }
                        }
                    } finally {
                        // Release the lock
                        delete siteContainer.dataset.actionInFlight;

                        // The Pure Ballet Handoff: If the action returned a callback, 
                        // execute it NOW that the loading handler is gone and the stage is clean.
                        if (postActionCallback) {
                            console.log(`[Menu] Executing post-action callback for '${action}'`);
                            postActionCallback();
                        }

                        // The Ballet: If the action returned a menu target, render it NOW 
                        // that the loading handler has been popped and the stack is clean.
                        if (params.nextMenuTarget) {
                            const targetLog = typeof params.nextMenuTarget === 'string' 
                                ? params.nextMenuTarget 
                                : (params.nextMenuTarget.id || 'dynamic-config');
                            console.log(`[Menu] Rendering nextMenuTarget: ${targetLog}`);
                            renderMenu(params.nextMenuTarget);
                        }
                        
                        // Ensure info button visibility is updated after action completion
                        refreshInfoButtonPosition();
                    }
                } else {
                    // Release lock if no handler found
                    delete siteContainer.dataset.actionInFlight;
                    console.warn(`No handler found for action: ${action}`);
                }
            }
        });
    }
}

