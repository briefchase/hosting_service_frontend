// Import the central menu registry and API base URL
import { menus, renderMenu, updateStatusDisplay, startLoading, showLoadingPrompt } from '/js/pages/menu.js';
import { registerHandler } from '../scripts/registry.js';
import { CONFIG } from '/js/config.js';
import { 
    fetchWithAuth, 
    updateAccountButtonVisibility,
    updateSiteTitleVisibility,
    applyWaveEffect
} from '/js/main.js';

const API_BASE_URL = CONFIG.API_BASE_URL;
import { requireAuth, getUser } from '/js/scripts/authenticate.js';
import { getSyncedData, invalidateCache } from '/js/scripts/sync.js';
import { prompt, dismissPrompt } from '/js/pages/prompt.js';
import { DOMAINS, SYSTEM, INFRASTRUCTURE } from '../strings.js';
import { 
    relinkDomain as relinkDomainApi, 
    purchaseDomain as apiPurchaseDomain, 
    fetchDomainRecords,
    fetchDomainDetails,
    transferOutDomain as apiTransferOutDomain,
    toggleDomainRenewal as apiToggleDomainRenewal,
    transferInDomain as apiTransferInDomain,
    addDomainRecord as apiAddDomainRecord,
    updateDomainRecord as apiUpdateDomainRecord,
    deleteDomainRecord as apiDeleteDomainRecord
} from '/js/scripts/api.js';

let cachedDomains = []; // Store domain data for lookups

export const _purchaseDomainLogic = requireAuth(async (params) => {
    const { updateStatusDisplay } = params;

    const answer = await prompt(DOMAINS.PROMPTS.REGISTRATION_LOOKUP);

    if (!answer || answer.status !== 'answered' || !answer.value) {
        return; // Stay on the current menu
    }
    
    const newDomainDetails = answer.value;
    const { domainName, price } = newDomainDetails;

    let offSession = false;
    if (cardOnFile) {
        const cardPrompt = await prompt(DOMAINS.PROMPTS.USE_CARD_ON_FILE(domainName, price));

        if (cardPrompt && cardPrompt.status === 'answered' && cardPrompt.value) {
            offSession = true;
        } else if (!cardPrompt || cardPrompt.status === 'canceled') {
            return; // Stay on the current menu
        }
    }

    const workFn = async () => {
        // Use 'loading...' for checkout initiation, 'purchasing...' for immediate charges
        const statusMsg = offSession ? DOMAINS.STATUS.PURCHASING(domainName) : SYSTEM.STATUS.LOADING;
        updateStatusDisplay(statusMsg, 'info');
        showLoadingPrompt(statusMsg);
        
        const user = getUser();
        if (!user || !user.token) {
            throw new Error(DOMAINS.ERRORS.AUTH_REQUIRED);
        }

        const result = await apiPurchaseDomain({
            domainName,
            price,
            offSession,
            token: user.token
        });

        if (result.ok) {
            if (!offSession) {
                const details = result.result && result.result.details;
                if (details && details.client_secret) {
                    // Handle embedded checkout
                    const checkoutPrompt = await prompt(DOMAINS.PROMPTS.CHECKOUT(domainName, details.client_secret));
                    
                    if (checkoutPrompt.status !== 'answered' || checkoutPrompt.value !== 'completed') {
                        throw new Error(SYSTEM.ERRORS.USER_CANCELLED);
                    }

                    // 3. Synchronously wait for the registration to complete
                    updateStatusDisplay(DOMAINS.STATUS.PURCHASING(domainName), 'info');
                    showLoadingPrompt(DOMAINS.STATUS.PURCHASING(domainName));
                    const waitResponse = await fetchWithAuth(`${API_BASE_URL}/domains/${domainName}/wait-registration`, {
                        method: 'POST'
                    });

                    const waitResult = await waitResponse.json();
                    if (!waitResponse.ok || !waitResult.success) {
                        dismissPrompt('domain-loading-prompt');
                        throw new Error(waitResult.error || DOMAINS.ERRORS.REGISTRATION_TIMEOUT);
                    }
                } else {
                    dismissPrompt('domain-loading-prompt');
                    throw new Error(DOMAINS.STATUS.CHECKOUT_INITIATING);
                }
            }

            // Fire a non-blocking success prompt so the user sees it 
            // while the background refreshes to the domain list.
            // Since it's marked as 'replace: true' in strings.js, it will kill the loading prompt.
            prompt(DOMAINS.PROMPTS.REGISTRATION_SUCCESS);

            invalidateCache('domains');
            return await listDomains(params);
        } else {
            dismissPrompt('domain-loading-prompt');
            throw new Error(result.error || DEPLOY.ERRORS.PURCHASE_FAILED);
        }
    };

    try {
        return await startLoading(workFn);
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        if (error.id === 'subscription_required' || error.id === 'project_not_initialized') throw error;
        if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
        console.error("Domain registration failed:", error);
        return 'domain-menu';
    }
}, 'purchase a domain');


let cardOnFile = false; // This now tracks if a card is on file

async function _listDomainsLogic(params) {
    const { renderMenu, updateStatusDisplay, initialMenuId } = params;
    try {
        updateStatusDisplay(DOMAINS.STATUS.FETCHING, 'info');

        // Use sync.js to get domains
        const domainData = await getSyncedData('domains', 'domains');
        cardOnFile = !!domainData.isCardOnFile;

        // Show a warning if GCP data is missing due to missing permissions
        if (domainData.gcpDataMissing) {
            console.log("[Domains] GCP data missing, showing warning prompt.");
            // We await this to ensure the back-stack stays synchronized and doesn't leak handlers.
            await prompt(DOMAINS.PROMPTS.CLOUD_PERMISSIONS_WARNING);
        }

        const allDeployments = [];
        // The backend now returns linked deployment info directly in the domain objects.
        // We no longer need to fetch sites separately for cross-referencing.
        
        if (domainData.message) {
            return {
                id: 'domain-menu',
                text: DOMAINS.LABELS.DOMAINS,
                items: [{ text: domainData.message, type: 'record' }],
                backTarget: 'resource-menu'
            };
        }

        const allDomainObjects = (domainData.domains || []).map(d => ({ 
            ...d, 
            isManaged: d.source === 'registrar'
        }));
        cachedDomains = allDomainObjects; // Update the cache

        const domainItems = allDomainObjects.map((d, index) => {
            const menuId = `domain-details-${d.domainName.replace(/\./g, '-')}`;
            
            // We no longer pre-generate the detail menus here.
            // They will be generated on-demand in viewDomainDetails.

            return {
                id: `domain-${d.domainName.replace(/\./g, '-')}`,
                text: d.domainName,
                type: 'record',
                action: 'viewDomainDetails',
                domainName: d.domainName,
                showLoading: true,
                className: index === allDomainObjects.length - 1 ? 'details-last-record' : ''
            };
        });

        domainItems.push({
            id: 'transfer-in-domain',
            text: DOMAINS.LABELS.TRANSFER_IN,
            type: 'button',
            action: 'transferInDomain',
            showLoading: false,
            tooltip: DOMAINS.TOOLTIPS.TRANSFER_IN
        });

        domainItems.push({
            id: 'register-new-domain',
            text: DOMAINS.LABELS.REGISTER,
            type: 'button',
            action: 'registerDomain',
            showLoading: false,
            tooltip: DOMAINS.TOOLTIPS.REGISTER 
        });

        domainItems.push({
            id: 'link-external-domain',
            text: DOMAINS.LABELS.LINK_EXTERNAL,
            type: 'button',
            action: 'linkExternalDomain',
            showLoading: false,
            tooltip: DOMAINS.TOOLTIPS.LINK_EXTERNAL 
        });

        const finalConfig = {
            id: 'domain-menu',
            text: DOMAINS.LABELS.DOMAINS_MENU,
            items: domainItems.length > 0 ? domainItems : [{ text: DOMAINS.LABELS.NO_DOMAINS, type: 'record' }],
            backTarget: 'dashboard-menu'
        };
        menus['domain-menu'] = finalConfig;
        return initialMenuId || 'domain-menu';
    } catch (error) {
        if (error.message === 'ReauthInitiated') {
            // Propagate to the requireAuth guard so it can save the pending action
            throw error;
        }
        if (error.id === 'permissions_required' || error.id === 'subscription_required' || error.id === 'project_not_initialized') {
            throw error;
        }
        return {
            id: 'domain-menu',
            text: SYSTEM.STATUS.ERROR,
            items: [{ text: DOMAINS.ERRORS.LOAD_DOMAINS_FAILED(error.message.toLowerCase()), type: 'record' }],
            backTarget: 'resource-menu'
        };
    }
}

export const listDomains = requireAuth(_listDomainsLogic, 'view domains');
export const relinkDomain = requireAuth(async (params) => {
    const { domainName, renderMenu, updateStatusDisplay, isExternal, isUnlink } = params;

    let deployment_name = null;
    let machine_id = null;
    let old_machine_id = null;
    let old_ip = null;
    let new_ip = null;

    // 1. Fetch all deployments to present as choices or for IP lookup
    updateStatusDisplay(DOMAINS.STATUS.FETCHING_DEPLOYMENTS, 'info');
    const state = await getSyncedData('instances', 'instances');
    const { compute, firebase } = state;
    
    if ((!compute || compute.length === 0) && (!firebase || firebase.length === 0)) {
        updateStatusDisplay(DOMAINS.ERRORS.NO_DEPLOYMENTS, 'error');
        return;
    }

    const allDeploymentsRaw = [];
    
    // Process Compute (VM) deployments
    if (Array.isArray(compute)) {
        compute.forEach(vm => {
            if (vm.deployments && vm.deployments.length > 0) {
                allDeploymentsRaw.push(...vm.deployments.map(dep => ({
                    ...dep,
                    machine_name: vm.name,
                    machine_id: vm.id,
                    ip_address: vm.ip_address,
                    infrastructure: 'vm'
                })));
            }
        });
    }

    // Process Firebase deployments
    if (Array.isArray(firebase)) {
        firebase.forEach(site => {
            allDeploymentsRaw.push({
                deployment_name: site.site_id,
                domain: site.domains && site.domains.length > 0 ? site.domains[0] : null,
                machine_name: 'firebase hosting',
                machine_id: 'firebase',
                ip_address: null,
                infrastructure: 'firebase',
                wordpress: false
            });
        });
    }

    // Find the deployment this domain is currently linked to
    const currentDeployment = allDeploymentsRaw.find(dep => dep.domain === domainName);
    if (currentDeployment) {
        old_machine_id = currentDeployment.machine_id;
        old_ip = currentDeployment.ip_address;
    }

    if (!isUnlink) {
        // Filter out the current deployment from the list of options
        // AND filter out any deployments that already have a domain linked to them
        const availableDeployments = allDeploymentsRaw.filter(dep => {
            if (dep.domain) return false;
            if (!currentDeployment) return true;
            return dep.deployment_name !== currentDeployment.deployment_name || dep.machine_id !== currentDeployment.machine_id;
        });

        if (availableDeployments.length === 0) {
            updateStatusDisplay(DOMAINS.ERRORS.NO_OTHER_DEPLOYMENTS, 'info');
            setTimeout(() => listDomains(params), 1500);
            return;
        }

        const deploymentOptions = availableDeployments.map(dep => ({
            value: {
                deployment_name: dep.deployment_name,
                machine_id: dep.machine_id,
                ip_address: dep.ip_address
            },
            label: DOMAINS.LABELS.DEPLOYMENT_ON_MACHINE(dep.deployment_name, dep.machine_name)
        }));

        // 2. Prompt user to select a deployment
        const answer = await prompt(DOMAINS.PROMPTS.RELINK_SELECT(domainName, deploymentOptions));

        if (!answer || answer.status !== 'answered' || !answer.value) {
            updateStatusDisplay(DOMAINS.ERRORS.RELINK_CANCELLED, 'info');
            return; // Stay on the current menu
        }

        deployment_name = answer.value.deployment_name;
        machine_id = answer.value.machine_id;
        new_ip = answer.value.ip_address;
    }

    // 3. Call the API
    const workFn = async () => {
        const msg = DOMAINS.STATUS.RELINKING(domainName, isUnlink);
        updateStatusDisplay(msg, 'info');
        showLoadingPrompt(msg);
        const result = await relinkDomainApi({
            domainName: domainName,
            deployment_name: deployment_name,
            machine_id: machine_id,
            isExternal: !!isExternal,
            isUnlink: !!isUnlink
        });

        if (result.ok) {
            const domainInfo = cachedDomains.find(d => d.domainName === domainName);
            if (domainInfo && domainInfo.source !== 'registrar') {
                let promptText = '';
                if (isUnlink) {
                    promptText = DOMAINS.LABELS.RELINK_HINT_DELETE(domainName, old_ip);
                } else if (old_ip && new_ip && old_ip !== new_ip) {
                    promptText = DOMAINS.LABELS.RELINK_HINT_CHANGE(domainName, old_ip, new_ip);
                } else {
                    promptText = DOMAINS.LABELS.RELINK_HINT_ENSURE(domainName, new_ip);
                }

                await prompt({ ...SYSTEM.PROMPTS.GENERIC_INFO(promptText), replace: true });
            } else {
                // If no hint prompt is shown, explicitly dismiss the loading prompt
                dismissPrompt('domain-loading-prompt');
            }
            // Invalidate cache since domain-deployment mapping changed
            invalidateCache('domains');
            invalidateCache('instances');
            // Return the menu target for organic transition
            return await viewDomainDetails({ domainName, updateStatusDisplay });
        } else {
            dismissPrompt('domain-loading-prompt');
            throw new Error(result.error || DOMAINS.ERRORS.RELINK_FAILED(isUnlink));
        }
    };

    try {
        return await startLoading(workFn);
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        if (error.id === 'subscription_required' || error.id === 'project_not_initialized') throw error;
        if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
        console.error(`Error during relink for ${domainName}:`, error);
        return 'domain-menu';
    }
}, 'relink domain');

export const toggleTransferOut = requireAuth(async (params) => {
    const { domainName, currentAction, renderMenu, updateStatusDisplay } = params;
    
    const workFn = async () => {
        const msg = DOMAINS.STATUS.TRANSFER_INITIATING(domainName, currentAction);
        updateStatusDisplay(msg);
        showLoadingPrompt(msg);

        const result = await apiTransferOutDomain({
            domainName: domainName,
            action: currentAction
        });

        if (result.ok) {
            if (currentAction === 'authorize') {
                await prompt({ ...DOMAINS.PROMPTS.TRANSFER_OUT_EMAILED, replace: true });
            } else {
                dismissPrompt('domain-loading-prompt');
            }
            updateStatusDisplay(DOMAINS.STATUS.TRANSFER_SUCCESS(domainName, currentAction), 'success');
            // Return the menu target for organic transition
            return await viewDomainDetails({ domainName, updateStatusDisplay });
        } else {
            dismissPrompt('domain-loading-prompt');
            throw new Error(result.error || `failed to ${currentAction} transfer.`);
        }
    };

    try {
        return await startLoading(workFn);
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        if (error.id === 'subscription_required' || error.id === 'project_not_initialized') throw error;
        if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
        console.error(`Error during ${currentAction} transfer:`, error);
        return `domain-details-${domainName.replace(/\./g, '-')}`;
    }
}, 'toggle transfer out');

export const toggleRenewal = requireAuth(async (params) => {
    const { domainName, enable, renderMenu, updateStatusDisplay } = params;
    
    // The 'enable' param comes from the dataset as a string 'true' or 'false'
    const isEnable = String(enable) === 'true';
    const actionText = isEnable ? DOMAINS.LABELS.RESUME_RENEWALS : DOMAINS.LABELS.CEASE_RENEWALS;

    const workFn = async () => {
        const msg = DOMAINS.STATUS.RENEWAL_TOGGLING(domainName, isEnable);
        updateStatusDisplay(msg);
        showLoadingPrompt(msg);

        const result = await apiToggleDomainRenewal({
            domainName: domainName,
            enable: isEnable
        });

        if (result.ok) {
            dismissPrompt('domain-loading-prompt');
            updateStatusDisplay(DOMAINS.STATUS.RENEWAL_SUCCESS(domainName, isEnable), 'success');
            return await viewDomainDetails({ domainName, updateStatusDisplay });
        } else {
            dismissPrompt('domain-loading-prompt');
            throw new Error(result.error || `failed to ${actionText}.`);
        }
    };

    try {
        return await startLoading(workFn);
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        if (error.id === 'subscription_required' || error.id === 'project_not_initialized') throw error;
        if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
        console.error(`Error during ${actionText}:`, error);
        return `domain-details-${domainName.replace(/\./g, '-')}`;
    }
}, 'toggle renewal');

export const transferInDomain = requireAuth(async (params) => {
    const { renderMenu, updateStatusDisplay } = params;

    const domainAnswer = await prompt(DOMAINS.PROMPTS.TRANSFER_IN_NAME);

    if (!domainAnswer || domainAnswer.status !== 'answered' || !domainAnswer.value) {
        return; // Stay on the current menu
    }
    const domainName = domainAnswer.value.domainName;

    const authCodeAnswer = await prompt(DOMAINS.PROMPTS.TRANSFER_IN_AUTH(domainName));

    if (!authCodeAnswer || authCodeAnswer.status !== 'answered' || !authCodeAnswer.value) {
        return; // Stay on the current menu
    }
    const authCode = authCodeAnswer.value.authCode;

    const workFn = async () => {
        const msg = DOMAINS.STATUS.TRANSFER_IN_INITIATING(domainName);
        updateStatusDisplay(msg, 'info');
        showLoadingPrompt(msg);

        const result = await apiTransferInDomain({
            domainName: domainName,
            authCode: authCode
        });

        if (result.ok) {
            dismissPrompt('domain-loading-prompt');
            updateStatusDisplay(DOMAINS.STATUS.TRANSFER_IN_SUCCESS(domainName), 'success');
            return await listDomains(params);
        } else {
            dismissPrompt('domain-loading-prompt');
            throw new Error(result.error || DOMAINS.ERRORS.TRANSFER_IN_FAILED);
        }
    };

    try {
        return await startLoading(workFn);
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        if (error.id === 'subscription_required' || error.id === 'project_not_initialized') throw error;
        if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
        console.error("Transfer-in failed:", error);
        return 'domain-menu';
    }
}, 'transfer in domain');

export const linkExternalDomain = requireAuth(async (params) => {
    const { renderMenu, updateStatusDisplay } = params;

    // 1. Fetch all deployments to present as choices
    updateStatusDisplay(DOMAINS.STATUS.FETCHING_DEPLOYMENTS, 'info');
    const state = await getSyncedData('instances', 'instances');
    const sitesData = state.compute || [];
    if (!sitesData || sitesData.length === 0 || (sitesData.length === 1 && sitesData[0].id === 'no-deployments')) {
        updateStatusDisplay(DOMAINS.ERRORS.NO_DEPLOYMENTS, 'error');
        return;
    }

    const allDeploymentsRaw = [];
    sitesData.forEach(vm => {
        if (vm.deployments && vm.deployments.length > 0) {
            allDeploymentsRaw.push(...vm.deployments.map(dep => ({
                ...dep,
                machine_name: vm.name,
                machine_id: vm.id,
                ip_address: vm.ip_address
            })));
        }
    });

    // Filter out any deployments that already have a domain linked to them
    const availableDeployments = allDeploymentsRaw.filter(dep => !dep.domain);

    const deploymentOptions = availableDeployments.map(dep => ({
        value: {
            deployment_name: dep.deployment_name,
            machine_id: dep.machine_id
        },
        label: `${dep.deployment_name} on ${dep.machine_name}`
    }));

    // 2. Prompt user to select a deployment
    const deploymentAnswer = await prompt(DOMAINS.PROMPTS.EXTERNAL_LINK_SELECT(deploymentOptions));

    if (!deploymentAnswer || deploymentAnswer.status !== 'answered' || !deploymentAnswer.value) {
        return; // Stay on the current menu
    }

    const { deployment_name, machine_id } = deploymentAnswer.value;
    const targetMachine = allDeploymentsRaw.find(dep => dep.machine_id === machine_id);
    const targetIp = targetMachine ? targetMachine.ip_address : DOMAINS.LABELS.SERVER_IP;

    // 3. Prompt for the domain name
    const domainAnswer = await prompt(DOMAINS.PROMPTS.EXTERNAL_LINK_INPUT);

    if (!domainAnswer || domainAnswer.status !== 'answered' || !domainAnswer.value) {
        return; // Stay on the current menu
    }
    const domainName = domainAnswer.value.domainName;

    // 4. Call the API
    const workFn = async () => {
        const msg = DOMAINS.STATUS.LINKING_EXTERNAL(domainName);
        updateStatusDisplay(msg, 'info');
        showLoadingPrompt(msg);
        const response = await fetchWithAuth(`${API_BASE_URL}/relink`, {
            method: 'POST',
            body: {
                domainName: domainName,
                deployment_name: deployment_name,
                machine_id: machine_id,
                isExternal: true
            }
        });

        const result = await response.json();

        if (response.ok && !result.error) {
            await prompt({ ...SYSTEM.PROMPTS.GENERIC_INFO(`ensure there is an a record for ${domainName} associated with ${targetIp}`), replace: true });
            return await listDomains({ ...params, initialMenuId: `domain-details-${domainName.replace(/\./g, '-')}` });
        } else {
            dismissPrompt('domain-loading-prompt');
            throw new Error(result.error || DOMAINS.ERRORS.EXTERNAL_LINK_FAILED);
        }
    };

    try {
        return await startLoading(workFn);
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        if (error.id === 'subscription_required' || error.id === 'project_not_initialized') throw error;
        if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
        console.error("External link failed:", error);
        return 'domain-menu';
    }
}, 'link external domain');

export const viewRecords = requireAuth(async (params) => {
    const { domainName, renderMenu, updateStatusDisplay } = params;
    const menuId = `domain-records-${domainName.replace(/\./g, '-')}`;

    try {
        updateStatusDisplay(DOMAINS.STATUS.FETCHING_RECORDS(domainName), 'info');
        
        const domain = cachedDomains.find(d => d.domainName === domainName);
        const isManaged = domain ? domain.isManaged : false;
        
        const data = await fetchDomainRecords(domainName);
        const records = (data.records || []).filter(r => r.type !== 'NS' && r.type !== 'SOA');

        const recordItems = records.map((r, index) => {
            const name = r.name || '@';
            const ttlSeconds = (r.ttl !== undefined && r.ttl !== null) ? r.ttl : null;
            
            const recordTitle = DOMAINS.LABELS.RECORDS_TITLE(r.type, name, r.content);
            const isLast = index === records.length - 1;

            return {
                id: `record-${domainName.replace(/\./g, '-')}-${r.id || index}`,
                text: recordTitle,
                type: 'record',
                className: isLast ? 'details-last-record' : '',
                action: 'editDomainRecord',
                domainName,
                recordId: r.id,
                host: r.name,
                recordType: r.type,
                value: r.content,
                ttl: ttlSeconds,
                isManaged
            };
        });

        if (records.length === 0) {
            recordItems.push({ text: DOMAINS.LABELS.NO_RECORDS, type: 'record', className: 'details-last-record' });
        }

        if (isManaged) {
            recordItems.push({
                id: 'add-record-button',
                text: DOMAINS.LABELS.ADD_RECORD,
                type: 'button',
                action: 'addDomainRecord',
                domainName: domainName,
                showLoading: false
            });
        }

        menus[menuId] = {
            id: menuId,
            text: DOMAINS.LABELS.RECORDS_FOR(domainName),
            items: recordItems,
            backTarget: `domain-details-${domainName.replace(/\./g, '-')}`
        };

        return menuId;
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        if (error.id === 'subscription_required' || error.id === 'project_not_initialized') throw error;
        if (error.message === SYSTEM.ERRORS.USER_CANCELLED) {
            console.log("[ViewRecords] user_cancelled caught, propagating.");
            throw error; // Let menu.js handle the transition back
        }
        console.error("Failed to fetch records:", error);
        return `domain-details-${domainName.replace(/\./g, '-')}`;
    }
}, 'view records');

const _getRecordFormItems = (initialValues = {}) => [
    {
        type: 'row',
        items: [
            { 
                id: 'type', 
                type: 'select', 
                label: DOMAINS.LABELS.TYPE_FIELD, 
                value: initialValues.recordType,
                options: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'],
                width: '18%'
            },
            { 
                id: 'host', 
                type: 'text', 
                label: DOMAINS.LABELS.HOST_FIELD, 
                value: initialValues.host || '@', 
                placeholder: DOMAINS.PLACEHOLDERS.HOST, 
                width: '25%',
                validationRegex: '^[a-zA-Z0-9.@_-]+$'
            },
            { 
                id: 'value', 
                type: 'text', 
                label: DOMAINS.LABELS.VALUE_FIELD, 
                value: initialValues.value, 
                placeholder: DOMAINS.PLACEHOLDERS.VALUE,
                validationRegex: '^.+$'
            },
            { 
                id: 'ttl', 
                type: 'text', 
                label: DOMAINS.LABELS.TTL_FIELD, 
                value: (initialValues.ttl !== undefined && initialValues.ttl !== null) ? String(Math.round(initialValues.ttl / 60)) : '', 
                placeholder: DOMAINS.PLACEHOLDERS.TTL, 
                width: '15%',
                validationRegex: '^[0-9]+$'
            }
        ]
    }
];

export const addDomainRecord = async (params) => {
    const { domainName } = params;
    
    const result = await prompt(DOMAINS.PROMPTS.DNS_RECORD_MANAGE(domainName, false, _getRecordFormItems()));

    if (result.status === 'answered' && result.value && result.value !== 'cancel') {
        const { host, type, value, ttl } = result.value;
        
        const workFn = async () => {
            showLoadingPrompt(DOMAINS.STATUS.ADDING_RECORD(type));
            const result = await apiAddDomainRecord({
                domainName,
                type,
                name: host === '@' ? '' : host,
                content: value,
                ttl: (parseInt(ttl, 10) || 10) * 60
            });

            if (result.ok) {
                await prompt({
                    text: DOMAINS.STATUS.RECORD_ADD_SUCCESS,
                    type: 'form',
                    replace: true,
                    buttons: [{ label: 'ok', value: true }]
                });
                // Refresh the records view
                return await viewRecords(params);
            } else {
                throw new Error(result.error || DOMAINS.ERRORS.ADD_RECORD_FAILED);
            }
        };

        try {
            return await startLoading(workFn);
        } catch (error) {
            if (error.message === 'ReauthInitiated') throw error;
            if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
            console.error('Error adding record:', error);
            await prompt({
                text: SYSTEM.ERRORS.GENERIC_ERROR_MSG(error.message),
                type: 'form',
                replace: true,
                buttons: [{ label: 'ok', value: true }]
            });
            return await viewRecords(params);
        }
    }
};

export const editDomainRecord = async (params) => {
    const { domainName, recordId, host, recordType, value, ttl, isManaged } = params;
    
    // If not managed, just show information in a non-editable info prompt
    if (!isManaged) {
        const ttlDisplay = ttl === null ? 'n/a' : `${Math.round(ttl / 60)} mins`;
        const infoText = `type: ${recordType}<br>host: ${host || '@'}<br>value: ${value}<br>ttl: ${ttlDisplay}`;
        return await prompt(SYSTEM.PROMPTS.GENERIC_INFO(infoText));
    }

    const result = await prompt(DOMAINS.PROMPTS.DNS_RECORD_MANAGE(domainName, true, _getRecordFormItems({ host, recordType, value, ttl })));

    if (!result || result.status !== 'answered' || result.value === 'cancel') {
        return;
    }

    if (result.value === 'delete') {
        return await deleteDomainRecord(params);
    }

    // Otherwise it's a save
    const { host: newHost, type: newType, value: newValue, ttl: newTtl } = result.value;
    
    const workFn = async () => {
        showLoadingPrompt(DOMAINS.STATUS.UPDATING_RECORD);
        const result = await apiUpdateDomainRecord({
            domainName,
            recordId,
            type: newType,
            name: newHost === '@' ? '' : newHost,
            content: newValue,
            ttl: (parseInt(newTtl, 10) || 10) * 60
        });

        if (result.ok) {
            await prompt({
                text: DOMAINS.STATUS.RECORD_UPDATE_SUCCESS,
                type: 'form',
                replace: true,
                buttons: [{ label: 'ok', value: true }]
            });
            return await viewRecords(params);
        } else {
            throw new Error(result.error || DOMAINS.ERRORS.UPDATE_RECORD_FAILED);
        }
    };

    try {
        return await startLoading(workFn);
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
        console.error('Error updating record:', error);
        await prompt({
            text: SYSTEM.ERRORS.GENERIC_ERROR_MSG(error.message),
            type: 'form',
            replace: true,
            buttons: [{ label: 'ok', value: true }]
        });
        return await viewRecords(params);
    }
};

export const deleteDomainRecord = async (params) => {
    const { domainName, recordId } = params;
    
    const confirmation = await prompt(DOMAINS.PROMPTS.DNS_RECORD_DELETE);

    if (confirmation.status === 'answered' && confirmation.value === 'yes') {
        const workFn = async () => {
            showLoadingPrompt(DOMAINS.STATUS.DELETING_RECORD);
            const result = await apiDeleteDomainRecord({ domainName, recordId });

            if (result.ok) {
                await prompt({
                    text: DOMAINS.STATUS.RECORD_DELETE_SUCCESS,
                    type: 'form',
                    replace: true,
                    buttons: [{ label: 'ok', value: true }]
                });
                // Refresh the records cache
                return await viewRecords(params);
            } else {
                throw new Error(result.error || DOMAINS.ERRORS.DELETE_RECORD_FAILED);
            }
        };

        try {
            return await startLoading(workFn);
        } catch (error) {
            if (error.message === 'ReauthInitiated') throw error;
            if (error.message === SYSTEM.ERRORS.USER_CANCELLED) throw error;
            console.error('Error deleting record:', error);
            await prompt({
                text: SYSTEM.ERRORS.GENERIC_ERROR_MSG(error.message),
                type: 'form',
                replace: true,
                buttons: [{ label: 'ok', value: true }]
            });
            return await viewRecords(params);
        }
    }
};

export const viewDomainDetails = requireAuth(async (params) => {
    const { domainName, updateStatusDisplay } = params;
    const menuId = `domain-details-${domainName.replace(/\./g, '-')}`;

    try {
        // 1. Update status (will show in standard loading overlay)
        updateStatusDisplay(DOMAINS.STATUS.FETCHING_DETAILS(domainName), 'info');

        // 2. Fetch the deep details from the new endpoint
        const details = await fetchDomainDetails(domainName);
        
        // 3. Find the existing cached object to preserve its data (like deployment_name, source, etc.)
        const cached = cachedDomains.find(d => d.domainName === domainName) || { domainName };
        
        // 4. Merge the fresh deep details into the cached object
        const d = { ...cached, ...details };

        // 5. Generate the real detail items
        const detailItems = [];

        if (d.relinking_status) {
            const targetName = d.relinking_status.target_deployment;
            detailItems.push({
                text: targetName ? DOMAINS.LABELS.RELINKING_TO(targetName) : DOMAINS.LABELS.UNLINKING,
                type: 'record'
            });
        } else {
            detailItems.push({
                text: `${DOMAINS.LABELS.SITE} ${d.deployment_name || INFRASTRUCTURE.LABELS.SITE_UNLINKED}`,
                type: 'record'
            });

            if (d.source === 'registrar') {
                if (d.expireTime) {
                    detailItems.push({
                        text: `${DOMAINS.LABELS.EXPIRES} ${d.expireTime}`,
                        type: 'record'
                    });
                }

                detailItems.push({
                    text: `${DOMAINS.LABELS.AUTO_RENEW} ${d.autoRenew ? DOMAINS.LABELS.ENABLED : DOMAINS.LABELS.DISABLED}`,
                    type: 'record'
                });

                detailItems.push({
                    text: `${DOMAINS.LABELS.TRANSFERRABLE} ${d.transferLockEnabled === false ? DOMAINS.LABELS.UNLOCKED : DOMAINS.LABELS.LOCKED}`,
                    type: 'record',
                    className: 'details-last-record'
                });
            } else {
                detailItems.push({
                    text: DOMAINS.LABELS.MANAGED_EXTERNAL,
                    type: 'record',
                    className: 'details-last-record'
                });
            }

            detailItems.push({
                id: `relink-${d.domainName.replace(/\./g, '-')}`,
                text: d.deployment_name ? DOMAINS.LABELS.RELINK : DOMAINS.LABELS.LINK,
                type: 'button',
                action: 'relinkDomain',
                domainName: d.domainName,
                showLoading: false,
                tooltip: d.deployment_name ? DOMAINS.TOOLTIPS.RELINK : DOMAINS.TOOLTIPS.LINK,
                isExternal: d.source !== 'registrar'
            });

            if (d.deployment_name) {
                detailItems.push({
                    id: `unlink-${d.domainName.replace(/\./g, '-')}`,
                    text: DOMAINS.LABELS.UNLINK,
                    type: 'button',
                    action: 'relinkDomain',
                    domainName: d.domainName,
                    isUnlink: true,
                    isExternal: d.source !== 'registrar',
                    showLoading: false,
                    tooltip: DOMAINS.TOOLTIPS.UNLINK
                });
            }

            detailItems.push({
                id: `records-${d.domainName.replace(/\./g, '-')}`,
                text: DOMAINS.LABELS.RECORDS,
                type: 'button',
                action: 'viewRecords',
                domainName: d.domainName,
                showLoading: true,
                tooltip: DOMAINS.TOOLTIPS.RECORDS
            });

            if (d.source === 'registrar') {
                detailItems.push({
                    id: `transfer-out-${d.domainName.replace(/\./g, '-')}`,
                    text: d.transferLockEnabled === false ? DOMAINS.LABELS.CANCEL_TRANSFER : DOMAINS.LABELS.TRANSFER_OUT,
                    type: 'button',
                    action: 'toggleTransferOut',
                    domainName: d.domainName,
                    currentAction: d.transferLockEnabled === false ? 'cancel' : 'authorize',
                    showLoading: false,
                    tooltip: d.transferLockEnabled === false ? DOMAINS.TOOLTIPS.RELOCK : DOMAINS.TOOLTIPS.MOVE_REGISTRAR
                });

                detailItems.push({
                    id: `cease-renewals-${d.domainName.replace(/\./g, '-')}`,
                    text: d.autoRenew ? DOMAINS.LABELS.CEASE_RENEWALS : DOMAINS.LABELS.RESUME_RENEWALS,
                    type: 'button',
                    action: 'toggleRenewal',
                    domainName: d.domainName,
                    enable: !d.autoRenew,
                    showLoading: false,
                    tooltip: d.autoRenew ? DOMAINS.TOOLTIPS.CEASE_RENEWALS : DOMAINS.TOOLTIPS.RESUME_RENEWALS
                });
            }
        }

        // 5. Return the menu configuration object. 
        // menu.js will handle the rendering and stack management.
        const finalMenu = {
            id: menuId,
            text: d.domainName,
            items: detailItems,
            backTarget: 'domain-menu'
        };

        // Save to the global menus registry so back-navigation works.
        // Subsequent clicks on the domain record will still trigger this action
        // and force a fresh fetch, but the back button will use this cached version.
        menus[menuId] = finalMenu;

        return finalMenu;

    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        console.error("Failed to fetch domain details:", error);
        return {
            id: menuId,
            text: SYSTEM.STATUS.ERROR,
            items: [{ text: DOMAINS.ERRORS.LOAD_DETAILS_FAILED(error.message), type: 'record' }],
            backTarget: 'domain-menu'
        };
    }
}, 'view domain details');

// Register handlers with the central registry
registerHandler('listDomains', listDomains);
registerHandler('viewDomainDetails', viewDomainDetails);
registerHandler('registerDomain', _purchaseDomainLogic);
registerHandler('relinkDomain', relinkDomain);
registerHandler('toggleTransferOut', toggleTransferOut);
registerHandler('toggleRenewal', toggleRenewal);
registerHandler('transferInDomain', transferInDomain);
registerHandler('linkExternalDomain', linkExternalDomain);
registerHandler('viewRecords', viewRecords);
registerHandler('addDomainRecord', addDomainRecord);
registerHandler('editDomainRecord', editDomainRecord);
registerHandler('deleteDomainRecord', deleteDomainRecord);
