# xoxo-plugins

A collection of custom plugins for IW4MAdmin server management.

## Plugins

### 1. Custom Commands (`customcmd.js`)
Adds custom administrative commands for game server management.

**Commands:**
- `!ss <player>` - Take a screenshot of a player
- `!wtf <player>` - Execute wtf command on a player (Owner only)

**Author:** deep  
**Version:** 1.0

---

### 2. ISP Lookup (`Isp.js`)
Displays ISP (Internet Service Provider) information for players.

**Commands:**
- `!isp <player>` - Shows ISP information of a player
- Alias: `!playerip`

**Features:**
- Detects and handles local/LAN IP addresses
- Integrates with external IP lookup API
- Available to all users

**Author:** xoxod33p  
**Version:** 1.0.0

---

### 3. Access Control System (`xoxosystem.js`)
Advanced access control and verification system with Discord integration.

**Commands:**
- `!setid <threshold>` - Set client ID threshold for verification (SeniorAdmin)
- Additional access control management commands

**Features:**
- Client ID-based verification system
- Discord bot integration for verification
- Manual allowlist management
- Linked profile tracking
- Port-specific monitoring (28960, 28964)
- Automatic player verification workflow

**Author:** xoxod33p  
**Version:** 1.0

---

## Installation

1. Copy the plugin files to your IW4MAdmin plugins directory
2. Configure the plugins as needed
3. Restart IW4MAdmin

## Requirements

- IW4MAdmin
- Supported games: IW3 (Call of Duty 4), IW4 (Modern Warfare 2)

## Configuration

Each plugin can be configured through the IW4MAdmin configuration interface or by editing the plugin files directly.

---

**Repository:** [yashan223/xoxo-plugins](https://github.com/yashan223/xoxo-plugins)
