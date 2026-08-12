// website/src/js/scripts/orchestrator.js

import { 
    updateStatusDisplay 
} from '/js/pages/menu.js';
import { 
    updateAccountButtonVisibility, 
    updateSiteTitleVisibility
} from '/js/main.js';
import { loadTerminalView, returnFromTerminal, handleTerminalMessage, getTerminalDimensions } from '/js/pages/terminal.js';
import { prompt, clearPromptStack } from '/js/pages/prompt.js';
import { establishWebSocketConnection } from '/js/scripts/socket.js';
import { pushBackHandler, popBackHandler, replaceBackHandler, getStack } from '/js/scripts/back.js';
import { SYSTEM, DEPLOY } from '../strings.js';

/**
 * TaskOrchestrator manages the lifecycle of terminal-based tasks (deploy, restore, download, connect)
 * and general UI "Loading Ceremonies" (editor load).
 */
class TaskOrchestrator {
    constructor() {
        this.activeTask = {
            id: null,
            ws: null,
            taskId: null,
            config: null,
            backHandler: null,
            wrapperEl: null,
            statusEl: null
        };
        this.prewarmedStatus = null;
    }

    /**
     * Starts the "Loading Ceremony": dims UI, locks back button, and injects Happy Cat.
     * @param {object} config - Ceremony configuration.
     * @returns {TaskOrchestrator} - Returns self for chaining.
     */
    begin(config) {
        const { id, interactive = false, container, strings = {} } = config;
        
        console.log(`[TaskOrchestrator] Beginning ceremony for: ${id}`);
        
        // 1. UI Cleanup
        updateSiteTitleVisibility(false);
        updateAccountButtonVisibility(false);

        this.activeTask = {
            id,
            ws: null,
            taskId: null,
            config,
            strings,
            backHandler: null, // Store reference to pop it later
            wrapperEl: null,
            statusEl: null
        };

        // 2. State & Classes
        window.dispatchEvent(new CustomEvent('deploymentstatechange', { detail: { isActive: true } }));
        document.body.classList.add('deployment-loading');

        // 3. Back-Button Protection
        const backButtonHandler = async () => {
            const displayType = interactive ? 'session' : id;
            
            // SNAPSHOT: The prompt pauses execution. If the background task finishes 
            // while the prompt is open, the orchestrator will wipe its active state.
            const snapshotConfig = this.activeTask.config;
            const snapshotId = this.activeTask.id;

            console.log(`[TaskOrchestrator] Back button pressed for ${id}, showing exit confirmation.`);
            const exitResult = await prompt(SYSTEM.PROMPTS.EXIT_CONFIRM(displayType));

            if (exitResult && exitResult.status === 'answered' && exitResult.value === true) {
                console.log(`[TaskOrchestrator] User confirmed exit.`);
                clearPromptStack();
                
                if (this.activeTask.id === snapshotId) {
                    // Task is still loading. Cancel it through the orchestrator.
                    this.cancel("user_cancelled_via_prompt");
                } else {
                    // Task finished loading while the prompt was open!
                    // The orchestrator has already cleaned itself up via complete().
                    // We just need to honor the user's intent to leave the resulting view.
                    console.log(`[TaskOrchestrator] Task finished while prompting. Executing snapshot cleanup.`);
                    if (snapshotConfig && snapshotConfig.onCancel) {
                        snapshotConfig.onCancel();
                    } else {
                        returnFromTerminal({ menuId: snapshotConfig?.backMenuId || 'dashboard-menu' });
                    }
                }
            } else {
                // User said no. Only re-protect the back button if the task is STILL loading.
                // If it finished, the target view (e.g., editor) has already pushed its own back handler.
                if (this.activeTask.id === snapshotId) {
                    pushBackHandler(backButtonHandler);
                }
            }
        };
        this.activeTask.backHandler = backButtonHandler;
        pushBackHandler(backButtonHandler);

        // 4. Inject Loading UI
        this._injectLoadingUI(container);

        return this;
    }

    /**
     * Updates the status text.
     */
    updateStatus(status, level = 'info') {
        const message = typeof status === 'object' ? status.text : status;
        const effect = typeof status === 'object' ? status.effect : null;

        if (this.activeTask.statusEl) {
            // Clear existing ellipsis interval if any
            if (this.activeTask.statusEl.dataset.ellipsisInterval) {
                clearInterval(parseInt(this.activeTask.statusEl.dataset.ellipsisInterval));
                delete this.activeTask.statusEl.dataset.ellipsisInterval;
            }

            if (effect === 'ellipsis') {
                let dots = 1;
                this.activeTask.statusEl.textContent = message + '.';
                const intervalId = setInterval(() => {
                    if (!document.body.contains(this.activeTask.statusEl)) {
                        clearInterval(intervalId);
                        return;
                    }
                    dots = (dots % 3) + 1;
                    this.activeTask.statusEl.textContent = message + '.'.repeat(dots);
                }, 500);
                this.activeTask.statusEl.dataset.ellipsisInterval = intervalId.toString();
            } else {
                this.activeTask.statusEl.textContent = message;
            }
        } else {
            // Prewarm the status so it appears immediately when the widget is created
            this.prewarmedStatus = { status, level };
        }
    }

    /**
     * Completes the ceremony and restores UI state.
     */
    complete() {
        console.log(`[TaskOrchestrator] Ceremony complete for: ${this.activeTask.id}`);
        
        // Pop the protective loading back handler if it's still at the top of the stack
        const stack = getStack();
        if (stack.length > 0 && stack[stack.length - 1] === this.activeTask.backHandler) {
            console.log(`[TaskOrchestrator] Popping protective back handler for: ${this.activeTask.id}`);
            popBackHandler();
        }

        this._restoreUI();
        this._markTaskInactive();
        
        // Pure Ballet: Clean up completely. No lingering config.
        this.activeTask = { id: null, ws: null, taskId: null, config: null, backHandler: null, wrapperEl: null, statusEl: null };
    }

    /**
     * Fails the ceremony with an error.
     */
    fail(error) {
        console.error(`[TaskOrchestrator] Ceremony failed for ${this.activeTask.id}:`, error);
        const message = error.message || JSON.stringify(error);
        updateStatusDisplay(SYSTEM.ERRORS.GENERIC_ERROR_MSG(message), 'error');
        this.cancel(`execution_error: ${message}`);
    }

    /**
     * Legacy/Monolithic execution for WebSocket tasks (Deploy/Restore/etc.)
     */
    async execute(config) {
        const { prepFn, onEvent, interactive = false } = config;
        
        this.begin(config);

        try {
            // 1. Background Handshake (Prep)
            let prepResult = config.prepResult;
            if (prepFn) {
                const response = await prepFn();
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || 'preparation failed');
                }
                prepResult = await response.json();
            }

            if (!prepResult || !prepResult.websocket_url) {
                throw new Error('invalid preparation result: missing websocket url');
            }

            this.activeTask.taskId = prepResult.deployment_id;
            
            // 2. Establish Connection
            this.updateStatus(this.activeTask.strings.CONNECTING || SYSTEM.STATUS.CONNECTING);
            
            const ws = await establishWebSocketConnection(
                prepResult.websocket_url,
                (ws, event) => this.updateStatus(this.activeTask.strings.CONNECTED_WAITING || DEPLOY.STATUS.CONNECTED_WAITING || SYSTEM.STATUS.CONNECTING),
                null,
                (event) => {
                    this.updateStatus(this.activeTask.strings.CONNECTION_ERROR || DEPLOY.STATUS.CONNECTION_ERROR || SYSTEM.STATUS.GENERIC_ERROR, 'error');
                    this.cancel('websocket_error');
                },
                (event) => {},
                (msg, lvl) => this.updateStatus(msg, lvl)
            );

            if (!ws) throw new Error(SYSTEM.ERRORS.WS_GENERIC_ERROR);

            this.activeTask.ws = ws;
            this._communicate(ws);

            // If interactive, handle dimensions
            if (interactive) {
                const dims = getTerminalDimensions();
                ws.send(JSON.stringify({ action: 'resize', ...dims }));
                setTimeout(() => {
                    if (this.activeTask.ws === ws) ws.send(JSON.stringify({ action: 'resize', ...dims }));
                }, 500);
            }

        } catch (error) {
            if (error.message === 'ReauthInitiated') {
                this.cancel('reauth_initiated');
                throw error;
            }
            this.fail(error);
        }
    }

    _injectLoadingUI(targetContainer) {
        // Find the target container (either explicit or default to menu)
        let container = null;
        if (targetContainer) {
            container = typeof targetContainer === 'string' ? document.querySelector(targetContainer) : targetContainer;
        } else {
            const menuContainer = document.getElementById('menu-container');
            container = menuContainer?.querySelector('#menu-list-container');
            const menuTitle = menuContainer?.querySelector('#menu-text');
            if (menuTitle) menuTitle.style.display = 'none';
        }

        if (!container) return;

        // Create the self-contained widget wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'orchestrator-ceremony-widget';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'center';
        wrapper.style.gap = '15px';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';

        // Only set relative positioning if the container isn't already positioned.
        // This prevents overwriting 'fixed' or 'absolute' positioning on specialized containers like the editor.
        const currentPos = window.getComputedStyle(container).position;
        if (currentPos === 'static') {
            container.style.position = 'relative';
        }

        // If targetContainer is provided, use absolute centering (e.g. editor)
        // Otherwise, use normal document flow for the menu so it stacks with status text
        if (targetContainer) {
            wrapper.style.position = 'absolute';
            wrapper.style.top = '0';
            wrapper.style.left = '0';
            wrapper.style.zIndex = '100';
        } else {
            wrapper.style.padding = '40px 0 20px 0'; // Keep it reasonably sized in the menu
        }

        const loadingGif = document.createElement('img');
        loadingGif.src = '/images/happy-cat.gif';
        loadingGif.className = 'loading-gif';
        loadingGif.style.display = 'block';
        loadingGif.style.width = '150px';
        loadingGif.style.margin = '0';

        const statusTextEl = document.createElement('div');
        statusTextEl.className = 'orchestrator-status-text';
        statusTextEl.style.color = 'white';
        statusTextEl.style.fontFamily = 'inherit';
        statusTextEl.style.textAlign = 'center';

        wrapper.appendChild(statusTextEl);
        wrapper.appendChild(loadingGif);
        container.appendChild(wrapper);

        this.activeTask.container = container;
        this.activeTask.wrapperEl = wrapper;
        this.activeTask.statusEl = statusTextEl;

        if (this.prewarmedStatus) {
            this.updateStatus(this.prewarmedStatus.status, this.prewarmedStatus.level);
            this.prewarmedStatus = null;
        }
    }

    _communicate(ws) {
        const { config } = this.activeTask;
        this.updateStatus(config.strings.CONNECTION_READY || DEPLOY.STATUS.CONNECTION_READY || SYSTEM.STATUS.CONNECTING);

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            const { event: eventName, payload } = data;

            try {
                if (config.onEvent) {
                    const handled = await config.onEvent(eventName, payload, ws);
                    if (handled) return;
                }

                switch (eventName) {
                    case 'UPDATE_STATUS':
                        const messageText = payload.text || JSON.stringify(payload);
                        const level = payload.level || 'info';

                        if (payload.view === 'terminal' || (document.body.classList.contains('terminal-view-active') && !payload.view)) {
                            handleTerminalMessage(messageText, level, ws, payload.isTerminalData);
                        } else {
                            this.updateStatus(messageText, level);
                        }
                        break;
                    case 'SSH_READY':
                        const { interactive } = this.activeTask.config;
                        if (interactive) {
                            const dims = getTerminalDimensions();
                            ws.send(JSON.stringify({ action: 'resize', ...dims }));

                            const terminalApi = await loadTerminalView({ 
                                existingWs: ws, 
                                hideInput: false, 
                                interactive: true,
                                noBackHandler: true 
                            });
                            this.activeTask.terminalApi = terminalApi;
                            terminalApi.enableInput();
                            this._clearLoadingState(); 
                        }
                        this.updateStatus(payload.message || INFRASTRUCTURE.STATUS.SSH_READY, 'success');
                        break;
                    case 'PROMPT_USER':
                        await this._handlePromptUser(payload, ws);
                        break;
                    case 'FATAL_ERROR':
                        this._handleFatalError(payload);
                        break;
                    case 'DEPLOYMENT_COMPLETE':
                    case 'TASK_COMPLETE':
                        this._handleTaskComplete(payload);
                        break;
                }
            } catch (error) {
                this.fail(error);
            }
        };
    }

    async _handlePromptUser(payload, ws) {
        if (payload.url) {
            const { openPopup } = await import('/js/scripts/popup.js');
            openPopup(payload.url);
        }
        const answer = await prompt({ ...payload, noBackHandler: true });
        ws.send(JSON.stringify({ status: answer.status, value: answer.value }));
    }

    _handleFatalError(payload) {
        const messageText = payload.message || JSON.stringify(payload);
        updateStatusDisplay(SYSTEM.ERRORS.GENERIC_ERROR_MSG(messageText), 'error');
        this.cancel(`server_error: ${messageText}`);
    }

    _handleTaskComplete(payload) {
        const { config, ws } = this.activeTask;
        const deploymentName = payload.deployment_name;

        this._restoreUI();

        if (config.onComplete) {
            config.onComplete(payload, ws);
            return;
        }

        const promptConfig = {
            id: 'task-complete-prompt',
            type: 'form',
            text: (payload.finalMessage || config.strings.FINISHED || SYSTEM.STATUS.FINISHED).toLowerCase(),
            buttons: [
                { label: SYSTEM.LABELS.OK, value: 'ok' },
                { label: SYSTEM.LABELS.VIEW_RESOURCE, value: 'view', className: 'primary-button' }
            ]
        };

        prompt(promptConfig).then(result => {
            if (ws && ws.readyState < WebSocket.CLOSING) ws.close();

            if (result && result.status === 'answered' && result.value === 'view' && deploymentName) {
                this.cancel('view_resource', { specialNav: 'viewSite', id: deploymentName });
            } else {
                handleTerminalMessage(config.strings.COMPLETE_TERMINAL || SYSTEM.STATUS.COMPLETE, "success", ws);
                replaceBackHandler(() => returnFromTerminal({ menuId: config.backMenuId || 'dashboard-menu' }));
                this._markTaskInactive();
            }
        });
    }

    cancel(reason, navParams = {}) {
        console.log(`[TaskOrchestrator] Cancelling task: ${this.activeTask.id}. Reason: ${reason}`);
        
        const siteContainer = document.getElementById('console-container');
        if (siteContainer) delete siteContainer.dataset.actionInFlight;

        const { ws, taskId, config } = this.activeTask;

        this._markTaskInactive();
        this._restoreUI();
        
        if (ws) {
            ws.onmessage = null;
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({ action: "cancel_deployment", deployment_id: taskId, reason: reason }));
                } catch (e) {}
            }
            ws.close();
        }

        // Preserve onCancel config so orchestrator knows how to clean up if cancelled later
        const params = { menuId: config?.backMenuId || 'dashboard-menu', ...navParams };
        
        import('./sync.js').then(m => {
            m.invalidateCache('instances');
            m.invalidateCache('machines');
            m.invalidateCache('usage');
        });

        // Use custom cancel handler if provided (e.g. for editor)
        if (config?.onCancel) {
            config.onCancel(params);
        } else if (document.body.classList.contains('terminal-view-active')) {
            returnFromTerminal(params);
        } else {
            // Default to returnFromTerminal if we're in any overlay state
            returnFromTerminal(params);
        }

        // Pure Ballet: Clean up completely.
        this.activeTask = { id: null, ws: null, taskId: null, config: null, backHandler: null, wrapperEl: null, statusEl: null };
    }

    _restoreUI() {
        const siteTitle = document.getElementById('site-title');
        if (siteTitle) {
            const currentDomain = window.location.hostname;
            const currentProtocol = window.location.protocol;
            const currentPort = window.location.port;
            let titleText = `${currentProtocol}//${currentDomain}`;
            if (currentPort && ((currentProtocol === 'http:' && currentPort !== '80') || (currentProtocol === 'https:' && currentPort !== '443'))) {
                titleText += `:${currentPort}`;
            }
            siteTitle.textContent = titleText;
            siteTitle.style.visibility = 'visible';
        }
        updateSiteTitleVisibility(true);
        updateAccountButtonVisibility(true);
    }

    _markTaskInactive() {
        window.dispatchEvent(new CustomEvent('deploymentstatechange', { detail: { isActive: false } }));
        document.body.classList.remove('deployment-loading');
        this._clearLoadingState();
    }

    _clearLoadingState() {
        const { wrapperEl, statusEl } = this.activeTask;
        if (statusEl && statusEl.dataset.ellipsisInterval) {
            clearInterval(parseInt(statusEl.dataset.ellipsisInterval));
        }
        if (wrapperEl && wrapperEl.parentNode) {
            wrapperEl.remove();
        }
        
        const menuContainer = document.getElementById('menu-container');
        if (menuContainer) {
            delete menuContainer.dataset.loading;
            const menuTitle = menuContainer.querySelector('#menu-text');
            if (menuTitle) menuTitle.style.display = 'block';
        }
    }
}

export const orchestrator = new TaskOrchestrator();
