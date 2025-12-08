
const init = (registerNotify, serviceResolver, configWrapper, pluginHelper) => {
    // Initialize the plugin with dependencies
    plugin.onLoad(serviceResolver, configWrapper, pluginHelper);
    return plugin;
};

const plugin = {
    author: 'xoxod33p',
    version: '1.0.0',
    name: 'ISP Lookup Plugin',
    manager: null,
    configWrapper: null,
    logger: null,
    serviceResolver: null,
    translations: null,
    pluginHelper: null,
    enabled: true,

    commands: [{
        name: 'isp',
        description: 'Shows ISP information of a player',
        alias: 'playerip',
        permission: 'User',
        targetRequired: true,
        arguments: [{
            name: 'player',
            required: true
        }],
        execute: (gameEvent) => {
            const client = gameEvent.target;
            
            if (!client) {
                gameEvent.origin.tell('^1Error: ^7Player not found.');
                return;
            }
            
            const ipAddress = client.IPAddressString;
            
            // Check if IP is local/private
            if (!ipAddress || ipAddress === "127.0.0.1" || 
                ipAddress.startsWith("192.168.") || 
                ipAddress.startsWith("10.") ||
                ipAddress.startsWith("172.16.")) {
                gameEvent.origin.tell(`^3Unable to determine ISP for ^7${client.name}^3: Local/LAN IP detected`);
                return;
            }
            
            // Prepare API request
            const userAgent = `IW4MAdmin-${plugin.manager.getApplicationSettings().configuration().id}`;
            const stringDict = System.Collections.Generic.Dictionary(System.String, System.String);
            const headers = new stringDict();
            headers.add('User-Agent', userAgent);
            const pluginScript = importNamespace('IW4MAdmin.Application.Plugin.Script');
            const request = new pluginScript.ScriptPluginWebRequest(
                `https://ipapi.co/${ipAddress}/json/`, 
                null, 'GET', 'application/json', headers
            );
            
            try {
                plugin.pluginHelper.requestUrl(request, (response) => {
                    plugin.processIspResponse(response, client, gameEvent.origin);
                });
            } catch (ex) {
                plugin.logger.logWarning('Error checking ISP for IP ({IP}): {message}',
                    ipAddress, ex.message);
                gameEvent.origin.tell(`^1Error: ^7Unable to check ISP information for ${client.name}`);
            }
        }
    }],
    
    processIspResponse: function(response, targetClient, originClient) {
        let ispData = null;
        
        try {
            ispData = JSON.parse(response);
        } catch {
            this.logger.logWarning('Problem checking ISP for IP ({IP}): {message}',
                targetClient.IPAddressString, response);
            originClient.tell(`^1Error: ^7Unable to process ISP information for ${targetClient.name}`);
            return;
        }
        
        if (ispData.error) {
            originClient.tell(`^1Error: ^7${ispData.reason || "API Error"}`);
            return;
        }
        
        // Extract relevant information
        const isp = ispData.org || "Unknown";
        const country = ispData.country_name || "Unknown";
        const city = ispData.city || "Unknown";
        
        // Send formatted message
        originClient.tell(`^3Player: ^7${targetClient.name} ^3| ISP: ^7${isp} ^3| Location: ^7${city}, ${country}`);
    },

    onLoad: function(serviceResolver, configWrapper, pluginHelper) {
        this.serviceResolver = serviceResolver;
        this.configWrapper = configWrapper;
        this.pluginHelper = pluginHelper;
        this.manager = this.serviceResolver.resolveService('IManager');
        this.logger = this.serviceResolver.resolveService('ILogger', ['ScriptPluginV2']);
        this.translations = this.serviceResolver.resolveService('ITranslationLookup');
        
        this.configWrapper.setName(this.name);
        
        // Optional: Set default enabled state
        this.enabled = this.configWrapper.getValue('enabled', newValue => {
            if (newValue !== undefined) {
                plugin.logger.logInformation('{Name} configuration updated. Enabled={Enabled}', plugin.name, newValue);
                plugin.enabled = newValue;
            }
        });
        
        if (this.enabled === undefined) {
            this.configWrapper.setValue('enabled', true);
            this.enabled = true;
        }
        
        this.logger.logInformation('{Name} {Version} by {Author} loaded. Enabled={Enabled}', this.name, this.version,
            this.author, this.enabled);
    }
};