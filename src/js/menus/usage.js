// Import the central menu registry
import { menus, renderMenu, updateStatusDisplay, showLoadingPrompt } from '/js/pages/menu.js';
import { registerHandler } from '../scripts/registry.js';
import { fetchWithAuth } from '/js/main.js';
import { CONFIG } from '/js/config.js';
const API_BASE_URL = CONFIG.API_BASE_URL;
import { requireAuth } from '/js/scripts/authenticate.js';
import { getSyncedData, invalidateCache } from '/js/scripts/sync.js';
import { openPopup } from '/js/scripts/popup.js';
import { prompt } from '/js/pages/prompt.js';
import { applyWaveEffect } from '../scripts/effects.js';
import { BILLING, SYSTEM } from '../strings.js';

let lastBillingData = null;

async function _getUsageLogic(params) {
    const { renderMenu, updateStatusDisplay, menuContainer, menuTitle } = params;

    updateStatusDisplay(BILLING.STATUS.FETCHING_USAGE, 'info');

    const cleanupLoadingUI = () => {
        // This function is now a no-op but is kept to avoid breaking existing call sites.
        // The generic loading UI is handled by menu.js.
    };

    try {
        const data = await getSyncedData('usage', 'usage');
        window.appConsole.log("[Usage] Received data:", data);
        lastBillingData = data.billing;

        cleanupLoadingUI();

        if (data.url) {
            const features = 'toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=900,height=720';
            const popup = openPopup(data.url, 'usage_popup', features);
            if (!popup) {
                renderMenu({
                    id: 'usage-popup-blocked-menu',
                    text: BILLING.LABELS.POPUP_BLOCKED,
                    items: [{ text: BILLING.LABELS.ENABLE_POPUPS, type: 'record' }],
                    backTarget: 'dashboard-menu'
                });
            } else {
                renderMenu('dashboard-menu');
            }
            return;
        }
        
        let usageItems;
        let menuTitleText = BILLING.LABELS.MONTHLY_USAGE;

        if (data.message) {
            usageItems = [{
                id: 'usage-message',
                text: data.message,
                type: 'record'
            }];
        } else if (data.month_name) {
            menuTitleText = BILLING.LABELS.USAGE_FOR(data.month_name);
            
            usageItems = [
                { id: 'membership-cost', text: BILLING.LABELS.MEMBERSHIP_COST(data.membership_cost), type: 'record' },
                { id: 'gcp-cost', text: BILLING.LABELS.GOOGLE_COST(Math.abs(data.gcp_cost), data.gcp_cost < 0), type: 'record' },
                { id: 'total-cost', text: BILLING.LABELS.TOTAL_BALANCE(data.total_cost), type: 'record' }
            ];

            // Add billing status if available
            if (data.billing) {
                const b = data.billing;
                let statusText = BILLING.LABELS.NOT_LINKED;
                let showStatus = true;
                if (b.is_linked) {
                    if (b.is_error) {
                        statusText = BILLING.LABELS.ERROR;
                    } else if (b.is_member && !b.is_open) {
                        statusText = BILLING.LABELS.INACTIVE;
                    } else if (b.is_open) {
                        statusText = BILLING.LABELS.OPEN;
                    } else {
                        // statusText = BILLING.LABELS.CLOSED; // We should not show closed accounts
                        showStatus = false;
                    }
                }
                
                if (showStatus) {
                    let tooltip = b.is_member ? BILLING.TOOLTIPS.MEMBER_ACCOUNT : BILLING.TOOLTIPS.PERSONAL_ACCOUNT;
                    if (b.is_error) {
                        tooltip = BILLING.TOOLTIPS.RESOLVE_ACCOUNT;
                    }

                    usageItems.push({
                        id: 'billing-status',
                        text: BILLING.LABELS.BILLING_STATUS(statusText, b.account_name, b.is_member),
                        type: 'record',
                        tooltip: tooltip
                    });
                }

                // Identify the last record currently in usageItems and give it the last-record styling
                // so there is spacing before the buttons that follow.
                const lastRecord = usageItems.filter(item => item.type === 'record').pop();
                if (lastRecord) {
                    lastRecord.className = 'details-last-record';
                }

                // Always add button for more details/fixing
                usageItems.push({
                    id: 'billing-details',
                    text: BILLING.LABELS.CHANGE_ACCOUNT,
                    type: 'button',
                    action: 'changeBillingAccount',
                    tooltip: BILLING.TOOLTIPS.CHANGE_ACCOUNT
                });

                // Add unlink button if currently linked
                if (b.is_linked || (b.account_id && b.account_id !== '')) {
                    usageItems.push({
                        id: 'billing-unlink',
                        text: BILLING.LABELS.UNLINK_ACCOUNT,
                        type: 'button',
                        action: 'unlinkBillingAccount',
                        tooltip: BILLING.TOOLTIPS.UNLINK_ACCOUNT
                    });
                }
            }
        } else if (data.billing) {
            // Case where we have billing data but no usage records (unlinked project)
            const b = data.billing;
            menuTitleText = BILLING.LABELS.MONTHLY_USAGE;
            
            usageItems = [
                { id: 'billing-status', text: BILLING.LABELS.BILLING_STATUS(BILLING.LABELS.NOT_LINKED, 'none', false), type: 'record', tooltip: BILLING.TOOLTIPS.RESOLVE_ACCOUNT },
                { id: 'billing-details', text: BILLING.LABELS.CHANGE_ACCOUNT, type: 'button', action: 'changeBillingAccount', tooltip: BILLING.TOOLTIPS.CHANGE_ACCOUNT }
            ];

            // Show unlink button even in partial mode if an ID exists
            if (b.account_id && b.account_id !== '') {
                usageItems.push({
                    id: 'billing-unlink',
                    text: BILLING.LABELS.UNLINK_ACCOUNT,
                    type: 'button',
                    action: 'unlinkBillingAccount',
                    tooltip: BILLING.TOOLTIPS.UNLINK_ACCOUNT
                });
            }
        } else {
            usageItems = [{
                id: 'usage-unavailable',
                text: BILLING.ERRORS.USAGE_UNAVAILABLE,
                type: 'record'
            }];
        }

        const finalConfig = {
            id: 'usage-menu',
            text: menuTitleText,
            items: usageItems,
            backTarget: 'dashboard-menu'
        };
        menus['usage-menu'] = finalConfig;
        renderMenu('usage-menu');

    } catch (error) {
        // If it's a re-authentication request, let it bubble up to the guard
        if (error.message === 'ReauthInitiated') {
            throw error;
        }

        // If it's our special error, re-throw it so the guards can catch it.
        if (error.id === 'permissions_required' || error.id === 'project_not_initialized' || error.id === 'subscription_required') {
            throw error;
        }
        
        // For all other errors, handle them locally.
        cleanupLoadingUI();
        renderMenu({
            id: 'usage-menu',
            text: SYSTEM.STATUS.ERROR,
            items: [{ text: BILLING.ERRORS.LOAD_USAGE_FAILED(error.message), type: 'record' }],
            backTarget: 'dashboard-menu'
        });
    }
}

export const getUsage = requireAuth(_getUsageLogic, 'view usage');

async function changeBillingAccount(params) {
    if (!lastBillingData) return;

    // 0. If the current account has an error, show a dedicated warning prompt first
    if (lastBillingData.is_error) {
        const result = await prompt(BILLING.PROMPTS.ACCOUNT_ERROR(lastBillingData.account_name));
        if (result.status === 'answered') {
            if (result.value === 'console') {
                const features = 'toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=1000,height=800';
                openPopup('https://console.cloud.google.com/billing', 'billing_console_popup', features);
                return;
            } else if (result.value === 'change') {
                // User wants to proceed to selection, fall through
            } else {
                return; // User canceled or clicked 'ok'
            }
        } else {
            return;
        }
    }

    const { available_accounts, is_member } = lastBillingData;
    const accountButtons = [];

    // 1. Add available personal accounts as buttons (record type)
    if (available_accounts && available_accounts.length > 0) {
        available_accounts.forEach(acc => {
            // Only show open personal accounts (hide inactive ones)
            // Also hide the currently linked account as it's already active
            if (acc.id !== lastBillingData.account_id && acc.is_open) {
                accountButtons.push({
                    type: 'record',
                    text: acc.name,
                    tooltip: BILLING.TOOLTIPS.ASSIGN_ACCOUNT,
                    onclick: () => submitPersonalBilling(acc.id, params)
                });
            }
        });
    }

    // 2. Add 'member billing' as a button at the bottom of the list
    if (!is_member) {
        const isActive = lastBillingData.is_sub_active;
        const text = isActive ? 'member billing' : `member billing (${BILLING.LABELS.INACTIVE})`;
        const tooltip = isActive ? BILLING.TOOLTIPS.MEMBER_BILLING_ACTIVE : BILLING.TOOLTIPS.MEMBER_BILLING_INACTIVE;

        accountButtons.push({
            type: 'record',
            text: text,
            tooltip: tooltip,
            onclick: () => {
                if (isActive) {
                    confirmManagedBilling(params);
                }
            }
        });
    }

    // Apply last record styling
    if (accountButtons.length > 0) {
        accountButtons[accountButtons.length - 1].className = 'details-last-record';
    }

    // 3. Define action buttons
    const actionButtons = [
        { 
            label: BILLING.LABELS.CREATE_ACCOUNT, 
            tooltip: BILLING.TOOLTIPS.CREATE_ACCOUNT,
            onclick: () => {
                const features = 'toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=1000,height=800';
                openPopup('https://console.cloud.google.com/billing/create', 'create_billing_popup', features);
            }
        },
        { label: 'nevermind', value: 'cancel' }
    ];

    // 4. Show selection prompt using the group structure for account selection
    await prompt({
        id: 'billing-account-select',
        text: "choose a billing account for this project:",
        type: 'form',
        className: 'prompt-billing-select',
        buttons: [
            ...accountButtons,
            ...actionButtons
        ]
    });
}

async function confirmManagedBilling(params) {
    const { updateStatusDisplay } = params;
    
    // updateStatusDisplay(BILLING.STATUS.SWITCHING_MANAGED, 'info');
    showLoadingPrompt(BILLING.STATUS.SWITCHING_MANAGED);
    
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/usage/billing-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: 'managed' })
        });
        
        if (!response.ok) throw new Error(BILLING.ERRORS.SWITCH_MANAGED_FAILED);
        
        // updateStatusDisplay(BILLING.STATUS.SWITCH_SUCCESS, 'success');
        await prompt(BILLING.PROMPTS.SUCCESS(BILLING.STATUS.SWITCH_SUCCESS));
        
        // Invalidate usage cache since billing changed
        invalidateCache('usage');

        // Re-run usage logic to show updated state
        setTimeout(() => getUsage(params), 500);
        
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        // updateStatusDisplay(SYSTEM.ERRORS.GENERIC_ERROR_MSG(error.message), 'error');
        prompt({ text: SYSTEM.ERRORS.GENERIC_ERROR_MSG(error.message), type: 'form', replace: true, buttons: [{ label: 'ok', value: true }] });
    }
}

async function submitPersonalBilling(accountId, params) {
    const { updateStatusDisplay } = params;
    
    // updateStatusDisplay(BILLING.STATUS.LINKING_PERSONAL, 'info');
    showLoadingPrompt(BILLING.STATUS.LINKING_PERSONAL);
    
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/usage/billing-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: accountId })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || BILLING.ERRORS.LINK_PERSONAL_FAILED);
        }
        
        // updateStatusDisplay(BILLING.STATUS.LINK_SUCCESS, 'success');
        await prompt(BILLING.PROMPTS.SUCCESS(BILLING.STATUS.LINK_SUCCESS));
        
        // Invalidate usage cache
        invalidateCache('usage');

        setTimeout(() => getUsage(params), 500);
        
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        // updateStatusDisplay(SYSTEM.ERRORS.GENERIC_ERROR_MSG(error.message), 'error');
        prompt({ text: SYSTEM.ERRORS.GENERIC_ERROR_MSG(error.message), type: 'form', replace: true, buttons: [{ label: 'ok', value: true }] });
    }
}

async function unlinkBillingAccount(params) {
    const confirm = await prompt(BILLING.PROMPTS.UNLINK_CONFIRM);
    if (confirm?.value !== true) return;

    showLoadingPrompt(BILLING.STATUS.UNLINKING);
    
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/usage/billing-account`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || BILLING.ERRORS.UNLINK_FAILED);
        }
        
        await prompt(BILLING.PROMPTS.SUCCESS(BILLING.STATUS.UNLINK_SUCCESS));
        
        // Invalidate usage cache
        invalidateCache('usage');

        setTimeout(() => getUsage(params), 500);
        
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        prompt({ text: SYSTEM.ERRORS.GENERIC_ERROR_MSG(error.message), type: 'form', replace: true, buttons: [{ label: 'ok', value: true }] });
    }
}

// Register handlers with the central registry
registerHandler('getUsage', getUsage);
registerHandler('changeBillingAccount', changeBillingAccount);
registerHandler('confirmManagedBilling', confirmManagedBilling);
registerHandler('unlinkBillingAccount', unlinkBillingAccount);
 