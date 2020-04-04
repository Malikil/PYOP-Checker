const Command = require('./commands');
const Banchojs = require('bancho.js');
const helpers = require('./helpers');
const util = require('util');

class Logger
{
    static log(str) {
        console.log(`\x1b[95mBancho Log:\x1b[0m ${str}`);
    }

    static warn(str) {
        console.log(`\x1b[95m${str}\x1b[0m`);
    }

    static inspect(obj) {
        console.log(`\x1b[95m${util.inspect(obj, { colors: true })}\x1b[0m`);
    }
}
const currentMap = {};

const commands = {
    /**
     * Shows a list of available commands
     * @param {Banchojs.PrivateMessage} msg 
     */
    async help(msg)
    {
        // Check if the command came from a player

        msg.user.sendMessage("Commands: " +
            Object.keys(comnames).reduce((p, c) => `${p}, ${c === "ACTION" ? "/np" : `!${c}`}`, "").slice(2) +
            " | Get more info by entering ? after a command"
        );
    },

    /**
     * Handles /np commands
     * @param {Banchojs.PrivateMessage} msg 
     */
    async ACTION(msg)
    {
        let begin = msg.message.indexOf("/b/");
        let end = msg.message.indexOf(' ', begin);
        let bid = msg.message.substring(begin + 3, end);
        Logger.log(`bid: ${bid}`);
        begin = msg.message.indexOf("]] +");
        let mods = 0;
        if (begin > 0)
        {
            // Get the mods part of the string
            let modstr = msg.message.substr(begin);
            let modarr = [];
            for (let i = 0;
                    (i = modstr.indexOf('+')) > -1;
                    modstr = modstr.substr(i + 1))
                modarr.push(modstr.slice(i + 1, modstr.indexOf(' ', i)));
            Logger.inspect(modarr);
            modarr.forEach(mstr => {
                switch (mstr)
                {
                    case "Hidden":     mods |= helpers.MODS.HD; break;
                    case "HardRock":   mods |= helpers.MODS.HR; break;
                    case "DoubleTime": mods |= helpers.MODS.DT; break;
                    case "Easy":       mods |= helpers.MODS.EZ; break;
                    case "HalfTime":   mods |= helpers.MODS.HT; break;
                }
            });
        }
        Logger.log(`mods: ${mods}`);
        if (bid)
        {
            currentMap[msg.user.id] = { bid, mods };
            return msg.user.sendMessage(`Set map to ${bid} +${helpers.modString(mods)}`);
        }
    },

    /**
     * Checks the previously selected map with given mods,
     * and saves those mods as currently selected
     * @param {Banchojs.PrivateMessage} msg 
     */
    async check(msg)
    {
        let uid = msg.user.id;
        // Get their current map
        if (!currentMap[uid])
            return msg.user.sendMessage("No recent map found, please use /np to add one");
        
        // Get the new mods that they want
        let args = msg.message.split(' ');
        if (args[1])
            currentMap[uid].mods = helpers.parseMod(args[1]);
        // Check the map
        let map = currentMap[uid];
        let result = await Command.checkMap(map.bid, { mods: map.mods, osuid: msg.user.id });
        return msg.user.sendMessage(`[https://osu.ppy.sh/b/${map.bid} ${helpers.mapString(result.beatmap)}] +${helpers.modString(map.mods)}: ${result.message}`);
    },

    /**
     * Adds the users selected map to their pool
     * @param {Banchojs.PrivateMessage} msg 
     */
    async add(msg)
    {
        let args = msg.message.split(' ');
        if (args.length > 2)
            return;
        
        let uid = msg.user.id;
        // Get the current map
        if (!currentMap[uid])
            return msg.user.sendMessage("No recent map found, please use /np to add one");
        // Update the mods if specified
        if (args[1])
            currentMap[uid].mods = helpers.parseMod(args[1]);
        // Try to add the map
        let result = await Command.addMap(currentMap[uid].bid, {
            mods: currentMap[uid].mods, osuid: uid
        });
        if (result.error)
            return msg.user.sendMessage(result.error);
        else
            return msg.user.sendMessage(`[https://osu.ppy.sh/b/${result.map.id} ${helpers.mapString(result.map)}] +${helpers.modString(result.map.mod)}` +
                ` added to ${result.map.pool.toUpperCase()} pool`);
    }
}
const comnames = Object.keys(commands);
//#region Aliases
commands.with = commands.check;
//#endregion
//#region 
//#region Help Messages
commands.help.help = "Shows a list of available commands";
commands.ACTION.help = "u sneaky :3";
commands.with.help = "Use !check <mods> where mods is some combination of NM|HD|HR|DT|EZ|HT. Alias: !with";
commands.add.help = "Use !add [mods] where mods is some combination of NM|HD|HR|DT|EZ|HT, " +
    "if left out it will use the last mods from !check or /np";
//#endregion

module.exports = commands;