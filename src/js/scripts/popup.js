import { SYSTEM } from '../strings.js';

/**
 * Opens a new popup window and writes a redirecting document.
 * This approach helps to avoid some popup blocker issues when `window.open`
 * is called with a URL directly from a non-user-initiated event.
 *
 * @param {string} url - The destination URL to redirect to.
 * @param {string} windowName - The name of the window.
 * @param {string} features - The string of window features.
 * @returns {Window | null} The new window object or null if it was blocked.
 */
export function openPopup(url, windowName = '_blank', features = 'width=800,height=600') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Popup] openPopup called for URL:`, url.substring(0, 100) + "...");
    
    // Open the window immediately to about:blank to get the reference
    const popup = window.open('', windowName, features);
    
    if (popup) {
        console.log(`[${timestamp}] [Popup] Window opened. Navigating to URL...`);
        
        // Set a simple loading message while we navigate
        try {
            popup.document.write(`
                <html>
                    <head>
                        <title>${SYSTEM.STATUS.CONNECTING_GITHUB}</title>
                        <style>
                            body { 
                                background-color: #242832; 
                                color: #ffffff; 
                                font-family: 'Courier Prime', 'Courier New', Courier, monospace; 
                                display: flex; 
                                align-items: center; 
                                justify-content: center; 
                                height: 100vh; 
                                margin: 0; 
                            }
                            .spinner {
                                width: 40px;
                                height: 40px;
                                border: 4px solid #3d4351;
                                border-top: 4px solid #4a90e2;
                                border-radius: 50%;
                                animation: spin 1s linear infinite;
                            }
                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                        </style>
                    </head>
                    <body>
                        <div class="spinner"></div>
                    </body>
                </html>
            `);
        } catch (e) {
            // Ignore if we can't write to the document (though we should be able to on about:blank)
        }

        // Navigate to the actual URL
        popup.location.href = url;
        
        try {
            popup.focus();
        } catch (e) {}
    } else {
        console.error(`[${timestamp}] [Popup] window.open returned null. Was the popup blocked?`);
    }
    return popup;
}


