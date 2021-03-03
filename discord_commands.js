const Discord = require('discord.js');
const helpers = require('./helpers/helpers');
const Command = require('./commands_old');
const { inspect } = require('util');
const divInfo = require('./divisions.json');

const commands = {
    //#region ============================== Public ==============================
    /**
     * Allows a player to register in the tournament through discord
     * @param {Discord.Message} msg 
     * @param {string[]} args 
     */
    async register(msg, args) {
        // Args: division, osu profile, utc time, @p2, p2 profile, p2 utc, @p3, p3 profile, p3 utc, ...team name
        if (args.length === 0)
            return msg.channel.send(commands.register.help);
        else return msg.channel.send("Registrations are closed");/*if (args.length < 7)
            return msg.channel.send("Not enough arguments");//*/
        // Verify arguments
        let division = args[0].toLowerCase();
        if (!divInfo.find(d => d.division === division))
            return msg.channel.send("Division not found");
        const parseProfile = p => {
            let items = p.split('/');
            let pid = items.pop();
            if (["osu", "taiko", "mania", "fruits"].includes(pid))
                pid = items.pop();
            let asInt = parseInt(pid);
            if (asInt)
                pid = asInt;
            else
                pid = pid.replace(/ /g, '_');
            return pid;
        }
        let players = [];
        try {
            players = [
                { // P1
                    discordid: msg.author.id,
                    osuid: parseProfile(args[1]),
                    utc: args[2]
                },
                { // P2
                    discordid: args[3].match(/[0-9]+/)[0],
                    osuid: parseProfile(args[4]),
                    utc: args[5]
                }
            ];
            // Possible player 3
            let p3id = args[6].match(/<@!?[0-9]+>/);
            if (p3id && p3id[0])
                players.push({
                    discordid: p3id[0].match(/[0-9]+/)[0],
                    osuid: parseProfile(args[7]),
                    utc: args[8]
                });
        }
        catch (err) {
            return msg.channel.send("Couldn't recognise player profiles");
        }
        // The remaining args make up the team name
        let teamName = '';
        for (let i = players.length * 3; i < args.length; i++)
            teamName += args[i] + ' ';
        teamName = teamName.trim();
        if (!teamName)
            return msg.channel.send("Couldn't register: No team name given");
        
        console.log(players);
        let result = await Command.addTeam(division, teamName, players);
        if (result.added)
            return msg.channel.send(
                `Registered **${teamName}**\n` +
                `__Captain__: ${result.players[0].osuname} <@!${result.players[0].discordid}>\n` +
                `__Players__: ${result.players.reduce((p, c) => ({osuname: `${p.osuname}, ${c.osuname}`})).osuname}`
            );
        else
            return msg.channel.send(`Could not add team: ${result.message}`);
    },
    //#endregion
    //#region ============================== Approver ==============================
    /**
     * Reject a map/mod combination, and notify players if enabled
     * @param {Discord.Message} msg
     * @param {string[]} args
     * @param {Discord.Client} client
     */
    async reject(msg, args, client)
    {
        // Need mapid, mods, and message
        if (args.length < 3)
            return;

        // Get map id
        let mapid = helpers.parseMapId(args.shift());
        if (!mapid)
            return msg.channel.send("Map id not recognised");
        // Get mod
        let mods = helpers.parseMod(args[0]);
        if (mods === 0 && args.shift().toUpperCase() !== "NM")
            return msg.channel.send("Mod not recognised");
        // Combine message back into a single string
        let message = args.reduce((p, s) => `${p} ${s}`, '').slice(1);
        if (!message)
            return msg.channel.send("Please include a reject message");
        let result = await Command.rejectMap(mapid, mods, message);
        // Get the list of players, and send them a message if they're in the server
        const guild = client.guilds.get(process.env.DISCORD_GUILD);
        let dms = result.playerNotif.map(player => {
            let member = guild.members.get(player.discordid);
            if (member)
                return member.send("A map in your pool was rejected:\n" +
                    `**__Map:__** https://osu.ppy.sh/b/${mapid} +${helpers.modString(mods)}\n` +
                    `**__Message:__** ${message}`);
        });
        dms.push(msg.channel.send(`Rejected ${mapid} +${helpers.modString(mods)} from ${result.modified} pools`));
        return Promise.all(dms);
    },

    /**
     * Views maps that got automatically approved
     * @param {Discord.Message} msg 
     * @param {string[]} args 
     */
    async autoapproved(msg, args)
    {
        if (args.length > 1)
            return;

        let mods;
        if (args[0])
        {
            let modstr = args[0].toLowerCase();
            mods = ['nm', 'hd', 'hr', 'dt', 'cm'].reduce((arr, mod) => {
                if (modstr.includes(mod))
                    arr.push(mod);
                return arr;
            }, []);
        }

        let maps = await Command.viewPending(mods, "Accepted (Automatic)");
        let str = "";
        maps.forEach(modpool => {
            str += `**__${modpool.pool.toUpperCase()}:__**\n`;
            modpool.maps.forEach(map => {
                if (str.length < 1800)
                    str += `<${helpers.mapLink(map)}> ${helpers.mapString(map)}\n`;
            });
        });
        if (str.length >= 1800)
            str += "Message too long, some maps skipped...";
        else if (str === "")
            str = "No auto approved maps";
        return msg.channel.send(str);
    },

    /**
     * Shows how many unfilled slots there are in pools
     * @param {Discord.Message} msg 
     */
    async missing(msg)
    {
        // Not much to it, just get the numbers and show them
        let count = await Command.viewMissingMaps();
        return msg.channel.send("```" + inspect(count) + "```");
    },
    //#endregion
}

//#region Command permissions
commands.approve.permissions = "approver";
commands.missing.permissions = "approver";
commands.reject.permissions = "approver";
commands.autoapproved.permissions = "approver";
//#endregion
//#region Aliases
// ========== Approver ==========
commands.accept = commands.approve;
//#endregion
//#region Help messages
// ============================== Public ==============================
commands.register.help = "Format:\n" +
    "```!register <division> <osu profile link or username> <UTC time>\n" +
    "<@ player 2> <player 2 profile/username> <player 2 UTC>\n" +
    "<@ player 3> <player 3 profile/username> <player 3 UTC> (Optional)\n" +
    "<team name>```\n" +
    "The team captain should register for the whole team, please make sure all items are in " +
    "the correct order.\n" +
    "Divisions are open or 10k.\n" +
    "You can use either the link to your osu profile or your osu username. If using username " +
    "all spaces should be replaced with underscore. Eg 'Example User Name' becomes 'Example\\_User\\_Name'\n" +
    "UTC times should be some sort of offset from utc, eg UTC-7 or just -7. If one of your players " +
    "doesn't want their time zone considered while scheduling enter a single underscore instead. Eg " +
    "`@Malikil Malikil _`\nIf you need to make changes to your team, please let Malikil know.";
// ============================== Approver ==============================
commands.reject.help = "Usage: !reject <map> <mod> <message>\n" +
    "Map: Map link or id to reject\n" +
    "mod: What mods are used. Should be some combination of NM|CM|HD|HR|DT|HT|EZ." +
    " It is required even for nomod.\n" +
    "Message: A rejection message so the player knows why the map was rejected. " +
    "Including quotes around the message isn't required, everything after the " +
    "mod string will be captured.";
commands.missing.help = "Usage: !missing\n" +
    "Shows how many map slots need to be filled for each mod " +
    "in either division.";
//#endregion

/**
 * Splits a string into args
 * @param {string} s 
 */
function getArgs(s)
{
    // Handle multiple lines
    let lines = s.split('\n');
    return lines.reduce((arr, str) => {
        let args = str.match(/\\?.|^$/g).reduce((p, c) => {
            if (c === '"')
                p.quote ^= 1;
            else if (!p.quote && c === ' ')
                p.a.push('');
            else
                p.a[p.a.length - 1] += c.replace(/\\(.)/, "$1");
            
            return  p;
        }, { a: [''] }).a;
        return arr.concat(args.reduce((p, c) => c ? p.concat(c) : p, []));
    }, []);
    //str.match(/(?:[^\s"]+|"[^"]*")+/g);
}

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
    if (com.permissions === "approver" && !msg.member.roles.cache.has(APPROVER))
        return msg.channel.send("This command is only available in the server to Map Approvers");
    else if (com.permissions === "admin" && !msg.member.roles.cache.has(ADMIN))
        return msg.channel.send("This command is only available in the server to Admins");
    else {
        let args = getArgs(msg.content).slice(1);
        console.log(`Running command ${comname} with arguments`);
        console.log(args);
        return com(msg, args, client);
    }
}

module.exports = {
    commands,
    run
};