import { menus, renderMenu, updateStatusDisplay, startLoading, showLoadingPrompt } from '/js/pages/menu.js';
import { registerHandler } from '../scripts/registry.js';
import { CONFIG } from '/js/config.js';
import { fetchWithAuth } from '/js/main.js';

const API_BASE_URL = CONFIG.API_BASE_URL;
import { pushBackHandler } from '/js/scripts/back.js';
import { prompt, dismissPrompt } from '/js/pages/prompt.js';
import { requireAuth } from '/js/scripts/authenticate.js';
import { BILLING, SYSTEM } from '../strings.js';

// Subscription polling state
let subscriptionPollingInterval = null;
let stripe = null;
let isOnSubscriptionPage = false;

// Initialize Stripe
export async function initializeStripe() {
    try {
        const response = await fetch(`${API_BASE_URL}/stripe-config`);
        if (!response.ok) {
            throw new Error(BILLING.ERRORS.STRIPE_CONFIG_FAILED);
        }
        const config = await response.json();
        const stripePublishableKey = config.stripePublishableKey;
        
        if (!stripePublishableKey) {
            throw new Error(BILLING.ERRORS.STRIPE_KEY_MISSING);
        }
        
        stripe = Stripe(stripePublishableKey);
        console.log("Stripe.js initialized successfully.");
    } catch (error) {
        console.error("Error initializing Stripe:", error);
        updateStatusDisplay(BILLING.ERRORS.PAYMENT_INIT_FAILED, "error");
    }
}

// Handle subscription checkout
export async function handleSubscribe(actionFn, params) {
    if (typeof actionFn === 'object' && !params) {
        params = actionFn;
        actionFn = params.actionFn;
    }

    const { promoCode } = params || {};
    
    const workFn = async () => {
        const isResume = String(params?.isResume) === 'true';
        const statusMsg = isResume ? BILLING.STATUS.RESUMING : BILLING.STATUS.LOADING;
        updateStatusDisplay(statusMsg, 'info');
        showLoadingPrompt(statusMsg);

        const body = { embedded: true };
        if (promoCode) body.promo_code = promoCode;

        const response = await fetchWithAuth(`${API_BASE_URL}/create-checkout-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            dismissPrompt('global-loading-prompt');
            const errorData = await response.json().catch(() => ({ error: SYSTEM.STATUS.GENERIC_ERROR }));
            throw new Error(errorData.error || BILLING.ERRORS.CREATE_SESSION_FAILED);
        }

        const session = await response.json();

        if (session && (session.resumed || session.already_active)) {
            // Keep the loading prompt up until status is fully refreshed
            await fetchSubscriptionStatus(params);
            dismissPrompt('global-loading-prompt');
            updateStatusDisplay(BILLING.STATUS.CLEAR, 'info');
            
            if (actionFn) return await actionFn({ ...params, session });
            return 'subscription-menu';
        }

        // Prefer embedded checkout; if client_secret missing, the prompt will request it
        const clientSecret = session && session.client_secret;

        // Replace the loading prompt with checkout
        const result = await prompt({ ...BILLING.PROMPTS.CHECKOUT_SUBSCRIPTION(clientSecret), replace: true });

        if (result.status !== 'answered' || result.value !== 'completed') {
            throw new Error(SYSTEM.ERRORS.USER_CANCELLED);
        }

        // After user returns from successful checkout, refresh status
        try {
            await fetchSubscriptionStatus(params);
        } catch (e) {
            if (e.message === 'ReauthInitiated') throw e;
            console.warn("[Subscription] Failed to refresh status after checkout:", e);
        }
        updateStatusDisplay(BILLING.STATUS.CLEAR, 'info');
        
        // If we were in a guard flow, resume the original action
        if (actionFn) {
            console.log("[Subscription] Checkout complete, resuming original action.");
            return await actionFn(params);
        }
        if (params && params.suppressMenuNav) return;
        return 'subscription-menu';
    };

    try {
        const result = await startLoading(workFn);
        return result;
    } catch (error) {
        if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
        console.error("Failed to start embedded checkout:", error);
        updateStatusDisplay(BILLING.ERRORS.START_FAILED(error.message), "error");
        if (params && params.suppressMenuNav) return;
        return 'subscription-menu';
    }
}

export async function handleCancelSubscription(params) {
    const confirmation = await prompt(BILLING.PROMPTS.CANCEL_MEMBERSHIP);

    if (confirmation.status !== 'answered' || confirmation.value !== true) {
        return; 
    }

    const workFn = async () => {
        const msg = BILLING.STATUS.CANCELING;
        updateStatusDisplay(msg, 'info');
        showLoadingPrompt(msg);

        const response = await fetchWithAuth(`${API_BASE_URL}/cancel-subscription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ immediate: false }) // set true to cancel immediately
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            dismissPrompt('global-loading-prompt');
            throw new Error(data.error || BILLING.ERRORS.CANCEL_FAILED);
        }
        // Immediately refresh status and let the status line show the end date
        await fetchSubscriptionStatus(params);
        dismissPrompt('global-loading-prompt');
        updateStatusDisplay(BILLING.STATUS.CLEAR, 'info'); // clear transient message
        return 'subscription-menu';
    };

    try {
        return await startLoading(workFn);
    } catch (e) {
        if (e.message === SYSTEM.ERRORS.USER_CANCELLED) throw e;
        console.error('Cancel subscription error:', e);
        updateStatusDisplay(BILLING.ERRORS.CANCEL_FAILED, 'error');
        return 'subscription-menu';
    }
}

// Fetch subscription status
async function _fetchSubscriptionStatusLogic(params) {
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/subscription-status`);
        if (!response.ok) {
            throw new Error(BILLING.ERRORS.STATUS_FETCH_FAILED);
        }
        const data = await response.json();

        // Update or create menu items
        const statusItem = menus['subscription-menu'].items.find(item => item.id === 'sub-status');
        let actionItem = menus['subscription-menu'].items.find(item => item.id === 'subscription-action');
        if (!actionItem) {
            actionItem = { id: 'subscription-action', type: 'button', text: '', action: null, showLoading: false };
            menus['subscription-menu'].items.push(actionItem);
        }
        
        if (data.status === 'active') {
            let statusText = BILLING.LABELS.STATUS_ACTIVE;
            if (data.cancel_at_period_end && data.ends_on) {
                const endDate = new Date(data.ends_on * 1000).toLocaleDateString();
                statusText = BILLING.LABELS.STATUS_ACTIVE_ENDS(endDate);
                // While scheduled to end, offer resume (backend will resume on subscribe)
                actionItem.text = SYSTEM.LABELS.RESUME;
                actionItem.action = 'handleSubscribe';
                actionItem.isResume = true;
            } else {
                actionItem.text = SYSTEM.LABELS.CANCEL_MEMBERSHIP;
                actionItem.action = 'handleCancelSubscription';
                delete actionItem.isResume;
            }
            if (statusItem) statusItem.text = statusText;
        } else {
            if (statusItem) statusItem.text = BILLING.LABELS.STATUS_INACTIVE;
            if (actionItem) {
                actionItem.text = SYSTEM.LABELS.SUBSCRIBE;
                actionItem.action = 'handleSubscribe';
                delete actionItem.isResume;
            }
        }

        // Update DOM: Always perform a full re-render to ensure styles and classes are preserved
        if (isOnSubscriptionPage) {
            renderMenu('subscription-menu');
        }
    } catch (error) {
        if (error.message === 'ReauthInitiated') {
            throw error;
        }
        console.error('Error fetching subscription status:', error);
        
        // Update both config and DOM for error state
        const statusItem = menus['subscription-menu'].items.find(item => item.id === 'sub-status');
        const statusElement = document.getElementById('sub-status');
        
        if (statusItem) statusItem.text = BILLING.LABELS.STATUS_ERROR;
        if (statusElement) statusElement.textContent = BILLING.LABELS.STATUS_ERROR;
        
        if (isOnSubscriptionPage) {
            updateStatusDisplay(BILLING.ERRORS.STATUS_FETCH_FAILED, 'error');
        }
    }
}

export const fetchSubscriptionStatus = requireAuth(_fetchSubscriptionStatusLogic, 'view subscription');

// Start polling subscription status every 20 seconds
function startSubscriptionPolling() {
    if (subscriptionPollingInterval) {
        clearInterval(subscriptionPollingInterval);
    }
    
    isOnSubscriptionPage = true;
    console.log('Starting subscription status polling (every 20 seconds)');
    
    // Poll every 20 seconds
    subscriptionPollingInterval = setInterval(() => {
        if (isOnSubscriptionPage) {
            fetchSubscriptionStatus();
        } else {
            stopSubscriptionPolling();
        }
    }, 20000);
}

// Stop polling subscription status
function stopSubscriptionPolling() {
    if (subscriptionPollingInterval) {
        clearInterval(subscriptionPollingInterval);
        subscriptionPollingInterval = null;
        console.log('Stopped subscription status polling');
    }
    isOnSubscriptionPage = false;
}

// Define Subscription Menu Configuration
const subscriptionMenuConfig = {
    text: BILLING.LABELS.SUBSCRIPTION,
    items: [
        // This item will be updated dynamically
        { id: 'sub-status', text: BILLING.LABELS.STATUS_CHECKING, type: 'record', className: 'details-last-record' }
    ],
    backTarget: 'account-menu',
    onRender: async (params) => {
        // Only start polling if not already started to avoid multiple intervals
        if (!subscriptionPollingInterval) {
            startSubscriptionPolling();
            
            // Fetch status immediately on first render
            try {
                await fetchSubscriptionStatus(params);
            } catch (error) {
                if (error.message === SYSTEM.ERRORS.USER_CANCELLED) {
                    console.log("[Subscription] User cancelled re-auth, navigating back.");
                    renderMenu(subscriptionMenuConfig.backTarget);
                } else {
                    throw error;
                }
            }
        }
    },
    onLeave: () => {
        // Stop polling when leaving the subscription menu
        stopSubscriptionPolling();
    }
};

// Register this menu configuration
menus['subscription-menu'] = subscriptionMenuConfig;

// Register handlers with the central registry
registerHandler('handleSubscribe', handleSubscribe);
registerHandler('handleCancelSubscription', handleCancelSubscription);
 