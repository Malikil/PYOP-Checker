const Banchojs = require('bancho.js');
const helpers = require('./helpers');
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
    constructor(user, pass, commands)
    {
        this.client = new Banchojs.BanchoClient({
            username: user,
            password: pass
        });
        this.commands = commands;
        this.currentMap = {};

        this.client.connect().then(() => {
            console.log("Connected to osu!bancho");
            this.client.on("PM", async message => {
                let response;
                // Sort the message here
                try
                {
                    if (message.message.startsWith("!with "))
                        response = await this.checkMap(message);
                    else if (message.message.startsWith("ACTION is listening to [", 1))
                        response = await this.onListening(message);
                    else if (message.message.startsWith("ACTION is playing [", 1))
                        response = await this.onPlaying(message);
                }
                catch (err)
                {
                    message.user.sendMessage("Something went wrong");
                    console.error(err);
                }
                // Give the response, if needed
                if (response)
                    response.catch(err => console.error(err));
            });
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
    async onListening(message)
    {
        // Get the song id
        Logger.log(`${message.user.ircUsername}: ${message.message}`);
        let begin = message.message.indexOf("/b/");
        let end = message.message.indexOf(' ', begin);
        let bid = message.message.substring(begin + 3, end);
        Logger.log(`bid: ${bid}`);
        // Set the user's latest song to this one
        // Always set the mod back to 0
        this.currentMap[message.user.id] = {
            bid: bid,
            mods: 0
        };
        // Do I want to do a checkMap here?
        // Yes, then return a message
        let result = await this.commands.checkMap(bid, { osuid: message.user.id });
        return message.user.sendMessage(result.message);
    }

    /**
     * @param {Banchojs.PrivateMessage} message
     */
    async onPlaying(message)
    {
        Logger.log(`${message.user.ircUsername}: ${message.message}`);
        // Get the map id
        let begin = message.message.indexOf("/b/");
        let end = message.message.indexOf(' ', begin);
        let bid = message.message.substring(begin + 3, end);
        Logger.log(`Beatmap: ${bid}`);
        // Extract the mods, if they exist
        begin = message.message.indexOf("]] +");
        let mods = 0;
        if (begin > 0)
        {
            // Get the mods part of the string
            let mod = message.message.substr(begin);
            let modarr = [];
            for (let i = 0;
                    (i = mod.indexOf('+')) > -1;
                    mod = mod.substr(i + 1))
                modarr.push(mod.slice(i + 1, mod.indexOf(' ', i)));
            Logger.inspect(modarr);
            modarr.forEach(modstr => {
                switch (modstr)
                {
                    case "Hidden":     mods |= helpers.MODS.HD; break;
                    case "HardRock":   mods |= helpers.MODS.HR; break;
                    case "DoubleTime": mods |= helpers.MODS.DT; break;
                    case "Easy":       mods |= helpers.MODS.EZ; break;
                    case "HalfTime":   mods |= helpers.MODS.HT; break;
                }
            });
        }
        Logger.log(`Mods: ${mods}`);
        this.currentMap[message.user.id] = { bid, mods };

        let result = await this.commands.checkMap(bid, { mods: mods, osuid: message.user.id });
        return message.user.sendMessage(result.message);
    }

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