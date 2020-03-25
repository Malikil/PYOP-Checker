const Discord = require('discord.js');
const helpers = require('./helpers');
const command = require('./commands');
/**
 * Splits a string into args
 * @param {string} str 
 */
function getArgs(str)
{
    return str.match(/\\?.|^$/g).reduce((p, c) => {
        if (c === '"')
            p.quote ^= 1;
        else if (!p.quote && c === ' ')
            p.a.push('');
        else
            p.a[p.a.length - 1] += c.replace(/\\(.)/, "$1");
        
        return  p;
    }, { a: [''] }).a;
    //str.match(/(?:[^\s"]+|"[^"]*")+/g);
}

const commands = {
    /**
     * Shows available commands, depending on your role and team status
     * @param {Discord.Message} msg 
     * @param {Discord.Client} client 
     */
    async help(msg, client)
    {
        msg.channel.send("Commands: " +
            comnames.reduce((p, c) => `${p}, !${c}`, "").slice(2)
        );
    },

    /**
     * Checks whether a given map would be valid,
     * without actually adding the map to any pools
     * @param {Discord.Message} msg
     */
    async check(msg)
    {
        // args order should be map, mod?, division?
        let args = getArgs(msg.content).slice(1);
        if (args.length < 1 || args.length > 3)
            return;
        // Convert mods into a number
        let mods = 0;
        if (args[1])
            mods = helpers.parseMod(args[1]);

        let result = await command.checkMap(args[0], {
            mods: mods,
            division: args[2],
            discordid: msg.author.id
        });
        return msg.channel.send(result.message);
    },

    /**
     * @param {Discord.Message} msg
     */
    async add(msg)
    {

    }
    
}
const comnames = Object.keys(commands);
//#region Aliases
commands.checkmap = commands.check;
//#endregion

//#region Help messages
commands.help.help = "Shows a list of available commands";
commands.check.help = "Usage: !check <map> [mod] [division]\n" +
    "Map: Should be a link or map id\n" +
    "(Optional) Mod: Should be some combination of HD|HR|DT|HT|EZ. Default is NoMod\n" +
    "(Optional) Division: Open or 15k. If left out will try to find which team you're " +
    "on, or use open division if it can't." +
    "Aliases: !map";
commands.check.osuhelp = "Use !add [mods] where mods is some combination of NM|HD|HR|DT|EZ|HT, " +
    "if left out it will use the last mods from !with or /np";
// ========== Add ==========
commands.add.help = "Usage: !add <map> [mod]\n" +
    "map: A map link or beatmap id\n" +
    "(optional) mod: What mods to use. Should be some combination of " +
    "CM|HD|HR|DT|HT|EZ. Default is nomod, unrecognised items are ignored. " +
    "To add the map as a custom mod, include CM.\n" +
    "You may optionally attach a screenshot to automatically use that as " +
    "your pass. It must be as an attachment, to use a separate link use " +
    "the !addpass command.\n" +
    "Aliases: !addmap\n\n" +
    "If there are already two maps in the selected mod pool, the first map " +
    "will be removed when adding a new one. To replace a specific map, " +
    "remove it first before adding another one.\n" +
    "If you make a mistake you can use `!undo` within 10 seconds to " +
    "return your maps to how they were before.";
commands.add.osuhelp = "Use !add [mods] where mods is a combination of NM|HD|HR|DT|EZ|HT|CM, using the last map from /np";

//#endregion

module.exports = commands;