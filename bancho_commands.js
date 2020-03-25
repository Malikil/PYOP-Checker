const command = require('./commands');
const Banchojs = require('bancho.js');

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
            Object.keys(commands).reduce((p, c) => `${p}, ${c === "ACTION" ? "/np" : `!${c}`}`, "").slice(2)
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
            let result = await command.checkMap(bid, { mods, osuid: msg.user.id });
            return message.user.sendMessage(result.message);
        }
    }
}
//#region Aliases
//#endregion
//#region 
//#region Help Messages
commands.help.help = "Shows a list of available commands";
commands.ACTION.help = "U sneaky :3";
//#endregion

module.exports = commands;