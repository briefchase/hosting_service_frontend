// website/src/js/pages/editor.js

import { pushBackHandler, popBackHandler, getStack } from '/js/scripts/back.js';
import { positionMusicControls } from '/js/pages/landing.js';
import { registerHandler } from '/js/scripts/registry.js';
import { prompt, clearPromptStack } from '/js/pages/prompt.js';
import { CONFIG } from '/js/config.js';
import { openPopup } from '/js/scripts/popup.js';
import { applyWaveEffect } from '/js/scripts/effects.js';
import { EDITOR, SYSTEM, INFRASTRUCTURE } from '../strings.js';
import { showLoadingPrompt, updateStatusDisplay } from '/js/pages/menu.js';
import { orchestrator } from '../scripts/orchestrator.js';
import { getSiteById, getSiteAddress } from '../scripts/site-utils.js';

const EDITOR_HTML = `
<div id="editor-container" class="terminal-container" style="padding: 0; overflow: hidden;">
    <div id="gjs" class="dimmed" style="height: 100%;"></div>
</div>
`;

export async function loadEditorView(params = {}) {
    console.log("[Editor] loadEditorView called (GrapesJS)", params);
    const { site_id, deployment_name } = params;

    let activeEditor = null;
    let isCancelled = false; // Flag to kill the zombie promise if user backs out

    // Add GitHub Auth message listener globally for this view
    if (window.__handleGithubAuth) {
        window.removeEventListener('message', window.__handleGithubAuth);
    }
    
    window.__handleGithubAuth = async (event) => {
        if (event.data.type === 'GITHUB_AUTH_SUCCESS') {
            console.log("[Editor] GitHub authentication successful (received from popup)");
            
            // Forcefully close any existing github auth windows from the parent side
            if (window.__githubAuthPopup) {
                try {
                    window.__githubAuthPopup.close();
                    console.log("[Editor] GitHub popup closed from parent side.");
                } catch (e) {
                    console.warn("[Editor] Failed to close popup from parent:", e);
                }
                window.__githubAuthPopup = null;
            }

            if (activeEditor) {
                activeEditor.github_connected = true;
                // Replace the sync menu immediately to reflect the change (no waiting for user "ok")
                window.__syncMenuOpen = false;
                window.editorHandlers.openSyncMenu(activeEditor, { replace: true });
            }
        }
    };
    window.addEventListener('message', window.__handleGithubAuth);

    document.body.classList.add('editor-view-active');
    document.body.classList.add('overlay-active');
    
    positionMusicControls();

    const consoleContainer = document.getElementById('console-container');
    if (!consoleContainer) {
        console.error("Console container not found.");
        return;
    }

    const { clearConsoleContent } = await import('/js/main.js');
    clearConsoleContent();
    
    consoleContainer.insertAdjacentHTML('beforeend', EDITOR_HTML);
    const editorContainer = document.getElementById('editor-container');

    // Define the cleanup logic once
    const editorCleanupHandler = () => {
        console.log("[Editor] Cleaning up and returning.");
        isCancelled = true; // Trip the wire to kill background execution
        if (window.__handleGithubAuth) {
            window.removeEventListener('message', window.__handleGithubAuth);
            delete window.__handleGithubAuth;
        }
        clearPromptStack();
        returnFromEditor({ menuId: `site-details-menu-${deployment_name}` });
    };

    // Define the active editor back handler (prompts first)
    const activeEditorBackHandler = async () => {
        console.log(`[Editor] Back button pressed, showing exit confirmation.`);
        const exitResult = await prompt(SYSTEM.PROMPTS.EXIT_CONFIRM('editor'));

        if (exitResult && exitResult.status === 'answered' && exitResult.value === true) {
            console.log(`[Editor] User confirmed exit.`);
            editorCleanupHandler();
        } else {
            // User cancelled the exit, re-push the handler
            pushBackHandler(activeEditorBackHandler);
        }
    };

    // 1. Begin Ceremony (Back-button lock + Happy Cat GIF)
    // We target #editor-container so the GIF is centered in the editor area
    orchestrator.begin({ 
        id: 'editor', 
        container: '#editor-container',
        onCancel: editorCleanupHandler
    });
    orchestrator.updateStatus({ text: EDITOR.STATUS.LOADING, effect: 'ellipsis' });

    try {
        console.log("[Editor] Fetching configuration for editor...");
        
        // Fetch the temporary configuration from the backend
        const res = await fetch(`${CONFIG.API_BASE_URL}/editor/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${JSON.parse(sessionStorage.getItem('currentUser')).token}`
            }
        });

        if (isCancelled) return; // Die peacefully if user backed out

        if (!res.ok) {
            throw new Error(`Failed to fetch editor configuration: ${res.statusText}`);
        }

        const { googleFontsKey, aiApiKey, availableModels, projectId, region, githubConnected, githubClientId } = await res.json();
        
        if (isCancelled) return; // Die peacefully if user backed out

        orchestrator.updateStatus({ text: "initializing engine", effect: 'ellipsis' });

        // Import and initialize GrapesJS shell first
        const { initEditor } = await import('/js/scripts/grapes.js');
        const editor = await initEditor({
            container: '#gjs',
            googleFontsKey,
            aiApiKey,
            availableModels,
            projectId,
            region,
            initialPages: [] // Start with empty, we'll hot-load
        });
        
        if (isCancelled) return; // Die peacefully if user backed out
        
        activeEditor = editor;

        // Store site_id and deployment_name for plugins (like publish) to use
        editor.site_id = site_id;
        editor.deployment_name = deployment_name;
        editor.github_connected = githubConnected;
        editor.github_client_id = githubClientId;
        editor.apiBaseUrl = CONFIG.API_BASE_URL;
        editor.authToken = JSON.parse(sessionStorage.getItem('currentUser')).token;

        // One-time: bake unique placeholder URLs into block definitions (not on drag)
        if (editor.ExtraBlocks?.hydrateBlockPlaceholders) {
            await editor.ExtraBlocks.hydrateBlockPlaceholders();
        }
        
        if (isCancelled) return; // Die peacefully if user backed out

        orchestrator.updateStatus({ text: "loading project data", effect: 'ellipsis' });

        console.log("[Editor] Loading saved project data from Firebase...");
        const loadRes = await fetch(`${CONFIG.API_BASE_URL}/editor/load?site_id=${site_id}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${JSON.parse(sessionStorage.getItem('currentUser')).token}`
            }
        });
        
        if (isCancelled) return; // Die peacefully if user backed out
        
        if (loadRes.ok) {
            const projectData = await loadRes.json();
            console.log(`[Editor] Injecting ${projectData.pages?.length || 0} files from Firebase. Labels:`, projectData.labels);
            editor.site_labels = projectData.labels || {};
            editor.runCommand('load-project', projectData);
        } else {
            console.warn("[Editor] Failed to load data from Firebase, editor remains empty.");
        }

        // 2. End Ceremony
        orchestrator.complete();

        // 3. Editor is now active. Push the cleanup logic as the standard back handler.
        // We must push this AFTER any menu.js handlers have resolved.
        // Since loadEditorView is called by menu.js, the menu.js handler might pop its own
        // loading handler *after* this function returns.
        // To ensure our activeEditorBackHandler is the top of the stack, we push it now.
        // The menu.js `startLoading` function's `finally` block only pops if the top handler
        // is its own cancelAction. By pushing ours here, we protect it.
        pushBackHandler(activeEditorBackHandler);

        // Undim the editor
        const gjsEl = document.getElementById('gjs');
        if (gjsEl) {
            gjsEl.classList.remove('dimmed');
        }

    } catch (error) {
        console.error("Failed to load GrapesJS editor:", error);
        orchestrator.fail(error);
        
        // Ensure undimmed if error occurs (optional, but prevents stuck dimmed state)
        const gjsEl = document.getElementById('gjs');
        if (gjsEl) {
            gjsEl.classList.remove('dimmed');
        }
        
        return; // Halt execution so menu.js doesn't get confused
    }
}

export async function returnFromEditor(params) {
    if (getStack().length > 0) {
        try { popBackHandler(); } catch (_) {}
    }

    cleanupEditor();

    document.body.classList.remove('editor-view-active');
    document.body.classList.remove('overlay-active');
    
    positionMusicControls();
    
    const { loadConsoleView } = await import('/js/main.js');
    loadConsoleView(params);
}

export function cleanupEditor() {
    const container = document.getElementById('editor-container');
    if (container) {
        container.remove();
    }
}

// Register the handler so the main app can call it
registerHandler('openEditor', loadEditorView);

/**
 * Helper to show a loading prompt with a wave effect.
 */
// Define global handlers for the GrapesJS plugins to call out to the main app
window.editorHandlers = {
    openSyncMenu: async (editor, options = {}) => {
        // Guard: If the sync menu is already open, don't stack another one unless we are replacing it
        if (window.__syncMenuOpen && !options.replace) return;
        window.__syncMenuOpen = true;

        const site_id = editor.site_id;
        const deployment_name = editor.deployment_name;
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        const token = currentUser.token;
        const cultKey = editor.cult_key;

        // Use the labels already stored on the editor object
        const site_labels = editor.site_labels || {};
        const linkedRepo = site_labels['cult-github-repo'];
        
        const isGithubConnected = editor.github_connected;

        // Determine Frontpage URL using shared logic
        const siteData = await getSiteById(site_id);
        const { url: frontpageUrl } = getSiteAddress(siteData);

        const signOutButton = { 
            label: EDITOR.LABELS.SIGN_OUT, 
            value: 'github_signout', 
            tooltip: EDITOR.TOOLTIPS.SIGN_OUT,
            onclick: async () => {
                const confirmSignout = await prompt(EDITOR.PROMPTS.GITHUB_SIGNOUT);

                if (confirmSignout?.value === true) {
                    showLoadingPrompt(EDITOR.STATUS.SIGNING_OUT, { id: 'github_signout_loading', replace: false });

                    try {
                        const res = await fetch(`${CONFIG.API_BASE_URL}/editor/github/disconnect`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });

                        if (res.ok) {
                            editor.github_connected = false;
                            await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.STATUS.SIGNOUT_SUCCESS));
                        } else {
                            throw new Error(EDITOR.ERRORS.SIGNOUT_FAILED);
                        }
                        } catch (e) {
                            await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.ERRORS.SIGNOUT_FAILED_MSG(e.message)));
                        } finally {
                        window.__syncMenuOpen = false;
                        window.editorHandlers.openSyncMenu(editor, { replace: true });
                    }
                }
            }
        };

        const curlCommand = cultKey ? `curl -X POST "${CONFIG.API_BASE_URL}/site/${site_id}/publish" \\
     -H "Cult-Api-Key: ${cultKey}" \\
     -H "Content-Type: application/json" \\
     -d '{"files": {"index.html": "..."}}'` : EDITOR.STATUS.CULT_KEY_HINT;

        const syncButtons = [
            {
                type: 'group',
                label: EDITOR.LABELS.LIVE,
                items: [
                    {
                        type: 'row',
                        items: [
                            { 
                                label: EDITOR.LABELS.PULL, 
                                value: 'pull', 
                                tooltip: EDITOR.TOOLTIPS.PULL,
                                onclick: async () => {
                                    const confirmPull = await prompt(EDITOR.PROMPTS.PULL_LIVE);

                                    if (confirmPull?.value === true) {
                                        showLoadingPrompt(EDITOR.STATUS.PULLING, { id: 'live_pull_loading', replace: false });

                                        try {
                                            const loadRes = await fetch(`${CONFIG.API_BASE_URL}/editor/load?site_id=${site_id}`, {
                                                method: 'GET',
                                                headers: { 'Authorization': `Bearer ${token}` }
                                            });

                                            if (loadRes.ok) {
                                                const projectData = await loadRes.json();
                                                editor.runCommand('load-project', projectData);
                                                await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.STATUS.PULL_SUCCESS));
                                            } else {
                                                throw new Error(EDITOR.ERRORS.FETCH_LIVE_FAILED);
                                            }
                                        } catch (e) {
                                            await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.ERRORS.PULL_FAILED_MSG(e.message)));
                                        }
                                    }
                                }
                            },
                            { 
                                label: EDITOR.LABELS.PUBLISH, 
                                value: 'publish', 
                                tooltip: EDITOR.TOOLTIPS.PUBLISH,
                                onclick: async () => {
                                    const confirmPublish = await prompt(EDITOR.PROMPTS.PUBLISH);

                                    if (confirmPublish?.value === true) {
                                        showLoadingPrompt(EDITOR.STATUS.PUBLISHING, { id: 'live_publish_loading', replace: false });

                                        try {
                                            // Capture the managed CSS path as a label before publishing
                                            const globalCssPage = editor.Pages.getAll().find(p => p.get('isGlobalCss'));
                                            if (globalCssPage) {
                                                const { fullPath } = editor.AssetResolver.parseAsset(globalCssPage.id);
                                                editor.site_labels = { 
                                                    ...(editor.site_labels || {}), 
                                                    'managed-css-path': fullPath 
                                                };
                                            }

                                            const files = editor.AssetResolver.generateExportMap();
                                            const publishRes = await fetch(`${CONFIG.API_BASE_URL}/editor/publish`, {
                                                method: 'POST',
                                                headers: { 
                                                    'Content-Type': 'application/json',
                                                    'Authorization': `Bearer ${editor.authToken || token}`
                                                },
                                                body: JSON.stringify({ 
                                                    site_id, 
                                                    files,
                                                    labels: editor.site_labels // Persist the updated labels
                                                })
                                            });
                                            
                                            if (publishRes.ok) {
                                                await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.STATUS.PUBLISH_SUCCESS));
                                            } else {
                                                const data = await publishRes.json().catch(() => ({}));
                                                throw new Error(data.error || EDITOR.ERRORS.PUBLISH_FAILED);
                                            }
                                        } catch (e) {
                                            await prompt(SYSTEM.PROMPTS.EDITOR_INFO(SYSTEM.ERRORS.GENERIC_ERROR_MSG(e.message)));
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    /*
                    {
                        type: 'row',
                        items: [
                    { label: EDITOR.LABELS.CULT_KEY, type: 'label' },
                    { text: cultKey || SYSTEM.LABELS.NOT_GENERATED, type: 'record' }
                ],
                justify: 'left'
                    },
                    */
                    /*
                    {
                        type: 'switcher',
                        tabs: [
                            { label: EDITOR.LABELS.BASH, content: curlCommand },
                            { 
                                label: cultKey ? EDITOR.LABELS.REFRESH_KEY : EDITOR.LABELS.MAKE_KEY, 
                                type: 'button', 
                                onclick: async () => {
                                    const confirm = await prompt(EDITOR.PROMPTS.KEY_CONFIRM(!!cultKey));
                                    if (confirm?.value !== true) return;

                                    showLoadingPrompt(EDITOR.STATUS.MANAGING_KEY, { id: 'cult_key_loading', replace: false });
                                    try {
                                        const res = await fetch(`${CONFIG.API_BASE_URL}/site/${site_id}/cult-key`, {
                                            method: 'GET',
                                            headers: { 'Authorization': `Bearer ${token}` }
                                        });
                                        if (res.ok) {
                                            const data = await res.json();
                                            editor.cult_key = data.cultKey;
                                            await prompt({ text: EDITOR.STATUS.KEY_SUCCESS, type: 'form', replace: true, buttons: [{ label: SYSTEM.LABELS.OK, value: true }] });
                                        } else {
                                            throw new Error(EDITOR.ERRORS.KEY_FAILED(''));
                                        }
                                    } catch (e) {
                                        await prompt({ text: EDITOR.ERRORS.KEY_FAILED(e.message), type: 'form', replace: true, buttons: [{ label: SYSTEM.LABELS.OK, value: true }] });
                                    } finally {
                                        window.__syncMenuOpen = false;
                                        window.editorHandlers.openSyncMenu(editor, { replace: true });
                                    }
                                } 
                            }
                        ]
                    }
                    */
                ]
            }
        ];

        if (frontpageUrl) {
            syncButtons[0].items[0].items.unshift({
                label: INFRASTRUCTURE.LABELS.FRONT_PAGE,
                value: 'frontpage',
                tooltip: 'view the live site in a new tab',
                onclick: () => window.open(frontpageUrl, '_blank', 'noopener,noreferrer')
            });
        }


        let gitLabel = EDITOR.LABELS.GITHUB;
        if (linkedRepo) {
            try {
                // Extract repo name from URL (e.g., https://github.com/user/repo.git -> repo)
                const repoName = linkedRepo.split('/').pop().replace('.git', '');
                gitLabel = EDITOR.LABELS.GITHUB_REPO(repoName);
            } catch (e) {
                gitLabel = EDITOR.LABELS.GITHUB_REPO(linkedRepo);
            }
        }

        const gitGroupItems = [];

        if (!isGithubConnected) {
            const clientId = editor.github_client_id;
            const redirectUri = encodeURIComponent(`${CONFIG.API_BASE_URL}/editor/github/callback`);
            
            // Use prompt=select_account to force the account picker and a cache buster to prevent silent redirects
            const githubUrl = `https://github.com/login/oauth/authorize?prompt=select_account&client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo,user&state=${encodeURIComponent(token)}&_=${Date.now()}`;

            gitGroupItems.push({
                type: 'row',
                items: [
                    { label: EDITOR.LABELS.ACCOUNT, type: 'label' },
                    { 
                        label: SYSTEM.LABELS.SIGN_IN, 
                        value: 'github_signin', 
                        tooltip: EDITOR.TOOLTIPS.GITHUB_CONNECT,
                        onclick: (e) => {
                            const timestamp = new Date().toISOString();
                            console.log(`[${timestamp}] [Editor-Sync] GitHub sign-in button clicked.`);
                            if (clientId && token) {
                                console.log(`[${timestamp}] [Editor] Triggering GitHub popup. ClientID:`, clientId, "RedirectURI:", redirectUri);
                                console.log(`[${timestamp}] [Editor] Full GitHub URL:`, githubUrl);
                                // Trigger popup IMMEDIATELY on click to avoid browser blocking
                                window.__githubAuthPopup = openPopup(githubUrl, 'cult_github_auth', 'width=600,height=700');
                            } else {
                                console.error(`[${timestamp}] [Editor] Cannot sign in: clientId or token missing`, { clientId, hasToken: !!token });
                            }
                        }
                    }
                ],
                justify: 'left'
            });
        } else if (!linkedRepo) {
            // Account row
            gitGroupItems.push({
                type: 'row',
                items: [
                    { label: EDITOR.LABELS.ACCOUNT, type: 'label' },
                    signOutButton
                ],
                justify: 'left'
            });

            // Repo row
            gitGroupItems.push({
                type: 'row',
                items: [
                    { label: EDITOR.LABELS.REPO, type: 'label' },
                    { 
                        label: EDITOR.LABELS.CREATE, 
                        value: 'github_create', 
                        tooltip: EDITOR.TOOLTIPS.CREATE_REPO,
                        onclick: async () => {
                            const repoResult = await prompt(EDITOR.PROMPTS.GITHUB_CREATE(deployment_name));

                                    if (repoResult?.status === 'answered' && repoResult.value?.repo_name) {
                                        showLoadingPrompt(EDITOR.STATUS.CREATING_REPO, { id: 'github_create_loading', replace: false });

                                        try {
                                    const repoName = repoResult.value.repo_name.trim();
                                    const res = await fetch(`${CONFIG.API_BASE_URL}/editor/github/create`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ site_id, repo_name: repoName })
                                    });

                                        if (res.ok) {
                                            const data = await res.json();
                                            editor.site_labels = { ...site_labels, 'cult-github-repo': data.repo_url };
                                            await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.STATUS.CREATION_SUCCESS(data.repo_url)));
                                        } else {
                                            const data = await res.json().catch(() => ({}));
                                            throw new Error(data.error || EDITOR.ERRORS.CREATE_REPO_FAILED);
                                        }
                                    } catch (e) {
                                        await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.ERRORS.CREATION_FAILED_MSG(e.message)));
                                    } finally {
                                    window.__syncMenuOpen = false;
                                    window.editorHandlers.openSyncMenu(editor, { replace: true });
                                }
                            }
                        }
                    },
                    { 
                        label: EDITOR.LABELS.ATTACH, 
                        value: 'github_attach', 
                        tooltip: EDITOR.TOOLTIPS.ATTACH_REPO,
                        onclick: async () => {
                            const repoResult = await prompt(EDITOR.PROMPTS.GITHUB_ATTACH(linkedRepo));

                            if (repoResult?.status === 'answered' && repoResult.value?.repo_url) {
                                showLoadingPrompt(EDITOR.STATUS.LINKING_REPO, { id: 'github_attach_loading', replace: false });

                                try {
                                    const repoUrl = repoResult.value.repo_url.trim();
                                    if (!repoUrl.startsWith('https://github.com/')) throw new Error(EDITOR.ERRORS.INVALID_GITHUB_URL);

                                    const labels = { ...site_labels, 'cult-github-repo': repoUrl };
                                    const res = await fetch(`${CONFIG.API_BASE_URL}/editor/update-labels`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ site_id, labels })
                                    });

                                    if (res.ok) {
                                        editor.site_labels = labels;
                                        await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.STATUS.LINK_SUCCESS));
                                    } else {
                                        const data = await res.json().catch(() => ({}));
                                        throw new Error(data.error || EDITOR.ERRORS.UPDATE_LABELS_FAILED);
                                    }
                                } catch (e) {
                                    await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.ERRORS.LINKING_FAILED_MSG(e.message)));
                                } finally {
                                    window.__syncMenuOpen = false;
                                    window.editorHandlers.openSyncMenu(editor, { replace: true });
                                }
                            }
                        }
                    }
                ],
                justify: 'left'
            });
        } else {
            // Account row first
            gitGroupItems.push({
                type: 'row',
                items: [
                    { label: EDITOR.LABELS.ACCOUNT, type: 'label' },
                    signOutButton
                ],
                justify: 'left'
            });

            // Repo row second
            gitGroupItems.push({
                type: 'row',
                items: [
                    { label: EDITOR.LABELS.REPO, type: 'label' },
                    { 
                        label: EDITOR.LABELS.PULL, 
                        value: 'git_pull', 
                        tooltip: EDITOR.TOOLTIPS.PULL,
                        onclick: async () => {
                            const confirmPull = await prompt(EDITOR.PROMPTS.GITHUB_PULL);

                            if (confirmPull?.value === true) {
                                showLoadingPrompt(EDITOR.STATUS.PULLING_GITHUB, { id: 'github_pull_loading', replace: false });

                                try {
                                    const res = await fetch(`${CONFIG.API_BASE_URL}/editor/github/pull?site_id=${site_id}`, {
                                        method: 'GET',
                                        headers: { 'Authorization': `Bearer ${token}` }
                                    });

                                    if (res.ok) {
                                        const projectData = await res.json();
                                        editor.runCommand('load-project', projectData);
                                        await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.STATUS.PULL_GITHUB_SUCCESS));
                                    } else {
                                        const data = await res.json().catch(() => ({}));
                                        throw new Error(data.error || EDITOR.ERRORS.PULL_FAILED);
                                    }
                                } catch (e) {
                                    await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.ERRORS.PULL_GITHUB_FAILED_MSG(e.message)));
                                }
                            }
                        }
                    },
                    { 
                        label: EDITOR.LABELS.PUSH, 
                        value: 'git_push', 
                        tooltip: EDITOR.TOOLTIPS.PUSH_REPO,
                        onclick: async () => {
                            const commitResult = await prompt(EDITOR.PROMPTS.GITHUB_PUSH);

                                if (commitResult?.status === 'answered' && commitResult.value?.message) {
                                    // Show loading prompt with a custom effect if desired
                                    showLoadingPrompt(EDITOR.STATUS.PUSHING, { id: 'github_push_loading', replace: false });

                                    try {
                                        const commitMessage = commitResult.value.message;
                                        const files = editor.AssetResolver.generateExportMap();
                                        const res = await fetch(`${CONFIG.API_BASE_URL}/editor/github/push`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                            body: JSON.stringify({ site_id, files, commit_message: commitMessage })
                                        });

                                        if (res.ok) {
                                            await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.STATUS.PUSH_SUCCESS));
                                        } else {
                                            const data = await res.json().catch(() => ({}));
                                            throw new Error(data.error || EDITOR.ERRORS.PUSH_FAILED);
                                        }
                                    } catch (e) {
                                        await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.ERRORS.PUSH_GITHUB_FAILED_MSG(e.message)));
                                    }
                                }
                        }
                    },
                    { 
                        label: EDITOR.LABELS.DISCONNECT, 
                        value: 'git_disconnect', 
                        tooltip: EDITOR.TOOLTIPS.DISCONNECT_REPO,
                        onclick: async () => {
                            const confirmDisconnect = await prompt(EDITOR.PROMPTS.GITHUB_DISCONNECT(linkedRepo));

                            if (confirmDisconnect?.value === true) {
                                showLoadingPrompt(EDITOR.STATUS.UNLINKING, { id: 'github_disconnect_loading', replace: false });

                                try {
                                    const labels = { ...site_labels };
                                    delete labels['cult-github-repo'];
                                    const res = await fetch(`${CONFIG.API_BASE_URL}/editor/update-labels`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ site_id, labels })
                                    });

                                    if (res.ok) {
                                        editor.site_labels = labels;
                                        await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.STATUS.UNLINK_SUCCESS));
                                    } else {
                                        throw new Error(EDITOR.ERRORS.UPDATE_LABELS_FAILED);
                                    }
                                } catch (e) {
                                    await prompt(SYSTEM.PROMPTS.EDITOR_INFO(EDITOR.ERRORS.LINKING_FAILED_MSG(e.message)));
                                } finally {
                                    window.__syncMenuOpen = false;
                                    window.editorHandlers.openSyncMenu(editor, { replace: true });
                                }
                            }
                        }
                    }
                ],
                justify: 'left'
            });
        }

        syncButtons.push({
            type: 'group',
            label: gitLabel,
            items: gitGroupItems,
            justify: 'left'
        });

        syncButtons.push({
            type: 'row',
            items: [
                { label: SYSTEM.LABELS.NEVERMIND, value: 'cancel' }
            ]
        });

        try {
            await prompt({
                id: 'editor_sync_menu',
                type: 'form',
                text: SYSTEM.LABELS.PROJECT_SYNC(deployment_name),
                buttons: syncButtons,
                replace: options.replace || false,
                cancelable: true,
                className: 'prompt-sync-menu'
            });
        } finally {
            window.__syncMenuOpen = false;
        }
    }
};
