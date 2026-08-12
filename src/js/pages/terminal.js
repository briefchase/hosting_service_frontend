// website/src/js/pages/terminal.js

import { getUser } from '/js/scripts/authenticate.js';
import { CONFIG } from '/js/config.js';
import { SYSTEM } from '../strings.js';
const API_BASE_URL = CONFIG.API_BASE_URL;
import { establishWebSocketConnection } from '/js/scripts/socket.js';
import { pushBackHandler, popBackHandler, replaceBackHandler, getStack } from '/js/scripts/back.js';
import { prompt } from '/js/pages/prompt.js';
import { positionMusicControls } from '/js/pages/landing.js';

const TERMINAL_HTML = `
<div id="terminal-container" class="terminal-container">
    <div id="terminal-target" style="width: 100%; height: 100%;"></div>
</div>
`;

let ws = null;
let xterm = null;
let fitAddon = null;
let currentParams = {};
let currentTerminalAPI = null;
let terminalQueue = [];
let terminalLoadPromise = null;

export function getTerminalAPI() {
    return currentTerminalAPI;
}

/**
 * Public entry point for sending messages to the terminal.
 * Handles automatic loading of the terminal view and message queuing.
 */
export async function handleTerminalMessage(messageText, level = 'info', ws = null, isTerminalData = false) {
    if (!messageText) return;

    // If loading, queue it
    if (terminalLoadPromise) {
        terminalQueue.push({ text: messageText, level, isTerminalData });
        return;
    }

    // If terminal is already loaded, write immediately
    if (currentTerminalAPI) {
        currentTerminalAPI.addOutput(messageText, level, isTerminalData);
        return;
    }

    // Buffer the message
    terminalQueue.push({ text: messageText, level, isTerminalData });

    // Initiate terminal load
    try {
        if (!ws) {
            console.error("[Terminal] Cannot load terminal without a WebSocket.");
            return;
        }

        const api = await loadTerminalView({
            existingWs: ws,
            hideInput: true,
            noBackHandler: true
        });

        // Flush the queue
        if (api) {
            while (terminalQueue.length > 0) {
                const queued = terminalQueue.shift();
                api.addOutput(queued.text, queued.level, queued.isTerminalData);
            }
        }
    } catch (error) {
        console.error("[Terminal] Failed to auto-load terminal:", error);
    }
}

/**
 * Calculates terminal dimensions based on window size and Courier Prime character width.
 */
export function getTerminalDimensions() {
    const header = document.getElementById('header-container');
    const headerHeight = header ? header.offsetHeight : 56;

    const width = window.innerWidth - 40 - 40;
    const height = window.innerHeight - (headerHeight * 2) - 40;

    const charWidth = 8.4;
    const charHeight = 17;

    const cols = Math.floor(width / charWidth) || 80;
    const rows = Math.floor(height / charHeight) || 24;

    return { cols, rows };
}

export async function loadTerminalView(params = {}) {
    if (terminalLoadPromise) {
        const api = await terminalLoadPromise;
        if (!params.hideInput && currentParams.hideInput) {
            api.enableInput();
            currentParams.hideInput = false;
        }
        return api;
    }

    if (currentTerminalAPI) {
        if (!params.hideInput && currentParams.hideInput) {
            currentTerminalAPI.enableInput();
            currentParams.hideInput = false;
        }
        return currentTerminalAPI;
    }
    
    terminalLoadPromise = (async () => {
        document.body.classList.add('terminal-view-active');
        document.body.classList.add('overlay-active');
        positionMusicControls();
        
        if (!params.noBackHandler) {
            replaceBackHandler(() => returnFromTerminal());
        }

        const consoleContainer = document.getElementById('console-container');
        if (!consoleContainer) {
            terminalLoadPromise = null;
            throw new Error(SYSTEM.STATUS.ERROR_MENU);
        }

        const { clearConsoleContent } = await import('/js/main.js');
        clearConsoleContent();
        consoleContainer.insertAdjacentHTML('beforeend', TERMINAL_HTML);

        try {
            const api = await initializeTerminal(params);
            currentTerminalAPI = api;
            terminalLoadPromise = null;
            return api;
        } catch (error) {
            terminalLoadPromise = null;
            throw error;
        }
    })();

    return await terminalLoadPromise;
}

export async function returnFromTerminal(params) {
    if (getStack().length > 0) {
        try { popBackHandler(); } catch (_) {}
    }

    if (currentTerminalAPI) {
        currentTerminalAPI.cleanup();
        currentTerminalAPI = null;
    }

    document.body.classList.remove('terminal-view-active');
    document.body.classList.remove('overlay-active');
    positionMusicControls();
    
    const { loadConsoleView } = await import('/js/main.js');
    loadConsoleView(params);
}

export function initializeTerminal(params) {
    currentParams = params;
    const isInteractive = params.interactive !== false;

    const terminalTarget = document.getElementById('terminal-target');
    if (!terminalTarget) {
        return Promise.reject(new Error("Terminal target not found!"));
    }

    xterm = new Terminal({
        fontFamily: "'Courier Prime', 'Courier New', Courier, monospace",
        fontSize: 14,
        lineHeight: 1.2,
        theme: {
            background: 'transparent',
            foreground: '#aaa',
            cursor: isInteractive ? '#fff' : 'transparent',
            selectionBackground: 'rgba(255, 255, 255, 0.3)',
            black: '#000000',
            red: '#ff4444',
            green: '#00ff00',
            yellow: '#ffaa00',
            blue: '#00aaff',
            magenta: '#cc00ff',
            cyan: '#00ffff',
            white: '#ffffff',
            brightBlack: '#666666',
            brightRed: '#ff6666',
            brightGreen: '#66ff66',
            brightYellow: '#ffff66',
            brightBlue: '#66ccff',
            brightMagenta: '#ff66ff',
            brightCyan: '#66ffff',
            brightWhite: '#ffffff'
        },
        cursorBlink: isInteractive,
        cursorStyle: 'block',
        allowTransparency: true,
        convertEol: true,
        disableStdin: !isInteractive
    });

    fitAddon = new FitAddon.FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(terminalTarget);
    
    // Focus the terminal immediately so the cursor starts blinking
    if (isInteractive) {
        xterm.focus();
    }
    
    setTimeout(() => { if (fitAddon) fitAddon.fit(); }, 0);

    const predictedBuffer = [];

    if (isInteractive && params.existingWs) {
        xterm.onData(data => {
            if (!currentParams.interactive) return; // Strict lockdown for non-interactive tasks
            
            if (params.existingWs.readyState === WebSocket.OPEN) {
                const isSimple = data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) <= 126;
                const isEnter = data === '\r';

                if (isSimple) {
                    xterm.write(data);
                    predictedBuffer.push(data);
                } else if (isEnter) {
                    // Pre-emptively move cursor down for that snappy feel
                    xterm.write('\r\n');
                    predictedBuffer.push('\r\n');
                }

                console.log(`[Terminal][${new Date().toISOString()}] Input sent: ${JSON.stringify(data)}`);
                params.existingWs.send(data);
            }
        });

        const container = document.getElementById('terminal-container');
        if (container) {
            container.addEventListener('click', () => xterm.focus());
        }
    }

    if (params.existingWs && params.existingWs.readyState === WebSocket.OPEN) {
        ws = params.existingWs;
        
        return Promise.resolve({
            addOutput: (message, level = 'info', isTerminalData = false) => {
                if (!xterm) return;
                
                let textToDraw = message;
                
                // If it's a terminal echo, check if it matches our prediction
                if ((isTerminalData || level === 'terminal') && predictedBuffer.length > 0) {
                    // console.log(`[Terminal] Prediction check: "${textToDraw}" vs buffer:`, predictedBuffer);
                    
                    // We must strip ANSI codes for the prediction check
                    const cleanText = textToDraw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
                    
                    while (predictedBuffer.length > 0 && cleanText.startsWith(predictedBuffer[0])) {
                        const matched = predictedBuffer.shift();
                        // Find the first occurrence of the matched character in the original (potentially ANSI-wrapped) text
                        const index = textToDraw.indexOf(matched);
                        if (index !== -1) {
                            textToDraw = textToDraw.substring(0, index) + textToDraw.substring(index + matched.length);
                        }
                    }
                }

                if (textToDraw) {
                    if (isTerminalData || level === 'terminal') {
                        console.log(`[Terminal][${new Date().toISOString()}] Data received: ${JSON.stringify(textToDraw)}`);
                    }
                    
                    // Non-interactive logs from Python often use \n, which xterm renders without CR.
                    // We normalize \n to \r\n only for non-raw terminal output.
                    let formatted = isTerminalData ? textToDraw : textToDraw.replace(/\n/g, '\r\n');
                    
                    // CRITICAL: Ensure non-terminal data (orchestration logs) always ends with a newline
                    // so multiple statuses don't stack on the same line.
                    if (!isTerminalData && !formatted.endsWith('\r\n')) {
                        formatted += '\r\n';
                    }
                    
                    xterm.write(formatted);
                }
            },
            disableInput: () => { if (xterm) xterm.options.disableStdin = true; },
            enableInput: () => {
                if (!isInteractive) return;
                if (xterm) {
                    xterm.options.disableStdin = false;
                    xterm.focus();
                }
            },
            cleanup: cleanupTerminal,
            ws
        });
    } else {
        return Promise.reject(new Error(SYSTEM.ERRORS.TERMINAL_WS_REQUIRED));
    }
}

export function cleanupTerminal() {
    console.log('Cleaning up terminal...');
    if (xterm) {
        xterm.dispose();
        xterm = null;
    }
    fitAddon = null;
    if (ws) {
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws = null;
    }
    currentParams = {};
}
