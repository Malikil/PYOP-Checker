const Banchojs = require('bancho.js');
const helpers = require('./helpers');
const commands = require('./bancho_commands');
const util = require('util');

class Logger
{
    static log(str)
    {
        console.log(`\x1b[95m${str}\x1b[0m`);
    }

    static inspect(obj)
    {
        console.log(`\x1b[95m${util.inspect(obj)}\x1b[0m`);
    }
}

module.exports = class OsuClient
{
    constructor(username, password)
    {
        this.client = new Banchojs.BanchoClient({
            username,
            password
        });

        this.client.on("PM", async msg => {
            if (msg.message[0] !== '\u0001' && msg.message[0] !== '!')
                return;
            console.log(`\x1b[95mReceived message:\x1b[0m ${msg.message}`);
            let commandNames = Object.keys(commands);
            let commandArgs = msg.message.split(' ');
            let command = commandArgs[0].slice(1);
            if (commandNames.includes(command))
                // Check if this is a help message or not
                if (commandArgs[1] === '?')
                    msg.user.sendMessage(commands[command].help);
                else
                    commands[command](msg, this.client)
                        .catch(reason => {
                            msg.user.sendMessage("Something went wrong, please tell Malikil what you were trying to do");
                            console.error(reason);
                        });
        });

        this.client.connect().then(() => {
            console.log("Connected to osu!bancho");
        });
    }

    /*
    np messages appear as follows:
    \u0001ACTION is listening to [link str]\u0001
    \u0001ACTION is playing [link str]\u0001
    \u0001ACTION is playing [link str] +Mod\u0001
    \u0001ACTION is playing [link str] +Mod1 +Mod2 +Mod3\u0001
    */

   /**
    * @param {Banchojs.PrivateMessage} message 
    */
    async checkMap(message)
    {
        Logger.log(`${message.user.ircUsername}: ${message.message}`);
        // Get mods from the message
        let args = message.message.split(' ');
        if (args.length > 2)
            return;
        if (args[1] === '?')
            return message.user.sendMessage("Use !with <mods> where mods is some combination of NM|HD|HR|DT|EZ|HT");
        // Get the map they added before
        let map = this.currentMap[message.user.id];
        if (!map)
            return message.user.sendMessage("No recent map found, please use /np to add one");
        // Get the mod info from args
        let mods = helpers.parseMod(args[1].toUpperCase());
        this.currentMap[message.user.id].mods = mods;

        // Check the map
        let result = await this.commands.checkMap(map.bid, { mods: mods, osuid: message.user.id });
        return message.user.sendMessage(`[https://osu.ppy.sh/b/${map.bid} ${helpers.mapString(result.beatmap)}] +${helpers.modString(mods)}: ${result.message}`);
    }

    /**
     * To add a map to the player's pool
     * @param {Banchojs.PrivateMessage} message 
     */
    async addMap(message)
    {
        // !add [mods]: to add the current map with a selection of mods
        // !add: to add the current map with the currently selected mods
        // !add <mapid> [mods]
        Logger.log(`${message.user.ircUsername}: ${message.message}`);
        let args = message.message.split(' ');
        if (args.length > 2)
            return;
        // !add HD something meaningless afterwards
        if (args[1] === '?') // args.length == 1 => args[1] == undefined
            return message.user.sendMessage("Use !add [mods] where mods is some combination of NM|HD|HR|DT|EZ|HT, " +
                "if left out it will use the last mods from !with or /np");
        let map = this.currentMap[message.user.id];
        if (!map) 
            return message.user.sendMessage("No recent map found, please use /np to add one");
        
        // Update the mods if specified
        if (args[1])
            this.currentMap[message.user.id].mods = helpers.parseMod(args[1].toUpperCase());
        
        let result = await this.commands.addMap()
    }
}