let allowedPlayerIds = [];
let kickedPlayers = [];
let pendingVerifications = {};
let discordLinkedProfiles = {};
let manualAllowedIds = [];
let clientIdThreshold = 7665;
let monitoredPorts = [28960, 28964];
const accessControlListKey = 'Webfront::Nav::Admin::AccessControlList';
const verificationMonitorKey = 'Webfront::Nav::Admin::VerificationMonitor';
const profileAccessControlKey = 'Webfront::Profile::AccessControl';

// Discord bot integration
const IO = importNamespace('System.IO');
const verificationFilePath = '/home/deep/cod4/xoxo-bot/in_game_verifications.json';
const linkedProfilesFilePath = '/home/deep/cod4/xoxo-bot/linked_profiles.json';
const manualAllowedFilePath = '/home/deep/cod4/xoxo-bot/manual_allowed.json';

const init = (registerNotify, serviceResolver, configWrapper, pluginHelper) => {
    registerNotify('IManagementEventSubscriptions.ClientStateInitialized', (initializedEvent, token) => plugin.onClientInitialized(initializedEvent, token));
    plugin.onLoad(serviceResolver, configWrapper, pluginHelper);
    return plugin;
};

const plugin = {
    author: 'xoxod33p',
    version: '1.0',
    name: 'Access Control',
    manager: null,
    configWrapper: null,
    logger: null,
    serviceResolver: null,
    pluginHelper: null,
    enabled: true,

    commands: [{
        name: 'setclientidthreshold',
        description: 'Set the Client ID threshold for access control',
        alias: 'setid',
        permission: 'SeniorAdmin',
        targetRequired: false,
        arguments: [{
            name: 'threshold',
            required: true
        }],
        execute: (gameEvent) => {
            const newThreshold = parseInt(gameEvent.data);
            if (isNaN(newThreshold) || newThreshold < 0) {
                gameEvent.origin.tell('Invalid client ID threshold. Please provide a positive number.');
                return;
            }
            clientIdThreshold = newThreshold;
            plugin.configWrapper.setValue('clientIdThreshold', newThreshold);
            gameEvent.origin.tell(`^2Client ID threshold updated to ^5${newThreshold}^2. Players above this ID will require verification to access monitored servers.`);
        }
    },
    {
        name: 'setmonitoredports',
        description: 'Set which server ports require access control (comma-separated)',
        alias: 'setports',
        permission: 'SeniorAdmin',
        targetRequired: false,
        arguments: [{
            name: 'ports',
            required: true
        }],
        execute: (gameEvent) => {
            const portsInput = gameEvent.data.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
            if (portsInput.length === 0) {
                gameEvent.origin.tell('Invalid ports. Please provide comma-separated port numbers (e.g., 28960,28964).');
                return;
            }
            monitoredPorts = portsInput;
            plugin.configWrapper.setValue('monitoredPorts', portsInput);
            gameEvent.origin.tell(`^2Monitored ports updated to: ^5${portsInput.join(', ')}`);
        }
    },
    {
        name: 'allowplayer',
        description: 'Grant server access to a player',
        alias: 'ap',
        permission: 'SeniorAdmin',
        targetRequired: true,
        arguments: [{
            name: 'player',
            required: true
        }],
        execute: (gameEvent) => {
            const cid = parseInt(gameEvent.Target.ClientId);
            if (!manualAllowedIds.includes(cid)) {
                manualAllowedIds.push(cid);
                plugin.configWrapper.setValue('manualAllowedIds', manualAllowedIds);
            }
            plugin.rebuildAllowedFromSources();
            plugin.syncManualAllowedToFile(); // Sync manual list to Discord bot
            plugin.syncLinkedProfiles(); // Sync with Discord bot after manual change

            gameEvent.origin.tell(`^2Successfully granted server access to ^5${gameEvent.target.name}`);
        }
    },
    {
        name: 'disallowplayer',
        description: 'Revoke server access from a player',
        alias: 'dp',
        permission: 'SeniorAdmin',
        targetRequired: true,
        arguments: [{
            name: 'player',
            required: true
        }],
        execute: (gameEvent) => {
            const cid = parseInt(gameEvent.Target.ClientId);
            manualAllowedIds = manualAllowedIds.filter(id => parseInt(id) !== cid);
            plugin.configWrapper.setValue('manualAllowedIds', manualAllowedIds);
            plugin.rebuildAllowedFromSources();
            plugin.syncManualAllowedToFile(); // Sync manual list to Discord bot
            plugin.syncLinkedProfiles(); // Sync with Discord bot after manual change

            gameEvent.origin.tell(`^1Server access revoked for ^5${gameEvent.target.name}`);
            
            // Check if the player is currently connected
            if (gameEvent.target.isConnected) {
                plugin.checkPlayerAccess(gameEvent.target, null);
            }
        }
    },
    {
        name: 'listpendingverifications',
        description: 'List all pending Discord verification codes',
        alias: 'lpv',
        permission: 'Moderator',
        targetRequired: false,
        execute: (gameEvent) => {
            const codes = Object.keys(pendingVerifications);
            if (codes.length === 0) {
                gameEvent.origin.tell('^3No pending verification codes.');
                return;
            }
            
            const now = Date.now();
            gameEvent.origin.tell(`^5Pending Verification Codes (${codes.length}):`);
            codes.forEach(code => {
                const verification = pendingVerifications[code];
                const ageMs = now - verification.timestamp;
                const ageSeconds = Math.floor(ageMs / 1000);
                const timeLeft = 120 - ageSeconds;
                gameEvent.origin.tell(`^7${code}: ^3${verification.playerName} ^7(ID: ${verification.clientId}) - ^2${timeLeft}s left`);
            });
        }
    },
    {
        name: 'cleanverifications',
        description: 'Manually remove expired verification codes',
        alias: 'cv',
        permission: 'SeniorAdmin',
        targetRequired: false,
        execute: (gameEvent) => {
            const beforeCount = Object.keys(pendingVerifications).length;
            plugin.syncVerificationsToFile();
            const afterCount = Object.keys(pendingVerifications).length;
            const cleaned = beforeCount - afterCount;
            gameEvent.origin.tell(`Cleaned ${cleaned} expired verification(s). ${afterCount} remaining.`);
        }
    }],

    interactions: [{
        // registers the profile action
        name: profileAccessControlKey,
        action: function (targetId, game, token) {
            const helpers = importNamespace('SharedLibraryCore.Helpers');
            const interactionData = new helpers.InteractionData();

            interactionData.actionPath = 'DynamicAction';
            interactionData.interactionId = profileAccessControlKey;
            interactionData.entityId = targetId;
            interactionData.minimumPermission = 3;
            interactionData.source = plugin.name;
            interactionData.actionMeta.add('InteractionId', 'command'); // indicate we're wanting to execute a command
            interactionData.actionMeta.add('ShouldRefresh', true.toString()); // indicates that the page should refresh after performing the action

            if (allowedPlayerIds.includes(parseInt(targetId))) {
                interactionData.name = 'Revoke Access';
                interactionData.displayMeta = 'ph-x-circle';

                interactionData.actionMeta.add('Data', `disallowplayer @${targetId}`);
                interactionData.actionMeta.add('ActionButtonLabel', 'Revoke Access');
                interactionData.actionMeta.add('Name', 'Revoke Server Access');
            } else {
                interactionData.name = 'Grant Access';
                interactionData.displayMeta = 'ph-check-circle';

                interactionData.actionMeta.add('Data', `allowplayer @${targetId}`);
                interactionData.actionMeta.add('ActionButtonLabel', 'Grant Access');
                interactionData.actionMeta.add('Name', 'Grant Server Access');
            }

            return interactionData;
        }
    },
    {
        name: accessControlListKey,
        action: function (targetId, game, token) {
            const helpers = importNamespace('SharedLibraryCore.Helpers');
            const interactionData = new helpers.InteractionData();

            interactionData.name = 'Access Control';
            interactionData.description = 'Manage players authorized to access monitored servers';
            interactionData.displayMeta = 'ph-identification-badge';
            interactionData.interactionId = accessControlListKey;
            interactionData.minimumPermission = 3;
            interactionData.interactionType = 2;
            interactionData.source = plugin.name;

            interactionData.scriptAction = (sourceId, targetId, game, meta, token) => {
                try {
                    const clientsData = plugin.getClientsData(allowedPlayerIds);

                    let table = '<table class="w-full text-left border-collapse">';

                    if (clientsData.length === 0) {
                        table += `<tr><td colspan="2" class="px-6 py-8 text-center text-muted">No players have been granted access yet.</td></tr>`;
                    } else {
                        clientsData.forEach(client => {
                            const disallowInteraction = {
                                InteractionId: 'command',
                                Data: `disallowplayer @${client.clientId}`,
                                ActionButtonLabel: 'Revoke Access',
                                Name: 'Revoke Server Access'
                            };
                            
                            const playerName = plugin.escapeHtml(client.currentAlias?.name?.stripColors() || 'Unknown');
                            
                            table += `<tr class="border-t border-line hover:bg-surface-hover/30 transition-colors">
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <a href="/Client/Profile/${client.clientId}" class="text-sm font-medium hover:text-primary transition-colors">${playerName}</a>
                                        </td>
                                        <td class="px-6 py-4 text-right">
                                            <button type="button" class="profile-action cursor-pointer" data-action="DynamicAction" data-action-id="${client.clientId}"
                                               data-action-meta="${encodeURI(JSON.stringify(disallowInteraction))}">
                                                <div class="inline-flex items-center px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 transition-colors text-sm font-medium">
                                                    <i class="ph ph-x-circle mr-2 text-sm"></i>
                                                    <span class="truncate">Revoke Access</span>
                                                </div>
                                            </button>
                                        </td>
                                    </tr>`;
                        });
                    }

                    table += '</table>';

                    return table;
                } catch (error) {
                    plugin.logger.logError('Error generating access control list: {Error}', error.message);
                    return `<div class="p-4 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400">An error occurred while loading data.</div>`;
                }
            };

            return interactionData;
        }
    },
    {
        name: verificationMonitorKey,
        action: function (targetId, game, token) {
            const helpers = importNamespace('SharedLibraryCore.Helpers');
            const interactionData = new helpers.InteractionData();

            interactionData.name = 'Access Monitor';
            interactionData.description = `View access control activity and kick logs for Client ID ${clientIdThreshold}+ on ports: ${monitoredPorts.join(', ')}`;
            interactionData.displayMeta = 'ph-shield-check';
            interactionData.interactionId = verificationMonitorKey;
            interactionData.minimumPermission = 3;
            interactionData.interactionType = 2;
            interactionData.source = plugin.name;

            interactionData.scriptAction = (sourceId, targetId, game, meta, token) => {
                try {
                    // Settings Section
                    let settingsInfo = `<div class="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/30">
                                            <h3 class="text-sm font-semibold mb-3 flex items-center gap-2"><i class="ph ph-gear"></i> Access Control Settings</h3>
                                            <div class="space-y-2">
                                                <p class="text-xs text-muted"><strong>Client ID Threshold:</strong> <span class="inline-block px-2 py-0.5 rounded bg-surface text-primary font-mono">${clientIdThreshold}</span> - Players above this ID require verification</p>
                                                <p class="text-xs text-muted"><strong>Monitored Ports:</strong> <span class="inline-block px-2 py-0.5 rounded bg-surface text-primary font-mono">${monitoredPorts.join(', ')}</span> - Ports where access control is active</p>
                                                <p class="text-xs text-muted mt-3"><code class="px-2 py-1 rounded bg-surface">!setclientidthreshold &lt;number&gt;</code> or <code class="px-2 py-1 rounded bg-surface">!setmonitoredports &lt;ports&gt;</code> to change</p>
                                            </div>
                                        </div>`;

                    // Recently Kicked Players Section
                    let kickedTable = `<div class="mb-3 flex items-center gap-2">
                                            <i class="ph ph-user-minus text-red-400"></i>
                                            <h4 class="text-lg font-semibold">Recent Access Denials</h4>
                                            <span class="text-xs px-2 py-0.5 rounded bg-surface text-muted">Last 50</span>
                                        </div>`;
                    kickedTable += '<table class="w-full text-left border-collapse">';

                    if (kickedPlayers.length === 0) {
                        kickedTable += `<tr><td colspan="5" class="px-6 py-8 text-center text-muted">No access denials recorded yet.</td></tr>`;
                    } else {
                        kickedPlayers.forEach(player => {
                            const timeAgo = plugin.getTimeAgo(player.timestamp);
                            const playerName = plugin.escapeHtml(player.name ? player.name.stripColors() : 'Unknown');
                            const serverName = plugin.escapeHtml(player.server ? player.server.stripColors() : 'Unknown');
                            kickedTable += `<tr class="border-t border-line hover:bg-surface-hover/30 transition-colors">
                                        <td class="px-6 py-4"><span class="inline-block px-2 py-1 rounded text-xs font-medium bg-red-600/20 text-red-400 border border-red-500/30">${player.clientId}</span></td>
                                        <td class="px-6 py-4"><a href="/Client/Profile/${player.clientId}" class="text-sm font-medium hover:text-primary transition-colors">${playerName}</a></td>
                                        <td class="px-6 py-4"><code class="text-xs px-2 py-1 rounded bg-surface">${plugin.escapeHtml(player.ipAddress)}</code></td>
                                        <td class="px-6 py-4 text-sm text-muted">${serverName}</td>
                                        <td class="px-6 py-4 text-sm text-muted">${timeAgo}</td>
                                    </tr>`;
                        });
                    }
                    kickedTable += '</table>';

                    return settingsInfo + kickedTable;
                } catch (error) {
                    plugin.logger.logError('Error generating verification monitor: {Error}', error.message);
                    return `<div class="p-4 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400">An error occurred while loading data.</div>`;
                }
            };

            return interactionData;
        }
    }],

    onClientInitialized: async function (initializedEvent, token) {
        if (initializedEvent.client.isBot || !this.enabled) {
            return;
        }
        // Sync linked profiles from Discord bot file into IW4MAdmin DB
        this.syncLinkedProfiles();
        await this.checkPlayerAccess(initializedEvent.client, token);
    },

    onLoad: function (serviceResolver, configWrapper, pluginHelper) {
        this.serviceResolver = serviceResolver;
        this.configWrapper = configWrapper;
        this.pluginHelper = pluginHelper;
        this.manager = this.serviceResolver.resolveService('IManager');
        // Use ScriptPluginV2 category for logger
        this.logger = this.serviceResolver.resolveService('ILogger', ['ScriptPluginV2']);

        this.configWrapper.setName(this.name);

        // Load manual allowed IDs
        const savedManualAllowed = this.configWrapper.getValue('manualAllowedIds');
        if (savedManualAllowed !== undefined && savedManualAllowed !== null) {
            manualAllowedIds = savedManualAllowed.map(x => parseInt(x));
        } else {
            // backward compat: use existing allowed list as manual base
            this.configWrapper.getValue('allowedPlayerIds').forEach(element => manualAllowedIds.push(parseInt(element)));
            this.configWrapper.setValue('manualAllowedIds', manualAllowedIds);
        }
        
        // Load pending verifications from database
        const savedVerifications = this.configWrapper.getValue('pendingVerifications');
        if (savedVerifications !== undefined && savedVerifications !== null) {
            pendingVerifications = savedVerifications;
            // Sync to Discord bot file on startup
            this.syncVerificationsToFile();
        }

        // Load discord-linked profiles from database
        const savedLinkedProfiles = this.configWrapper.getValue('discordLinkedProfiles');
        if (savedLinkedProfiles !== undefined && savedLinkedProfiles !== null) {
            discordLinkedProfiles = savedLinkedProfiles;
        }

        // Build allowed list = manual + linked
        this.rebuildAllowedFromSources();
        
        // Load kicked players from database
        const savedKickedPlayers = this.configWrapper.getValue('kickedPlayers');
        if (savedKickedPlayers !== undefined && savedKickedPlayers !== null && savedKickedPlayers.length > 0) {
            // Filter out any invalid entries
            kickedPlayers = savedKickedPlayers.filter(player => 
                player && 
                player.clientId !== undefined && 
                player.name !== undefined && 
                player.ipAddress !== undefined && 
                player.timestamp !== undefined && 
                player.server !== undefined
            );
        }
        
        // Load client ID threshold
        const savedThreshold = this.configWrapper.getValue('clientIdThreshold');
        if (savedThreshold !== undefined && savedThreshold !== null) {
            clientIdThreshold = parseInt(savedThreshold);
        } else {
            this.configWrapper.setValue('clientIdThreshold', clientIdThreshold);
        }
        
        // Load monitored ports
        const savedPorts = this.configWrapper.getValue('monitoredPorts');
        if (savedPorts !== undefined && savedPorts !== null && savedPorts.length > 0) {
            monitoredPorts = savedPorts.map(p => parseInt(p));
        } else {
            this.configWrapper.setValue('monitoredPorts', monitoredPorts);
        }
        
        this.enabled = this.configWrapper.getValue('enabled', newValue => {
            if (newValue !== undefined) {
                plugin.enabled = newValue;
            }
        });
        
        if (this.enabled === undefined) {
            this.configWrapper.setValue('enabled', true);
            this.enabled = true;
        }

        this.interactionRegistration = this.serviceResolver.resolveService('IInteractionRegistration');
        this.interactionRegistration.unregisterInteraction(profileAccessControlKey);
        this.interactionRegistration.unregisterInteraction(accessControlListKey);
        this.interactionRegistration.unregisterInteraction(verificationMonitorKey);

        // Sync manual allowed list to Discord bot on startup
        this.syncManualAllowedToFile();

        // Log startup state
        this.logger.logInformation('{Name} {Version} by {Author} loaded. Enabled={Enabled}, Threshold={Threshold}, MonitoredPorts={Ports}, AllowedPlayers={Count}',
            this.name, this.version, this.author, this.enabled, clientIdThreshold, monitoredPorts.join(','), allowedPlayerIds.length);
    },

    checkPlayerAccess: async function (client, _) {
        this.logger.logDebug('checkPlayerAccess called for ClientId={ClientId}, Port={Port}', client.clientId, client.currentServer.port);
        if (!this.enabled) {
            this.logger.logDebug('Plugin not enabled');
            return;
        }
        // Check server port - only filter on configured monitored ports
        const serverPort = client.currentServer.port;
        if (!monitoredPorts.includes(serverPort)) {
            this.logger.logDebug('Port {Port} not monitored', serverPort);
            return;
        }
        // Allow players with client ID at or below threshold automatically
        if (parseInt(client.clientId) <= clientIdThreshold) {
            this.logger.logDebug('ClientId {ClientId} <= threshold {Threshold}, not kicking', client.clientId, clientIdThreshold);
            return;
        }
        // For players above threshold, check if they're in the verified/linked lists
        let isExempt = false;
        allowedPlayerIds.forEach(function (id) {
            if (parseInt(id) === parseInt(client.clientId)) {
                isExempt = true;
                return false;
            }
        });

        if (isExempt) {
            this.logger.logDebug('ClientId {ClientId} is exempt (manual or discord link)', client.clientId);
            return;
        }
        // Players above client ID threshold who are not verified get kicked
        if (parseInt(client.clientId) > clientIdThreshold) {
            this.logger.logInformation('Kicking ClientId {ClientId} (above threshold {Threshold})', client.clientId, clientIdThreshold);
            // Generate verification code
            const verificationCode = this.generateVerificationCode();
            
            // Save to database and sync to Discord bot file
            this.saveVerification(client.clientId, client.cleanedName, verificationCode);
            
            // Track kicked player
            const kickedPlayerInfo = {
                clientId: client.clientId,
                name: client.cleanedName,
                ipAddress: client.IPAddressString,
                timestamp: new Date().toISOString(),
                server: client.currentServer.hostname
            };
            
            // Keep only last 50 kicked players
            kickedPlayers.unshift(kickedPlayerInfo);
            if (kickedPlayers.length > 50) {
                kickedPlayers = kickedPlayers.slice(0, 50);
            }
            
            // Save to database
            this.configWrapper.setValue('kickedPlayers', kickedPlayers);
            
            // Log verification details to console/logs (private)
            this.logger.logInformation('Player {Name} kicked - ClientID: {ClientId}, PIN: {PIN}', client.cleanedName, client.clientId, verificationCode);
            client.tell(`^3╔════════════════════════════════════════╗`);
            client.tell(`^3║ ^7SERVER ACCESS VERIFICATION REQUIRED ^3║`);
            client.tell(`^3╠════════════════════════════════════════╣`);
            client.tell(`^3║ ^7Your Client ID: ^5${client.clientId.toString().padEnd(22)} ^3║`);
            client.tell(`^3║ ^7Your PIN Code:  ^1${verificationCode.padEnd(22)} ^3║`);
            client.tell(`^3╠════════════════════════════════════════╣`);
            client.tell(`^3║ ^21. Join Discord: discord.ceylonwarfare.tech ^3║`);
            client.tell(`^3║ ^22. Use command: ^5/link ${client.clientId} ${verificationCode.padEnd(10)} ^3║`);
            client.tell(`^3║ ^23. Rejoin server after verification   ^3║`);
            client.tell(`^3╠════════════════════════════════════════╣`);
            client.tell(`^3║ ^1⚠ PIN expires in 120 seconds         ^3║`);
            client.tell(`^3╚════════════════════════════════════════╝`);
            
            client.kick(`^7Access verification required. ^2Check console (Shift + ~) ^7for your Client ID and PIN. ^1Discord: discord.ceylonwarfare.tech`,
                client.currentServer.asConsoleClient());
            return;
        }
    },

    getClientsData: function (clientIds) {
        const contextFactory = this.serviceResolver.resolveService('IDatabaseContextFactory');
        const context = contextFactory.createContext(false);
        const clientSet = context.clients;
        const clients = clientSet.getClientsBasicData(clientIds);
        context.dispose();

        return clients;
    },

    getTimeAgo: function (timestamp) {
        const now = new Date();
        const past = new Date(timestamp);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    },

    generateVerificationCode: function () {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        const random = new System.Random();
        for (let i = 0; i < 4; i++) {
            code += chars[random.Next(chars.length)];
        }
        return code;
    },

    saveVerification: function (clientId, playerName, verificationCode) {
        try {
            // Add to memory
            pendingVerifications[verificationCode] = {
                clientId: String(clientId),
                playerName: playerName,
                timestamp: Date.now()
            };
            
            // Save to database
            this.configWrapper.setValue('pendingVerifications', pendingVerifications);
            
            // Sync to Discord bot file
            this.syncVerificationsToFile();
            
            this.logger.logDebug('Verification code {Code} saved for player {Name} (ID: {ClientId})', verificationCode, playerName, clientId);
            return true;
        } catch (e) {
            this.logger.logError('Failed to save verification: {Error}', e.message);
            return false;
        }
    },

    syncVerificationsToFile: function () {
        try {
            // Clean expired verifications (older than 2 minutes)
            const now = Date.now();
            const twoMinutes = 120000;
            let cleaned = false;
            
            Object.keys(pendingVerifications).forEach(code => {
                if (now - pendingVerifications[code].timestamp > twoMinutes) {
                    delete pendingVerifications[code];
                    cleaned = true;
                }
            });
            
            // Update database if we cleaned any
            if (cleaned) {
                this.configWrapper.setValue('pendingVerifications', pendingVerifications);
            }
            
            // Write to Discord bot file
            IO.File.WriteAllText(verificationFilePath, JSON.stringify(pendingVerifications, null, 2));
            
            return true;
        } catch (e) {
            this.logger.logError('Failed to sync verifications to file: {Error}', e.message);
            return false;
        }
    },

    rebuildAllowedFromSources: function () {
        // allowed = manualAllowedIds + discord linked ids
        const linkedIds = Object.values(discordLinkedProfiles || {}).map(lp => parseInt(lp.clientId));
        const combined = new Set();
        manualAllowedIds.forEach(id => combined.add(parseInt(id)));
        linkedIds.forEach(id => combined.add(parseInt(id)));
        allowedPlayerIds = Array.from(combined).filter(id => !isNaN(id));
        this.configWrapper.setValue('allowedPlayerIds', allowedPlayerIds);
    },

    syncLinkedProfiles: function () {
        try {
            let links = {};
            if (IO.File.Exists(linkedProfilesFilePath)) {
                const jsonContent = IO.File.ReadAllText(linkedProfilesFilePath);
                if (jsonContent && jsonContent.length > 0) {
                    links = JSON.parse(jsonContent);
                }
            }
            this.configWrapper.setValue('discordLinkedProfiles', links);
            discordLinkedProfiles = links;
            this.rebuildAllowedFromSources();
            return true;
        } catch (e) {
            this.logger.logError('Failed to sync linked profiles: {Error}', e.message);
            return false;
        }
    },

    syncManualAllowedToFile: function () {
        try {
            IO.File.WriteAllText(manualAllowedFilePath, JSON.stringify(manualAllowedIds, null, 2));
            return true;
        } catch (e) {
            this.logger.logError('Failed to sync manual allowed to file: {Error}', e.message);
            return false;
        }
    },

    escapeHtml: function (text) {
        if (!text) return '';
        
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }
};

init;
