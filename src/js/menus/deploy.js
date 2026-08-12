import { menus } from '/js/pages/menu.js';
import { registerHandler } from '../scripts/registry.js';
import { fetchWithAuth } from '/js/main.js';
import { CONFIG } from '/js/config.js';
const API_BASE_URL = CONFIG.API_BASE_URL;
import { getUser, requireAuth } from '/js/scripts/authenticate.js';
import { prompt } from '/js/pages/prompt.js';
import { purchaseDomain } from '/js/scripts/api.js';
import { orchestrator } from '../scripts/orchestrator.js';
import { DEPLOY } from '../strings.js';

let pollingInterval = null;

// --- Menu Configuration ---
menus['deploy-menu'] = {
    ...DEPLOY.MENU.MAIN,
    onLeave: () => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }
};

// --- Deployment Initiation ---

async function _executeDeployment(prepParams) {
    const { params, deploymentType } = prepParams;
    orchestrator.updateStatus(DEPLOY.STATUS.PREPARING, 'info');
    
    orchestrator.execute({
        id: 'deployment',
        prepFn: () => fetchWithAuth(`${API_BASE_URL}/deploy`, {
            method: 'POST',
            body: { ...params, task: deploymentType }
        }),
        strings: DEPLOY.STATUS,
        backMenuId: 'deploy-menu',
        onEvent: async (eventName, payload, ws) => {
            if (eventName === 'PROMPT_USER') {
                // 1. Specialized handling for Domain & Subscription
                if (payload.type === 'subscription') {
                    const { handleSubscribe } = await import('/js/menus/subscription.js');
                    await handleSubscribe(async () => {
                        ws.send(JSON.stringify({ status: 'answered', value: 'paid' }));
                    }, { ...payload, suppressMenuNav: true });
                    return true;
                }

                if (payload.type === 'domain') {
                    const answer = await prompt({ ...payload, noBackHandler: true });
                    if (answer && answer.status === 'answered' && answer.value) {
                        const { domainName, price } = answer.value;
                        const user = getUser();
                        if (!user || !user.token) throw new Error(DEPLOY.ERRORS.AUTH_REQUIRED);
                        
                        orchestrator.updateStatus(DEPLOY.STATUS.PURCHASING, 'info');
                        const result = await purchaseDomain({ domainName, price, offSession: true, token: user.token });
                        
                        if (!result.ok) throw new Error(result.error || DEPLOY.ERRORS.PURCHASE_FAILED_GENERIC);
                        
                        orchestrator.updateStatus(DEPLOY.STATUS.PURCHASE_SUCCESS(domainName), 'success');
                        ws.send(JSON.stringify({ status: 'answered', value: domainName }));
                    } else {
                        ws.send(JSON.stringify({ status: answer.status, value: answer.value }));
                    }
                    return true;
                }

                // 2. Reaction feedback for non-specialized prompts
                if (payload.reaction) {
                    orchestrator.updateStatus(payload.reaction, 'success');
                }
            }
            return false; // Let orchestrator handle the rest
        }
    });
}

export const handleDeployAdvanced = requireAuth(
    async (params) => {
        await _executeDeployment({ params, deploymentType: 'advanced' });
        return { handled: true };
    },
    'advanced deployment'
);

export const handleDeploySimple = requireAuth(
    async (params) => {
        await _executeDeployment({ params, deploymentType: 'simple' });
        return { handled: true };
    },
    'simple deployment'
);

registerHandler('handleDeploySimple', handleDeploySimple);
registerHandler('handleDeployAdvanced', handleDeployAdvanced);
