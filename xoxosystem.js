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
const verificationFilePath = 'c:\\Users\\xoxod33p\\Desktop\\iw4m\\xoxobot\\in_game_verifications.json';
const linkedProfilesFilePath = 'c:\\Users\\xoxod33p\\Desktop\\iw4m\\xoxobot\\linked_profiles.json';
const manualAllowedFilePath = 'c:\\Users\\xoxod33p\\Desktop\\iw4m\\xoxobot\\manual_allowed.json';

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
    translations: null,
    pluginHelper: null,
    enabled: true,

    commands: [{
        name: 'setclientidthreshold',
        description: 'Set the client ID threshold for verification requirement',
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
            gameEvent.origin.tell(`Client ID threshold set to ${newThreshold}. Players above this ID will require verification.`);
        }
    },
    {
        name: 'setmonitoredports',
        description: 'Set which server ports require verification (comma-separated)',
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
            gameEvent.origin.tell(`Monitored ports set to: ${portsInput.join(', ')}`);
        }
    },
    {
        name: 'allowplayer',
        description: 'Verify a player to allow connection',
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

            gameEvent.origin.tell(`Successfully verified ${gameEvent.target.name} to connect to the server`);
        }
    },
    {
        name: 'disallowplayer',
        description: 'Remove a player verification',
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

            gameEvent.origin.tell(`${gameEvent.target.name} verification removed`);
            
            // Check if the player is currently connected
            if (gameEvent.target.isConnected) {
                plugin.checkPlayerAccess(gameEvent.target, null);
            }
        }
    },
    {
        name: 'listpendingverifications',
        description: 'List all pending Discord verifications',
        alias: 'lpv',
        permission: 'Moderator',
        targetRequired: false,
        execute: (gameEvent) => {
            const codes = Object.keys(pendingVerifications);
            if (codes.length === 0) {
                gameEvent.origin.tell('No pending verifications.');
                return;
            }
            
            const now = Date.now();
            gameEvent.origin.tell(`^5Pending Verifications (${codes.length}):`);
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
        description: 'Manually clean expired verifications',
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
                interactionData.name = 'Remove Verification';
                interactionData.displayMeta = 'oi-circle-x';

                interactionData.actionMeta.add('Data', `disallowplayer`);
                interactionData.actionMeta.add('ActionButtonLabel', 'Remove Verification');
                interactionData.actionMeta.add('Name', 'Remove Player Verification');
            } else {
                interactionData.name = 'Verify Player';
                interactionData.displayMeta = 'oi-circle-check';

                interactionData.actionMeta.add('Data', `allowplayer`);
                interactionData.actionMeta.add('ActionButtonLabel', 'Verify Player');
                interactionData.actionMeta.add('Name', 'Verify Player for Access');
            }

            return interactionData;
        }
    },
    {
        name: accessControlListKey,
        action: function (targetId, game, token) {
            const helpers = importNamespace('SharedLibraryCore.Helpers');
            const interactionData = new helpers.InteractionData();

            interactionData.name = 'Verified Players';
            interactionData.description = 'Manage verified players';
            interactionData.displayMeta = 'oi-badge';
            interactionData.interactionId = accessControlListKey;
            interactionData.minimumPermission = 3;
            interactionData.interactionType = 2;
            interactionData.source = plugin.name;

            interactionData.scriptAction = (sourceId, targetId, game, meta, token) => {
                const clientsData = plugin.getClientsData(allowedPlayerIds);

                let table = '<table class="table bg-dark-dm bg-light-lm">';
                let header = `<tr>
                                <th>Player Name</th>
                                <th>Action</th>
                              </tr>`;

                const disallowInteraction = {
                    InteractionId: 'command',
                    Data: 'disallowplayer',
                    ActionButtonLabel: 'Remove Verification',
                    Name: 'Remove Player Verification'
                };

                let infoText = `<div class="p-10 mb-20 bg-info-lm bg-info-dm rounded">
                                    <p><strong>Verified Players</strong></p>
                                </div>`;

                if (clientsData.length === 0) {
                    table += header;
                    table += `<tr><td colspan="2">No players are currently verified.</td></tr>`;
                } else {
                    table += header;
                    clientsData.forEach(client => {
                        table += `<tr>
                                    <td>
                                        <a href="/Client/Profile/${client.clientId}" class="level-color-${client.level.toLowerCase()} no-decoration">${client.currentAlias.name.stripColors()}</a>
                                    </td>
                                    <td>
                                        <a href="#" class="profile-action no-decoration float-right" data-action="DynamicAction" data-action-id="${client.clientId}"
                                           data-action-meta="${encodeURI(JSON.stringify(disallowInteraction))}">
                                            <div class="btn">
                                                <i class="oi oi-circle-x mr-5 font-size-12"></i>
                                                <span class="text-truncate">Remove Verification</span>
                                            </div>
                                        </a>
                                    </td>
                                </tr>`;
                    });
                }

                table += '</table>';

                return infoText + table;
            };

            return interactionData;
        }
    },
    {
        name: verificationMonitorKey,
        action: function (targetId, game, token) {
            const helpers = importNamespace('SharedLibraryCore.Helpers');
            const interactionData = new helpers.InteractionData();

            interactionData.name = 'Verification Monitor';
            interactionData.description = 'Monitor verified players and kick logs for client ID ' + clientIdThreshold + '+ on ports: ' + monitoredPorts.join(', ');
            interactionData.displayMeta = 'oi-shield';
            interactionData.interactionId = verificationMonitorKey;
            interactionData.minimumPermission = 3;
            interactionData.interactionType = 2;
            interactionData.source = plugin.name;

            interactionData.scriptAction = (sourceId, targetId, game, meta, token) => {
                // Settings Section
                let settingsInfo = `<div class="p-10 mb-20 bg-primary-lm bg-primary-dm rounded">
                                        <p><strong>Current Settings</strong></p>
                                        <p><code>!setclientidthreshold &lt;number&gt;</code> - Current: <strong>${clientIdThreshold}</strong></p>
                                        <p><code>!setmonitoredports &lt;ports&gt;</code> - Current: <strong>${monitoredPorts.join(', ')}</strong></p>
                                    </div>`;

                // Recently Kicked Players Section
                let kickedTable = '<h4 class="mt-20 mb-10">Recently Kicked Players (Last 50)</h4>';
                kickedTable += '<table class="table bg-dark-dm bg-light-lm">';
                let kickedHeader = `<tr>
                                <th>Client ID</th>
                                <th>Player Name</th>
                                <th>IP Address</th>
                                <th>Server</th>
                                <th>Time</th>
                              </tr>`;

                if (kickedPlayers.length === 0) {
                    kickedTable += kickedHeader;
                    kickedTable += `<tr><td colspan="5">No players have been kicked yet.</td></tr>`;
                } else {
                    kickedTable += kickedHeader;
                    kickedPlayers.forEach(player => {
                        const timeAgo = plugin.getTimeAgo(player.timestamp);
                        const playerName = player.name ? player.name.stripColors() : 'Unknown';
                        const serverName = player.server ? player.server.stripColors() : 'Unknown';
                        kickedTable += `<tr>
                                    <td><span class="badge badge-danger">${player.clientId}</span></td>
                                    <td><a href="/Client/Profile/${player.clientId}" class="no-decoration">${playerName}</a></td>
                                    <td><code>${player.ipAddress}</code></td>
                                    <td>${serverName}</td>
                                    <td>${timeAgo}</td>
                                </tr>`;
                    });
                }
                kickedTable += '</table>';

                return settingsInfo + kickedTable;
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
        // get logger without category to avoid missing overload
        this.logger = this.serviceResolver.resolveService('ILogger');
        this.translations = this.serviceResolver.resolveService('ITranslationLookup');

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
        this.logger.writeInfo(`[xoxosystem] Loaded: enabled=${this.enabled}, threshold=${clientIdThreshold}, monitoredPorts=${monitoredPorts.join(',')}, allowedIds=${allowedPlayerIds.length}`);
    },

    checkPlayerAccess: async function (client, _) {
        this.logger.writeInfo(`[xoxosystem] checkPlayerAccess called for clientId=${client.clientId}, port=${client.currentServer.port}`);
        if (!this.enabled) {
            this.logger.writeInfo('[xoxosystem] Plugin not enabled');
            return;
        }
        // Check server port - only filter on configured monitored ports
        const serverPort = client.currentServer.port;
        if (!monitoredPorts.includes(serverPort)) {
            this.logger.writeInfo(`[xoxosystem] Port ${serverPort} not monitored`);
            return;
        }
        // Allow players with client ID at or below threshold automatically
        if (parseInt(client.clientId) <= clientIdThreshold) {
            this.logger.writeInfo(`[xoxosystem] clientId ${client.clientId} <= threshold ${clientIdThreshold}, not kicking`);
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
            this.logger.writeInfo(`[xoxosystem] clientId ${client.clientId} is exempt (manual or discord link)`);
            return;
        }
        // Players above client ID threshold who are not verified get kicked
        if (parseInt(client.clientId) > clientIdThreshold) {
            this.logger.writeInfo(`[xoxosystem] Kicking clientId ${client.clientId} (threshold ${clientIdThreshold})`);
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
            this.logger.writeInfo(`[xoxosystem] Player ${client.cleanedName} kicked - ClientID: ${client.clientId}, PIN: ${verificationCode}`);
            client.tell(`^1Your ClientID: ${client.clientId}`);
            client.tell(`^1Your PIN: ${verificationCode}`);
            client.tell(`^7Join Discord: ^2discord.ceylonwarfare.tech ^7and use: ^2/link ${client.clientId} ${verificationCode}`);
            client.tell(`^7PIN expires in ^2120 seconds`);
            
            client.kick(`^7New players require Discord verification. ^2Press Shift + ~ ^7to open console and check your ClientID and PIN.`,
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
            
            this.logger.writeInfo(`[xoxosystem] Verification code ${verificationCode} saved for player ${playerName} (ID: ${clientId})`);
            return true;
        } catch (e) {
            this.logger.writeError(`[xoxosystem] Failed to save verification: ${e.message}`);
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
            this.logger.writeError(`[xoxosystem] Failed to sync verifications to file: ${e.message}`);
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
            this.logger.writeError(`[xoxosystem] Failed to sync linked profiles: ${e.message}`);
            return false;
        }
    },

    syncManualAllowedToFile: function () {
        try {
            IO.File.WriteAllText(manualAllowedFilePath, JSON.stringify(manualAllowedIds, null, 2));
            return true;
        } catch (e) {
            this.logger.writeError(`[xoxosystem] Failed to sync manual allowed to file: ${e.message}`);
            return false;
        }
    }
};

init;