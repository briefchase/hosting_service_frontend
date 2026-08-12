import { menus, updateStatusDisplay, showLoadingPrompt } from '/js/pages/menu.js';
import { registerHandler } from '../scripts/registry.js';
import { requireAuth } from '/js/scripts/authenticate.js';
import { BACKUP, SYSTEM, DOMAINS } from '../strings.js';
import { fetchWithAuth } from '/js/main.js';
import { CONFIG } from '/js/config.js';
const API_BASE_URL = CONFIG.API_BASE_URL;
import { getSyncedData, invalidateCache } from '/js/scripts/sync.js';
import { prompt } from '/js/pages/prompt.js';
import { applyWaveEffect } from '../scripts/effects.js';
import { orchestrator } from '../scripts/orchestrator.js';

let lastFetchedDeployments = [];
let lastFetchedMachines = [];

// --- UNWRAPPED ACTIONS ---

const _listDeploymentsForBackup = async (params) => {
        const { updateStatusDisplay } = params;
        updateStatusDisplay(BACKUP.STATUS.FETCHING_DEPLOYMENTS, 'info');
        const vms = await getSyncedData('machines', 'machines');
        let deployments = [];
        let emptyMessage = BACKUP.ERRORS.NO_DEPLOYMENTS_FOUND;

        if (Array.isArray(vms)) {
            if (vms.length === 1 && vms[0].id === 'no-deployments') {
                emptyMessage = vms[0].name;
            } else {
                vms.forEach(vm => {
                    if (vm.deployments && vm.deployments.length > 0) {
                        const deploymentsOnVm = vm.deployments.map(dep => ({
                            id: `${vm.id}-${dep.deployment_name}`,
                            name: dep.deployment_name,
                            deployment: dep.deployment_name,
                            vm_name: vm.name,
                            project_id: vm.project_id,
                        }));
                        deployments.push(...deploymentsOnVm);
                    }
                });
            }
        }

        lastFetchedDeployments = deployments;

        if (deployments.length === 0) {
            return {
                id: 'no-deployments-for-backup',
                text: emptyMessage,
                items: [],
                backTarget: 'backup-menu'
            };
        }

        const menuItems = deployments.map(deployment => ({
            id: `backup-${deployment.id}`,
            text: DOMAINS.LABELS.DEPLOYMENT_ON_MACHINE(deployment.name, deployment.vm_name),
            type: 'record',
            action: 'createScriptBackup',
            showLoading: true,
            resourceId: deployment.id
        }));

        const deploymentsMenu = {
            id: 'select-deployment-for-backup',
            text: BACKUP.LABELS.SELECT_DEPLOYMENT_BACKUP,
            items: menuItems,
            backTarget: 'backup-menu'
        };

        menus[deploymentsMenu.id] = deploymentsMenu;
        return deploymentsMenu;
};

const _createScriptBackup = async (params) => {
    const { resourceId, updateStatusDisplay } = params;
    const deployment = lastFetchedDeployments.find(d => d.id === resourceId);
    if (!deployment) {
        updateStatusDisplay(BACKUP.ERRORS.DEPLOYMENT_ID_NOT_FOUND(resourceId), 'error');
        return await _listDeploymentsForBackup(params);
    }

    try {
        showLoadingPrompt(BACKUP.STATUS.INITIATING_BACKUP(deployment.name));
        const response = await fetchWithAuth(`${API_BASE_URL}/create`, {
            method: 'POST',
            body: { deployment: deployment.deployment, project_id: deployment.project_id }
        });

        const result = await response.json();
        if (response.ok) {
            await prompt({
                text: BACKUP.STATUS.BACKUP_SUCCESS,
                type: 'form',
                replace: true,
                buttons: [{ label: 'ok', value: true }]
            });
            return await _listDeploymentsForBackup(params);
        } else {
            throw new Error(result.error || BACKUP.ERRORS.CREATE_FAILED);
        }
    } catch (error) {
        if (error.message === 'ReauthInitiated') throw error;
        updateStatusDisplay(SYSTEM.ERRORS.GENERIC_ERROR_MSG(error.message), 'error');
        return await _listDeploymentsForBackup(params);
    }
};

const _showRestoreMenu = async (params) => {
    const { updateStatusDisplay } = params;
    window.dispatchEvent(new CustomEvent('deploymentstatechange', { detail: { isActive: true } }));
    updateStatusDisplay(BACKUP.STATUS.FETCHING_BACKUPS, 'info');
    const response = await fetchWithAuth(`${API_BASE_URL}/list-backups`);
    const result = await response.json();

    if (!result.backups || result.backups.length === 0) {
        return {
            id: 'no-backups-found',
            text: BACKUP.ERRORS.NO_BACKUPS_FOUND,
            items: [],
            backTarget: 'backup-menu'
        };
    }

    const menuItems = result.backups.map(backup => ({
        id: `backup-file-${backup.id}`,
        text: backup.name,
        type: 'record',
        action: 'selectMachineForRestore',
        showLoading: true,
        backupFilename: backup.name,
        backupFileId: backup.id
    }));
    
    const menuConfig = {
        id: 'select-backup-for-restore',
        text: BACKUP.LABELS.SELECT_BACKUP_RESTORE,
        items: menuItems,
        backTarget: 'backup-menu'
    };
    menus[menuConfig.id] = menuConfig;
    return menuConfig;
};

const _selectMachineForRestore = async (params) => {
    const { backupFilename, backupFileId, updateStatusDisplay } = params;
    if (!backupFilename) {
        updateStatusDisplay(BACKUP.ERRORS.NO_BACKUP_SELECTED, 'error');
        return;
    }
    updateStatusDisplay(BACKUP.STATUS.FETCHING_MACHINES, 'info');
    const machines = await getSyncedData('machines', 'machines'); 
    lastFetchedMachines = machines.filter(m => m.id !== 'no-deployments');
    updateStatusDisplay(BACKUP.STATUS.CLEAR, 'info');

    let emptyMessage = BACKUP.ERRORS.NO_MACHINES_FOR_RESTORE;
    if (machines.length === 1 && machines[0].id === 'no-deployments') {
        emptyMessage = machines[0].name.toLowerCase();
    }

    const menuItems = lastFetchedMachines.map(machine => ({
        id: `restore-to-machine-${machine.id}`,
        text: machine.name,
        type: 'record',
        action: 'confirmRestore',
        showLoading: true,
        resourceId: machine.id,
        backupFilename,
        backupFileId
    }));

    menuItems.push({
        id: 'restore-to-new-machine',
        text: BACKUP.LABELS.NEW_MACHINE,
        type: 'record',
        action: 'confirmRestore',
        showLoading: true,
        resourceId: 'new_machine',
        backupFilename,
        backupFileId
    });

    const menuConfig = {
        id: 'select-machine-for-restore',
        text: BACKUP.LABELS.RESTORE_TO(backupFilename),
        items: menuItems,
        backTarget: 'backup-menu'
    };
    menus[menuConfig.id] = menuConfig;
    return menuConfig;
};

// --- Execution ---

async function _executeRestore(params, machineInfo) {
    const { backupFileId } = params;
    const { id: vm_id, zone } = machineInfo;
    orchestrator.updateStatus(BACKUP.STATUS.INITIATING_RESTORE, 'info');

    orchestrator.execute({
        id: 'restore',
        prepFn: () => fetchWithAuth(`${API_BASE_URL}/restore`, {
            method: 'POST',
            body: { vm_id, zone, backup_file_id: backupFileId }
        }),
        strings: BACKUP.STATUS,
        backMenuId: 'backup-menu'
    });
}

export const confirmRestore = requireAuth(async (params) => {
    const { resourceId, backupFilename, updateStatusDisplay } = params;
    
    let machine;
    if (resourceId === 'new_machine') {
        machine = { id: 'new_machine', name: BACKUP.LABELS.NEW_MACHINE_DESC, zone: null };
    } else {
        machine = lastFetchedMachines.find(m => m.id === resourceId);
    }
    
    if (!machine) {
        updateStatusDisplay(BACKUP.ERRORS.MACHINE_NOT_FOUND, 'error');
        return;
    }

    const confirmation = await prompt(BACKUP.PROMPTS.RESTORE_CONFIRM(backupFilename, machine.name));
    if (confirmation.status !== 'answered' || confirmation.value !== 'yes') {
        updateStatusDisplay(BACKUP.STATUS.RESTORE_CANCELLED, 'info');
        return;
    }

    await _executeRestore(params, machine);
    return { handled: true };
}, 'restore from backup');

// Other actions remain unchanged or use similar patterns

export const listDeploymentsForBackup = requireAuth(_listDeploymentsForBackup, "create a backup");
export const createScriptBackup = requireAuth(_createScriptBackup, "create a script backup");
export const showRestoreMenu = requireAuth(_showRestoreMenu, "restore from backup");
export const selectMachineForRestore = requireAuth(_selectMachineForRestore, "restore from backup");
export const showScheduleMenu = requireAuth(async (params) => {
    const { updateStatusDisplay } = params;
    updateStatusDisplay(BACKUP.STATUS.FETCHING_DEPLOYMENTS, 'info');
    const vms = await getSyncedData('machines', 'machines?include_schedule=true');
    let deployments = [];
    if (Array.isArray(vms)) {
        vms.forEach(vm => {
            if (vm.deployments) {
                deployments.push(...vm.deployments.map(dep => ({
                    id: `${vm.id}-${dep.deployment_name}`,
                    name: dep.deployment_name,
                    deployment: dep.deployment_name,
                    vm_name: vm.name,
                    project_id: vm.project_id,
                    backup_schedule: dep.backup_schedule || SYSTEM.LABELS.NOT_SET
                })));
            }
        });
    }
    lastFetchedDeployments = deployments;
    const menuItems = deployments.map(d => ({
        id: `schedule-backup-${d.id}`,
        text: `${d.name} on ${d.vm_name} - ${d.backup_schedule}`,
        type: 'record',
        action: 'promptBackupSchedule',
        showLoading: true,
        resourceId: d.id
    }));
    const menu = { id: 'select-deployment-for-schedule', text: BACKUP.LABELS.SELECT_DEPLOYMENT_SCHEDULE, items: menuItems, backTarget: 'backup-menu' };
    menus[menu.id] = menu;
    return menu;
}, "schedule a backup");

export const promptBackupSchedule = requireAuth(async (params) => {
    const { resourceId, updateStatusDisplay } = params;
    const deployment = lastFetchedDeployments.find(d => d.id === resourceId);
    if (!deployment) return;
    const result = await prompt(BACKUP.PROMPTS.SCHEDULE(deployment.name));
    if (result.status === 'answered' && result.value) {
        showLoadingPrompt(BACKUP.STATUS.UPDATING_SCHEDULE);
        const response = await fetchWithAuth(`${API_BASE_URL}/schedule`, {
            method: 'POST',
            body: { deployment: deployment.deployment, project_id: deployment.project_id, interval: result.value.interval }
        });
        if (response.ok) {
            await prompt({ text: BACKUP.STATUS.SCHEDULE_SUCCESS, type: 'form', replace: true, buttons: [{ label: 'ok', value: true }] });
        }
        document.body.classList.remove('deployment-loading');
        return await showScheduleMenu(params);
    }
}, "schedule a backup");

registerHandler('listDeploymentsForBackup', listDeploymentsForBackup);
registerHandler('createScriptBackup', createScriptBackup);
registerHandler('showRestoreMenu', showRestoreMenu);
registerHandler('selectMachineForRestore', selectMachineForRestore);
registerHandler('confirmRestore', confirmRestore);
registerHandler('showScheduleMenu', showScheduleMenu);
registerHandler('promptBackupSchedule', promptBackupSchedule);

menus['backup-menu'] = {
    text: BACKUP.LABELS.BACKUPS_MENU,
    items: [
        { id: 'create-backup-option', text: BACKUP.LABELS.CREATE, action: 'listDeploymentsForBackup', type: 'button', showLoading: true, tooltip: BACKUP.TOOLTIPS.CREATE },
        { id: 'restore-backup-option', text: BACKUP.LABELS.RESTORE, action: 'showRestoreMenu', type: 'button', showLoading: true, tooltip: BACKUP.TOOLTIPS.RESTORE },
        { id: 'schedule-backup-option', text: BACKUP.LABELS.SCHEDULE, action: 'showScheduleMenu', type: 'button', showLoading: true, tooltip: BACKUP.TOOLTIPS.SCHEDULE }
    ],
    backTarget: 'dashboard-menu',
    onRender: () => window.dispatchEvent(new CustomEvent('deploymentstatechange', { detail: { isActive: false } }))
};
