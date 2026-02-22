const banListKey = 'Webfront::Nav::Admin::BanList';

const init = (registerNotify, serviceResolver, configWrapper) => {
    plugin.onLoad(serviceResolver, configWrapper);
    return plugin;
};

const plugin = {
    author: 'xoxod33p',
    version: '1.0',
    name: 'Ban List Webfront',
    serviceResolver: null,
    configWrapper: null,
    logger: null,
    config: {
        enabled: true,
        minimumPermission: 0, // 0=User, 1=Trusted, 2=Moderator, 3=Administrator, 4=SeniorAdmin, 5=Owner
        showTemporaryBans: true,
        showPermanentBans: true,
        bansPerPage: 50, // Show more bans per page
        sortOrder: 'desc' // 'desc' = newest first, 'asc' = oldest first
    },

    interactions: [{
        name: banListKey,
        action: function (_, __, ___) {
            const helpers = importNamespace('SharedLibraryCore.Helpers');
            const interactionData = new helpers.InteractionData();

            interactionData.name = 'Ban List';
            interactionData.description = 'View all active bans';
            interactionData.displayMeta = 'ph-x-circle';
            interactionData.interactionId = banListKey;
            interactionData.minimumPermission = plugin.config.minimumPermission;
            interactionData.interactionType = 2; // Page/View type
            interactionData.source = plugin.name;

            interactionData.scriptAction = (sourceId, targetId, game, meta, token) => {
                try {
                    // Just show first page with more items (50)
                    const result = plugin.getActiveBans(1);
                    return plugin.generateBanListHtml(result.bans, 1, result.totalPages, result.totalBans);
                } catch (error) {
                    plugin.logger.logError('Error generating ban list: {Error}', error.message);
                    return `<div class="p-4 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400">An error occurred while loading ban list.</div>`;
                }
            };

            return interactionData;
        }
    }],

    onLoad: function (serviceResolver, configWrapper) {
        this.serviceResolver = serviceResolver;
        this.configWrapper = configWrapper;
        this.logger = serviceResolver.resolveService('ILogger', ['ScriptPluginV2']);

        // Load configuration
        const storedConfig = this.configWrapper.getValue('config', newConfig => {
            if (newConfig) {
                plugin.logger.logInformation('{Name} config reloaded. Enabled={Enabled}', plugin.name, newConfig.enabled);
                plugin.config = newConfig;
            }
        });

        if (storedConfig != null) {
            this.config = storedConfig;
            
            // Migrate old config: maxBansToDisplay -> bansPerPage
            if (this.config.maxBansToDisplay && !this.config.bansPerPage) {
                this.config.bansPerPage = 50; // Set new default
                delete this.config.maxBansToDisplay;
                this.configWrapper.setValue('config', this.config);
                this.logger.logInformation('Migrated config: maxBansToDisplay -> bansPerPage (50)');
            }
            
            // Ensure bansPerPage exists
            if (!this.config.bansPerPage) {
                this.config.bansPerPage = 50;
                this.configWrapper.setValue('config', this.config);
            }
        } else {
            this.configWrapper.setValue('config', this.config);
        }

        // Register the interaction
        const interactionRegistration = serviceResolver.resolveService('IInteractionRegistration');
        interactionRegistration.unregisterInteraction(banListKey);

        this.logger.logInformation('{Name} {Version} by {Author} loaded. Enabled={Enabled}', 
            this.name, this.version, this.author, this.config.enabled);
    },

    getActiveBans: function (page) {
        page = page || 1;
        
        if (!this.config.enabled) {
            return { bans: [], totalPages: 0, totalBans: 0 };
        }

        const contextFactory = this.serviceResolver.resolveService('IDatabaseContextFactory');
        const context = contextFactory.createContext(false);
        
        try {
            const EFPenalty = importNamespace('Data.Models').EFPenalty;
            
            // Get active penalties and count Ban/TempBan types (enum comparison doesn't work in LINQ)
            const activePenalties = context.penalties
                .where(p => p.active === true)
                .orderByDescending(p => p.when)
                .toList();
            
            // Filter for Ban/TempBan types in memory
            const allActiveBans = [];
            for (let i = 0; i < activePenalties.length; i++) {
                const typeStr = activePenalties[i].type.toString();
                if (typeStr === 'Ban' || typeStr === 'TempBan') {
                    allActiveBans.push(activePenalties[i]);
                }
            }
            
            const totalBans = allActiveBans.length;
            const bansPerPage = this.config.bansPerPage || 50;
            const totalPages = Math.ceil(totalBans / bansPerPage);
            
            this.logger.logInformation('Total active bans: {Count}, BansPerPage: {PerPage}, Page: {Page}/{TotalPages}', 
                totalBans, bansPerPage, page, totalPages);
            
            if (totalBans === 0) {
                context.dispose();
                return { bans: [], totalPages: 0, totalBans: 0 };
            }
            
            // Get only the bans for current page
            const skip = (page - 1) * bansPerPage;
            const pageBans = allActiveBans.slice(skip, skip + bansPerPage);
            
            // Get unique client IDs to fetch in bulk
            const offenderIds = [];
            const punisherIds = [];
            const linkIds = [];
            
            for (let i = 0; i < pageBans.length; i++) {
                if (!offenderIds.includes(pageBans[i].offenderId)) {
                    offenderIds.push(pageBans[i].offenderId);
                }
                if (!punisherIds.includes(pageBans[i].punisherId)) {
                    punisherIds.push(pageBans[i].punisherId);
                }
            }
            
            // Fetch all clients at once
            const allClientIds = offenderIds.concat(punisherIds);
            const clients = context.clients
                .where(c => allClientIds.includes(c.clientId))
                .toList();
            
            // Get link IDs for aliases
            for (let i = 0; i < clients.length; i++) {
                if (!linkIds.includes(clients[i].aliasLinkId)) {
                    linkIds.push(clients[i].aliasLinkId);
                }
            }
            
            // Fetch all aliases at once
            const aliases = context.aliases
                .where(a => linkIds.includes(a.linkId))
                .toList();
            
            // Build client lookup with their latest alias
            const clientMap = {};
            for (let i = 0; i < clients.length; i++) {
                const client = clients[i];
                
                // Find the most recent alias for this client
                let latestAlias = null;
                let latestDate = null;
                
                for (let j = 0; j < aliases.length; j++) {
                    const alias = aliases[j];
                    if (alias.linkId === client.aliasLinkId) {
                        if (!latestDate || alias.dateAdded > latestDate) {
                            latestAlias = alias;
                            latestDate = alias.dateAdded;
                        }
                    }
                }
                
                if (latestAlias) {
                    client.currentAlias = latestAlias;
                }
                
                clientMap[client.clientId] = client;
            }
            
            // Attach client data to penalties
            const bans = [];
            for (let i = 0; i < pageBans.length; i++) {
                const penalty = pageBans[i];
                penalty.offender = clientMap[penalty.offenderId];
                penalty.punisher = clientMap[penalty.punisherId];
                bans.push(penalty);
            }
            
            this.logger.logInformation('Returning {Count} bans with full client data', bans.length);
            
            return { bans: bans, totalPages: totalPages, totalBans: totalBans };
        } catch (error) {
            this.logger.logError('Error querying bans: {Error}', error.message);
            return { bans: [], totalPages: 0, totalBans: 0 };
        } finally {
            context.dispose();
        }
    },

    generateBanListHtml: function (bans, currentPage, totalPages, totalBans) {
        currentPage = currentPage || 1;
        totalPages = totalPages || 0;
        totalBans = totalBans || 0;
        
        if (!bans || bans.length === 0) {
            return `
                <div class="p-6 rounded-lg bg-surface border border-line">
                    <h4 class="text-lg font-semibold mb-2">No Active Bans</h4>
                    <p class="text-muted">There are currently no active bans on record.</p>
                </div>
            `;
        }

        let html = `
            <div class="space-y-4">
                <div class="mb-6">
                    <h2 class="text-2xl font-bold mb-2 flex items-center gap-2">
                        <i class="ph ph-x-circle"></i> Active Ban List
                    </h2>
                    <p class="text-muted text-sm">Showing ${this.escapeHtml(bans.length.toString())} ban(s) on page ${currentPage} of ${totalPages} (${totalBans} total)</p>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b-2 border-line">
                                <th class="px-4 py-3 font-semibold text-sm">Type</th>
                                <th class="px-4 py-3 font-semibold text-sm">Player</th>
                                <th class="px-4 py-3 font-semibold text-sm">Banned By</th>
                                <th class="px-4 py-3 font-semibold text-sm">Reason</th>
                                <th class="px-4 py-3 font-semibold text-sm">Ban Date</th>
                                <th class="px-4 py-3 font-semibold text-sm">Expires</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        bans.forEach(ban => {
            const banType = ban.type.toString();
            const isPermanent = banType === 'Ban';
            const badgeClass = isPermanent ? 'ban-type-permanent' : 'ban-type-temporary';
            const badgeText = isPermanent ? 'PERMANENT' : 'TEMPORARY';

            const playerName = this.escapeHtml(ban.offender?.currentAlias?.name?.stripColors() || 'Unknown');
            const playerId = ban.offender?.clientId || 0;

            const adminName = this.escapeHtml(ban.punisher?.currentAlias?.name?.stripColors() || 'Console');
            const adminId = ban.punisher?.clientId || 1;

            const reason = this.escapeHtml(ban.offense || 'No reason provided');
            
            const banDate = this.formatDate(ban.when);
            const expirationDate = isPermanent || !ban.expires ? 
                '<span class="text-muted">Never</span>' : 
                this.formatDate(ban.expires);

            html += `
                            <tr class="border-t border-line hover:bg-surface-hover/30 transition-colors">
                                <td class="px-4 py-3">
                                    <span class="inline-block px-2.5 py-1 rounded text-xs font-semibold ${isPermanent ? 'bg-red-600/20 text-red-400 border border-red-500/30' : 'bg-orange-600/20 text-orange-400 border border-orange-500/30'}">
                                        ${badgeText}
                                    </span>
                                </td>
                                <td class="px-4 py-3">
                                    <a href="/Client/Profile/${playerId}" class="text-sm font-medium hover:text-primary transition-colors">
                                        ${playerName}
                                    </a>
                                </td>
                                <td class="px-4 py-3">
                                    <a href="/Client/Profile/${adminId}" class="text-sm font-medium hover:text-primary transition-colors">
                                        ${adminName}
                                    </a>
                                </td>
                                <td class="px-4 py-3 max-w-xs break-words text-sm">${reason}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-muted">${banDate}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-muted">${expirationDate}</td>
                            </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>`;
        
        // Show info if there are more bans
        if (totalPages > 1) {
            html += `
                <div class="mt-4 p-4 rounded-lg bg-yellow-600/10 border border-yellow-500/30 text-center">
                    <p class="text-sm"><strong class="font-semibold">Note:</strong> Showing first ${bans.length} of ${totalBans} total bans (most recent)</p>
                </div>`;
        }
        
        html += `
            </div>
        `;

        return html;
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
    },

    formatDate: function (dateValue) {
        if (!dateValue) return 'N/A';
        
        try {
            // Handle both .NET DateTime and JavaScript Date
            let date;
            if (typeof dateValue === 'object' && dateValue.toString) {
                // .NET DateTime object
                date = new Date(dateValue.toString());
            } else {
                date = new Date(dateValue);
            }

            if (isNaN(date.getTime())) {
                return 'Invalid Date';
            }

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');

            return `${year}-${month}-${day} ${hours}:${minutes}`;
        } catch (error) {
            this.logger.logWarning('Error formatting date: {Error}', error.message);
            return 'N/A';
        }
    }
};

init;
