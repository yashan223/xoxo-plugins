const advertisingBansKey = 'Webfront::Nav::Admin::AdvertisingBans';

const init = (registerNotify, serviceResolver, configWrapper) => {
    plugin.onLoad(serviceResolver, configWrapper);

    registerNotify('IGameEventSubscriptions.ClientMessaged', (messageEvent, _) => {
        plugin.onClientMessage(messageEvent);
    });

    return plugin;
};

const plugin = {
    author: 'IW4M-Admin',
    version: '1.1',
    name: 'Advertising Ban',
    config: {
        enabled: true, // indicates if the plugin is enabled
        banDurationDays: 14, // how many days to ban for (2 weeks)
        checkUrls: true, // check for website URLs
        checkIps: true, // check for IP addresses
        whitelist: [
            // Basic common websites
            'youtube', 'google', 'facebook', 'twitter', 'twitch', 'discord',
            'instagram', 'reddit', 'github', 'steam', 'spotify', 'netflix',
            'wikipedia', 'imgur', 'gyazo', 'medal.tv', 'streamable',
            // Server-related domains
            'ceylonwarfare.tech', 'machannoob.com', 'ceylonwarfare', 'machannoob', 'ceylon', 'machan'
        ],
        banMessage: 'Advertising is not allowed on this server',
        exemptLevels: ['Moderator', 'Administrator', 'SeniorAdmin', 'Owner'] // Staff levels that are exempt
    },
    logger: null,
    translations: null,
    configWrapper: null,
    serviceResolver: null,
    interactionRegistration: null,

    // Regex patterns for detection
    patterns: {
        // Matches URLs with common protocols and domains
        url: /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:com|net|org|gg|me|io|co|uk|de|fr|ru|cn|tv|cc|xyz|info|biz|eu|us|ca|au|tk|ga|ml|cf|gq|online|site|website|space|live|store|tech|club|top|fun|pro|host|pw|vip|cloud|zone|download|click|link|stream|bet|win|game|games|party|racing|trade|date|review|news|blog|shop|app)(?:\/[^\s]*)?/i,
        
        // Matches IPv4 addresses (with dots or with spaces/dashes as separators)
        ipv4: /\b(?:\d{1,3}[.\s\-_:]{1,3}){3}\d{1,3}\b/,
        
        // Matches common domain patterns even without protocol
        domain: /[a-zA-Z0-9-]+\s*(?:dot|\.)\s*(?:com|net|org|gg|me|io|co|uk|de|fr|ru|tv|cc|xyz|info|biz|online|site|website)/i,
        
        // Matches "join" or "visit" followed by domain-like text
        invite: /(?:join|visit|check\s*out|go\s*to|play\s*at|play\s*on)\s+[a-zA-Z0-9-]+\s*[.\s]\s*[a-zA-Z]{2,}/i
    },

    interactions: [{
        name: advertisingBansKey,
        action: function (_, __, ___) {
            const helpers = importNamespace('SharedLibraryCore.Helpers');
            const interactionData = new helpers.InteractionData();

            interactionData.name = 'Advertising Bans';
            interactionData.description = 'View all advertising-related bans';
            interactionData.displayMeta = 'ph-megaphone';
            interactionData.interactionId = advertisingBansKey;
            interactionData.minimumPermission = 2; // Moderator+
            interactionData.interactionType = 2; // Page/View type
            interactionData.source = plugin.name;

            interactionData.scriptAction = (sourceId, targetId, game, meta, token) => {
                try {
                    const result = plugin.getAdvertisingBans();
                    return plugin.generateAdvertisingBansHtml(result);
                } catch (error) {
                    plugin.logger.logError('Error generating advertising bans list: {Error}', error.message);
                    return `<div class="p-4 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400">An error occurred while loading advertising bans.</div>`;
                }
            };

            return interactionData;
        }
    }],

    onClientMessage: function (messageEvent) {
        if (!this.config.enabled) {
            return;
        }

        const client = messageEvent.client;
        const message = messageEvent.message;

        // Exempt staff members
        if (this.config.exemptLevels.includes(client.level)) {
            return;
        }

        // Check if message contains advertising
        if (this.isAdvertising(message)) {
            this.logger.logInformation(`Client ${client.name} (${client.clientId}) detected advertising: "${message}"`);
            
            // Issue temp ban through penalty service to ensure it appears in penalties tab
            this.issueTempBan(client, messageEvent.server);
            
            this.logger.logInformation(`Client ${client.name} (${client.clientId}) has been banned for ${this.config.banDurationDays} days for advertising`);
        }
    },

    issueTempBan: function (client, server) {
        try {
            const EFClient = importNamespace('Data.Models').EFClient;
            const EFPenalty = importNamespace('Data.Models').EFPenalty;
            const penaltyType = importNamespace('Data.Models').EFPenalty.PenaltyType;
            
            // Create a new penalty
            const penalty = new EFPenalty();
            penalty.type = penaltyType.TempBan;
            penalty.expires = System.DateTime.UtcNow.AddDays(this.config.banDurationDays);
            penalty.offenderId = client.clientId;
            penalty.punisherId = server.asConsoleClient().clientId;
            penalty.offense = this.config.banMessage;
            penalty.isEvaded = false;
            penalty.automated = true;
            penalty.active = true;
            penalty.when = System.DateTime.UtcNow;
            
            this.logger.logInformation('Creating advertising ban penalty for {Client} - Offense: {Offense}', client.name, penalty.offense);
            
            // Get penalty service and add the penalty
            const penaltyService = this.serviceResolver.resolveService('IModerationService');
            const result = penaltyService.createPenaltyAsync(penalty, server, System.Threading.CancellationToken.None).Result;
            
            this.logger.logInformation('Advertising ban penalty created successfully for {Client}', client.name);
            
            // Kick the player from the server
            client.kick(this.config.banMessage, server.asConsoleClient());
            
        } catch (error) {
            this.logger.logError('Failed to issue temp ban: {Error}', error.message);
            this.logger.logError('Error stack: {Stack}', error.toString());
            // Fallback to simple tempBan if the penalty service approach fails
            const banDuration = System.TimeSpan.FromDays(this.config.banDurationDays);
            client.tempBan(this.config.banMessage, banDuration, server.asConsoleClient());
        }
    },

    isAdvertising: function (message) {
        if (!message || message.length === 0) {
            return false;
        }

        const lowerMessage = message.toLowerCase();

        // Check against whitelist
        for (let i = 0; i < this.config.whitelist.length; i++) {
            if (lowerMessage.includes(this.config.whitelist[i].toLowerCase())) {
                return false;
            }
        }

        // Check for URLs if enabled
        if (this.config.checkUrls) {
            if (this.patterns.url.test(message)) {
                return true;
            }
            if (this.patterns.domain.test(message)) {
                return true;
            }
            if (this.patterns.invite.test(message)) {
                return true;
            }
        }

        // Check for IP addresses if enabled
        if (this.config.checkIps) {
            if (this.patterns.ipv4.test(message)) {
                // Validate it's actually an IP-like pattern (not a random number sequence)
                const ipMatch = message.match(this.patterns.ipv4);
                if (ipMatch) {
                    const cleaned = ipMatch[0].replace(/[\s\-_:]/g, '.');
                    const parts = cleaned.split('.');
                    
                    // Check if it looks like a valid IP (not scores or random numbers)
                    if (parts.length === 4) {
                        let validIpPattern = true;
                        for (let i = 0; i < parts.length; i++) {
                            const num = parseInt(parts[i]);
                            if (isNaN(num) || num < 0 || num > 255) {
                                validIpPattern = false;
                                break;
                            }
                        }
                        
                        // Additional check: avoid false positives from scores like "10 - 5"
                        // Real IPs being advertised usually have larger numbers
                        if (validIpPattern) {
                            // If at least one octet is >= 50, likely an IP address
                            const hasLargerNumber = parts.some(p => parseInt(p) >= 50);
                            if (hasLargerNumber) {
                                return true;
                            }
                        }
                    }
                }
            }
        }

        return false;
    },

    onLoad: function (serviceResolver, configWrapper) {
        this.serviceResolver = serviceResolver;
        this.logger = serviceResolver.resolveService('ILogger', ['ScriptPluginV2']);
        this.translations = serviceResolver.resolveService('ITranslationLookup');
        this.configWrapper = configWrapper;

        const storedConfig = this.configWrapper.getValue('config', newConfig => {
            if (newConfig) {
                plugin.logger.logInformation('AdvertisingBan config reloaded. Enabled={Enabled}', newConfig.enabled);
                plugin.config = newConfig;
            }
        });

        if (storedConfig != null) {
            this.config = storedConfig;
        } else {
            this.configWrapper.setValue('config', this.config);
        }

        // Register webfront interaction
        this.interactionRegistration = serviceResolver.resolveService('IInteractionRegistration');
        this.interactionRegistration.unregisterInteraction(advertisingBansKey);

        this.logger.logInformation('AdvertisingBan {version} by {author} loaded. Enabled={Enabled}, BanDuration={Days} days', 
            this.version, this.author, this.config.enabled, this.config.banDurationDays);
    },

    getAdvertisingBans: function () {
        const contextFactory = this.serviceResolver.resolveService('IDatabaseContextFactory');
        const context = contextFactory.createContext(false);
        
        try {
            const EFPenalty = importNamespace('Data.Models').EFPenalty;
            
            // Get all active penalties (both automated and manual) where offense contains "Advertising"
            const activePenalties = context.penalties
                .where(p => p.active === true)
                .orderByDescending(p => p.when)
                .toList();
            
            this.logger.logInformation('Found {Count} active penalties total', activePenalties.length);
            
            // Filter for advertising bans in memory
            const advertisingBans = [];
            for (let i = 0; i < activePenalties.length; i++) {
                const penalty = activePenalties[i];
                const typeStr = penalty.type.toString();
                const offense = penalty.offense || '';
                
                if ((typeStr === 'Ban' || typeStr === 'TempBan') && 
                    offense.toLowerCase().includes('advertising')) {
                    advertisingBans.push(penalty);
                }
            }
            
            this.logger.logInformation('Found {Count} advertising bans out of {Total} active penalties', 
                advertisingBans.length, activePenalties.length);
            
            // Get unique client IDs
            const offenderIds = [];
            const punisherIds = [];
            
            for (let i = 0; i < advertisingBans.length; i++) {
                if (!offenderIds.includes(advertisingBans[i].offenderId)) {
                    offenderIds.push(advertisingBans[i].offenderId);
                }
                if (!punisherIds.includes(advertisingBans[i].punisherId)) {
                    punisherIds.push(advertisingBans[i].punisherId);
                }
            }
            
            // Fetch client data in bulk
            const clientSet = context.clients;
            const offenders = clientSet.getClientsBasicData(offenderIds);
            const punishers = clientSet.getClientsBasicData(punisherIds);
            
            // Map client data
            const offenderMap = {};
            const punisherMap = {};
            
            for (let i = 0; i < offenders.length; i++) {
                offenderMap[offenders[i].clientId] = offenders[i];
            }
            
            for (let i = 0; i < punishers.length; i++) {
                punisherMap[punishers[i].clientId] = punishers[i];
            }
            
            // Attach client data to penalties
            const result = [];
            for (let i = 0; i < advertisingBans.length; i++) {
                const ban = advertisingBans[i];
                result.push({
                    penalty: ban,
                    offender: offenderMap[ban.offenderId],
                    punisher: punisherMap[ban.punisherId]
                });
            }
            
            context.dispose();
            return result;
        } catch (error) {
            context.dispose();
            this.logger.logError('Error fetching advertising bans: {Error}', error.message);
            return [];
        }
    },

    generateAdvertisingBansHtml: function (bans) {
        let html = `<div class="mb-6 p-4 rounded-lg bg-yellow-600/10 border border-yellow-500/30">
                        <div class="flex items-center gap-2 mb-2">
                            <i class="ph ph-megaphone text-yellow-400"></i>
                            <h3 class="text-sm font-semibold">Advertising Bans</h3>
                        </div>
                        <p class="text-xs text-muted">Total active advertising bans: <span class="text-primary font-bold">${bans.length}</span></p>
                    </div>`;
        
        html += '<table class="w-full text-left border-collapse">';
        html += `<thead>
                    <tr class="border-b border-line">
                        <th class="px-6 py-3 text-xs font-semibold uppercase text-muted">Player</th>
                        <th class="px-6 py-3 text-xs font-semibold uppercase text-muted">Offense</th>
                        <th class="px-6 py-3 text-xs font-semibold uppercase text-muted">Banned By</th>
                        <th class="px-6 py-3 text-xs font-semibold uppercase text-muted">When</th>
                        <th class="px-6 py-3 text-xs font-semibold uppercase text-muted">Expires</th>
                    </tr>
                 </thead>
                 <tbody>`;
        
        if (bans.length === 0) {
            html += `<tr><td colspan="5" class="px-6 py-8 text-center text-muted">No advertising bans found.</td></tr>`;
        } else {
            for (let i = 0; i < bans.length; i++) {
                const ban = bans[i];
                const penalty = ban.penalty;
                const offender = ban.offender;
                const punisher = ban.punisher;
                
                const offenderName = this.escapeHtml(offender?.currentAlias?.name?.stripColors() || 'Unknown');
                const punisherName = this.escapeHtml(punisher?.currentAlias?.name?.stripColors() || 'Console');
                const offense = this.escapeHtml(penalty.offense || 'No reason specified');
                
                const whenDate = new Date(penalty.when.toString());
                const whenStr = this.getTimeAgo(whenDate);
                
                let expiresStr = 'Permanent';
                if (penalty.expires) {
                    const expiresDate = new Date(penalty.expires.toString());
                    expiresStr = this.getTimeUntil(expiresDate);
                }
                
                html += `<tr class="border-t border-line hover:bg-surface-hover/30 transition-colors">
                            <td class="px-6 py-4">
                                <a href="/Client/Profile/${offender?.clientId}" class="text-sm font-medium hover:text-primary transition-colors">${offenderName}</a>
                            </td>
                            <td class="px-6 py-4 text-sm text-muted max-w-md truncate">${offense}</td>
                            <td class="px-6 py-4">
                                ${punisher?.clientId ? `<a href="/Client/Profile/${punisher.clientId}" class="text-sm hover:text-primary transition-colors">${punisherName}</a>` : `<span class="text-sm text-muted">${punisherName}</span>`}
                            </td>
                            <td class="px-6 py-4 text-sm text-muted">${whenStr}</td>
                            <td class="px-6 py-4 text-sm text-muted">${expiresStr}</td>
                         </tr>`;
            }
        }
        
        html += '</tbody></table>';
        return html;
    },

    getTimeAgo: function (date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    },

    getTimeUntil: function (date) {
        const now = new Date();
        const diffMs = date - now;
        
        if (diffMs <= 0) return 'Expired';
        
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) return `${diffMins}m left`;
        if (diffHours < 24) return `${diffHours}h left`;
        return `${diffDays}d left`;
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
