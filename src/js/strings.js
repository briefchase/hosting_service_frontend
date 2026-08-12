/**
 * Centralized registry for all user-facing strings and interactive prompts in the frontend.
 * All strings are strictly lowercase to maintain consistency with the backend.
 */

export const SYSTEM = {
    METADATA: {
        NAME: 'console',
        DESCRIPTION: 'a simple, clean console interface for web services.',
        PHONE: '(305) 501-0383',
        PHONE_FORMATTED: '3055010383'
    },

    MENU: {
        DASHBOARD: {
            text: 'console:',
            items: [
                { id: 'deploy-option', text: 'deploy', targetMenu: 'deploy-menu', type: 'button', tooltip: 'make a website' },
                { id: 'sites-option', text: 'sites', action: 'listSites', type: 'button', showLoading: true, tooltip: 'manage and destroy deployed sites' },
                { id: 'machines-option', text: 'machines', action: 'listMachines', type: 'button', showLoading: true, tooltip: 'view and ssh into virtual machines' },
                { id: 'domains-option', text: 'domains', action: 'listDomains', type: 'button', showLoading: true, tooltip: 'manage domains and dns records' },
                { id: 'backups-option', text: 'backups', targetMenu: 'backup-menu', type: 'button', tooltip: 'schedule, create, and restore backups from your google drive' },
                { id: 'usage-option', text: 'usage', action: 'getUsage', type: 'button', showLoading: true, tooltip: 'check accumulated balance' }
            ]
        },
        ERRORS: {
            GENERIC: '<p>error loading menu.</p>',
            NOT_FOUND: '<p>error: menu not found.</p>',
            INCOMPLETE: '<p>error: menu structure incomplete.</p>',
            MAIN_NOT_LOADED: '<p>error: main menu not loaded.</p>'
        },
        FETCHING: (id) => ({ text: `fetching ${id.replace('-menu', '')}...`, effect: 'wave' })
    },
    STATUS: {
        ERROR_MENU: 'error loading menu structure.',
        AUTH_ELEMENT_MISSING: 'cannot initiate authentication: ui element missing.',
        GENERIC_ERROR: 'an unexpected error occurred.',
        LOADING: 'loading...',
        ERROR: 'error',
        AUTHENTICATING: { text: 'authenticating with server...', effect: 'wave' },
        SIGNING_IN: { text: 'signing in...', effect: 'wave' },
        SIGN_IN_CANCELLED: 'sign-in cancelled.',
        PLEASE_SIGN_IN: 'please sign in to continue',
        DELETING_PROJECT: 'deleting project...',
        RESCINDING_ACCESS: 'rescinding access...',
        CONNECTING: { text: 'connecting to server...', effect: 'wave' },
        FETCHING_DETAILS: (id) => ({ text: `fetching details for ${id}...`, effect: 'wave' }),
        CONNECTING_GITHUB: 'connecting to github...'
    },
    LABELS: {
        ACCOUNT: 'account',
        AUTHENTICATE: 'authenticate',
        AUTHENTICATING: 'authenticating...',
        BACK: 'back',
        EDIT: 'edit',
        DELETE: 'delete',
        OK: 'ok',
        YES: 'yes',
        NO: 'no',
        COPY: 'copy',
        COPIED: 'copied!',
        VIEW_RESOURCE: 'view resource',
        DESTROY: 'destroy',
        RENAME: 'rename',
        DELETE_PROJECT: 'delete project',
        LOGOUT: 'logout',
        RESCIND_ACCESS: 'rescind access',
        NEVERMIND: 'nevermind',
        SIGN_IN: 'sign in',
        RESUME: 'resume',
        CANCEL_MEMBERSHIP: 'cancel membership',
        SUBSCRIBE: 'subscribe',
        UNAVAILABLE: 'unavailable',
        CONTINUE: 'continue',
        NOPE: 'nope',
        NOT_SET: 'not set',
        NOT_GENERATED: 'not generated',
        PROJECT_SYNC: (name) => `project sync: ${name}`,
        UNKNOWN: 'unknown',
        MANUAL: 'manual',
        NA: 'n/a',
        FOOTER: {
            BRIEFCHASE: 'briefchase llc',
            PRIVACY: 'privacy policy',
            TOS: 'terms of service',
            CODE: 'code',
            INSTAGRAM: 'instagram'
        },
        SUPPORT: {
            OPEN_24: 'open 24 hours'
        },
        MODE: {
            CAT: 'enter cat mode',
            SERIOUS: 'enter serious mode'
        },
        INFO_ICON: 'i'
    },
    TOOLTIPS: {
        COMING_SOON: 'coming soon'
    },
    ERRORS: {
        LOAD_RESOURCES_FAILED: 'could not load resources.',
        INVALID_INPUT: 'invalid input.',
        AUTH_FAILED: (status) => `backend authentication failed: ${status}`,
        AUTH_INCOMPLETE: 'authentication data incomplete from server.',
        AUTH_CONFIG_MISSING: 'google sign-in is not configured.',
        NETWORK_ERROR: 'network error communicating with server. please try again.',
        AUTH_CANCELLED: (details) => `google sign-in failed or was cancelled${details}.`,
        AUTH_ERROR: (type) => `google sign-in error: ${type || 'unknown error'}. check console.`,
        AUTH_CRITICAL: 'critical error initializing google sign-in. check console.',
        AUTH_INIT_FAILED: 'sign-in client failed to initialize. please refresh.',
        PERMISSIONS_REQUIRED: 'additional permissions required to manage your infrastructure.',
        PERMISSIONS_REQUIRED_ID: 'permissions_required',
        ONE_TAP_ERROR: 'automatic sign-in failed.',
        UNKNOWN_EVENT: (eventName) => `received unknown event: ${eventName}`,
        GENERIC_ERROR_MSG: (msg) => `error: ${msg}`,
        HTTP_ERROR: (status) => `http error ${status}`,
        SERVER_RETURNED: (status) => `server returned ${status}`,
        UNKNOWN_ANON: 'an unknown error occurred',
        USER_CANCELLED: 'user_cancelled',
        WS_ERROR: 'websocket connection error. check console for details.',
        WS_GENERIC_ERROR: 'websocket connection error.',
        TERMINAL_WS_REQUIRED: 'terminal requires an active websocket connection.'
    },
    PROMPTS: {
        GENERIC_INFO: (msg) => ({
            text: msg.toLowerCase(),
            type: 'form',
            buttons: [{ label: "ok", value: true }]
        }),
        EDITOR_INFO: (msg) => ({
            text: msg.toLowerCase(),
            type: 'form',
            replace: true,
            buttons: [{ label: "ok", value: true }]
        }),
        EXIT_CONFIRM: (type) => ({
            id: `${type}_exit_confirm`,
            text: `are you sure you want to exit this ${type}?${type === 'editor' ? ' unsaved changes will be lost.' : ''}`,
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes', value: true }, { label: 'no', value: false }] }],
            hideBackButton: true
        }),
        AUTH_RESCIND: {
            id: 'confirm-rescind-prompt',
            text: "are you sure you want to rescind our access to your google account? scheduled backups will not be created, and you will be logged out. signing back in will undo this action.",
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes', value: true }, { label: 'no', value: false }] }]
        },
        WHAT_IS_THIS: (html) => ({
            id: 'what-is-this-prompt',
            text: html,
            type: 'form',
            buttons: [{ label: 'ok', value: 'ok' }]
        }),
        DELETE_PROJECT_CONFIRM: {
            id: 'delete-project-confirm',
            text: 'are you sure you want to completely delete your project and all its resources? this action cannot be undone.',
            type: 'form',
            buttons: [
                { type: 'row', items: [{ label: 'yes', value: true, className: 'primary-button' }, { label: 'no', value: false }] }
            ]
        },
        DELETE_PROJECT_SUCCESS: {
            id: 'delete-project-success',
            text: 'project successfully deleted.',
            type: 'form',
            buttons: [{ label: 'ok', value: true }]
        },
        DELETE_PROJECT_ERROR: (errorMsg) => ({
            id: 'delete-project-error',
            text: `failed to delete project: ${errorMsg}`,
            type: 'form',
            buttons: [{ label: 'ok', value: true }]
        }),
        PERMISSION_EXPLANATION: {
            id: 'permission-explanation-prompt',
            text: `we need some permissions from you:
            <br><br>
            <div style="text-align: left; display: inline-block; width: 100%; max-width: 400px; margin: 0 auto;">
                <div style="display: flex; align-items: center; margin-bottom: 12px;">
                    <span style="margin-right: 12px; display: flex; align-items: center; color: white;">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M19.511 9.722a7.833 7.833 0 0 0-2.359-3.804l-.035.035.005-.042A7.81 7.81 0 0 0 4.418 9.722c.031-.013.066-.013.099-.023a5.643 5.643 0 0 0-.306 9.166l.006-.006-.006.024a5.612 5.612 0 0 0 3.407 1.134h4.321l.024.024h4.341a5.644 5.644 0 0 0 3.207-10.319zm-3.206 6.845h-4.341l-.006.006v-.031h-4.34c-.308 0-.611-.066-.892-.193l.002-.001a2.17 2.17 0 1 1 2.87-2.871l2.518-2.518a5.634 5.634 0 0 0-3.396-2.1c.018-.009.035-.024.05-.021a4.334 4.334 0 0 1 5.931-.451h.046a4.334 4.334 0 0 1 1.558 3.407v.433a2.17 2.17 0 1 1 0 4.34z"></path></svg>
                    </span>
                    <span>to deploy and manage servers and sites</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <span style="margin-right: 12px; display: flex; align-items: center; color: white;">
                        <svg width="22" height="22" viewBox="0 0 207.133 207.133" fill="currentColor"><path d="M67.473,19.58l28.845,50.747L28.279,187.45L0,135.727L67.473,19.58z M41.913,190.558l134.656-0.027l30.563-52.024 L72.158,138.49L41.913,190.558z M205.588,125.446L139.464,16.747l-58.265-0.172l62.747,108.972L205.588,125.446z"></path></svg>
                    </span>
                    <span style="opacity: 0.8;">to store and use backups we create in drive</span>
                </div>
            </div><br><br>`,
            type: 'form',
            buttons: [
                { 
                    type: 'row', 
                    items: [
                        { label: 'ok, cool', value: 'continue' },
                        { label: 'nevermind', value: 'cancel' }
                    ] 
                }
            ]
        },
        BILLING_ACCOUNT_ATTACH_EXPLANATION: {
            id: 'billing-account-attach-explanation-prompt',
            text: `
            <div style="text-align: left; display: inline-block; width: 100%; max-width: 400px; margin: 0 auto;">
                <div style="display: flex; align-items: center; margin-bottom: 16px;">
                    <span style="margin-right: 12px; display: flex; align-items: center; color: white;">
                        <svg width="28" height="28" viewBox="0 0 24 24" overflow="visible">
                            <g>
                                <rect y="0" fill="none" width="24" height="24"/>
                                <g transform="translate(0.000000, 5.000000)">
                                    <path fill-rule="evenodd" fill="#A2A2A2" d="M22.5,15.2h-21c-0.8,0-1.5-0.7-1.5-1.5V0.2c0-0.8,0.7-1.5,1.5-1.5h21 c0.8,0,1.5,0.7,1.5,1.5v13.5C24,14.6,23.3,15.2,22.5,15.2L22.5,15.2z"/>
                                    <path fill-rule="evenodd" fill="#838383" d="M22.5,15.2H12V-1.2h10.5c0.8,0,1.5,0.7,1.5,1.5v13.5C24,14.6,23.3,15.2,22.5,15.2 L22.5,15.2z"/>
                                    <rect y="1" fill-rule="evenodd" fill="#838383" width="24" height="3"/>
                                    <rect x="12" y="1" fill-rule="evenodd" fill="#646464" width="12" height="3"/>
                                    <rect x="2.2" y="5.5" fill-rule="evenodd" fill="#FFFFFF" width="19.5" height="2.2"/>
                                    <rect x="2.2" y="10" fill-rule="evenodd" fill="#838383" width="4.5" height="3"/>
                                    <rect x="13.5" y="10.8" fill-rule="evenodd" fill="#FFFFFF" width="1.5" height="1.5"/>
                                    <rect x="16.5" y="10.8" fill-rule="evenodd" fill="#FFFFFF" width="1.5" height="1.5"/>
                                    <rect x="19.5" y="10.8" fill-rule="evenodd" fill="#FFFFFF" width="1.5" height="1.5"/>
                                </g>
                            </g>
                        </svg>
                    </span>
                    <span>our billing account is being connected your new project</span>
                </div>
                <div style="opacity: 0.8; line-height: 1.4; font-size: 0.95em;">
                    this means you will be billed by us for your compute usage, but you can change this anytime in the usage menu
                </div>
            </div><br><br>`,
            type: 'form',
            buttons: [
                { 
                    type: 'row', 
                    items: [
                        { label: 'ok, cool', value: 'continue' },
                        { label: 'nevermind', value: 'cancel' }
                    ] 
                }
            ]
        }
    }
};

export const DEPLOY = {
    MENU: {
        MAIN: {
            text: 'difficulty:',
            items: [
                { id: 'simple-option', text: 'simple', type: 'button', action: 'handleDeploySimple', showLoading: true, tooltip: 'fast, feature complete, skips dumb questions (reccomended)' },
                { id: 'advanced-option', text: 'advanced', type: 'button', action: 'handleDeployAdvanced', showLoading: true, tooltip: 'asks unimportant questions scenic route (fun)' }
            ],
            backTarget: 'dashboard-menu'
        }
    },
    STATUS: {
        PREPARING: 'preparing deployment...',
        CONNECTING: 'connecting...',
        CONNECTED_WAITING: 'connected. waiting for server...',
        CONNECTION_ERROR: 'connection error.',
        CONNECTION_READY: 'connection ready.',
        PURCHASING: 'purchasing...',
        PURCHASE_SUCCESS: (domain) => `successfully registered ${domain}!`,
        CLEANING: 'cleaning up...',
        DEPLOYING: 'deploying',
        COMPLETE_TERMINAL: 'deployment complete. press back to return to the menu.',
        FINISHED: 'deployment finished.'
    },
    ERRORS: {
        WS_PROCESS: 'error processing server message.',
        AUTH_REQUIRED: 'user not authenticated.',
        PURCHASE_FAILED: 'failed to purchase domain.',
        PURCHASE_FAILED_GENERIC: 'failed to purchase domain.',
        PREPARE_FAILED: 'unknown error during deployment request.',
        UNKNOWN_EVENT: (eventName) => `received unknown event: ${eventName}`,
        WS_CONNECTION_FAILED: 'failed to establish websocket connection.'
    },
    PROMPTS: {}
};

export const INFRASTRUCTURE = {
    LABELS: {
        STATUS: 'status:',
        MACHINE: 'machine:',
        BACKUPS: 'backups:',
        ADDRESS: 'address:',
        TRANSFERRABLE: 'transferrable:',
        MANAGED_EXTERNAL: 'managed externally',
        RELINKING: 'relinking...',
        SITE_UNLINKED: 'unlinked',
        FRONT_PAGE: 'front page',
        ADMIN_PANEL: 'admin panel',
        NO_SITES: 'no sites found',
        SITES: 'sites',
        SITES_MENU: 'sites:',
        SITE: 'site:',
        DEPLOYMENTS: 'deployments:',
        NONE: 'none',
        CONNECT: '<s>connect</s>',
        NO_MACHINES: 'no machines found',
        MACHINES: 'machines',
        MACHINES_MENU: 'machines:',
        RESOURCES: 'resources:',
        IP: 'ip:',
        SIZE: 'size:',
        ZONE: 'zone:',
        SITE_ID: (id) => `site: ${id}`,
        MACHINE_ID: (id) => `machine: ${id}`,
        IP: 'ip:',
        SIZE: 'size:',
        DOWNLOAD: 'download site'
    },
    TOOLTIPS: {
        SITES: 'manage and destroy deployed sites',
        MACHINES: 'view and ssh into virtual machines',
        DOWNLOAD: 'download a zip of your live website',
        ADMIN_PANEL: 'open the wordpress dashboard',
        DESTROY_SITE: 'permanently delete this site and its data',
        CONNECT: 'open a secure shell session',
        RENAME: 'change the display name of this machine',
        DESTROY: 'permanently delete this machine and all its data'
    },
    STATUS: {
        FETCHING_MACHINES: { text: 'fetching machines...', effect: 'wave' },
        FETCHING_SITES: { text: 'fetching sites...', effect: 'wave' },
        INITIATING_DESTROY: 'initiating destruction...',
        DESTROY_CANCELLED: 'destruction cancelled.',
        DESTROY_REQUESTED: 'destroy requested',
        DESTROYING: 'destroying...',
        RENAMING: 'renaming machine...',
        RENAME_SUCCESS: 'machine renamed successfully.',
        DESTROY_SUCCESS: 'machine destroyed successfully.',
        SSH_READY: 'secure shell established.',
        PREPARING_DOWNLOAD: 'preparing download...',
        DOWNLOAD_READY: 'download ready.',
        DOWNLOAD_FINISHED: 'download complete.',
        DOWNLOAD_FINISHED_MSG: 'download bundle created. your download should begin momentarily.'
    },
    ERRORS: {
        SITE_NOT_FOUND: 'site details not found.',
        INCOMPLETE_DATA: 'site data is incomplete for destroy operation.',
        MISSING_MACHINE_ID: 'missing machine id for destruction.',
        MISSING_MACHINE_DATA: 'missing machine data for rename.',
        RENAME_CANCELLED: 'rename cancelled or name unchanged.',
        MACHINE_NOT_FOUND: 'machine details not found.',
        DESTROY_FAILED: 'failed to destroy machine.',
        DESTROY_TASK_FAILED: 'failed to start destruction task.',
        LOAD_SITE_FAILED: (msg) => `could not load site: ${msg}`,
        DESTROY_FAILED_GENERIC: 'failed to destroy',
        RENAME_FAILED: 'failed to rename machine',
        AUTH_TOKEN_NOT_FOUND: 'authentication token not found.',
        PREPARE_DOWNLOAD_FAILED: 'failed to prepare download.'
    },
    PROMPTS: {
        MACHINE_DESTROY: (name) => ({
            id: 'confirm-destroy-vm-prompt',
            text: `are you sure you want to destroy the entire machine '${name}' and all its deployments? this cannot be undone.`,
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes', value: 'yes' }, { label: 'no', value: 'no' }] }]
        }),
        MACHINE_RENAME: (currentName) => ({
            id: 'rename-vm-prompt',
            text: `enter new name for machine '${currentName}':`,
            type: 'form',
            items: [
                {
                    id: 'newName',
                    type: 'text',
                    value: currentName,
                    placeholder: 'new-name',
                    validationRegex: '^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$',
                    validationError: 'name must be 1-63 characters, start/end with a letter/number, and can only contain lowercase letters, numbers, or hyphens.'
                }
            ],
            buttons: [{ label: 'continue', isSubmit: true }]
        }),
        SITE_DESTROY: (name) => ({
            id: 'confirm-destroy-site-prompt',
            text: `are you sure you want to destroy the site '${name}'? this cannot be undone.`,
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes', value: 'yes' }, { label: 'no', value: 'no' }] }]
        })
    }
};

export const DOMAINS = {
    LABELS: {
        TYPE: 'type:',
        HOST: 'host:',
        VALUE: 'value:',
        TTL: 'ttl:',
        EXPIRES: 'expires:',
        AUTO_RENEW: 'auto renew:',
        TRANSFERRABLE: 'transferrable:',
        MANAGED_EXTERNAL: 'managed externally',
        RELINKING_TO: (target) => `linking to ${target}...`,
        UNLINKING: 'unlinking...',
        SITE: 'site:',
        ENABLED: 'enabled',
        DISABLED: 'disabled',
        LOCKED: 'locked',
        UNLOCKED: 'unlocked',
        FIREBASE_HOSTING: 'firebase hosting',
        SERVER_IP: 'the server\'s ip',
        DOMAINS: 'domains',
        DOMAINS_MENU: 'domains:',
        TRANSFER_IN: 'transfer in',
        REGISTER: 'register domain',
        LINK_EXTERNAL: 'link external domain',
        NO_DOMAINS: 'no domains found',
        NO_RECORDS: 'no records found',
        ADD_RECORD: 'add record',
        TYPE_FIELD: 'type',
        HOST_FIELD: 'host',
        VALUE_FIELD: 'value',
        TTL_FIELD: 'ttl',
        UNLINK: 'unlink',
        RECORDS: 'records',
        RECORDS_FOR: (domain) => `records for ${domain}:`,
        RELINK_HINT_DELETE: (domain, ip) => `remember to delete the a record for ${domain} associated with ${ip || 'the server'}`,
        RELINK_HINT_CHANGE: (domain, oldIp, newIp) => `change the a record for ${domain} associated with ${oldIp} to ${newIp}`,
        RELINK_HINT_ENSURE: (domain, ip) => `ensure there is an a record for ${domain} associated with ${ip || 'the server'}`,
        RECORDS_TITLE: (type, name, content) => `${type} ${name} -> ${content}`,
        LINK: 'link',
        RELINK: 'relink',
        TRANSFER_OUT: 'transfer out',
        CANCEL_TRANSFER: 'cancel transfer',
        RESUME_RENEWALS: 'resume renewals',
        CEASE_RENEWALS: 'cease renewals',
        DEPLOYMENT_ON_MACHINE: (name, machine) => `${name} on ${machine}`,
        YEARLY_PRICE: (price) => `$${price} / year`
    },
    TOOLTIPS: {
        TRANSFER_IN: 'bring a domain from a different registrar',
        REGISTER: 'purchase a new domain',
        LINK_EXTERNAL: 'point a domain you own elsewhere at a site',
        UNLINK: 'remove this domain from its current site',
        RECORDS: 'view dns records for this domain',
        DOMAINS: 'manage domains and dns records',
        LINK: 'point this domain at a site',
        RELINK: 'point this domain at a different site',
        CEASE_RENEWALS: 'do not renew this domain',
        RESUME_RENEWALS: 'process renewals for this domain',
        RELOCK: 're-lock domain',
        MOVE_REGISTRAR: 'move this domain to a different registrar'
    },
    PLACEHOLDERS: {
        HOST: '@ or sub',
        VALUE: 'ip or domain',
        TTL: 'mins'
    },
    STATUS: {
        FETCHING: { text: 'fetching domains...', effect: 'wave' },
        FETCHING_DETAILS: (domain) => ({ text: `fetching details for ${domain}...`, effect: 'wave' }),
        FETCHING_RECORDS: (domain) => ({ text: `fetching records for ${domain}...`, effect: 'wave' }),
        PURCHASING: (domain) => `purchasing ${domain}...`,
        PURCHASE_SUCCESS: (domain) => `successfully registered ${domain}!`,
        RELINKING: (domain, isUnlink) => `${isUnlink ? 'unlinking' : 'initiating relink for'} ${domain}...`,
        TRANSFER_INITIATING: (domain, action) => `initiating ${action} transfer for ${domain}...`,
        TRANSFER_SUCCESS: (domain, action) => `successfully ${action === 'authorize' ? 'authorized' : 'cancelled'} transfer for ${domain}!`,
        RENEWAL_TOGGLING: (domain, isEnable) => `${isEnable ? 'resuming' : 'ceasing'} renewals for ${domain}...`,
        RENEWAL_SUCCESS: (domain, isEnable) => `successfully ${isEnable ? 'resumed' : 'ceased'} renewals for ${domain}!`,
        TRANSFER_IN_INITIATING: (domain) => `initiating transfer for ${domain}...`,
        TRANSFER_IN_SUCCESS: (domain) => `successfully initiated transfer for ${domain}!`,
        FETCHING_DEPLOYMENTS: { text: 'fetching available deployments...', effect: 'wave' },
        LINKING_EXTERNAL: (domain) => `initiating link for ${domain}...`,
        ADDING_RECORD: (type) => `adding ${type} record...`,
        RECORD_ADD_SUCCESS: 'record added successfully',
        UPDATING_RECORD: 'updating record...',
        RECORD_UPDATE_SUCCESS: 'record updated successfully',
        DELETING_RECORD: 'deleting record...',
        RECORD_DELETE_SUCCESS: 'record deleted successfully',
        CHECKOUT_INITIATING: 'unable to initiate checkout.'
    },
    ERRORS: {
        FETCH_FAILED: 'failed to fetch domains.',
        NO_DEPLOYMENTS: 'no deployments available.',
        NO_OTHER_DEPLOYMENTS: 'no other deployments available to link to.',
        RELINK_CANCELLED: 'relink cancelled.',
        RELINK_FAILED: (isUnlink) => `failed to ${isUnlink ? 'unlink' : 'initiate relink'}.`,
        TRANSFER_FAILED: (action) => `failed to ${action} transfer.`,
        TRANSFER_IN_FAILED: 'failed to initiate transfer.',
        EXTERNAL_LINK_FAILED: 'failed to initiate link.',
        FETCH_RECORDS_FAILED: 'failed to fetch records.',
        ADD_RECORD_FAILED: 'failed to add record',
        UPDATE_RECORD_FAILED: 'failed to update record',
        DELETE_RECORD_FAILED: 'failed to delete record',
        NO_DEPLOYMENTS_ACCESS: 'you must initiate at least one deployment before accessing this menu.',
        LOAD_DETAILS_FAILED: (msg) => `could not load details: ${msg}`,
        LOAD_DOMAINS_FAILED: (msg) => `could not load domains: ${msg}`,
        AUTH_REQUIRED: 'user not authenticated.',
        REGISTRATION_TIMEOUT: 'registration timed out',
        DOMAIN_REQUIRED: 'domain name required',
        TRANSFER_OUT_FAILED: 'failed to transfer out',
        TOGGLE_RENEWAL_FAILED: 'failed to toggle renewal',
        TRANSFER_IN_FAILED_GENERIC: 'failed to transfer in'
    },
    PROMPTS: {
        DELETE_CONFIRM: (domain) => ({
            id: 'delete-domain-confirm',
            text: `are you sure you want to delete the domain '${domain}'? this will remove all associated dns records and cannot be undone.`,
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes, delete', value: 'yes' }, { label: 'no, keep it', value: 'no' }] }]
        }),
        REGISTRATION_LOOKUP: {
            id: 'domain_registration_prompt',
            text: "enter the domain name you'd like to use (e.g., example.com):",
            type: 'domain'
        },
        USE_CARD_ON_FILE: (domainName, price) => ({
            id: 'use_card_on_file',
            text: `would you like to use the card on file to purchase ${domainName} for $${price}?`,
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes', value: true }, { label: 'no', value: false }] }]
        }),
        CHECKOUT: (domainName, clientSecret) => ({
            id: 'domain_checkout',
            type: 'embedded_checkout',
            text: `complete checkout for ${domainName}`,
            client_secret: clientSecret
        }),
        REGISTRATION_SUCCESS: {
            id: 'registration_success',
            text: "if this is your first time purchasing a domain from us, you should receive an email from our partners at dnsimple asking you to verify your email for whois. failure to do this could result in issues with your standing with our registrar, and your domain may stop resolving.",
            type: 'form',
            replace: true,
            buttons: [{ label: 'ok', value: true }]
        },
        RELINK_SELECT: (domainName, deploymentOptions) => ({
            id: 'relink-deployment-select',
            text: `which deployment should ${domainName} point to?`,
            type: 'form',
            buttons: deploymentOptions.map(opt => ({ label: opt.label, value: opt.value }))
        }),
        TRANSFER_OUT_EMAILED: {
            id: 'transfer_out_emailed',
            text: "you have been emailed an authorization code.",
            type: 'form',
            buttons: [{ label: 'ok', value: true }]
        },
        TRANSFER_IN_NAME: {
            id: 'transfer_in_domain_name',
            text: "enter the domain name you'd like to transfer in:",
            type: 'form',
            items: [{ id: 'domainName', type: 'text', placeholder: 'example.com' }],
            buttons: [{ label: 'proceed', isSubmit: true }]
        },
        TRANSFER_IN_AUTH: (domainName) => ({
            id: 'transfer_in_auth_code',
            text: `enter the authorization code for ${domainName}:`,
            type: 'form',
            items: [{ id: 'authCode', type: 'text', placeholder: 'code' }],
            buttons: [{ label: 'proceed', isSubmit: true }]
        }),
        EXTERNAL_LINK_SELECT: (deploymentOptions) => ({
            id: 'external-domain-link-select',
            text: "which deployment should this domain point to?",
            type: 'form',
            buttons: deploymentOptions.map(opt => ({ label: opt.label, value: opt.value }))
        }),
        EXTERNAL_LINK_INPUT: {
            id: 'external-domain-link-input',
            text: "enter the domain name you'd like to link (e.g., example.com):",
            type: 'form',
            items: [{ id: 'domainName', type: 'text', placeholder: 'example.com' }],
            buttons: [{ label: 'link domain', isSubmit: true }]
        },
        CLOUD_PERMISSIONS_WARNING: {
            id: 'domain-cloud-permissions-warning',
            text: "all domains may not be visible without cloud permissions.",
            type: 'form',
            buttons: [{ label: 'ok', value: true }]
        },
        DNS_RECORD_MANAGE: (domainName, isUpdate, items) => ({
            id: isUpdate ? 'edit-domain-record-prompt' : 'add-domain-record-prompt',
            text: `${isUpdate ? 'edit' : 'add a new'} record ${isUpdate ? 'for' : 'to'} ${domainName}:`,
            type: 'form',
            items: items,
            buttons: [
                { 
                    type: 'row', 
                    items: isUpdate ? [
                        { label: 'save', isSubmit: true },
                        { label: 'delete', value: 'delete', style: 'danger' },
                        { label: 'cancel', value: 'cancel' }
                    ] : [
                        { label: 'cancel', value: 'cancel' },
                        { label: 'add', isSubmit: true }
                    ]
                }
            ]
        }),
        DNS_RECORD_DELETE: {
            id: 'confirm-delete-record-prompt',
            text: "are you sure you want to delete this record? this cannot be undone.",
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes', value: 'yes' }, { label: 'no', value: 'no' }] }]
        }
    }
};

export const BILLING = {
    MENU: {},
    LABELS: {
        MONTHLY_USAGE: 'current monthly usage:',
        USAGE_FOR: (month) => `usage for ${month.toLowerCase()}:`,
        MEMBERSHIP_COST: (cost) => `membership cost: $${cost.toFixed(2)}`,
        GOOGLE_COST: (cost, isFree) => `google server cost: $${cost.toFixed(2)}${isFree ? ' (free)' : ''}`,
        BILLING_STATUS: (status, name, isMember) => {
            if (isMember) return `account status: member billing (${status})`;
            if (!name || name === 'Not Linked') return 'account status: not linked';
            return `account status: '${name}' (${status})`;
        },
        TOTAL_BALANCE: (balance) => `total balance: $${balance.toFixed(2)}`,
        POPUP_BLOCKED: 'popup blocked',
        ENABLE_POPUPS: 'please enable popups to view usage',
        OPEN: 'open',
        AVAILABLE: 'available',
        CLOSED: 'closed',
        INACTIVE: 'inactive',
        ERROR: 'error',
        NOT_LINKED: 'not linked',
        FREE: 'free',
        CHANGE_ACCOUNT: 'change account',
        UNLINK_ACCOUNT: 'unlink project',
        CREATE_ACCOUNT: 'create account',
        STATUS_ERROR: 'status: error',
        SUBSCRIPTION: 'subscription:',
        SUBSCRIPTION_MENU: 'subscription',
        STATUS_CHECKING: 'status: checking...',
        STATUS_ACTIVE: 'status: active',
        STATUS_ACTIVE_ENDS: (date) => `status: active (ends ${date})`,
        STATUS_INACTIVE: 'status: inactive'
    },
    TOOLTIPS: {
        CHANGE_ACCOUNT: 'change the billing account associated with this project',
        UNLINK_ACCOUNT: 'stop billing for this project and disable paid services',
        MEMBER_ACCOUNT: 'our billing account is assigned to your project (we do not profit from compute costs)',
        PERSONAL_ACCOUNT: 'you are billed directly by google',
        CREATE_ACCOUNT: 'make a billing account and have compute costs come directly from google',
        ASSIGN_ACCOUNT: 'assign this billing account to your project',
        RESOLVE_ACCOUNT: 'resolve issues with this account',
        MEMBER_BILLING_ACTIVE: 'have us bill you for compute costs',
        MEMBER_BILLING_INACTIVE: 'unavailable to non members'
    },
    STATUS: {
        FETCHING_USAGE: { text: 'fetching usage data...', effect: 'wave' },
        SWITCHING_MANAGED: 'switching to managed billing...',
        SWITCH_SUCCESS: 'successfully switched to managed billing.',
        LINKING_PERSONAL: 'linking personal account...',
        LINK_SUCCESS: 'successfully linked personal account.',
        UNLINKING: 'unlinking billing account...',
        UNLINK_SUCCESS: 'successfully unlinked billing account.',
        LOADING: 'loading...',
        CANCELING: 'canceling...',
        RESUMING: 'resuming...',
        CHECKING_SUBSCRIPTION: 'checking subscription...',
        CLEAR: ''
    },
    ERRORS: {
        PAYMENT_INIT_FAILED: 'could not initialize payment system. please try again later.',
        START_FAILED: (msg) => `failed to start subscription process: ${msg}`,
        CANCEL_FAILED: 'failed to cancel',
        STATUS_FETCH_FAILED: 'could not retrieve subscription status.',
        USAGE_UNAVAILABLE: 'usage data not available.',
        CREATE_SESSION_FAILED: 'could not create a checkout session.',
        PROJECT_NOT_INITIALIZED: 'project not initialized.',
        PROJECT_NOT_INITIALIZED_ID: 'project_not_initialized',
        SUBSCRIPTION_REQUIRED_ID: 'subscription_required',
        LOAD_USAGE_FAILED: (msg) => `could not load usage: ${msg}`,
        GENERIC_FETCH_FAILED: (status) => `failed to fetch: ${status}`,
        SWITCH_MANAGED_FAILED: 'failed to switch to managed billing.',
        LINK_PERSONAL_FAILED: 'failed to link personal account.',
        UNLINK_FAILED: 'failed to unlink billing account.',
        STATUS_FETCH_FAILED_MSG: (msg) => `failed to fetch subscription status: ${msg}`,
        STRIPE_NOT_LOADED: 'stripe.js not loaded.',
        MISSING_PUBLISHABLE_KEY: 'missing stripe publishable key',
        PAYMENT_CONFIG_FAILED: 'unable to load payment configuration',
        START_CHECKOUT_FAILED: (msg) => `unable to start checkout: ${msg}`,
        START_CHECKOUT_FAILED_GENERIC: 'unable to start checkout',
        STRIPE_CONFIG_FAILED: 'failed to fetch stripe configuration from server.',
        STRIPE_KEY_MISSING: 'stripe publishable key not found in server config.'
    },
    PROMPTS: {
        UNLINK_CONFIRM: {
            id: 'unlink-billing-confirm',
            text: "are you sure you want to unlink the billing account from this project? this will disable all paid services and your sites may stop working.",
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes, unlink', value: true }, { label: 'no, keep it', value: false }] }]
        },
        CANCEL_MEMBERSHIP: {
            id: 'cancel-membership-confirm',
            text: "are you sure you want to cancel your membership? scheduled backups will not be created, and your deployed machines will remain active. you may however, enable your membership again anytime in the future.",
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes, cancel', value: true }, { label: 'no, keep it', value: false }] }]
        },
        CHECKOUT_SUBSCRIPTION: (clientSecret) => ({
            id: 'embedded_checkout_prompt',
            text: 'complete your membership<br><br><ul style="text-align: left; list-style-type: disc; margin: 0 auto; display: inline-block;"><li>we do not profit from compute costs</li><li>we collect dues on the first of each month</li></ul>',
            type: 'embedded_checkout',
            required: true,
            client_secret: clientSecret
        }),
        CHECKOUT_ORDER: (clientSecret) => ({
            id: 'order_checkout_prompt',
            text: 'complete your purchase',
            type: 'embedded_checkout',
            client_secret: clientSecret
        }),
        ORDER_SUCCESS: {
            id: 'order-success-prompt',
            text: 'your order was successful!',
            type: 'form',
            buttons: [{ label: 'ok', value: 'ok' }]
        },
        ALREADY_SUBSCRIBED: {
            id: 'already-subscribed-prompt',
            text: 'you are already subscribed.',
            type: 'form',
            buttons: [{ label: 'ok', value: true }]
        },
        PRODUCT_PURCHASE: (productName, price, imageUrl, options) => ({
            id: 'product-purchase-prompt',
            text: `${productName} ($${price})`,
            imageUrl: imageUrl,
            type: 'form',
            items: [
                {
                    id: 'option',
                    type: 'select',
                    label: options.label || 'size',
                    options: options.values.map(v => ({ label: v.toLowerCase(), value: v }))
                }
            ],
            buttons: [{ label: 'checkout', isSubmit: true, value: 'checkout' }]
        }),
        CHECKOUT_ERROR: (error) => ({
            id: 'checkout-error-prompt',
            text: error.toLowerCase(),
            type: 'form',
            buttons: [{ label: 'ok', value: true }]
        }),
        SELECT_ACCOUNT: (accounts, actions) => ({
            id: 'billing-account-select',
            text: "choose a billing account for this project:",
            type: 'form',
            items: accounts.map(acc => ({
                text: acc.label,
                value: acc.value,
                type: 'record',
                className: acc.className || ''
            })),
            buttons: [{ type: 'row', items: actions.map(act => ({
                label: act.label,
                value: act.value,
                style: act.style || 'outline'
            })) }]
        }),
        PURCHASE_CONFIRM: (name) => ({
            text: `are you sure you want to purchase ${name}?`,
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes', value: true }, { label: 'no', value: false }] }]
        }),
        ACCOUNT_ERROR: (name) => ({
            id: 'billing-account-error-prompt',
            text: `the linked billing account '${name}' is not active or accessible. please ensure your billing information is valid in the google cloud console.`,
            type: 'form',
            buttons: [
                { label: 'go to console', value: 'console' },
                { label: 'change account', value: 'change' },
                { label: 'ok', value: 'ok' }
            ]
        }),
        SWITCHING: (msg) => ({
            text: msg,
            type: 'form',
            replace: true,
            buttons: [], // No buttons for loading state
            hideBackButton: true
        }),
        SUCCESS: (msg) => ({
            text: msg,
            type: 'form',
            replace: true,
            buttons: [{ label: 'ok', value: true }]
        })
    }
};

export const BACKUP = {
    MENU: {},
    LABELS: {
        SELECT_DEPLOYMENT_BACKUP: 'select a deployment to back up:',
        SELECT_BACKUP_RESTORE: 'select a backup to restore:',
        NEW_MACHINE: 'new machine',
        NEW_MACHINE_DESC: 'a new machine',
        SELECT_DEPLOYMENT_SCHEDULE: 'select a deployment to schedule:',
        BACKUPS: 'backups',
        BACKUPS_MENU: 'backups:',
        CREATE: 'create',
        RESTORE: 'restore',
        SCHEDULE: 'schedule',
        DEPLOYMENT_ON_VM: (name, vm) => `${name} on ${vm}`,
        DEPLOYMENT_ON_VM_SCHEDULE: (name, vm, schedule) => `${name} on ${vm} - ${schedule}`,
        RESTORE_TO: (filename) => `restore ${filename.substring(0, 20)}... to:`
    },
    TOOLTIPS: {
        BACKUPS: 'schedule, create, and restore backups from your google drive',
        CREATE: 'manually trigger a new backup',
        RESTORE: 'restore from a previous backup',
        SCHEDULE: 'configure automatic backup frequency'
    },
    STATUS: {
        FETCHING_DEPLOYMENTS: { text: 'fetching deployments...', effect: 'wave' },
        FETCHING_BACKUPS: { text: 'fetching backups...', effect: 'wave' },
        FETCHING_MACHINES: { text: 'fetching machines...', effect: 'wave' },
        INITIATING_BACKUP: (name) => `creating backup for ${name}...`,
        BACKUP_SUCCESS: 'backup started successfully',
        INITIATING_RESTORE: 'initiating restore...',
        RESTORE_CANCELLED: 'restore cancelled.',
        UPDATING_SCHEDULE: 'updating schedule...',
        SCHEDULE_SUCCESS: 'backup schedule updated',
        CONNECTED_WAITING: 'connected. waiting for server...',
        CONNECTION_ERROR: 'connection error.',
        CONNECTION_READY: 'connection ready.',
        RESTORE_INITIATED: 'restore initiated. connecting to live log...',
        RESTORE_COMPLETE_TERMINAL: 'restore complete. press back to return to the menu.',
        RESTORE_FINISHED: 'restore finished.',
        CLEAR: '',
        RESTORING: 'restoring'
    },
    ERRORS: {
        DEPLOYMENT_NOT_FOUND: 'could not find deployment details. please try again.',
        DEPLOYMENT_ID_NOT_FOUND: (id) => `could not find deployment with id: ${id}`,
        MACHINE_NOT_FOUND: 'could not find machine details.',
        NO_BACKUP_SELECTED: 'error: no backup file was selected.',
        WS_PROCESS: 'error processing server message.',
        NO_BACKUPS_FOUND: 'no backups found in google drive.',
        NO_DEPLOYMENTS_FOUND: 'no deployments found.',
        NO_MACHINES_FOR_RESTORE: 'no machines found to restore to.',
        FETCH_BACKUPS_FAILED: 'failed to fetch backups.',
        CREATE_FAILED: 'failed to create backup',
        RESTORE_FAILED: 'failed to initiate restore',
        SCHEDULE_FAILED: 'failed to set backup schedule'
    },
    PROMPTS: {
        SCHEDULE: (deploymentName) => ({
            id: 'backup-schedule-prompt',
            text: `how often would you like to backup ${deploymentName}?`,
            type: 'form',
            items: [
                {
                    id: 'interval',
                    type: 'select',
                    options: [
                        { label: 'manual', value: 'manual' },
                        { label: 'daily', value: 'daily' },
                        { label: 'weekly', value: 'weekly' },
                        { label: 'monthly', value: 'monthly' },
                    ]
                }
            ],
            buttons: [{ label: 'save', isSubmit: true }],
            cancelable: true
        }),
        RESTORE_CONFIRM: (backupFilename, machineName) => ({
            id: 'confirm-restore-prompt',
            text: `restore backup ${backupFilename} to ${machineName}?`,
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes', value: 'yes' }, { label: 'no', value: 'no' }] }]
        })
    }
};

export const EDITOR = {
    MENU: {},
    LABELS: {
        SIGN_OUT: 'sign out',
        LIVE: 'live',
        PULL: 'pull',
        PUBLISH: 'publish',
        CULT_KEY: 'cult key:',
        BASH: 'bash',
        ACCOUNT: 'account:',
        REPO: 'repo:',
        CREATE: 'create',
        ATTACH: 'attach',
        PUSH: 'push',
        DISCONNECT: 'disconnect',
        GITHUB: 'github',
        GITHUB_REPO: (name) => `github (${name})`,
        MAKE_KEY: 'make key',
        REFRESH_KEY: 'refresh key'
    },
    TOOLTIPS: {
        SIGN_OUT: 'disconnect your github account',
        PULL: 'pull and overwrite the current editor state with what is on github',
        PUBLISH: 'deploys your current editor state to firebase hosting',
        GITHUB_CONNECT: 'connect your github account',
        CREATE_REPO: 'create a new github repository',
        ATTACH_REPO: 'link an existing github repository',
        PUSH_REPO: 'commit and push the current state of the editor to github',
        DISCONNECT_REPO: 'unlink this repository'
    },
    STATUS: {
        SIGNING_OUT: 'signing out...',
        PULLING: 'pulling live files...',
        PUBLISHING: 'publishing changes...',
        CREATING_REPO: 'creating repository...',
        LINKING_REPO: 'linking repository...',
        PUSHING_GITHUB: 'pushing changes to github...',
        PUSH_SUCCESS: 'changes pushed to github successfully.',
        PULLING_GITHUB: 'pulling changes from github...',
        UNLINKING: 'unlinking repository...',
        UNLINK_SUCCESS: 'repo unlinked.',
        LOADING: 'loading',
        KEY_SUCCESS: 'cult key managed successfully',
        SIGNOUT_SUCCESS: 'github signed out successfully',
        LINK_SUCCESS: 'repo linked successfully',
        PULL_SUCCESS: 'pull complete. editor updated.',
        PUBLISH_SUCCESS: 'publish successful. your changes are now live.',
        CULT_KEY_HINT: 'click "make key" to generate a command',
        PULL_GITHUB_SUCCESS: 'pull complete. editor updated from github.',
        PUSH_GITHUB_SUCCESS: 'changes pushed successfully.',
        CREATION_SUCCESS: (repoUrl) => `repository created and linked: ${repoUrl}`,
        MANAGING_KEY: 'managing cult key...'
    },
    ERRORS: {
        LOAD_REPOS_FAILED: 'failed to load repositories.',
        CLONE_FAILED: 'failed to clone repository.',
        SIGNOUT_FAILED: 'failed to sign out of github',
        FETCH_LIVE_FAILED: 'failed to fetch live files',
        PUBLISH_FAILED: 'failed to publish',
        KEY_FAILED: (msg) => `failed to manage key: ${msg}`,
        CREATE_REPO_FAILED: 'failed to create repository',
        UPDATE_LABELS_FAILED: 'failed to update labels',
        PULL_FAILED: 'failed to pull',
        PUSH_FAILED: 'failed to push',
        INVALID_GITHUB_URL: 'please enter a valid github repo url.'
    },
    PROMPTS: {
        KEY_CONFIRM: (isRefresh) => ({
            id: 'cult-key-confirm',
            text: `are you sure you want to ${isRefresh ? 'refresh' : 'generate'} your api key? this will invalidate any existing scripts using the old key.`,
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes', value: true }, { label: 'no', value: false }] }]
        }),
        PULL_LIVE: {
            id: 'live-pull-confirm',
            text: "are you sure you want to pull? this will overwrite all your unsaved changes in the editor.",
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes, pull', value: true }, { label: 'cancel', value: false }] }]
        },
        PUBLISH: {
            id: 'editor-publish-confirm',
            text: "publish these changes to the live site?",
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes, publish', value: true }, { label: 'cancel', value: false }] }]
        },
        GITHUB_SIGNOUT: {
            id: 'github-signout-confirm',
            text: "sign out of github? this will delete your access token from our server.",
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes, sign out', exit: true, value: true }, { label: 'cancel', value: false }] }]
        },
        GITHUB_CREATE: (defaultName) => ({
            id: 'github_create_prompt',
            type: 'form',
            text: "enter a name for your new github repository:",
            items: [{ id: 'repo_name', type: 'text', placeholder: 'my-awesome-site', value: defaultName || '' }],
            buttons: [{ type: 'row', items: [{ label: 'create', value: true, isSubmit: true }, { label: 'cancel', value: false }] }]
        }),
        GITHUB_ATTACH: (currentUrl) => ({
            id: 'github_attach_prompt',
            type: 'form',
            text: "enter the full url of the github repo (e.g., https://github.com/user/repo):",
            items: [{ id: 'repo_url', type: 'text', placeholder: 'https://github.com/...', value: currentUrl || '' }],
            buttons: [{ type: 'row', items: [{ label: 'link', value: true, isSubmit: true }, { label: 'cancel', value: false }] }]
        }),
        GITHUB_PULL: {
            id: 'github-pull-confirm',
            text: "are you sure you want to pull? this will overwrite your current editor state with what is on github.",
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes, pull', value: true }, { label: 'cancel', value: false }] }]
        },
        GITHUB_PUSH: {
            id: 'github_commit_prompt',
            text: "enter a commit message:",
            items: [{ id: 'message', type: 'text', placeholder: 'updated site content', value: 'updated site content' }],
            buttons: [{ type: 'row', items: [{ label: 'push', value: true, isSubmit: true }, { label: 'cancel', value: false }] }]
        },
        GITHUB_DISCONNECT: (repoUrl) => ({
            id: 'github-disconnect-confirm',
            text: `unlink ${repoUrl} from this site?`,
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes, unlink', value: true }, { label: 'cancel', value: false }] }]
        }),
        REPO_UNLINK: {
            id: 'editor-disconnect-confirm',
            text: "are you sure you want to unlink this repository from your project?",
            type: 'form',
            buttons: [{ type: 'row', items: [{ label: 'yes, unlink', value: true }, { label: 'no, keep it', value: false }] }]
        }
    }
};

export const PROMOTIONAL = {
    TAGLINE_PHRASES: [
        "cheapest way to host a website",
        "own your infrastructure",
        "open source shopify",
        "cancel and keep your website",
        "automatic backups to google drive",
        "big cloud for busy people",
        "the only open source hosting platform",
        "enterprise grade website hosting",
        "host websites like a main character"
    ],
    TOOLTIPS: {
        VENTURE_FORTH: 'venture forth',
        BRAINROT: 'click for brainrot',
        EXPLANATION: 'hover for explanation',
        EXPLANATION_TOUCH: 'press and hold for explanation'
    },
    SPECIAL: {
        CLAIM_MEMBERSHIP: 'claim free membership',
        EXPIRES_IN: (hours, minutes, seconds) => `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    },
    LABELS: {
        TAGLINE: 'we host websites',
        SIZE: 'size',
        SIZES: ['s', 'm', 'l', 'xl'],
        PRODUCT_TEE: 'froggo tee'
    },
    ACTIONS: {
        PURCHASE_PRODUCT: 'purchase a product'
    },
    ALT: {
        PLAY_PAUSE: 'play/pause',
        SPIKEBALL: 'spikeball',
        MOCKUP: 'mockup'
    },
    WHAT_IS_THIS: {
        ADJECTIVES: [
            'best', 'most transparent', 'sickest', 'cat friendliest', 
            'most open source', 'least stupid', 'least extortion', 
            'coolest', 'cheapest', 'most scalable'
        ],
        HTML: `
            <div style="text-align: left; max-width: 500px; margin: auto; max-height: 50vh; overflow-y: auto; padding-right: 15px;">
                <p><b>the <span id="adjective-scramble"></span> hosting service on the planet.</b></p>
                <p>we enable our customers to own their infrastructure and their websites.</p>
                <p>this means:</p>
                <h3>ultimate freedom</h3>
                <ul>
                    <li>cancel and your site stays working</li>
                    <li>easily download your site and move to another platform</li>
                    <li>access & manage via google cloud platform!</li>
                </ul>
                <h3>technically superior</h3>
                <ul>
                    <li>transparent infrastructure<br><small>(see everything!)</small></li>
                    <li>built using enterprise grade tools and configurations</li>
                    <li>maximally affordable<br><small>(pay per compute cycle)</small></li>
                </ul>
                <h3>easy to use</h3>
                <ul>
                    <li>automatic backups to google drive</li>
                    <li>no need to use a terminal<br><small>(but you can if you want!)</small></li>
                    <li>24 hour customer support<br><small>(call or text!)</small></li>
                </ul>
            </div>
        `
    },
    ABOUT: {
        CONSOLE: 'this is the web console for creating and hosting your own websites using google cloud.',
        HELP: 'we also help you do things like set up and manage domain names, backup your website, and more.',
        MISSION: 'our mission is to eliminate dependency on proprietary website creation and hosting services.',
        GOOGLE: "you can pause or cancel anytime and keep your website, and manage it through the google's cloud console.",
        COST: 'it costs $8 a month, and you can buy individual months, or you can subscribe.',
        SOURCE: 'the code for this website is available',
        CONTACT: 'contact hey@servercult.com with any questions or concerns.',
        VERSION: 'version: 1.0.0'
    }
};
