const Discord = require('discord.js');
const helpers = require('./helpers');
const Command = require('./commands');
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
    //#region ============================== Public ==============================
    /**
     * Shows available commands
     * @param {Discord.Message} msg 
     */
    async help(msg)
    {
        let sorted = {
            public: [],
            player: [],
            approver: [],
            admin: []
        }
        comnames.forEach(name => sorted[commands[name].permissions || 'public'].push(name));
        msg.channel.send(
            Object.keys(sorted).reduce((prev, key) => {
                return `${prev}\nAvailable **${key}** commands:\n` +
                    sorted[key].reduce((p, c) => `${p}, !${c}`, '').slice(2);
            }, '')
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

        let result = await Command.checkMap(args[0], {
            mods: mods,
            division: args[2],
            discordid: msg.author.id
        });
        return msg.channel.send(result.message);
    },

    /**
     * Shows the requirements for the current week
     * @param {Discord.Message} msg 
     */
    async requirements(msg)
    {
        
        const minStar = process.env.MIN_STAR;   // Minimum star rating
        const maxStar = process.env.MAX_STAR;   // Maximum star rating
        const lowMin = process.env.FIFT_MIN;
        const lowMax = process.env.FIFT_MAX;
        const minLength = parseInt(process.env.MIN_LENGTH); // Minimum drain time
        const maxLength = parseInt(process.env.MAX_LENGTH); // Maximum drain time
        const absoluteMax = parseInt(process.env.ABSOLUTE_MAX); // Maximum length limit
        const minTotal = parseInt(process.env.MIN_TOTAL);       // Pool drain limit, per map
        const maxTotal = parseInt(process.env.MAX_TOTAL);       // Pool drain limit, per map
        const poolCount = 10; // 10 maps per pool
        let minPool = minTotal * poolCount;
        let maxPool = maxTotal * poolCount;
        const leaderboard = parseInt(process.env.LEADERBOARD);      // How many leaderboard scores are required for auto-approval

        return msg.channel.send("Requirements for this week:\n" +
            `Star rating:\n` +
            `    Open: ${minStar} - ${maxStar}\n` +
            `    15K: ${lowMin} - ${lowMax}\n` +
            `Drain length: ${checker.convertSeconds(minLength)}` +
            ` - ${checker.convertSeconds(maxLength)}\n` +
            `   Total length must be less than ${checker.convertSeconds(absoluteMax)}\n` +
            `Total pool drain time must be ${checker.convertSeconds(minPool)}` +
            ` - ${checker.convertSeconds(maxPool)}\n\n` +
            `Maps with less than ${leaderboard} scores with the selected ` +
            `mod on the leaderboard will need to be submitted with a ` +
            `screenshot of one of the players on your team passing the map.\n` +
            `Maps without a leaderboard will always need a screenshot.`);
    },

    /**
     * Gets a list of teams/players
     * @param {Discord.Message} msg 
     */
    async players(msg)
    {
        let args = getArgs(msg.content);
        let div;
        if (args[1])
            div = args[1].toLowerCase();
        // If args is too long ignore it
        if (args.length > 2 || (div && div !== "open" && div !== "15k"))
            return;
        
        let result = await Command.getTeamPlayers();

        if (div === "open")
            return msg.channel.send(`**Open division:**${result.openstr}\`\`\``);
        else if (div === "15k")
            return msg.channel.send(`**15k division:**${result.fiftstr}\`\`\``);
        else
            return Promise.all([
                msg.channel.send(`**Open division:**${result.openstr}\`\`\``),
                msg.channel.send(`**15k division:**${result.fiftstr}\`\`\``)
            ]);
    },
    //#endregion
    //#region ============================== Player ==============================
    /**
     * Updates own osu username or the pinged user's
     * @param {Discord.Message} msg 
     */
    async osuname(msg)
    {
        let args = getArgs(msg.content);
        let discordid;
        if (args.length === 2)
        {
            let matches = args[1].match(/[0-9]+/);
            if (!matches)
                return console.log("Discord id not recognised. Exiting silently");
            discordid = matches.pop();
        }
        else if (args.length === 1)
            discordid = msg.author.id;
        
        if (discordid)
            return msg.channel.send(await Command.updatePlayerName(discordid));
    },

    /**
     * @param {Discord.Message} msg
     */
    async add(msg, client)
    {

    }
    //#endregion
    //#region ============================== Admin ==============================
    //#endregion
}
const comnames = Object.keys(commands);
//#region Command permissions

//#endregion
//#region Aliases
commands.commands = commands.help;
commands.checkmap = commands.check;
commands.map = commands.check;
commands.req = commands.requirements;
commands.teams = commands.players;
//#endregion
//#region Help messages
// ============================== Public ==============================
commands.help.help = "Shows a list of available commands";
commands.check.help = "Usage: !check <map> [mod] [division]\n" +
    "Map: Should be a link or map id\n" +
    "(Optional) Mod: Should be some combination of HD|HR|DT|HT|EZ. Default is NoMod\n" +
    "(Optional) Division: Open or 15k. If left out will try to find which team you're " +
    "on, or use open division if it can't." +
    "Aliases: !map, !checkmap";
commands.requirements.help = "Usage: !requirements\n" +
    "Displays the star rating and length requirements for " +
    "the current week\n" +
    "Aliases: !req"
commands.players.help = "Usage: !teams [open|15k]\n" +
    "Optionally limit to a division by specifying 'open' or '15k'\n" +
    "Shows the currently registered teams and players on those teams\n" +
    "Aliases: !players"
// ============================== Player ==============================
commands.osuname.help = "Usage: !osuname\n" +
    "Updates your osu username if you've changed it";
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
    "remove it first before adding another one.\n"// +
    //"If you make a mistake you can use `!undo` within 10 seconds to " +
    //"return your maps to how they were before.";
commands.add.osuhelp = "Use !add [mods] where mods is a combination of NM|HD|HR|DT|EZ|HT|CM, using the last map from /np";
//#endregion
/**
 * Runs a command by name, and checks whether the
 * command is allowed to be run by the caller
 * @param {string} comname Which command to run
 * @param {Discord.Message} msg 
 * @param {Discord.Client} client 
 */
async function run(comname, msg, client)
{
    const APPROVER = process.env.ROLE_MAP_APPROVER;
    const ADMIN = process.env.ROLE_ADMIN;
    let com = commands[comname];
    if (com.permissions === "approver" && !msg.member.roles.has(APPROVER))
        return msg.channel.send("This command is only available in the server to Map Approvers");
    else if (com.permissions === "admin" && !msg.member.roles.has(ADMIN))
        return msg.channel.send("This command is only available in the server to Admins");
    else
        return com(msg, client);
}

module.exports = {
    commands,
    run
};