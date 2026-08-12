// website/src/js/scripts/site-utils.js

import { getSyncedData } from '/js/scripts/sync.js';

/**
 * Shared logic to determine the live URL and display address for a site.
 * @param {object} site - The site/deployment object.
 * @returns {object} - { url: string, label: string }
 */
export function getSiteAddress(site) {
    if (!site) return { url: null, label: 'n/a' };

    let address = 'n/a';
    let addressUrl = null;

    if (site.status === 'relinking') {
        if (site.relinking_source_for) {
            addressUrl = `http://${site.ip_address}:${site.port}`;
            address = `${addressUrl}...`; 
        } else if (site.relinking_target_for) {
            const domain = site.relinking_target_for;
            addressUrl = `https://${domain}`;
            address = `${addressUrl}...`;
        }
    } else {
        if (site.domain) {
            addressUrl = `https://${site.domain}`;
            address = addressUrl;
        } else if (site.infrastructure === 'firebase' && site.default_url) {
            addressUrl = site.default_url;
            address = addressUrl;
        } else if (site.ip_address && site.port) {
            addressUrl = `http://${site.ip_address}:${site.port}`;
            address = addressUrl;
        } else if (site.ip_address) {
            addressUrl = `http://${site.ip_address}`;
            address = addressUrl;
        }
    }

    return { url: addressUrl, label: address };
}

/**
 * Fetches the latest instance data and returns a normalized list of all deployments.
 */
export async function fetchAndProcessDeployments() {
    const state = await getSyncedData('instances', 'instances');
    const { compute, firebase } = state;
    let allDeployments = [];

    // 1. Process Compute (VM) deployments
    if (Array.isArray(compute)) {
        compute.forEach(vm => {
            if (vm.deployments && vm.deployments.length > 0) {
                const deployments = vm.deployments.map(dep => ({
                    id: dep.deployment_name,
                    machine_id: vm.id,
                    machine_name: vm.name,
                    status: dep.status,
                    ip_address: vm.ip_address,
                    domain: dep.domain,
                    port: dep.port,
                    wordpress: dep.wordpress,
                    zone: vm.zone,
                    backup_schedule: dep.backup_schedule,
                    relinking_target_for: dep.relinking_target_for,
                    relinking_source_for: dep.relinking_source_for,
                    infrastructure: 'vm'
                }));
                allDeployments.push(...deployments);
            }
        });
    }

    // 2. Process Firebase deployments
    if (Array.isArray(firebase)) {
        firebase.forEach(site => {
            allDeployments.push({
                id: site.name,
                site_id: site.site_id,
                status: site.status,
                domain: site.domains && site.domains.length > 0 ? site.domains[0] : null,
                default_url: site.default_url,
                infrastructure: 'firebase'
            });
        });
    }

    return allDeployments;
}

/**
 * Finds a specific site by its site_id or deployment name.
 */
export async function getSiteById(siteId) {
    const sites = await fetchAndProcessDeployments();
    return sites.find(s => s.site_id === siteId || s.id === siteId);
}
