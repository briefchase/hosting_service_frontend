import { SYSTEM, BILLING } from '/js/strings.js';
import { CONFIG } from '/js/config.js';
import { updateStatusDisplay, clearStatusDisplay } from '/js/pages/menu.js';
import { GCP_SCOPES } from '/js/scripts/scopes.js';

// --- Configuration ---
const GOOGLE_CLIENT_ID = CONFIG.GOOGLE_CLIENT_ID;
const API_BASE_URL = CONFIG.API_BASE_URL;

// Breaking circular dependency with main.js
async function _getFetchWithAuth() {
    const { fetchWithAuth } = await import('/js/main.js');
    return fetchWithAuth;
}

// --- Helper for status updates ---
function updateAuthStatus(container, status, type = 'info') {
    const message = typeof status === 'object' && status !== null ? status.text : status;
    const colorMap = {
        error: 'red',
        success: 'green',
        info: 'inherit'
    };
    const color = colorMap[type] || 'inherit';

    if (container) {
        if (message) {
            container.innerHTML = `<p style="color:${color};">${String(message).replace(/\n/g, '<br>')}</p>`;
        } else {
            container.innerHTML = '';
        }
    } else {
        if (message) {
            if (type === 'error') {
                console.error(`[Auth Status] ${message}`);
            } else {
                console.log(`[Auth Status] ${message}`);
            }
        }
    }
}

// --- Global variables ---
let codeClient = null;
let google = null; // Will be initialized by the GSI script load
let defaultAuthRedirect = () => {
    console.warn("Default auth redirect not configured. User will not be redirected after login.");
};
let onAuthSuccessCallback = null; // New callback

// The Ballet: Resolvers for transparently resuming paused actions
let pendingAuthResolve = null;
let pendingAuthReject = null;
let pendingSubResolve = null;

const ONE_TAP_FAILED = 'OneTapFailed';
const ONE_TAP_USER_DISMISS_REASONS = new Set([
    'cancel_called',
    'user_cancel',
    'tap_outside',
]);

function rejectPendingAuth(error) {
    if (!pendingAuthReject) return;
    const reject = pendingAuthReject;
    pendingAuthReject = null;
    pendingAuthResolve = null;
    reject(error);
}

function isPermissionsAuthError(error) {
    if (!error) return false;
    const id = error.id;
    const msg = (error.message || '').toLowerCase();
    return id === SYSTEM.ERRORS.PERMISSIONS_REQUIRED_ID ||
        msg.includes('permissions_required') ||
        msg === SYSTEM.ERRORS.PERMISSIONS_REQUIRED.toLowerCase();
}

/**
 * Called from the main application entry point to configure the default
 * action after a successful login when no other action is pending.
 * @param {Function} redirectFn The function to call, e.g., loadConsoleView.
 */
export function configureAuthRedirect(redirectFn) {
    if (typeof redirectFn === 'function') {
        defaultAuthRedirect = redirectFn;
    }
}

/**
 * Called from the main application entry point to configure a callback
 * that runs immediately on successful authentication, before any redirect.
 * @param {Function} callbackFn The function to call.
 */
export function configureAuthSuccessCallback(callbackFn) {
    if (typeof callbackFn === 'function') {
        onAuthSuccessCallback = callbackFn;
    }
}

/**
 * Central handler for successful authentication.
 * Checks for a pending action (e.g., from a checkout flow) and executes it.
 * Otherwise, falls back to the default redirect.
 * @param {object} userSession The user session object from the backend.
 */
async function handleAuthenticationSuccess(userSession) {
    // 1. Clear re-auth state immediately to prevent loops
    window.__reauthInProgress = false; 

    // Run the immediate success callback if it's configured
    if (onAuthSuccessCallback) {
        try {
            onAuthSuccessCallback(userSession);
        } catch (error) {
            console.error("Error executing onAuthSuccessCallback:", error);
        }
    }

    // Trigger background sync now that we have a valid session
    import('/js/scripts/sync.js').then(m => {
        m.triggerBackgroundSync();
    }).catch(e => console.warn("[Auth] Failed to trigger background sync:", e));

    // The Ballet: If an action was paused awaiting auth, wake it up now.
    // This is the preferred modern flow.
    if (pendingAuthResolve) {
        console.log("Auth success. Resolving transparent guard.");
        
        // Pop the re-auth back handler we pushed in initiateReauthUI
        // before resolving, so the stack is clean for the resumed action.
        const { popBackHandler, getStack } = await import('/js/scripts/back.js');
        if (getStack().length > 0) {
            try { popBackHandler(); } catch (_) {}
        }

        const resolve = pendingAuthResolve;
        pendingAuthResolve = null;
        pendingAuthReject = null;
        
        // Clear legacy action to avoid double-execution
        window.pendingReauthAction = null;

        resolve(userSession);
        return; // The original action will take it from here
    }

    // Fallback for legacy flows or direct logins (only if no transparent guard was active)
    console.log("Auth success. Checking legacy pending action.");
    const pendingAction = window.pendingReauthAction;
    window.pendingReauthAction = null; 

    if (pendingAction && typeof pendingAction.actionFn === 'function') {
        console.log('Re-executing interrupted action after successful reauth');
        try {
            const executionParams = { ...pendingAction.params };
            await pendingAction.actionFn(executionParams);
        } catch (error) {
            console.error('Error re-executing pending action:', error);
            defaultAuthRedirect();
        }
    } else {
        defaultAuthRedirect();
    }
}

/**
 * Clears any pending action that was stored for re-execution after authentication.
 * This should be called when the user cancels an auth flow.
 */
export function clearPendingReauthAction() {
    if (window.pendingReauthAction) {
        console.log("Clearing pending re-authentication action.");
        window.pendingReauthAction = null;
    }
}


// --- Core Logic ---

/**
 * Redirects the user upon successful login or 'Console' click.
 * This function might be called from multiple places (e.g., landing page console button).
 * Kept for compatibility with landing page Console button, but main auth flow uses callback.
 */
export function handleLoginSuccess(user) {
    console.log("Login success (direct redirect), redirecting to main application.", user);
    // Redirect to the root or main application page
    window.location.href = '/'; // Adjust if your main app is elsewhere (e.g., '/app')
}

/**
 * Handles the response from the backend /api/authenticate endpoint.
 * Calls the stored success callback on successful authentication.
 */
async function handleAuthResponse(response, statusContainer) {
    updateAuthStatus(statusContainer, ''); // Clear previous status
    
    if (!response.ok) {
        // Handle all non-successful responses
        let errorMsg = SYSTEM.ERRORS.AUTH_FAILED(response.status);
        try {
            const errorData = await response.json();
            const details = errorData.details || '';
            errorMsg += ` - ${errorData.error || 'unknown error'}` + (details ? `\ndetails: ${details}` : '');
        } catch (e) {
            // Fallback if the error response isn't valid JSON
            const text = await response.text().catch(() => '');
            if (text) errorMsg += ` - ${text}`;
        }
        console.error(errorMsg);
        updateAuthStatus(statusContainer, errorMsg, 'error');
        return;
    }

    // Handle successful response
    try {
        const data = await response.json();
        const { session } = data;

        if (session && typeof session.email === 'string' && typeof session.token === 'string') {
            console.log("Backend authentication successful:", data);
            sessionStorage.setItem('currentUser', JSON.stringify(session));
            console.log("Stored user session in sessionStorage.currentUser:", session);
            await handleAuthenticationSuccess(session);
        } else {
            throw new Error(SYSTEM.ERRORS.AUTH_INCOMPLETE);
        }
    } catch (error) {
        console.error("Error processing successful authentication response:", error);
        updateAuthStatus(statusContainer, SYSTEM.ERRORS.GENERIC_ERROR_MSG(error.message), 'error');
    }
}

/**
 * Initializes the Google Sign-In code client.
 * Needs the status container element and a success callback function.
 */
export function initializeGoogleSignIn(statusContainer) {
    // This function no longer accepts a `successCallback`.
    // It always uses the internal `handleAuthenticationSuccess`.

     if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
        console.error("Google Identity Services library not loaded.");
        updateAuthStatus(statusContainer, SYSTEM.STATUS.AUTH_ELEMENT_MISSING, 'error');
        return;
    }

    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE_CLIENT_ID')) {
        console.error("google client id is not configured.");
        updateAuthStatus(statusContainer, SYSTEM.ERRORS.AUTH_CONFIG_MISSING, 'error');
        return;
    }

    try {
        // Initialize the Google OAuth 2.0 Code Client
        // The redirect_uri must match exactly what was used to get the code.
        // We use the current origin (including port) to ensure consistency.
        const dynamicRedirectUri = window.location.origin;
        console.log('[Auth][Frontend] Using redirect_uri for Google Code flow:', dynamicRedirectUri);
        console.log('[Auth][Frontend] API endpoint for auth:', `${API_BASE_URL}/authenticate`);

        codeClient = window.google.accounts.oauth2.initCodeClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: `openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile ${GCP_SCOPES}`,
            prompt: 'consent',
            ux_mode: 'popup',
            redirect_uri: dynamicRedirectUri,
            callback: async (response) => {
                updateAuthStatus(statusContainer, ''); // Clear status on new attempt
                console.log("Received authorization code from Google:", response.code ? response.code.substring(0, 10) + '...' : 'Error/Cancelled');
                if (response.code) {
                    updateAuthStatus(statusContainer, SYSTEM.STATUS.AUTHENTICATING, 'info'); // Indicate progress
                    try {
                        console.log('[Auth][Frontend] Posting auth code to backend with Origin:', window.location.origin);
                        const backendResponse = await fetch(`${API_BASE_URL}/authenticate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ authorization_code: response.code, redirect_origin: window.location.origin }),
                        });
                        await handleAuthResponse(backendResponse, statusContainer);
                    } catch (error) {
                        window.__reauthInProgress = false; // Clear re-auth state
                        console.error('Network or other error sending code to backend:', error);
                        updateAuthStatus(statusContainer, SYSTEM.ERRORS.NETWORK_ERROR, 'error');
                    }
                } else {
                    window.__reauthInProgress = false; // Clear re-auth state
                    // Handle user closing the popup gracefully
                    if (response.error === 'popup_closed' || response.error === 'popup_closed_by_user') {
                        console.log('google sign-in popup closed by user.');
                        updateAuthStatus(statusContainer, SYSTEM.STATUS.SIGN_IN_CANCELLED, 'info');
                        if (pendingAuthReject) {
                            const reject = pendingAuthReject;
                            pendingAuthReject = null;
                            pendingAuthResolve = null;
                            reject(new Error(SYSTEM.ERRORS.USER_CANCELLED));
                        }
                    } else {
                        console.error("error receiving authorization code from google:", response);
                        const googleError = response.error ? ` (${response.error})` : '';
                        updateAuthStatus(statusContainer, SYSTEM.ERRORS.AUTH_CANCELLED(googleError), 'error');
                    }
                }
            },
            error_callback: (error) => {
                window.__reauthInProgress = false; // Clear re-auth state
                // Don't show an error if the user closed the popup
                if (error.type === 'popup_closed') {
                    console.log('google sign-in popup closed by user.');
                    updateAuthStatus(statusContainer, SYSTEM.STATUS.SIGN_IN_CANCELLED, 'info');
                    if (pendingAuthReject) {
                        const reject = pendingAuthReject;
                        pendingAuthReject = null;
                        pendingAuthResolve = null;
                        reject(new Error(SYSTEM.ERRORS.USER_CANCELLED));
                    }
                    return;
                }
                console.error('google code client error:', error);
                updateAuthStatus(statusContainer, SYSTEM.ERRORS.AUTH_ERROR(error.type), 'error');
            }
        });
        console.log('google code client initialized.');
    } catch(error) {
         console.error('error during google code client initialization:', error);
         updateAuthStatus(statusContainer, SYSTEM.ERRORS.AUTH_CRITICAL, 'error');
         codeClient = null; // Ensure client is null if init fails
    }
}

/**
 * Triggers the Google Sign-In flow.
 * Needs the status container element from the calling page.
 */
export function triggerGoogleSignIn(statusContainer) {
    if (codeClient) {
        // Prevent double-triggering during the same session
        if (window.__googleRequestInitiated) {
            console.warn("[Auth] google code request already initiated.");
            return;
        }
        window.__googleRequestInitiated = true;
        
        console.log('requesting authorization code...');
        console.log('[debug] attempting to call codeClient.requestCode()');
        
        try {
            codeClient.requestCode();
        } catch (e) {
            console.error("[Auth] failed to call requestCode():", e);
            window.__googleRequestInitiated = false;
        } finally {
            // Reset the internal safety lock after a delay to allow for retries
            // if the user closes the popup or it fails.
            setTimeout(() => { window.__googleRequestInitiated = false; }, 2000);
        }
    } else {
        console.error("google code client not initialized or initialization failed.");
        updateAuthStatus(statusContainer, SYSTEM.ERRORS.AUTH_INIT_FAILED, 'error');
    }
}

/**
 * Initializes Google One Tap for frictionless login.
 * Usually called on app boot if no active session is found.
 *
 * Outcomes for a pending requireAuth waiter:
 * - user dismiss → USER_CANCELLED (abort action)
 * - permissions error → permissions_required (upgrade via OAuth)
 * - not shown / failed → OneTapFailed (caller falls back to manual sign-in)
 */
export function initializeOneTap(statusContainer) {
    if (!window.google?.accounts?.id) {
        console.warn("[Auth] Google Identity Services not ready for One Tap.");
        rejectPendingAuth(new Error(ONE_TAP_FAILED));
        return;
    }

    // Prevent multiple concurrent One Tap prompts
    if (window.__oneTapInFlight) {
        console.log("[Auth] One Tap prompt already in flight, skipping.");
        rejectPendingAuth(new Error(ONE_TAP_FAILED));
        return;
    }
    window.__oneTapInFlight = true;

    // Keep the latest status container for the shared GIS callback
    window.__oneTapStatusContainer = statusContainer ?? null;

    if (!window.__oneTapInitialized) {
        window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => {
                window.__oneTapInFlight = false;
                handleOneTapResponse(response, window.__oneTapStatusContainer);
            },
            auto_select: true, // Seamless login for returning users
            cancel_on_tap_outside: false,
            // FedCM blocked in site settings breaks the prompt entirely; use classic One Tap.
            use_fedcm_for_prompt: false
        });
        window.__oneTapInitialized = true;
    }

    // Display the One Tap bubble
    window.google.accounts.id.prompt((notification) => {
        // Suppress specific status methods when using FedCM to avoid GSI_LOGGER warnings
        if (notification.isFedcmMoment && notification.isFedcmMoment()) {
            console.log('[Auth] One Tap FedCM moment handled.');
            return;
        }

        if (notification.isNotDisplayed()) {
            window.__oneTapInFlight = false;
            rejectPendingAuth(new Error(ONE_TAP_FAILED));
            return;
        }

        if (notification.isSkippedMoment() || notification.isDismissedMoment()) {
            const reason = notification.getSkippedReason() || notification.getDismissedReason();
            // credential_returned: identity callback will resolve the waiter
            if (reason === 'credential_returned') return;

            window.__oneTapInFlight = false;
            if (ONE_TAP_USER_DISMISS_REASONS.has(reason)) {
                rejectPendingAuth(new Error(SYSTEM.ERRORS.USER_CANCELLED));
            } else {
                rejectPendingAuth(new Error(ONE_TAP_FAILED));
            }
        }
    });
}

/**
 * Handles the JWT returned by Google One Tap.
 * Sends the ID Token ('credential') to the backend.
 */
async function handleOneTapResponse(response, statusContainer) {
    if (!response.credential) {
        rejectPendingAuth(new Error(ONE_TAP_FAILED));
        return;
    }

    // Use the main.js helper to show progress in the header button
    const { setAccountButtonLoading, updateAccountButtonVisibility } = await import('/js/main.js');
    setAccountButtonLoading(true);

    try {
        const backendResponse = await fetch(`${API_BASE_URL}/authenticate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                credential: response.credential, // The One Tap JWT
                redirect_origin: window.location.origin 
            }),
        });

        if (!backendResponse.ok) {
            let errorData = {};
            try {
                errorData = await backendResponse.json();
            } catch (_) { /* ignore */ }

            const errorMsg = SYSTEM.ERRORS.AUTH_FAILED(backendResponse.status);
            console.error(errorMsg, errorData);
            updateAuthStatus(statusContainer, errorMsg, 'error');
            setAccountButtonLoading(false);
            updateAccountButtonVisibility(true, false);

            if (isPermissionsAuthError({ id: errorData.id || errorData.error, message: errorData.error || errorData.details || '' })) {
                const err = new Error(SYSTEM.ERRORS.PERMISSIONS_REQUIRED);
                err.id = SYSTEM.ERRORS.PERMISSIONS_REQUIRED_ID;
                rejectPendingAuth(err);
            } else {
                rejectPendingAuth(new Error(ONE_TAP_FAILED));
            }
            return;
        }

        // Success resolves the waiter via handleAuthenticationSuccess
        await handleAuthResponse(backendResponse, null);
        if (pendingAuthReject) {
            // Response looked ok but session was incomplete / did not resolve
            rejectPendingAuth(new Error(ONE_TAP_FAILED));
        }
    } catch (error) {
        console.error('[Auth] One Tap error:', error);
        setAccountButtonLoading(false);
        updateAccountButtonVisibility(true, false);
        rejectPendingAuth(new Error(ONE_TAP_FAILED));
    }
}

/**
 * Retrieves the current user session from sessionStorage.
 * @returns {object|null} The user session object {email, token} or null if not found/invalid.
 */
export function getUser() {
    try {
        const storedUserString = sessionStorage.getItem('currentUser');
        if (storedUserString) {
            const user = JSON.parse(storedUserString);
            // Ensure it has the expected properties (e.g., email and token)
            if (user && user.email && user.token) {
                return user;
            }
        }
    } catch (error) {
        console.error("Error retrieving user from sessionStorage:", error);
    }
    return null; // Return null if no valid user session is found
}

/**
 * Triggers the re-authentication flow and updates the UI.
 * Fails spectacularly if the UI cannot be initialized.
 */
export async function initiateReauthUI(params = {}) {
    // 1. Strict idempotency check - MUST be first
    if (window.__reauthInProgress) {
        console.log("[Auth] Re-authentication already in progress, skipping UI trigger.");
        return;
    }
    
    let { updateStatusDisplay: statusFn, menuContainer } = params;

    // Mandatory Permission Explanation Prompt
    // This ensures users always understand why we need Cloud/Drive before the OAuth popup.
    const { prompt } = await import('/js/pages/prompt.js');
    const answer = await prompt(SYSTEM.PROMPTS.PERMISSION_EXPLANATION);
    if (!answer || answer.status !== 'answered' || answer.value !== 'continue') {
        console.log("[Auth] Permission explanation cancelled or ignored.");
        const error = new Error(SYSTEM.ERRORS.USER_CANCELLED);
        if (pendingAuthReject) {
            const reject = pendingAuthReject;
            pendingAuthReject = null;
            pendingAuthResolve = null;
            reject(error);
        }
        if (params.reject) params.reject(error);
        window.__reauthInProgress = false;
        return;
    }

    window.__reauthInProgress = true;

    if (!statusFn) {
        // Fallback to finding the element directly
        const statusEl = document.getElementById('menu-status-message');
        if (statusEl) {
            statusFn = (msg, type) => {
                statusEl.textContent = msg;
                statusEl.className = `menu-status-message menu-status-${type}`;
            };
        }
    }

    const message = SYSTEM.STATUS.PLEASE_SIGN_IN;
    if (statusFn) {
        statusFn(message, 'info');
    } else {
        // Fallback to finding the element directly if statusFn is missing
        const statusEl = document.getElementById('menu-status-message');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = 'menu-status-message menu-status-info';
        } else {
            // If we're on the landing page or the menu isn't loaded, 
            // we don't need to fail spectacularly. The Google popup itself 
            // is a clear enough indicator that sign-in is required.
            console.log("[Auth] UI status element missing, skipping 'please sign in' message.");
        }
    }

    // Register a back button handler to cancel the re-auth flow
    const { pushBackHandler } = await import('/js/scripts/back.js');
    const { renderMenu } = await import('/js/pages/menu.js');

        const backHandler = () => {
            console.log("[Auth] Back button pressed during re-auth, cancelling.");
            window.__reauthInProgress = false;
            window.pendingReauthAction = null;

            if (pendingAuthReject) {
                const reject = pendingAuthReject;
                pendingAuthReject = null;
                pendingAuthResolve = null;
                reject(new Error(SYSTEM.ERRORS.USER_CANCELLED));
                return; // The reject will trigger cleanup in the caller
            }
            
            // Signal cancellation to the caller (e.g. menu.js click handler)
            // This is the key to the Promise Ballet: the guard rejects, 
            // allowing the caller's finally block to clean up its own handler.
            if (params && params.reject) {
                params.reject(new Error(SYSTEM.ERRORS.USER_CANCELLED));
            } else {
            // Fallback for direct calls
            import('/js/scripts/back.js').then(m => {
                // The Ballet: A handler must be self-consuming, but since we are in a fallback
                // that doesn't use the Promise race, we must pop manually.
                try { m.popBackHandler(); } catch (_) {}
                if (menuContainer && menuContainer.dataset.previousMenu) {
                    renderMenu(menuContainer.dataset.previousMenu);
                } else {
                    renderMenu('dashboard-menu');
                }
            });
        }
    };
    pushBackHandler(backHandler);

    // Determine where to attach the Google popup
    const isLandingPage = !!document.getElementById('landing-view-container');
    const statusContainer = isLandingPage ? null : (menuContainer?.querySelector('#menu-status-message') || document.getElementById('menu-status-message') || document.getElementById('prompt-container') || document.body);

    initializeGoogleSignIn(statusContainer);
    triggerGoogleSignIn(statusContainer);
}

/**
 * A higher-order function that wraps an action with an authentication check.
 * @param {Function} actionFn The async function to execute if authentication passes.
 * @param {string} actionName A user-friendly name for the action.
 * @returns {Function} An async function that takes a `params` object and executes the guarded action.
 */
export function requireAuth(actionFn, actionName) {
    // The Ballet: Centralized helper for triggering re-authentication.
    // Creates a promise that pauses execution until the user signs in via the popup.
    const _withReauth = async (params) => {
        const authPromise = new Promise((resolve, reject) => {
            pendingAuthResolve = resolve;
            pendingAuthReject = reject;
        });

        // Store the original action for legacy fallback re-execution
        if (typeof window !== 'undefined') {
            window.pendingReauthAction = { actionFn, params };
        }

        await initiateReauthUI(params);
        return await authPromise;
    };

    const guarded = async function(params) {
        let { menuContainer, updateStatusDisplay } = params || {};

        if (!updateStatusDisplay) {
            updateStatusDisplay = (message, type = 'info') => {
                console[type === 'error' ? 'error' : 'log'](`[Auth Guard] ${message}`);
            };
        }

        const runActionWithGuards = async () => {
            while (true) {
                try {
                    return await actionFn(params);
                } catch (error) {
                    const errorId = error?.id;
                    const errorMsg = error?.message || '';
                    const isGuardError = errorId === SYSTEM.ERRORS.PERMISSIONS_REQUIRED_ID || 
                                        errorId === BILLING.ERRORS.SUBSCRIPTION_REQUIRED_ID || 
                                        errorId === 'project_not_initialized' ||
                                        errorMsg === 'ReauthInitiated' ||
                                        errorMsg.toLowerCase().includes('subscription is required') ||
                                        errorMsg.toLowerCase().includes('permissions_required');

                    // If it's a known guard ID, log it as a standard status message instead of an error trace.
                    if (error && isGuardError) {
                        console.log(`[Auth Guard] Guard triggered for '${actionName}': ${errorId || errorMsg}`);
                    } else {
                        console.log(`[Auth Guard] Caught error in '${actionName}':`, error, "ID:", error?.id);
                        throw error; // Immediately bubble up unknown errors
                    }

                    if (error && (errorMsg === 'ReauthInitiated')) {
                        console.log("[Auth Guard] Session expired (401), attempting One Tap recovery.");
                        const { updateStatusDisplay: menuUpdateStatusDisplay, clearStatusDisplay } = await import('/js/pages/menu.js');

                        if (window.google?.accounts?.id) {
                            menuUpdateStatusDisplay(SYSTEM.STATUS.SIGNING_IN, 'info');
                            const authPromise = new Promise((resolve, reject) => {
                                pendingAuthResolve = resolve;
                                pendingAuthReject = reject;
                            });
                            initializeOneTap(null);
                            try {
                                const session = await authPromise;
                                if (session) continue; // Loop back and retry the action
                            } catch (otError) {
                                clearStatusDisplay();
                                if (otError.message === SYSTEM.ERRORS.USER_CANCELLED) {
                                    console.log("[Auth Guard] One Tap cancelled by user.");
                                    throw otError;
                                }
                                // OneTapFailed / permissions → manual sign-in below
                                console.log("[Auth Guard] One Tap recovery unfinished:", otError.message);
                            }
                        }

                        clearStatusDisplay();
                        const session = await _withReauth(params);
                        if (session) continue;
                        throw new Error(SYSTEM.ERRORS.USER_CANCELLED);
                    }
                    
                    if (error && (errorId === SYSTEM.ERRORS.PERMISSIONS_REQUIRED_ID || errorMsg.toLowerCase().includes('permissions_required'))) {
                        console.log("[Auth Guard] Identity verified but permissions missing (403). Upgrading session via popup.");
                        const session = await _withReauth(params);
                        if (session) continue; // Loop back and retry
                        throw new Error(SYSTEM.ERRORS.USER_CANCELLED);
                    }
                    
                    if (error && (errorId === BILLING.ERRORS.SUBSCRIPTION_REQUIRED_ID || errorMsg.toLowerCase().includes('subscription is required'))) {
                        console.log("[Auth Guard] Subscription required (403). Triggering checkout flow.");
                        const { initializeStripe, handleSubscribe } = await import('/js/menus/subscription.js');
                        
                        const subPromise = new Promise(resolve => {
                            pendingSubResolve = resolve;
                        });

                        try {
                            await initializeStripe();
                            await handleSubscribe(async (res) => {
                                if (pendingSubResolve) {
                                    console.log("[Auth Guard] Resolving transparent subscription guard via callback.");
                                    const resolve = pendingSubResolve;
                                    pendingSubResolve = null;
                                    resolve(res);
                                }
                            }, { ...params, suppressMenuNav: true });
                        } catch (subError) {
                            if (subError && (subError.message === 'ReauthInitiated' || subError.message === SYSTEM.ERRORS.USER_CANCELLED)) {
                                throw subError;
                            }
                            console.error("[Auth Guard] Subscription flow failed:", subError);
                            throw subError;
                        }
                        
                        await subPromise;
                        continue; // Loop back and retry
                    }

                    // If we hit an edge case and didn't re-try or throw, we must stop the loop.
                    throw error;
                }
            }
        };

        const user = getUser();

        // Case A: No user — One Tap first; dismiss cancels; otherwise manual sign-in
        if (!user) {
            console.log("[Auth Guard] No user found, initiating One Tap.");
            const { updateStatusDisplay: menuUpdateStatusDisplay, clearStatusDisplay } = await import('/js/pages/menu.js');

            if (window.google?.accounts?.id) {
                menuUpdateStatusDisplay(SYSTEM.STATUS.SIGNING_IN, 'info');
                const authPromise = new Promise((resolve, reject) => {
                    pendingAuthResolve = resolve;
                    pendingAuthReject = reject;
                });
                initializeOneTap(null);
                try {
                    const session = await authPromise;
                    if (session) {
                        return await runActionWithGuards();
                    }
                } catch (e) {
                    clearStatusDisplay();
                    if (e.message === SYSTEM.ERRORS.USER_CANCELLED) {
                        console.log("[Auth Guard] One Tap cancelled by user.");
                        throw e;
                    }
                    // OneTapFailed / permissions → fall through to manual sign-in
                    console.log("[Auth Guard] One Tap unfinished; falling back to sign-in UI:", e.message);
                }
            }

            clearStatusDisplay();
            const session = await _withReauth({ ...params });
            if (session) {
                return await runActionWithGuards();
            }
            throw new Error(SYSTEM.ERRORS.USER_CANCELLED);
        }

        // Case B: User exists, try the action
        return await runActionWithGuards();
    };
    return guarded;
}

// Note: These functions are now globally accessible.
// Ensure this script is loaded before any script that uses these functions.
// Consider using JavaScript modules (import/export) for better organization in larger projects.
