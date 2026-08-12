// Import the central menu registry
import { menus, startLoading, showLoadingPrompt } from '/js/pages/menu.js';
import { registerHandler } from '../scripts/registry.js';
import { fetchWithAuth } from '/js/main.js';
import { CONFIG } from '/js/config.js';
const API_BASE_URL = CONFIG.API_BASE_URL;
import { prompt, dismissPrompt } from '/js/pages/prompt.js';
import { SYSTEM, BILLING } from '../strings.js';


export const handleRescind = async (params) => {
    const { updateStatusDisplay } = params;
    const confirmation = await prompt(SYSTEM.PROMPTS.AUTH_RESCIND);

    if (confirmation.status !== 'answered' || confirmation.value !== true) {
        // User cancelled, do nothing. Optionally, show a status message.
        return;
    }

    const workFn = async () => {
        const msg = SYSTEM.STATUS.RESCINDING_ACCESS;
        updateStatusDisplay(msg, 'info');
        showLoadingPrompt(msg);

        try {
            const response = await fetchWithAuth(`${API_BASE_URL}/rescind`, {
                method: 'POST'
            });
            if (response.ok) {
                console.log("Successfully rescinded access on server.");
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error("Server rescind failed:", response.status, errorData.error || 'Unknown error');
                // Inform the user via console, but still log them out locally.
                console.warn("Could not rescind Google access, but you will be logged out. Please revoke access manually in your Google account settings.");
            }
        } finally {
            // Always clear local session and redirect
            sessionStorage.removeItem('currentUser');
            window.location.href = '/landing.html';
        }
    };

    try {
        return await startLoading(workFn);
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        if (error.id === 'permissions_required' || error.id === 'subscription_required' || error.id === 'project_not_initialized') throw error;
        if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
        console.error("Error during rescind request:", error);
        return 'account-menu';
    }
};

export const handleDeleteProject = async (params) => {
    const { updateStatusDisplay } = params;
    const confirmation = await prompt(SYSTEM.PROMPTS.DELETE_PROJECT_CONFIRM);

    if (confirmation.status !== 'answered' || confirmation.value !== true) {
        return;
    }

    const workFn = async () => {
        const msg = SYSTEM.STATUS.DELETING_PROJECT;
        updateStatusDisplay(msg, 'info');
        showLoadingPrompt(msg);
        
        const response = await fetchWithAuth(`${API_BASE_URL}/project`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            console.log("Successfully deleted project on server.");
            await prompt({ ...SYSTEM.PROMPTS.DELETE_PROJECT_SUCCESS, replace: true });
            
            // Re-render the account menu to reflect any changes (e.g., if we want to hide the button now)
            // Or navigate back to dashboard
            return 'dashboard-menu';
        } else {
            const errorData = await response.json().catch(() => ({}));
            console.error("Project deletion failed:", response.status, errorData.error || 'Unknown error');
            dismissPrompt('global-loading-prompt');
            throw new Error(errorData.error || 'unknown error');
        }
    };

    try {
        return await startLoading(workFn);
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
        console.error("Error during project deletion request:", error);
        await prompt({ ...SYSTEM.PROMPTS.DELETE_PROJECT_ERROR(error.message), replace: true });
        return 'account-menu';
    }
};

// Register handlers with the central registry
registerHandler('handleRescind', handleRescind);
registerHandler('handleDeleteProject', handleDeleteProject);

// Define Account Menu Configuration
const accountMenuConfig = {
    text: function() {
        try {
            const storedUserString = sessionStorage.getItem('currentUser');
            if (storedUserString) {
                const currentUser = JSON.parse(storedUserString);
                if (currentUser && currentUser.email) {
                    return currentUser.email; // Display user's email as the title
                }
            }
        } catch (error) {
            console.error("Error retrieving user email for account menu title:", error);
        }
        return SYSTEM.LABELS.ACCOUNT; // Default title if email is not found or error occurs
    },
    items: [
        { id: 'logout-button', text: SYSTEM.LABELS.LOGOUT, type: 'button', action: 'handleLogout' },
        { id: 'sub-button', text: BILLING.LABELS.SUBSCRIPTION_MENU, type: 'button', targetMenu: 'subscription-menu' },
        { id: 'rescind-button', text: SYSTEM.LABELS.RESCIND_ACCESS, type: 'button', action: 'handleRescind', showLoading: false },
        { id: 'delete-project-button', text: SYSTEM.LABELS.DELETE_PROJECT, type: 'button', action: 'handleDeleteProject', className: 'danger-button', showLoading: false },
    ],
    backTarget: 'dashboard-menu'
};

// Register this menu configuration
menus['account-menu'] = accountMenuConfig; 