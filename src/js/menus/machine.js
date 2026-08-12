import { menus, renderMenu, updateStatusDisplay, startLoading } from '/js/pages/menu.js';
import { registerHandler } from '../scripts/registry.js';
import { requireAuth } from '/js/scripts/authenticate.js';
import { getSyncedData, invalidateCache } from '/js/scripts/sync.js';
import { CONFIG } from '/js/config.js';
import {
    fetchWithAuth,
    updateAccountButtonVisibility,
    updateSiteTitleVisibility,
} from '/js/main.js';

const API_BASE_URL = CONFIG.API_BASE_URL;
import { prompt } from '/js/pages/prompt.js';
import { INFRASTRUCTURE, SYSTEM, DEPLOY } from '../strings.js';
import { orchestrator } from '../scripts/orchestrator.js';

// No more global cache.

function generateMachineDetailsMenu(vm) {
    if (!vm) {
        return {
            id: `machine-details-error-generic`,
            text: SYSTEM.STATUS.ERROR,
            items: [{ id: 'machine-not-found', text: INFRASTRUCTURE.ERRORS.MACHINE_NOT_FOUND, type: 'record' }],
            backTarget: 'machine-list-menu'
        };
    }

    const machineType = vm.machine_type ? vm.machine_type.split('/').pop() : SYSTEM.LABELS.UNKNOWN;

    const detailItems = [
        { id: `details-ip-${vm.id}`, text: `${INFRASTRUCTURE.LABELS.IP} ${vm.ip_address || SYSTEM.LABELS.NA}`, type: 'record' },
        { id: `details-size-${vm.id}`, text: `${INFRASTRUCTURE.LABELS.SIZE} ${machineType}`, type: 'record' },
        { id: `details-zone-${vm.id}`, text: `${INFRASTRUCTURE.LABELS.ZONE} ${vm.zone || SYSTEM.LABELS.UNKNOWN}`, type: 'record' },
        { id: `details-status-${vm.id}`, text: `${INFRASTRUCTURE.LABELS.STATUS} ${vm.status || SYSTEM.LABELS.UNKNOWN}`, type: 'record' }
    ];

    const deploymentItems = [
        { text: INFRASTRUCTURE.LABELS.DEPLOYMENTS, type: 'record', className: 'label-record' }
    ];

    if (vm.deployments && vm.deployments.length > 0) {
        vm.deployments.forEach((d, index) => {
            deploymentItems.push({
                id: `details-deployment-${vm.id}-${index}`,
                text: d.deployment_name,
                type: 'record',
                action: 'viewSite',
                id: d.deployment_name // Pass the clean name as id
            });
        });
    } else {
        deploymentItems.push({
            id: `details-deployment-none-${vm.id}`,
            text: INFRASTRUCTURE.LABELS.NONE,
            type: 'record'
        });
    }

    detailItems.push({
        id: `details-deployments-container-${vm.id}`,
        type: 'horizontal-container',
        items: deploymentItems
    });

    // Add connect and destroy buttons with all necessary data for their actions.
    detailItems.push({ 
        id: `connect-vm-${vm.id}`, 
        text: 'connect', 
        type: 'button',
        action: 'connectMachine',
        resourceId: vm.id,
        tooltip: INFRASTRUCTURE.TOOLTIPS.CONNECT
    });
    detailItems.push({ 
        id: `rename-vm-${vm.id}`, 
        text: SYSTEM.LABELS.RENAME, 
        type: 'button', 
        action: 'renameMachine',
        showLoading: true, 
        resourceId: vm.id,
        machineName: vm.name,
        zone: vm.zone,
        tooltip: INFRASTRUCTURE.TOOLTIPS.RENAME
    });
    detailItems.push({ 
        id: `destroy-vm-${vm.id}`, 
        text: SYSTEM.LABELS.DESTROY, 
        type: 'button', 
        action: 'destroyMachine', 
        showLoading: true, // Opt-in to the generic loading UI
        resourceId: vm.id,
        machineName: vm.name,
        tooltip: INFRASTRUCTURE.TOOLTIPS.DESTROY
    });

    return {
        id: `machine-details-menu-${vm.id}`,
        text: INFRASTRUCTURE.LABELS.MACHINE_ID(vm.name),
        items: detailItems,
        backTarget: 'machine-list-menu'
    };
}

async function fetchAndProcessMachines() {
    return await getSyncedData('machines', 'machines');
}

function cacheAllMachineMenus(vms) {
    if (!vms) vms = []; // Handle silent failure result
    const machineItems = vms.map(vm => ({
        id: `machine-${vm.id}`,
        text: vm.name,
        type: 'record',
        action: 'viewMachine',
        targetMenu: `machine-details-menu-${vm.id}`,
        resourceId: vm.id,
        tooltip: INFRASTRUCTURE.TOOLTIPS.MACHINES
    }));

    if (machineItems.length === 0) {
         machineItems.push({ id: 'no-machines', text: INFRASTRUCTURE.LABELS.NO_MACHINES, type: 'record' });
    }

    menus['machine-list-menu'] = {
        id: 'machine-list-menu',
        text: INFRASTRUCTURE.LABELS.MACHINES_MENU,
        items: machineItems,
        backTarget: 'dashboard-menu'
    };
    
    vms.forEach(vm => {
        menus[`machine-details-menu-${vm.id}`] = generateMachineDetailsMenu(vm);
    });
}

async function _listMachinesLogic(params) {
    const { updateStatusDisplay } = params;
    updateStatusDisplay(INFRASTRUCTURE.STATUS.FETCHING_MACHINES, 'info');
    const vms = await fetchAndProcessMachines();
    cacheAllMachineMenus(vms);
    return 'machine-list-menu';
}

export const connectMachine = requireAuth(async (params) => {
    const { resourceId } = params;
    orchestrator.updateStatus(SYSTEM.STATUS.CONNECTING, 'info');
    
    orchestrator.execute({
        id: 'connect',
        prepFn: () => fetchWithAuth(`${API_BASE_URL}/connect/${resourceId}`, { method: 'POST' }),
        interactive: true,
        strings: {
            ...DEPLOY.STATUS,
            DEPLOYING: 'connecting...', // Title
            FINISHED: 'connection closed.'
        },
        backMenuId: 'machine-list-menu'
    });
}, 'connect to a machine');

export const destroyMachine = requireAuth(async (params) => {
    const { resourceId, machineName, renderMenu, updateStatusDisplay } = params;
    if (!resourceId) {
        return updateStatusDisplay(INFRASTRUCTURE.ERRORS.MISSING_MACHINE_ID, 'error');
    }

    const confirmation = await prompt(INFRASTRUCTURE.PROMPTS.MACHINE_DESTROY(machineName));

    if (confirmation.status !== 'answered' || confirmation.value !== 'yes') {
        return updateStatusDisplay(INFRASTRUCTURE.STATUS.DESTROY_CANCELLED, 'info');
    }

    try {
        updateStatusDisplay(INFRASTRUCTURE.STATUS.INITIATING_DESTROY, 'info');
        const response = await fetchWithAuth(`${API_BASE_URL}/destroy`, {
            method: 'POST',
            body: { vm_id: resourceId }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || INFRASTRUCTURE.STATUS.DESTROY_FAILED);
        }

        updateStatusDisplay((result.message || INFRASTRUCTURE.STATUS.DESTROY_SUCCESS).toLowerCase(), 'success');
        
        // After destruction, invalidate cache to ensure the list is refreshed
        invalidateCache('machines');
        invalidateCache('instances');

        // Show a success prompt so the user knows it's finished
        await prompt({
            id: 'machine-destroyed-success-prompt',
            text: (result.message || INFRASTRUCTURE.STATUS.DESTROY_SUCCESS).toLowerCase(),
            type: 'form',
            buttons: [{ label: SYSTEM.LABELS.OK, value: 'ok' }]
        });

        return await _listMachinesLogic({ renderMenu, updateStatusDisplay });

    } catch (e) {
        if (e.message === 'ReauthInitiated') throw e;
        if (e.id === 'permissions_required' || e.id === 'subscription_required' || e.id === 'project_not_initialized') throw e;
        if (e.message !== SYSTEM.ERRORS.USER_CANCELLED) {
            console.error('Destroy machine error:', e);
        }
        return await _listMachinesLogic({ renderMenu, updateStatusDisplay });
    }
}, 'destroy a machine');

export const renameMachine = requireAuth(async (params) => {
    const { resourceId, machineName, zone, renderMenu, updateStatusDisplay } = params;
    if (!resourceId || !zone) {
        updateStatusDisplay(INFRASTRUCTURE.ERRORS.MISSING_MACHINE_DATA, 'error');
        return;
    }

    const newNamePrompt = await prompt(INFRASTRUCTURE.PROMPTS.MACHINE_RENAME(machineName));

    if (newNamePrompt.status !== 'answered' || !newNamePrompt.value || newNamePrompt.value.newName === machineName) {
        updateStatusDisplay(INFRASTRUCTURE.ERRORS.RENAME_CANCELLED, 'info');
        return;
    }

    const newName = newNamePrompt.value.newName;

    const workFn = async () => {
        updateStatusDisplay(INFRASTRUCTURE.STATUS.RENAMING, 'info');

        try {
            const response = await fetchWithAuth(`${API_BASE_URL}/rename`, {
                method: 'POST',
                body: {
                    vm_id: resourceId,
                    zone: zone,
                    new_display_name: newName
                }
            });

            const result = await response.json();

            if (response.ok && result.success) {
                updateStatusDisplay(INFRASTRUCTURE.STATUS.RENAME_SUCCESS, 'success');
                
                // Invalidate cache since the machine name has changed
                invalidateCache('machines');
                invalidateCache('instances');

                // Success prompt
                await prompt({
                    id: 'machine-renamed-success-prompt',
                    text: INFRASTRUCTURE.STATUS.RENAME_SUCCESS.toLowerCase(),
                    type: 'form',
                    buttons: [{ label: SYSTEM.LABELS.OK, value: 'ok' }]
                });

                // Return the menu target for organic transition
                return await _listMachinesLogic({ renderMenu, updateStatusDisplay });
            } else {
                throw new Error(result.error || INFRASTRUCTURE.ERRORS.RENAME_FAILED);
            }
        } catch (error) {
            if (error.message === 'ReauthInitiated') throw error;
            if (error.id === 'permissions_required' || error.id === 'subscription_required' || error.id === 'project_not_initialized') throw error;
            if (error.message !== SYSTEM.ERRORS.USER_CANCELLED) {
                console.error('Error renaming machine:', error);
            }
            // If the rename fails, we should still refresh the machine list
            // to return the user to a stable state.
            return await _listMachinesLogic({ renderMenu, updateStatusDisplay });
        }
    };

    return await startLoading(workFn);
});

export async function viewMachine(params) {
    const { resourceId, renderMenu } = params;
    if (menus[`machine-details-menu-${resourceId}`]) {
        renderMenu(`machine-details-menu-${resourceId}`);
    } else {
        // Fallback or re-fetch logic if needed, similar to viewSite
        renderMenu('machine-list-menu');
    }
}

export const listMachines = requireAuth(_listMachinesLogic, 'view machines');

// Register handlers with the central registry
registerHandler('listMachines', listMachines);
registerHandler('viewMachine', viewMachine);
registerHandler('destroyMachine', destroyMachine);
registerHandler('renameMachine', renameMachine);
registerHandler('connectMachine', connectMachine);
