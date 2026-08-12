import { fetchWithAuth } from '/js/main.js';
import { CONFIG } from '/js/config.js';

const API_BASE_URL = CONFIG.API_BASE_URL;
import { getUser, clearPendingReauthAction } from '/js/scripts/authenticate.js';
import { BILLING, SYSTEM, DOMAINS } from '../strings.js';
import { checkDomainAvailability as apiCheckDomainAvailability } from '/js/scripts/api.js';
import { openPopup } from '/js/scripts/popup.js';
import { pushBackHandler, popBackHandler, shelveStack, unshelveStack } from '/js/scripts/back.js';
import { refreshInfoButtonPosition } from '/js/scripts/info.js';

// --- Prompt Mode Management ---

/**
 * Enters prompt mode: dims the background and prepares for the prompt UI.
 * @param {object} [options={}] - Options for entering prompt mode.
 * @param {boolean} [options.dim=true] - Whether to apply the dimming effect.
 */
function _enterPromptMode(options = {}) {
    const { dim = true } = options;
    document.body.classList.add('prompt-active', 'prompt-overlay-active');
    if (!dim) {
        document.body.classList.add('prompt-no-dim');
    }
    document.documentElement.classList.add('prompt-overlay-active');

    // Hide any active tutorials when a prompt appears
    try {
        import('/js/scripts/tutorial.js').then(m => m.hideTutorial());
    } catch (_) {}

    // Refresh info button position for the new prompt
    try {
        import('/js/scripts/info.js').then(m => m.refreshInfoButtonPosition());
    } catch (_) {}
}

/**
 * Exits prompt mode: restores the background and cleans up body classes.
 */
function _exitPromptMode() {
    document.body.classList.remove('prompt-active', 'prompt-overlay-active', 'prompt-no-dim');
    document.documentElement.classList.remove('prompt-overlay-active');
    
    // Refresh info button position after prompt is gone
    try {
        import('/js/scripts/info.js').then(m => m.refreshInfoButtonPosition());
    } catch (_) {}
}


let isPrompting = false;
let isStackProcessing = false;
let promptStack = [];
let activePromptStack = []; // Track prompts that are currently "underneath" the active one
let currentResolve = null; 
let currentInternalResolve = null; 
let debounceTimer;
let currentPromptConfig = {};
let embeddedCheckoutRef = null; // Track active Stripe Embedded Checkout

document.addEventListener('DOMContentLoaded', () => {
});

function _debounce(func, delay) {
    return function(...args) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
}

// Safely decode possible HTML entities then allow only specific simple tags
function _decodeHtmlEntities(str) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
}

function _sanitizeAllowedInlineHtml(html) {
    const container = document.createElement('div');
    container.innerHTML = html;
    // Remove all tags except span
    const all = container.querySelectorAll('*');
    all.forEach(el => {
        if (el.tagName.toLowerCase() !== 'span') {
            el.replaceWith(document.createTextNode(el.textContent));
        } else {
            // Whitelist only style color on span
            const color = el.style && el.style.color ? el.style.color : '';
            el.removeAttribute('style');
            if (color) el.style.color = color;
        }
    });
    return container.innerHTML;
}

// REMOVED handleDomainPurchase 

async function _handleDomainAvailabilityCheck(domainName, inputElement, priceDisplay, buttonWrapper, resolve) {
    console.log(`[Domain Check] Checking availability for: ${domainName}`);
    const user = getUser();
    if (!user || !user.token) {
        console.error("[Domain Check] User not authenticated.");
        return;
    }

    inputElement.classList.remove('prompt-input-available', 'prompt-input-unavailable', 'prompt-input-checking');
    priceDisplay.style.display = 'none';
    priceDisplay.style.color = '';
    const existingPurchaseButton = buttonWrapper.querySelector('.prompt-purchase-button');
    if (existingPurchaseButton) existingPurchaseButton.remove();

    if (!domainName) {
        return;
    }

    inputElement.classList.add('prompt-input-checking');

    try {
        const apiResult = await apiCheckDomainAvailability({ domainName, token: user.token });
        if (!apiResult.ok) throw new Error(apiResult.error || SYSTEM.ERRORS.SERVER_RETURNED(apiResult.status));

        const result = apiResult.result;
        console.log("[Domain Check] Received result:", result);

        if (result.availability === 'AVAILABLE') {
            inputElement.classList.add('prompt-input-available');

            // Privacy logic removed. We now just show the purchase button.
            const purchaseButton = document.createElement('button');
            purchaseButton.textContent = DOMAINS.LABELS.YEARLY_PRICE(result.price);
            purchaseButton.className = 'prompt-button prompt-purchase-button';
            purchaseButton.onclick = () => {
                // Shadow Confirmation: We don't call prompt() here because it would push a new back handler
                // and trigger the stack restoration logic, which causes "ghosting" on back.
                // Instead, we just swap the content of the current prompt locally.
                const promptContentWrapper = inputElement.closest('.prompt-content-wrapper');
                if (!promptContentWrapper) return;

                const originalContent = promptContentWrapper.innerHTML;
                
                // 1. Clear and show "Are you sure?" locally
                promptContentWrapper.innerHTML = `
                    <p class="prompt-text">${BILLING.PROMPTS.PURCHASE_CONFIRM(domainName).text}</p>
                    <div class="prompt-form-row" style="justify-content: center; align-items: center;">
                        <div style="display: flex; gap: 10px; flex: 0 1 auto;">
                            <button class="prompt-option-button shadow-confirm-yes">${SYSTEM.LABELS.YES}</button>
                            <button class="prompt-option-button shadow-confirm-no">${SYSTEM.LABELS.NO}</button>
                        </div>
                    </div>
                `;

                // 2. Handle "Yes" -> Resolve the parent prompt immediately
                promptContentWrapper.querySelector('.shadow-confirm-yes').onclick = () => {
                    if (resolve) {
                        resolve({ 
                            status: 'answered', 
                            value: { domainName, price: result.price } 
                        });
                    }
                };

                // 3. Handle "No" -> Restore the original domain input UI
                promptContentWrapper.querySelector('.shadow-confirm-no').onclick = () => {
                    promptContentWrapper.innerHTML = '';
                    // Re-render the original prompt text
                    const promptTextElement = document.createElement('p');
                    promptTextElement.innerHTML = DOMAINS.PROMPTS.REGISTRATION_LOOKUP.text;
                    promptTextElement.className = 'prompt-text';
                    promptContentWrapper.appendChild(promptTextElement);
                    
                    // Re-create the domain input UI
                    _createDomainInput(promptContentWrapper, { id: 'domain_name_input' }, resolve);
                    
                    // Restore the value if possible
                    const newInput = promptContentWrapper.querySelector('.prompt-input-text');
                    if (newInput) {
                        newInput.value = domainName;
                        // Trigger a check immediately to show the purchase button again
                        _handleDomainAvailabilityCheck(domainName, newInput, 
                            promptContentWrapper.querySelector('.prompt-price'), 
                            promptContentWrapper.querySelector('#prompt-button-wrapper'), 
                            resolve);
                    }
                };
            };
            buttonWrapper.appendChild(purchaseButton);
        } else {
            inputElement.classList.add('prompt-input-unavailable');
            priceDisplay.textContent = result.availability === 'INVALID' ? SYSTEM.LABELS.NOPE : SYSTEM.LABELS.UNAVAILABLE;
            priceDisplay.style.color = '#e53935';
            priceDisplay.style.display = 'block';
        }
    } catch (error) {
        console.error("[Domain Check] Error:", error);
        inputElement.classList.add('prompt-input-unavailable');
        priceDisplay.style.display = 'none';
    } finally {
        inputElement.classList.remove('prompt-input-checking');
    }
}

/**
 * Cleans up the prompt UI, hiding the prompt and showing the console.
 */
function _cleanupPromptUI() {
    // If there are more prompts waiting or an active prompt stack to restore, 
    // do not tear down the UI to avoid flashing.
    // However, if we are in the middle of clearing the stack, we should proceed
    // ONLY if the stack is truly empty and no setup is happening.
    if ((promptStack.length > 0 || activePromptStack.length > 0) && !window.__clearingPromptStack) {
        console.log("[Prompt] _cleanupPromptUI: Stack not empty, skipping cleanup to avoid flicker.");
        return;
    }

    if (isStackProcessing) {
        console.log("[Prompt] _cleanupPromptUI: Stack processing, skipping cleanup.");
        return;
    }

    console.log("[Prompt] _cleanupPromptUI: Cleaning up UI.");

    // Destroy Stripe instance if it exists
    if (embeddedCheckoutRef && typeof embeddedCheckoutRef.destroy === 'function') {
        console.log('[Prompt] Destroying Stripe Embedded Checkout instance.');
        embeddedCheckoutRef.destroy();
    }
    embeddedCheckoutRef = null;

    const promptContainer = document.getElementById('prompt-container');
    if (promptContainer) {
        // Remove resize listeners if attached
        try {
            if (promptContainer.__updateHeightHandler) {
                window.removeEventListener('resize', promptContainer.__updateHeightHandler);
                if (window.visualViewport && promptContainer.__vvHandlerAttached) {
                    window.visualViewport.removeEventListener('resize', promptContainer.__updateHeightHandler);
                    window.visualViewport.removeEventListener('scroll', promptContainer.__updateHeightHandler);
                }
                delete promptContainer.__updateHeightHandler;
                delete promptContainer.__vvHandlerAttached;
            }
        } catch (_) {}
        promptContainer.remove();
    }
    
    _exitPromptMode();
    isPrompting = false; 
    currentResolve = null;
    currentPromptConfig = {};
}
/**
 * Forcefully cancels an active prompt and cleans up the UI.
 * @param {string} [source='programmatic'] - The source of the cancellation ('backbutton' or 'programmatic').
 */
function _cancelCurrentPrompt(source = 'programmatic') {
    // When a prompt is cancelled, we must also clear any pending re-auth action
    // that might have triggered it. This prevents unexpected actions later.
    clearPendingReauthAction();

    if (isPrompting && currentInternalResolve) {
        console.log(`[Prompt] Forcefully cancelling active prompt (Source: ${source}).`);
        const internalResolve = currentInternalResolve;
        currentInternalResolve = null; // Prevent double resolution
        internalResolve({ status: 'canceled', value: null, source });
    } else {
        _cleanupPromptUI();
    }
}

export function clearPromptStack() {
    console.log('[Prompt] Clearing prompt stack.');
    window.__clearingPromptStack = true;
    try {
        // 1. Cancel the current active prompt if it exists.
        // This will trigger its cleanup and scheduling of the next (which will be empty).
        if (isPrompting && currentResolve) {
            console.log(`[Prompt] clearPromptStack: Cancelling current active prompt '${currentPromptConfig.id || 'unnamed'}'`);
            _cancelCurrentPrompt('programmatic');
        }

        // 2. Resolve all waiting prompts as cancelled and pop their handlers
        promptStack.forEach(item => {
            if (item.ownsBackHandler) {
                console.log(`[Prompt] clearPromptStack: Popping back handler for waiting prompt '${item.config.id || 'unnamed'}'`);
                try { popBackHandler(); } catch (_) {}
                item.ownsBackHandler = false;
            }
            if (item.resolve) {
                item.resolve({ status: 'canceled', value: null });
            }
        });
        promptStack = [];
        
        // 3. Resolve all active prompts underneath as cancelled and pop their handlers
        activePromptStack.forEach(item => {
            if (item.ownsBackHandler) {
                console.log(`[Prompt] clearPromptStack: Popping back handler for shelved prompt '${item.config.id || 'unnamed'}'`);
                try { popBackHandler(); } catch (_) {}
                item.ownsBackHandler = false;
            }
            if (item.resolve) {
                item.resolve({ status: 'canceled', value: null });
            }
        });
        activePromptStack = [];

        // 4. Force a final UI cleanup check. 
        // We defer this slightly to allow any pending microtasks (like _processStack) to finish.
        setTimeout(_cleanupPromptUI, 0);
    } finally {
        window.__clearingPromptStack = false;
    }
}

/**
 * Programmatically dismisses the current active prompt if its ID matches.
 * @param {string} id - The ID of the prompt to dismiss.
 */
export function dismissPrompt(id) {
    if (isPrompting && currentPromptConfig && currentPromptConfig.id === id) {
        console.log(`[Prompt] Programmatically dismissing prompt: ${id}`);
        _cancelCurrentPrompt('programmatic');
        return true;
    }
    return false;
}

function _handlePromptResolution(result, resolve, ownsBackHandler, config) {
    console.log(`[Prompt] _handlePromptResolution for '${config.id || 'unnamed'}' with status: ${result.status}, source: ${result.source}`);
    
    // If this prompt was replaced, its back handler has already been finished off 
    // by the prompt() function that initiated the replacement. We must NOT pop it again
    // here, as that would accidentally pop the back handler of the NEW replacement prompt.
    // However, we MUST resolve the promise so the caller can continue.
    if (result.source === 'replaced') {
        if (resolve) resolve(result);
        return;
    }

    // Restore the shelved stack immediately if it was hidden for THIS prompt.
    if (config.hideBackButton) {
        console.log(`[Prompt] _handlePromptResolution: Unshelving back stack for '${config.id || 'unnamed'}'`);
        unshelveStack();
    }

    // The Ballet: If the user clicked a button (answered) or the prompt was 
    // cancelled programmatically (status: canceled, but NOT via back button), we pop the handler.
    // If it was already popped by the back button, result.source will be 'backbutton'.
    const shouldPop = (result.status === 'answered' || (result.status === 'canceled' && result.source !== 'backbutton'));
    if (shouldPop && ownsBackHandler) {
        console.log(`[Prompt] _handlePromptResolution: Popping back handler for '${config.id || 'unnamed'}'`);
        try { popBackHandler(); } catch (_) {}
    }

    // Clear current state ONLY if we are still the active prompt resolving
    if (currentResolve === resolve) {
        currentResolve = null;
        currentPromptConfig = {};
        currentInternalResolve = null;
        isPrompting = false;
    }

    // IMMEDIATELY call _processStack synchronously.
    // This restores the shelved prompt (if any) so that isPrompting becomes true again.
    if (!window.__clearingPromptStack) {
        _processStack();
    }

    if (resolve) {
        console.log(`[Prompt] _handlePromptResolution: Resolving promise for '${config.id || 'unnamed'}'`);
        resolve(result);
    }
}

export function prompt(promptConfig) {
    if (promptConfig.replace) {
        return new Promise(resolve => {
            let oldWasHidden = false;

            // 1. If something is active, kill it synchronously
            if (isPrompting && currentInternalResolve) {
                console.log(`[Prompt] Replace: Killing active prompt '${currentPromptConfig.id || 'unnamed'}'`);
                const internalResolve = currentInternalResolve;
                const ownsBackHandler = currentPromptConfig.ownsBackHandler;
                oldWasHidden = !!currentPromptConfig.hideBackButton;
                currentInternalResolve = null; // Prevent double resolution
                if (ownsBackHandler) {
                    try { popBackHandler(); } catch (_) {}
                }
                internalResolve({ status: 'canceled', value: null, source: 'replaced' });
            }

            // 2. Set up state for the new replacement prompt
            let ownsBackHandler = false;

            // Manage the BackStack shelf during replacement to avoid double-shelving or ghosting
            if (promptConfig.hideBackButton && !oldWasHidden) {
                shelveStack();
            } else if (!promptConfig.hideBackButton && oldWasHidden) {
                unshelveStack();
            }

            if (!promptConfig.noBackHandler && !promptConfig.hideBackButton) {
                ownsBackHandler = true;
                pushBackHandler(() => {
                    _cancelCurrentPrompt('backbutton');
                });
            }

            currentResolve = resolve;
            currentPromptConfig = { ...promptConfig, ownsBackHandler };
            isPrompting = true;

            // 3. Show the UI and handle its resolution
            _showActualPrompt(promptConfig).then(result => {
                _handlePromptResolution(result, resolve, ownsBackHandler, promptConfig);
            });
        });
    }

    return new Promise(resolve => {
        let ownsBackHandler = false;

        // If the prompt should hide the back button, we shelve the current stack.
        // This ensures the button is hidden and no handlers are active during the prompt.
        if (promptConfig.hideBackButton) {
            shelveStack();
        }

        // The Ballet: A prompt pushes its back handler exactly ONCE when it is created.
        // This handler remains on the stack even if the prompt is interrupted by a sub-prompt.
        // If the back button is hidden, we skip this entirely.
        if (!promptConfig.noBackHandler && !promptConfig.hideBackButton) {
            ownsBackHandler = true;
            pushBackHandler(() => {
                console.log(`[Prompt] Back handler fired for '${promptConfig.id || 'unnamed'}'`);
                console.log(`Prompt '${promptConfig.id || 'unnamed'}' cancelled via back button`);
                _cancelCurrentPrompt('backbutton');
            });
        }

        promptStack.push({ config: promptConfig, resolve, ownsBackHandler });
        _processStack();
    });
}

function _processStack() {
    console.log(`[Prompt] _processStack called. promptStack size: ${promptStack.length}, activePromptStack size: ${activePromptStack.length}, isPrompting: ${isPrompting}, isStackProcessing: ${isStackProcessing}`);
    // If we're already setting up a prompt, wait for it to finish its setup phase.
    if (isStackProcessing) {
        console.log("[Prompt] _processStack: Already processing, returning.");
        return;
    }
    
    if (promptStack.length === 0) {
        // If we have an active prompt stack and no new prompts, restore the previous prompt
        if (!isPrompting && activePromptStack.length > 0) {
            const previous = activePromptStack.pop();
            console.log(`[Prompt] _processStack: Restoring previous prompt '${previous.config.id || 'unnamed'}' to promptStack`);
            promptStack.push(previous);
            // Fall through to start processing
        } else {
            // Nothing to do
            if (!isPrompting) {
                console.log("[Prompt] _processStack: Stack empty and not prompting, cleaning up.");
                _cleanupPromptUI();
            }
            return;
        }
    }

    isStackProcessing = true;

    // If there's an existing prompt being shown, push it to the activePromptStack
    if (currentResolve && currentPromptConfig) {
        console.log(`[Prompt] _processStack: Shelving current prompt '${currentPromptConfig.id || 'unnamed'}' to activePromptStack`);
        activePromptStack.push({ 
            config: currentPromptConfig, 
            resolve: currentResolve, 
            ownsBackHandler: currentPromptConfig.ownsBackHandler 
        });
        currentResolve = null;
        currentPromptConfig = null;
    }

    const item = promptStack.pop();
    const { config, resolve, ownsBackHandler } = item;
    console.log(`[Prompt] _processStack: Showing prompt '${config.id || 'unnamed'}'`);
    currentResolve = resolve;
    currentPromptConfig = { ...config, ownsBackHandler };
    isPrompting = true;

    _showActualPrompt(config).then(result => {
        _handlePromptResolution(result, resolve, ownsBackHandler, config);
    });

    // The setup phase (DOM creation) is synchronous in _showActualPrompt until it returns the promise.
    isStackProcessing = false; 
}


function _createDomainInput(container, promptConfig, resolve) {
    const { context } = promptConfig;
            const inputContainer = document.createElement('div');
                inputContainer.className = 'prompt-input-container';

            const inputElement = document.createElement('input');
            inputElement.type = 'text';
            inputElement.className = 'prompt-input-text';
    inputElement.id = `prompt-input-domain_registration`;
            inputContainer.appendChild(inputElement);

                const rightSideContainer = document.createElement('div');
                rightSideContainer.className = 'prompt-input-right';
                inputContainer.appendChild(rightSideContainer);

                const priceDisplay = document.createElement('div');
                priceDisplay.id = 'prompt-price-display';
                priceDisplay.className = 'prompt-price';
                priceDisplay.style.display = 'none';
                rightSideContainer.appendChild(priceDisplay);

                const buttonWrapper = document.createElement('div');
                buttonWrapper.id = 'prompt-button-wrapper';
                rightSideContainer.appendChild(buttonWrapper);

    const debouncedCheck = _debounce((domain) => {
        _handleDomainAvailabilityCheck(domain, inputElement, priceDisplay, buttonWrapper, resolve);
    }, 500);

    inputElement.addEventListener('input', () => debouncedCheck(inputElement.value));
    
    container.appendChild(inputContainer);
    setTimeout(() => inputElement.focus(), 0);
}

function _handleEmbeddedCheckoutPrompt(promptContentWrapper, promptConfig, resolve) {
            const container = document.createElement('div');
            container.id = 'embedded-checkout-container';
            container.className = 'embedded-checkout-container';
            if (promptContentWrapper && promptContentWrapper.style) {
                promptContentWrapper.style.background = '#fff';
                promptContentWrapper.style.color = '#000';
                promptContentWrapper.style.borderRadius = '10px';
            }
            container.style.background = '#fff';
            container.style.color = '#000';
            container.style.padding = '12px';
            container.style.borderRadius = '8px';
            container.style.width = '100%';
            container.style.minHeight = '60vh';
            container.style.height = '';
            container.style.maxHeight = 'none';
            container.style.overflowY = 'visible';
            container.style.flex = '0 0 auto';
            promptContentWrapper.appendChild(container);

            (async () => {
                try {
                    try { document.body.classList.add('prompt-no-dim'); } catch (_) {}
                    if (!window.Stripe) {
                        console.error(BILLING.ERRORS.STRIPE_NOT_LOADED);
                        return;
                    }
                    const user = getUser();
            if (!user || !user.token) throw new Error(DOMAINS.ERRORS.AUTH_REQUIRED);

                    let clientSecret = promptConfig.client_secret;
                    if (!clientSecret) {
                        const resp = await fetchWithAuth(`${API_BASE_URL}/create-checkout-session`, {
                            method: 'POST',
                            body: { embedded: true }
                        });
                        const data = await resp.json();
                        if (!resp.ok || !data.client_secret) throw new Error(BILLING.ERRORS.START_CHECKOUT_FAILED(data.error || ''));
                        clientSecret = data.client_secret;
                    }

                    const cfgResp = await fetch(`${API_BASE_URL}/stripe-config`);
                    if (!cfgResp.ok) throw new Error(BILLING.ERRORS.PAYMENT_CONFIG_FAILED);
                    const cfg = await cfgResp.json();
                    const publishableKey = cfg && cfg.stripePublishableKey;
                    if (!publishableKey) throw new Error(BILLING.ERRORS.MISSING_PUBLISHABLE_KEY);

                    const stripeInstance = window.Stripe(publishableKey);

                    if (embeddedCheckoutRef && typeof embeddedCheckoutRef.destroy === 'function') {
                        embeddedCheckoutRef.destroy();
                    }

                    const checkout = await stripeInstance.initEmbeddedCheckout({ 
                        clientSecret,
                        onComplete: () => {
                            console.log('[Stripe] Checkout completed successfully (onComplete).');
                            // Resolve immediately to let the caller (subscription.js) proceed
                            if (resolve) {
                                resolve({ status: 'answered', value: 'completed' });
                            }
                        }
                    });
                    embeddedCheckoutRef = checkout;
                    checkout.mount('#embedded-checkout-container');

                    const applyIframeStyles = () => {
                        const iframe = container.querySelector('iframe');
                        if (iframe) {
                            iframe.style.width = '100%';
                            iframe.style.height = '';
                            iframe.style.minHeight = '';
                            iframe.style.border = '0';
                            try { iframe.style.touchAction = 'manipulation'; } catch (_) {}
                            try { iframe.style.webkitOverflowScrolling = 'touch'; } catch (_) {}
                        }
                    };
                    applyIframeStyles();
                    const checkoutObserver = new MutationObserver(applyIframeStyles);
                    checkoutObserver.observe(container, { childList: true, subtree: true });

                    const observer = new MutationObserver(() => {
                        const mounted = document.getElementById('embedded-checkout-container');
                        if (!mounted) {
                            observer.disconnect();
                            // If the container was removed but we didn't resolve via onComplete,
                            // it's a cancellation.
                            if (resolve) resolve({ status: 'canceled', value: null });
                        }
                    });
                    observer.observe(container, { childList: true });

                } catch (err) {
                    console.error('Embedded checkout error:', err);
                    if (resolve) resolve({ status: 'canceled', value: null });
                        if (embeddedCheckoutRef && typeof embeddedCheckoutRef.destroy === 'function') {
                            embeddedCheckoutRef.destroy();
                        }
                    embeddedCheckoutRef = null;
                    try { document.body.classList.remove('prompt-no-dim'); } catch (_) {}
                }
            })();
        }

function _handleDomainPrompt(promptContentWrapper, promptConfig, resolve) {
    _createDomainInput(promptContentWrapper, promptConfig, resolve);
}

function _handleFormPrompt(promptContentWrapper, promptConfig, resolve) {
    const form = document.createElement('form');
    form.className = 'prompt-form';

    const validationRules = [];

    // Helper to render a single item/block
    const renderItem = (item, container) => {
        if (item.type === 'row') {
            const row = document.createElement('div');
            row.className = 'prompt-form-row';
            (item.items || []).forEach(subItem => renderItem(subItem, row));
            container.appendChild(row);
            return;
        }

        const itemContainer = document.createElement('div');
        itemContainer.className = 'prompt-form-item';
        if (item.className) itemContainer.classList.add(item.className);

        if (item.label) {
            const label = document.createElement('label');
            label.textContent = item.label;
            label.htmlFor = `prompt-input-${item.id}`;
            itemContainer.appendChild(label);
        }

        if (item.type === 'select') {
            const select = document.createElement('select');
            select.id = `prompt-input-${item.id}`;
            select.name = item.id;
            if (item.tooltip) select.dataset.tooltipText = item.tooltip;
            if (item.width) {
                itemContainer.style.flex = '0 0 auto';
                itemContainer.style.width = item.width;
            }
            (item.options || []).forEach(opt => {
                const option = document.createElement('option');
                option.value = typeof opt === 'object' ? opt.value : opt;
                option.textContent = typeof opt === 'object' ? opt.label : opt;
                select.appendChild(option);
            });
            itemContainer.appendChild(select);
        } else if (item.type === 'text' || !item.type) {
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `prompt-input-${item.id}`;
            input.name = item.id;
            input.className = 'prompt-input-text';
            if (item.tooltip) input.dataset.tooltipText = item.tooltip;
            if (item.placeholder) input.placeholder = item.placeholder;
            if (item.value) input.value = item.value;
            if (item.width) {
                itemContainer.style.flex = '0 0 auto';
                itemContainer.style.width = item.width;
            }
            itemContainer.appendChild(input);

            // Validation logic
            if (item.validationRegex) {
                const errorElement = document.createElement('div');
                errorElement.className = 'prompt-validation-error';
                errorElement.style.display = 'none';
                errorElement.style.color = '#e53935';
                errorElement.style.fontSize = '0.8em';
                errorElement.style.marginTop = '4px';
                errorElement.textContent = item.validationError || SYSTEM.ERRORS.INVALID_INPUT;
                itemContainer.appendChild(errorElement);

                const validate = () => {
                    const regex = new RegExp(item.validationRegex);
                    const isValid = regex.test(input.value);
                    if (isValid || !input.value) {
                        errorElement.style.display = 'none';
                        input.classList.remove('prompt-input-unavailable');
                        return true;
                    } else {
                        errorElement.style.display = 'block';
                        input.classList.add('prompt-input-unavailable');
                        return false;
                    }
                };

                input.addEventListener('input', validate);
                validationRules.push({ input, validate });
            }
        } else if (item.type === 'header') {
            const header = document.createElement('p');
            header.className = 'prompt-text';
            header.innerHTML = item.text;
            itemContainer.appendChild(header);
        } else if (item.type === 'record') {
            const record = document.createElement('div');
            record.className = 'record'; // Use shared record styling
            if (item.className) record.classList.add(item.className);
            record.innerHTML = item.text;
            if (item.tooltip) record.dataset.tooltipText = item.tooltip;

            if (item.value !== undefined) {
                record.classList.add('actionable');
                record.onclick = () => {
                    resolve({ status: 'answered', value: item.value });
                };
            }

            itemContainer.appendChild(record);
        } else if (item.type === 'switcher') {
            const switcherContainer = document.createElement('div');
            switcherContainer.className = 'prompt-switcher';
            
            const tabRow = document.createElement('div');
            tabRow.className = 'prompt-form-row';
            
            const codeBox = document.createElement('pre');
            codeBox.className = 'prompt-code-box';
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'prompt-code-copy';
            copyBtn.innerHTML = SYSTEM.LABELS.COPY;
            
            const updateTab = (activeTab, labelEl) => {
                codeBox.textContent = activeTab.content;
                codeBox.appendChild(copyBtn);
                
                // Update active states on tab elements
                tabRow.querySelectorAll('.prompt-tab-label').forEach(el => {
                    el.classList.remove('active');
                });
                labelEl.classList.add('active');
            };

            copyBtn.onclick = (e) => {
                e.preventDefault();
                navigator.clipboard.writeText(codeBox.textContent.replace(SYSTEM.LABELS.COPY, '').trim());
                copyBtn.innerHTML = SYSTEM.LABELS.COPIED;
                setTimeout(() => { copyBtn.innerHTML = SYSTEM.LABELS.COPY; }, 2000);
            };

            (item.tabs || []).forEach((tab, index) => {
                const tabItem = document.createElement('div');
                tabItem.className = 'prompt-form-item';
                
                if (tab.type === 'button') {
                    tabItem.classList.add('prompt-tab-item--right');
                    const button = document.createElement('button');
                    button.textContent = tab.label;
                    button.className = 'prompt-tab-button';
                    if (tab.onclick) {
                        button.onclick = (e) => {
                            e.preventDefault();
                            tab.onclick(e);
                        };
                    }
                    tabItem.appendChild(button);
                } else {
                    const label = document.createElement('label');
                    label.textContent = tab.label;
                    label.className = 'prompt-tab-label';
                    
                    if (tab.content) {
                        label.onclick = () => updateTab(tab, label);
                        // Set initial tab
                        if (!tabRow.querySelector('.prompt-tab-label.active')) {
                            updateTab(tab, label);
                        }
                    } else {
                        label.classList.add('static');
                    }
                    
                    tabItem.appendChild(label);
                }
                
                tabRow.appendChild(tabItem);
            });

            switcherContainer.appendChild(tabRow);
            switcherContainer.appendChild(codeBox);
            itemContainer.appendChild(switcherContainer);
        }

        container.appendChild(itemContainer);
    };

    // Render all top-level items
    (promptConfig.items || []).forEach(item => renderItem(item, form));

    // Render buttons/actions
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'prompt-options-container';

    // Check if any button requires wrapping
    const hasWrappingButton = (promptConfig.buttons || []).some(b => 
        b.wrapText || (b.type === 'row' && (b.items || []).some(si => si.wrapText))
    );
    if (hasWrappingButton) {
        buttonContainer.classList.add('prompt-options-container--full-width');
    }
    
    const renderButton = (buttonConfig, container) => {
        if (buttonConfig.type === 'label') {
            const label = document.createElement('span');
            label.textContent = buttonConfig.label;
            label.style.opacity = '0.6';
            label.style.fontSize = '0.8em';
            label.style.marginRight = '5px';
            label.style.alignSelf = 'center';
            label.style.textTransform = 'lowercase';
            container.appendChild(label);
            return;
        }

        if (buttonConfig.type === 'record') {
            const record = document.createElement('div');
            record.className = 'record';
            if (buttonConfig.className) record.classList.add(buttonConfig.className);
            record.innerHTML = buttonConfig.text;
            if (buttonConfig.tooltip) record.dataset.tooltipText = buttonConfig.tooltip;
            
            if (buttonConfig.onclick) {
                record.classList.add('actionable');
                record.onclick = async (e) => {
                    await buttonConfig.onclick(e);
                };
            } else if (buttonConfig.value !== undefined) {
                record.classList.add('actionable');
                record.onclick = () => {
                    resolve({ status: 'answered', value: buttonConfig.value });
                };
            }
            container.appendChild(record);
            return;
        }

        if (buttonConfig.type === 'switcher') {
            const switcherContainer = document.createElement('div');
            switcherContainer.className = 'prompt-switcher';
            
            const tabRow = document.createElement('div');
            tabRow.className = 'prompt-form-row';
            
            const codeBox = document.createElement('pre');
            codeBox.className = 'prompt-code-box';
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'prompt-code-copy';
            copyBtn.innerHTML = SYSTEM.LABELS.COPY;
            
            const updateTab = (activeTab, labelEl) => {
                codeBox.textContent = activeTab.content;
                codeBox.appendChild(copyBtn);
                
                // Update active states on tab elements
                tabRow.querySelectorAll('.prompt-tab-label').forEach(el => {
                    el.classList.remove('active');
                });
                labelEl.classList.add('active');
            };

            copyBtn.onclick = (e) => {
                e.preventDefault();
                navigator.clipboard.writeText(codeBox.textContent.replace(SYSTEM.LABELS.COPY, '').trim());
                copyBtn.innerHTML = SYSTEM.LABELS.COPIED;
                setTimeout(() => { copyBtn.innerHTML = SYSTEM.LABELS.COPY; }, 2000);
            };

            (buttonConfig.tabs || []).forEach((tab, index) => {
                const tabItem = document.createElement('div');
                tabItem.className = 'prompt-form-item';
                
                if (tab.type === 'button') {
                    tabItem.classList.add('prompt-tab-item--right');
                    const button = document.createElement('button');
                    button.textContent = tab.label;
                    button.className = 'prompt-tab-button';
                    if (tab.onclick) {
                        button.onclick = (e) => {
                            e.preventDefault();
                            tab.onclick(e);
                        };
                    }
                    tabItem.appendChild(button);
                } else {
                    const label = document.createElement('label');
                    label.textContent = tab.label;
                    label.className = 'prompt-tab-label';
                    
                    if (tab.content) {
                        label.onclick = () => updateTab(tab, label);
                        if (!tabRow.querySelector('.prompt-tab-label.active')) {
                            updateTab(tab, label);
                        }
                    } else {
                        label.classList.add('static');
                    }
                    
                    tabItem.appendChild(label);
                }
                
                tabRow.appendChild(tabItem);
            });

            switcherContainer.appendChild(tabRow);
            switcherContainer.appendChild(codeBox);
            container.appendChild(switcherContainer);
            return;
        }

        if (buttonConfig.type === 'group') {
            const group = document.createElement('div');
            group.className = 'prompt-group';
            
            if (buttonConfig.label) {
                const label = document.createElement('div');
                label.className = 'prompt-group-label';
                label.textContent = buttonConfig.label;
                group.appendChild(label);
            }

            const itemsContainer = document.createElement('div');
            itemsContainer.style.display = 'flex';
            itemsContainer.style.flexDirection = 'column';
            itemsContainer.style.gap = '10px';
            
            if (buttonConfig.justify === 'left') {
                itemsContainer.style.alignItems = 'flex-start';
                group.style.alignSelf = 'flex-start'; // Allow group itself to shift left if parent is flex
            } else {
                itemsContainer.style.alignItems = 'center';
            }
            
            (buttonConfig.items || []).forEach(item => renderButton(item, itemsContainer));
            group.appendChild(itemsContainer);
            container.appendChild(group);
            return;
        }

        if (buttonConfig.type === 'row') {
            const row = document.createElement('div');
            row.className = 'prompt-form-row';
            row.style.alignItems = 'center';
            
            if (buttonConfig.justify === 'left') {
                row.style.justifyContent = 'flex-start';
            } else {
                row.style.justifyContent = 'center'; // Default center buttons in groups
            }

            const buttonsWrapper = document.createElement('div');
            buttonsWrapper.style.display = 'flex';
            buttonsWrapper.style.gap = '10px';
            buttonsWrapper.style.flex = '0 1 auto'; // Don't force full width

            (buttonConfig.items || []).forEach(subItem => renderButton(subItem, buttonsWrapper));
            row.appendChild(buttonsWrapper);
            container.appendChild(row);
            return;
        }

        const button = document.createElement('button');
        button.textContent = buttonConfig.label;
        button.className = 'prompt-option-button';
        if (buttonConfig.wrapText) button.classList.add('prompt-option-button--wrap');
        if (buttonConfig.tooltip) button.dataset.tooltipText = buttonConfig.tooltip;
        if (buttonConfig.isSubmit) {
            button.type = 'submit';
        } else {
            button.type = 'button';
            button.onclick = async (e) => {
                if (typeof buttonConfig.onclick === 'function') {
                    await buttonConfig.onclick(e);
                    // If an onclick handler was provided, we do NOT resolve the parent prompt.
                    // This keeps the prompt (like a sync menu) active while the sub-action occurs.
                    return;
                }

                resolve({ status: 'answered', value: buttonConfig.value });
            };
        }
        container.appendChild(button);
    };

    (promptConfig.buttons || []).forEach(buttonConfig => renderButton(buttonConfig, buttonContainer));
    form.appendChild(buttonContainer);

    form.onsubmit = (e) => {
        e.preventDefault();

        // Run all validations
        let allValid = true;
        let firstInvalid = null;
        validationRules.forEach(rule => {
            if (!rule.validate()) {
                allValid = false;
                if (!firstInvalid) firstInvalid = rule.input;
            }
        });

        if (!allValid) {
            if (firstInvalid) firstInvalid.focus();
            return;
        }

        const formData = new FormData(form);
        const values = Object.fromEntries(formData.entries());
        resolve({ status: 'answered', value: values });
    };

    promptContentWrapper.appendChild(form);

    // Auto-focus the first input if it exists
    setTimeout(() => {
        const firstInput = form.querySelector('input, select');
        if (firstInput) firstInput.focus();
    }, 0);
}

const promptHandlers = {
    'embedded_checkout': _handleEmbeddedCheckoutPrompt,
    'domain': _handleDomainPrompt,
    'form': _handleFormPrompt,
};

function _showActualPrompt(promptConfig) {
    const { type } = promptConfig;
    // For embedded checkout, we enter prompt mode but without the dimming overlay.
    _enterPromptMode({ dim: type !== 'embedded_checkout' });

    // Recompute header height CSS var on open to avoid first-load mismatch
    try {
        const header = document.getElementById('header-container');
        if (header) {
            const h = header.getBoundingClientRect().height || 0;
            document.documentElement.style.setProperty('--header-height', `${Math.ceil(h)}px`);
        }
    } catch (_) {}
    
    return new Promise(resolve => {
        const { id, text, type, options, defaultValue, inputStatus, context, imageUrl } = promptConfig;

        // Capture the internal resolve function so programmatic cancellation
        // can trigger the full cleanup cycle in _processStack.
        currentInternalResolve = resolve;

        // Ensure a single overlay container exists without relying on a host wrapper
        let promptContainer = document.getElementById('prompt-container');
        if (!promptContainer) {
            promptContainer = document.createElement('div');
            promptContainer.id = 'prompt-container';
            document.body.appendChild(promptContainer);
        } else {
            // Clear previous contents
            promptContainer.innerHTML = '';
        }

        // Add class for styling based on type
        if (type === 'embedded_checkout') {
            promptContainer.classList.add('prompt-container--subscription');
        } else {
            promptContainer.classList.add('prompt-container--regular');
        }

        const promptContentWrapper = document.createElement('div');
        promptContentWrapper.className = 'prompt-content-wrapper';
        if (type === 'embedded_checkout') {
            promptContentWrapper.classList.add('prompt-content-wrapper--subscription');
        } else {
            promptContentWrapper.classList.add('prompt-content-wrapper--regular');
        }

        if (promptConfig.className) {
            promptContentWrapper.classList.add(promptConfig.className);
        }

        promptContainer.appendChild(promptContentWrapper);

        const promptTextElement = document.createElement('p');
        promptTextElement.innerHTML = text; // Use innerHTML to render the link
        promptTextElement.className = 'prompt-text'; // Add class for styling
        promptContentWrapper.appendChild(promptTextElement);

        if (imageUrl) {
            const imageElement = document.createElement('img');
            imageElement.src = imageUrl;
            imageElement.className = 'prompt-image';
            imageElement.style.maxWidth = '100%';
            imageElement.style.maxHeight = '200px';
            imageElement.style.margin = '10px 0';
            imageElement.style.objectFit = 'contain';
            promptContentWrapper.appendChild(imageElement);
        }

        try {
            const handler = promptHandlers[type];
            if (handler) {
                handler(promptContentWrapper, promptConfig, resolve);
            }

            if (promptConfig.onMount) {
                promptConfig.onMount(promptContentWrapper);
            }
            
            // Re-run the info button check now that content is (likely) in the DOM
            refreshInfoButtonPosition();
        } catch (error) {
            console.error("Error setting up prompt UI:", error);
            resolve({ status: 'canceled', value: null });
        }
    });
}
