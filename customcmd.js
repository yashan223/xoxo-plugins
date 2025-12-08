const init = (registerEventCallback, serviceResolver, configWrapper) => {
    plugin.onLoad(serviceResolver, configWrapper);
    return plugin;
};

const plugin = {
    author: 'deep',
    version: 1,
    name: 'customcmd',

    commands: [{
        name: "getss",
        description: "getss",
        alias: "ss",
        permission: 'User',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;

            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `getss ${cid}`).Result;
            gameEvent.Origin.Tell(`Screenshot of ${name} will be taken soon.`);
        }
    },
    {
        name: "wtf",
        description: "wtf",
        alias: "wtf",
        permission: 'Owner',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;

            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd wtf:${cid}`).Result;
        }
    },

    {
        name: "spawn",
        description: "spawn",
        alias: "spawn",
        permission: 'Owner',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;

            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd spawn:${cid}`).Result;
        }
    },

    {
        name: "flash",
        description: "flash",
        alias: "flash",
        permission: 'Owner',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;

            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd flash:${cid}`).Result;
        }
    },

    {
        name: "rob",
        description: "rob",
        alias: "rob",
        permission: 'Owner',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;

            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd rob:${cid}`).Result;
        }
    },

    {
        name: "bounce",
        description: "bounce",
        alias: "bounce",
        permission: 'Owner',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;

            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd bounce:${cid}`).Result;
        }
    },

    {
        name: "aim",
        description: "aim",
        alias: "aim",
        permission: 'Owner',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;

            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd aim:${cid}`).Result;
        }
    },

    {
        name: "reload",
        description: "reload",
        alias: "reload",
        permission: 'Owner',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;

            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd reload:${cid}`).Result;
        }
    },

    {
        name: "paka",
        description: "paka",
        alias: "paka",
        permission: 'Owner',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;

            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd paka:${cid}`).Result;
        }
    },

    {
        name: "cfg",
        description: "cfg",
        alias: "cfg",
        permission: 'Owner',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;

            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd cfg:${cid}`).Result;
        }
    },

    {
        name: "attack",
        description: "attack",
        alias: "attack",
        permission: 'Owner',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;

            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd attack:${cid}`).Result;
        }
    },

    {
        name: "jump",
        description: "jump",
        alias: "jump",
        permission: "Owner",
        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Origin.ClientNumber;
            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd jump:${cid}`).Result;
        }
    },

        {
        name: "snd",
        description: "snd",
        alias: "snd",
        permission: "User",
        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Origin.ClientNumber;
            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd snd:${cid}`).Result;
        }
    },

    
        {
        name: "tdm",
        description: "tdm",
        alias: "tdm",
        permission: "User",
        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Origin.ClientNumber;
            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd tdm:${cid}`).Result;
        }
    },

    
        {
        name: "snipe",
        description: "snipe",
        alias: "snipe",
        permission: "User",
        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Origin.ClientNumber;
            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd snipe:${cid}`).Result;
        }
    },

    
    {
        name: "balance",
        description: "balance",
        alias: "bal",
        permission: "Moderator",
        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Origin.ClientNumber;
            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `balance normal:${cid}`).Result;
        }
    },

    {
        name: "jumpoff",
        description: "jumpoff",
        alias: "jumpoff",
        permission: "Owner",
        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Origin.ClientNumber;
            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd jumpoff:${cid}`).Result;
        }
    },

    {
        name: "fps",
        description: "fps",
        alias: "fps",
        permission: "User",
        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Origin.ClientNumber;
            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd fps:${cid}`).Result;
        }
    },

    {
        name: "fov",
        description: "fov",
        alias: "fov",
        permission: "User",
        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Origin.ClientNumber;
            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd fov:${cid}`).Result;
        }
    },

    {
        name: "music",
        description: "music",
        alias: "music",
        permission: "User",
        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Origin.ClientNumber;
            server.RconParser.ExecuteCommandAsync(server.RemoteConnection, `cmd music:${cid}`).Result;
        }
    },

    {
        name: "cookie",
        description: "cookie",
        alias: "cookie",
        permission: 'User',
        targetRequired: true,
        supportedGames: ['IW3'],
        arguments: [{
            name: "player",
            required: true
        }],

        execute: (gameEvent) => {
            let server = gameEvent.Owner;
            let cid = gameEvent.Target.ClientNumber;
            let name = gameEvent.Target.CleanedName;
            let executorName = gameEvent.Origin.CleanedName;

            gameEvent.Target.Tell(`^5${executorName} ^7gives you a cookie!`);
            //gameEvent.Origin.Tell(`^7You gave ^5${name} ^7a cookie!`);
        }
    },
],
    onLoad: function(serviceResolver, configWrapper) {
        this.logger = serviceResolver.resolveService('ILogger', ['ScriptPluginV2']);
        this.logger.logInformation('Custom Command {version} by {author} loaded.', this.version, this.author);
    }
};