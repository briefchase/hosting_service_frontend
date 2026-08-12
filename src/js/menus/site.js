import { menus, renderMenu, updateStatusDisplay, showLoadingPrompt } from '/js/pages/menu.js';
import { registerHandler } from '../scripts/registry.js';
import { CONFIG } from '/js/config.js';
import {
    fetchWithAuth,
    updateAccountButtonVisibility,
    updateSiteTitleVisibility
} from '/js/main.js';

const API_BASE_URL = CONFIG.API_BASE_URL;
import { requireAuth } from '/js/scripts/authenticate.js';
import { getSyncedData, invalidateCache } from '/js/scripts/sync.js';
import { prompt, dismissPrompt } from '/js/pages/prompt.js';
import { INFRASTRUCTURE, SYSTEM } from '../strings.js';
import { orchestrator } from '../scripts/orchestrator.js';
import { getSiteAddress, fetchAndProcessDeployments } from '../scripts/site-utils.js';

// No more global cache. Data is fetched on demand.

function generateSiteDetailsMenu(site) {
    if (!site) {
        return {
            id: `site-details-error-generic`,
            text: SYSTEM.STATUS.ERROR,
            items: [{ id: 'site-not-found', text: INFRASTRUCTURE.ERRORS.SITE_NOT_FOUND, type: 'record' }],
            backTarget: 'site-list-menu'
        };
    }

    let detailItems = [
        { id: `details-status-${site.id}`, text: `${INFRASTRUCTURE.LABELS.STATUS} ${site.status || SYSTEM.LABELS.UNKNOWN}`, type: 'record' },
    ];

    if (site.infrastructure === 'vm') {
        detailItems.unshift({ id: `details-machine-name-${site.id}`, text: `${INFRASTRUCTURE.LABELS.MACHINE} ${site.machine_name || SYSTEM.LABELS.UNKNOWN}`, type: 'record' });
        detailItems.push({ id: `details-schedule-${site.id}`, text: `${INFRASTRUCTURE.LABELS.BACKUPS} ${site.backup_schedule || SYSTEM.LABELS.MANUAL}`, type: 'record' });
    }

    if (site.status !== 'provisioning') {
        const { url: addressUrl, label: address } = getSiteAddress(site);

        const addressItem = addressUrl 
            ? { id: `details-address-${site.id}`, text: `${INFRASTRUCTURE.LABELS.ADDRESS} ${address}`, type: 'record', action: 'openAddress', url: addressUrl, className: 'details-last-record' }
            : { id: `details-address-${site.id}`, text: `${INFRASTRUCTURE.LABELS.ADDRESS} ${address}`, type: 'record', className: 'details-last-record' };
        
        detailItems.push(addressItem);

        if (addressUrl) {
            detailItems.push({ id: `details-front-page-${site.id}`, text: INFRASTRUCTURE.LABELS.FRONT_PAGE, type: 'button', action: 'openAddress', url: addressUrl });
        }

        // Add the download button for all live sites
        detailItems.push({
            id: `details-download-${site.id}`,
            text: INFRASTRUCTURE.LABELS.DOWNLOAD,
            type: 'button',
            action: 'downloadSite',
            deployment: site.id,
            infrastructure: site.infrastructure,
            site_id: site.site_id,
            tooltip: INFRASTRUCTURE.TOOLTIPS.DOWNLOAD
        });

        if (site.infrastructure === 'firebase') {
            detailItems.push({ 
                id: `details-edit-${site.id}`, 
                text: SYSTEM.LABELS.EDIT, 
                type: 'button', 
                action: 'openEditor', 
                site_id: site.site_id, 
                deployment_name: site.id 
            });
        }

        if (site.wordpress && site.status !== 'relinking') {
            const adminUrl = addressUrl ? `${addressUrl}/wp-admin` : null;
            if (adminUrl) {
                detailItems.push({ id: `details-wp-admin-${site.id}`, text: INFRASTRUCTURE.LABELS.ADMIN_PANEL, type: 'button', action: 'openAddress', url: adminUrl, tooltip: INFRASTRUCTURE.TOOLTIPS.ADMIN_PANEL });
            }
        }
    }

    // Only add the destroy button if the site is not being destroyed or provisioned
    if (site.status !== 'destroying' && site.status !== 'provisioning') {
            detailItems.push({ 
                id: `deployment-destroy-${site.id}`, 
                text: SYSTEM.LABELS.DESTROY, 
            type: 'button', 
            action: 'destroyDeployment', 
            showLoading: true, // Opt-in to the generic loading UI
            resourceId: site.id,
            deployment: site.id,
            infrastructure: site.infrastructure,
            machineId: site.machine_id || 'firebase',
            tooltip: INFRASTRUCTURE.TOOLTIPS.DESTROY_SITE
        });
    }

    return {
        id: `site-details-menu-${site.id}`,
        text: INFRASTRUCTURE.LABELS.SITE_ID(site.id),
        items: detailItems,
        backTarget: 'site-list-menu'
    };
}

function cacheAllSiteMenus(sites) {
    const siteItems = sites.map(item => {
            const isDisabled = item.status === 'provisioning';
            return {
                id: `site-${item.id}`,
                text: isDisabled ? `${item.id}...` : item.id,
                targetMenu: `site-details-menu-${item.id}`,
                resourceId: item.id,
                type: 'record',
                action: 'viewSite',
                disabled: isDisabled
            };
        });

        if (siteItems.length === 0) {
         siteItems.push({ id: 'no-sites', text: INFRASTRUCTURE.LABELS.NO_SITES, type: 'record' });
        }

    menus['site-list-menu'] = {
            id: 'site-list-menu',
            text: INFRASTRUCTURE.LABELS.SITES_MENU,
            items: siteItems,
            backTarget: 'dashboard-menu'
        };

    sites.forEach(site => {
        menus[`site-details-menu-${site.id}`] = generateSiteDetailsMenu(site);
    });
}

async function _listSitesLogic(params) {
    const { updateStatusDisplay } = params;
    updateStatusDisplay(INFRASTRUCTURE.STATUS.FETCHING_SITES, 'info');
    const sites = await fetchAndProcessDeployments();
    cacheAllSiteMenus(sites);
    return 'site-list-menu';
}

export const listSites = requireAuth(_listSitesLogic, 'view sites'); 

export async function viewSite(params) {
    const siteId = params.id || params.resourceId;

    if (!siteId) {
        console.error('viewSite called without site identifier:', params);
        return;
    }

    // Re-check for site details menu existence. If it's missing, wait for a loud fetch.
    const menuId = `site-details-menu-${siteId}`;
    if (!menus[menuId]) {
        // Show a centered loading state immediately to prevent Dashboard jump
        renderMenu({
            id: `loading-site-${siteId}`,
            text: INFRASTRUCTURE.LABELS.SITE,
            items: [{ id: 'loading-site', text: SYSTEM.STATUS.LOADING, type: 'record' }],
            backTarget: 'site-list-menu'
        });

        try {
            // Fetch all sites to update the cache.
            const sites = await fetchAndProcessDeployments();
            cacheAllSiteMenus(sites); // Re-builds all menus with fresh data
            
            // Check again after fetch
            if (!menus[menuId]) throw new Error('site still not found after fetch');
        } catch (error) {
            console.error(`Error fetching site details for ${siteId}:`, error);
            renderMenu({
                id: `site-details-error-${siteId}`,
                text: INFRASTRUCTURE.LABELS.SITE,
                items: [{ id: 'site-fetch-error', text: INFRASTRUCTURE.ERRORS.LOAD_SITE_FAILED(error.message.toLowerCase()), type: 'record' }],
                backTarget: 'site-list-menu'
            });
            return;
        }
    }

    renderMenu(menuId);
}

export async function downloadSite(params) {
    const { deployment, infrastructure, site_id } = params;
    const siteId = site_id || deployment;

        if (infrastructure === 'firebase') {
        showLoadingPrompt(INFRASTRUCTURE.STATUS.PREPARING_DOWNLOAD);
        try {
            const storedUserString = sessionStorage.getItem('currentUser');
            let token = null;
            if (storedUserString) {
                const storedUser = JSON.parse(storedUserString);
                token = storedUser.token;
            }

            if (!token) throw new Error(INFRASTRUCTURE.ERRORS.AUTH_TOKEN_NOT_FOUND);

            const url = `${API_BASE_URL}/download/site/${siteId}?auth_token=${token}`;
            
            // Use fetch to trigger the download and detect errors, while keeping the prompt visible
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = downloadUrl;
            a.download = `${siteId}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            
                updateStatusDisplay(INFRASTRUCTURE.STATUS.DOWNLOAD_READY, 'success');
                dismissPrompt('global-loading-prompt');
            } catch (e) {
                console.error('Firebase download error:', e);
                updateStatusDisplay(e.message.toLowerCase(), 'error');
                dismissPrompt('global-loading-prompt');
            }
    } else {
        orchestrator.updateStatus(INFRASTRUCTURE.STATUS.PREPARING_DOWNLOAD, 'info');
        orchestrator.execute({
            id: 'download',
            prepFn: () => fetchWithAuth(`${API_BASE_URL}/download/prepare/${deployment}`, { method: 'POST' }),
            strings: {
                ...INFRASTRUCTURE.STATUS,
                DEPLOYING: INFRASTRUCTURE.STATUS.PREPARING_DOWNLOAD,
                FINISHED: INFRASTRUCTURE.STATUS.DOWNLOAD_FINISHED
            },
            backMenuId: 'site-list-menu',
            interactive: false,
            onEvent: (eventName, payload, ws) => {
                if (eventName === 'DOWNLOAD_READY') {
                    const storedUserString = sessionStorage.getItem('currentUser');
                    let token = null;
                    if (storedUserString) {
                        const storedUser = JSON.parse(storedUserString);
                        token = storedUser.token;
                    }
                    const finalUrl = `${API_BASE_URL}${payload.url}${token ? `?auth_token=${token}` : ''}`;
                    
                    // Trigger download without navigating the current page
                    const link = document.createElement('a');
                    link.href = finalUrl;
                    link.download = `${deployment}.zip`;
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    return true; // Event handled
                }
                return false;
            },
            onComplete: async (payload, ws) => {
                orchestrator.updateStatus(INFRASTRUCTURE.STATUS.DOWNLOAD_READY, 'success');
                
                // Show a success prompt that returns to menu
                await prompt({
                    id: 'download-complete-prompt',
                    type: 'form',
                    text: INFRASTRUCTURE.STATUS.DOWNLOAD_FINISHED_MSG,
                    buttons: [{ label: 'ok', value: true }]
                });

                if (ws && ws.readyState < WebSocket.CLOSING) ws.close();
                orchestrator.cancel('download_complete');
            }
        });
        return { handled: true };
    }
}

export const destroyDeployment = requireAuth(async (params) => {
    const { deployment, machineId, renderMenu, menuContainer, menuTitle } = params;

    if (!deployment || !machineId) {
        updateStatusDisplay(INFRASTRUCTURE.ERRORS.INCOMPLETE_DATA, 'error');
        return;
    }

    const confirmation = await prompt(INFRASTRUCTURE.PROMPTS.SITE_DESTROY(deployment));

    if (confirmation.status !== 'answered' || confirmation.value !== 'yes') {
        updateStatusDisplay(INFRASTRUCTURE.STATUS.DESTROY_CANCELLED, 'info');
        return;
    }

    try {
        updateStatusDisplay(INFRASTRUCTURE.STATUS.INITIATING_DESTROY, 'info');
        const response = await fetchWithAuth(`${API_BASE_URL}/destroy`, {
            method: 'POST',
            body: {
                vm_id: machineId,
                deployment: deployment,
                infrastructure: params.infrastructure || 'vm'
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || INFRASTRUCTURE.STATUS.DESTROY_TASK_FAILED);
        }

        updateStatusDisplay(result.message.toLowerCase(), 'success');
        
        // After destruction, invalidate cache and refresh the list of sites.
        invalidateCache('instances');

        // Show a success prompt
        await prompt({
            id: 'deployment-destroyed-success-prompt',
            text: result.message.toLowerCase(),
            type: 'form',
            buttons: [{ label: SYSTEM.LABELS.OK, value: 'ok' }]
        });

        return await _listSitesLogic(params);

    } catch (e) {
        if (e.message === 'ReauthInitiated') throw e;
        if (e.id === 'permissions_required' || e.id === 'subscription_required' || e.id === 'project_not_initialized') throw e;
        if (e.message === SYSTEM.ERRORS.USER_CANCELLED) {
            throw e; // Let menu.js handle the transition back
        }
        console.error('Destroy error:', e);
        // Return to the current list as fallback
        return await _listSitesLogic(params);
    }
}, 'destroy a deployment');

export function openAddress(params) {
    if (params && params.url) {
        window.open(params.url, '_blank', 'noopener,noreferrer');
    }
}

export async function destroySite(params) {
    const { deployment, machineName, renderMenu } = params;
    if (!deployment || !machineName) {
            updateStatusDisplay(INFRASTRUCTURE.ERRORS.INCOMPLETE_DATA, 'error');
            return;
        }
    
    try {
        updateStatusDisplay(INFRASTRUCTURE.STATUS.DESTROYING, 'info');
        const response = await fetchWithAuth(`${API_BASE_URL}/destroy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vm_name: machineName, deployment: deployment })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || INFRASTRUCTURE.ERRORS.DESTROY_FAILED_GENERIC);
        updateStatusDisplay(INFRASTRUCTURE.STATUS.DESTROY_REQUESTED, 'success');
        
        return await _listSitesLogic(params);
    } catch (e) {
        if (e.message === 'ReauthInitiated') throw e;
        if (e.id === 'permissions_required' || e.id === 'subscription_required' || e.id === 'project_not_initialized') throw e;
        if (e.message === SYSTEM.ERRORS.USER_CANCELLED) {
            throw e; // Let menu.js handle the transition back
        }
        console.error('destroy error:', e);
        return await _listSitesLogic(params);
    }
}

// Register handlers with the central registry
registerHandler('listSites', listSites);
registerHandler('viewSite', viewSite);
registerHandler('downloadSite', downloadSite);
registerHandler('destroySite', destroySite);
registerHandler('destroyDeployment', destroyDeployment);
registerHandler('openAddress', openAddress);
