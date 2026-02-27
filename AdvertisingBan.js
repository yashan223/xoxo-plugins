const init = (registerNotify, serviceResolver, configWrapper) => {
    plugin.onLoad(serviceResolver, configWrapper);

    registerNotify('IGameEventSubscriptions.ClientMessaged', (messageEvent, _) => {
        plugin.onClientMessage(messageEvent);
    });

    return plugin;
};

const plugin = {
    author: 'xoxod33p',
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

    // Regex patterns for detection
    patterns: {
        // Matches URLs with common protocols and domains
        url: /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:com|net|org|gg|me|io|co|uk|de|fr|ru|cn|tv|cc|xyz|info|biz|eu|us|ca|au|tk|ga|ml|cf|gq|online|site|website|space|live|store|tech|club|top|fun|pro|host|pw|vip|cloud|zone|download|click|link|stream|bet|win|game|games|party|racing|trade|date|review|news|blog|shop|app)(?:\/[^\s]*)?/i,
        
        // Matches IPv4 addresses (STRICT: only actual dots, must look like real IP)
        ipv4: /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/,
        
        // Matches spaced IP addresses (people trying to bypass: 192 168 1 1)
        ipv4Spaced: /\b(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b/,
        
        // Matches common domain patterns even without protocol
        domain: /[a-zA-Z0-9-]+\s*(?:dot|\.)\s*(?:com|net|org|gg|me|io|co|uk|de|fr|ru|tv|cc|xyz|info|biz|online|site|website)/i,
        
        // Patterns to IGNORE (game-related false positives)
        gamePatterns: /(?:red\s*dot|blue\s*dot|green\s*dot|enemy\s*at|team|kill|score|round|point|level|rank|kd|k\/d|\d+\s*-\s*\d+)/i
    },

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
            // Skip if an active advertising ban already exists to avoid duplicates
            if (this.hasActiveAdvertisingBan(client.clientId)) {
                this.logger.logInformation(`Client ${client.name} (${client.clientId}) already has an active advertising ban; skipping new ban`);
                return;
            }

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

    hasActiveAdvertisingBan: function (clientId) {
        const contextFactory = this.serviceResolver.resolveService('IDatabaseContextFactory');
        const context = contextFactory.createContext(false);

        try {
            const penalties = context.penalties
                .where(p => p.offenderId === clientId && p.active === true)
                .orderByDescending(p => p.when)
                .toList();

            for (let i = 0; i < penalties.length; i++) {
                const penalty = penalties[i];
                const typeStr = penalty.type.toString();
                const offense = (penalty.offense || '').toLowerCase();

                if ((typeStr === 'Ban' || typeStr === 'TempBan') && offense.includes('advertising')) {
                    context.dispose();
                    return true;
                }
            }

            context.dispose();
            return false;
        } catch (error) {
            context.dispose();
            this.logger.logError('Error checking existing advertising ban for client {ClientId}: {Error}', clientId, error.message);
            return false;
        }
    },

    isAdvertising: function (message) {
        if (!message || message.length === 0) {
            return false;
        }

        const lowerMessage = message.toLowerCase();

        // Skip game-related callouts to avoid false positives (red dot, scores, etc.)
        if (this.patterns.gamePatterns.test(lowerMessage)) {
            return false;
        }

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
        }

        // Check for IP addresses if enabled
        if (this.config.checkIps) {
            // Check for standard IP format (192.168.1.1)
            const ipMatch = message.match(this.patterns.ipv4);
            if (ipMatch) {
                const parts = [parseInt(ipMatch[1]), parseInt(ipMatch[2]), parseInt(ipMatch[3]), parseInt(ipMatch[4])];
                
                // Validate each octet is valid (0-255)
                const validOctets = parts.every(p => !isNaN(p) && p >= 0 && p <= 255);
                
                if (validOctets) {
                    // Skip common false positives:
                    // - Version numbers (1.0.0.0, 2.0.0.1)
                    // - Dates that look like IPs
                    // - Low number patterns (typically not real server IPs)
                    const hasServerLikeOctet = parts.some(p => p >= 100); // Real server IPs usually have larger octets
                    const isLikelyVersion = parts[0] <= 10 && parts[1] <= 10; // Version patterns like 1.2.3.4
                    
                    if (hasServerLikeOctet && !isLikelyVersion) {
                        return true;
                    }
                }
            }
            
            // Check for spaced IP addresses (people trying to bypass: 192 168 1 1)
            const spacedMatch = message.match(this.patterns.ipv4Spaced);
            if (spacedMatch) {
                const parts = [parseInt(spacedMatch[1]), parseInt(spacedMatch[2]), parseInt(spacedMatch[3]), parseInt(spacedMatch[4])];
                const validOctets = parts.every(p => !isNaN(p) && p >= 0 && p <= 255);
                const hasServerLikeOctet = parts.some(p => p >= 100);
                
                if (validOctets && hasServerLikeOctet) {
                    return true;
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

        this.logger.logInformation('AdvertisingBan {version} by {author} loaded. Enabled={Enabled}, BanDuration={Days} days', 
            this.version, this.author, this.config.enabled, this.config.banDurationDays);
    }
};

init;
