const Discord = require('discord.js');
const helpers = require('./helpers/helpers');
const Command = require('./commands');
const { inspect } = require('util');
const divInfo = require('./divisions.json');

//#region Helper functions
/**
 * Will ask for confirmation in the channel of a received message,
 * from the user who sent that message
 * @param {Discord.Message} msg 
 * @param {string} prompt
 */
async function getConfirmation(msg, prompt = undefined, accept = ['y', 'yes'], reject = ['n', 'no'])
{
    // Prepare the accept/reject values
    let waitFor = accept.concat(reject);
    let waitForStr = waitFor.reduce((p, v) => p + `/${v}`, "").slice(1);
    if (prompt)
        await msg.channel.send(`${prompt} (${waitForStr})`);
    let err = "";
    let aborted = await msg.channel.awaitMessages(
        message => message.author.equals(msg.author)
            && waitFor.includes(message.content.toLowerCase()),
        { maxMatches: 1, time: 10000, errors: ['time'] }
    ).then(results => {
        console.log(results);
        let response = results.first();
        return reject.includes(response.content.toLowerCase());
    }).catch(reason => {
        console.log("Response timer expired");
        err = "Timed out. ";
        return true;
    });
    console.log(`Aborted? ${aborted}`);
    return {
        aborted,
        err
    };
}
//#endregion

const commands = {
    //#region ============================== Public ==============================
    /**
     * Shows available commands
     * @param {Discord.Message} msg 
     */
    async help(msg)
    {
        console.log("Showing help");
        let sorted = {
            public: [],
            player: [],
            approver: [],
            admin: []
        }
        comnames.forEach(name => sorted[commands[name].permissions || 'public'].push(name));
        if (msg.member) // Only check roles if this came from the server
        {
            var approver = msg.member.roles.has(process.env.ROLE_MAP_APPROVER);
            var admin = msg.member.roles.has(process.env.ROLE_ADMIN);
        }
        msg.channel.send(
            Object.keys(sorted).reduce((prev, key) => {
                if ((!approver && key === 'approver')
                        || (!admin && key === 'admin'))
                    return prev;
                return `${prev}\nAvailable **${key}** commands:\n` +
                    sorted[key].reduce((p, c) => `${p}, !${c}`, '').slice(2);
            }, '') +
            "\n\nUse ? after a command to get more information about it, eg `!check ?`"
        );
    },

    /**
     * Checks whether a given map would be valid,
     * without actually adding the map to any pools
     * @param {Discord.Message} msg
     * @param {string[]} args
     */
    async check(msg, args)
    {
        // args order should be map, mod?, division?
        if (args.length < 1 || args.length > 3)
            return;
        // Convert mods into a number
        let mods = 0;
        if (args[1])
            mods = helpers.parseMod(args[1]);
        // Extract the map id from the first arg
        let mapid = helpers.parseMapId(args[0]);

        let result = await Command.checkMap(mapid, mods, args[2], msg.author.id);
        console.log("Result of checkMap command:");
        console.log(result);
        if (result.message)
            return msg.channel.send(`${result.division} division: ${result.message}`);
        else if (result.passed)
            return msg.channel.send("This map could be automatically approved");
        else if (result.error)
            throw result.error;
        else
            return msg.channel.send("This map would need to be manually checked");
    },

    /**
     * Shows the requirements for the current week
     * @param {Discord.Message} msg 
     */
    async requirements(msg)
    {
        const minTotal = parseInt(process.env.MIN_TOTAL);       // Pool drain limit, per map
        const maxTotal = parseInt(process.env.MAX_TOTAL);       // Pool drain limit, per map
        const poolCount = 10; // 10 maps per pool
        let minPool = minTotal * poolCount;
        let maxPool = maxTotal * poolCount;
        // Cheating a little here, I assume all divisions are the same as the default division
        let defaultDiv = divInfo[0];
        let drains = helpers.currentWeek(defaultDiv.drainlimits);
        let maxLength = helpers.currentWeek(defaultDiv.lengthlimits).high;

        return msg.channel.send("Requirements for this week:\n" +
            "Star rating:\n" + divInfo.reduce((p, c) => {
                let sr = helpers.currentWeek(c.starlimits);
                return p + `    ${c.division}: ${sr.low.toFixed(2)} - ${sr.high.toFixed(2)}\n`
            }, '') +
            `Drain length: ${helpers.convertSeconds(drains.low)}` +
            ` - ${helpers.convertSeconds(drains.high)}\n` +
            `Total length must be less than ${helpers.convertSeconds(maxLength)}\n` +
            `Total pool drain time must be ${helpers.convertSeconds(minPool)}` +
            ` - ${helpers.convertSeconds(maxPool)}\n\n` +
            `Maps with less than a certain number of scores with the selected ` +
            `mod on the leaderboard will need to be submitted with a ` +
            `screenshot of a pass on the map. ` +
            `Maps without a leaderboard will always need a screenshot.\n` +
            `Auto accepted leaderboard scores:` + divInfo.reduce((p, c) => {
                let minLeaders = helpers.currentWeek(c.leaderboardlimits).low;
                return p + `\n    ${c.division}: ${minLeaders}`;
            }, '')
        );
    },

    /**
     * Allows a player to register in the tournament through discord
     * @param {Discord.Message} msg 
     * @param {string[]} args 
     */
    async register(msg, args) {
        // Args: division, osu profile, utc time, @p2, p2 profile, p2 utc, @p3, p3 profile, p3 utc, ...team name
        if (args.length === 0)
            return msg.channel.send(commands.register.help);
        else if (args.length < 7)
            return msg.channel.send("Not enough arguments");
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
    //#region ============================== Player ==============================
    /**
     * Updates own osu username or the pinged user's
     * @param {Discord.Message} msg 
     */
    async osuname(msg, args)
    {
        let discordid;
        if (args.length === 1)
        {
            let matches = args[0].match(/[0-9]+/);
            if (!matches)
                return console.log("Discord id not recognised. Exiting silently");
            discordid = matches.pop();
        }
        else if (args.length === 0)
            discordid = msg.author.id;
        
        if (discordid)
            return msg.channel.send(await Command.updatePlayerName(discordid));
    },

    /**
     * Toggles notifications on or off
     * @param {Discord.Message} msg 
     * @param {string[]} args
     */
    async notif(msg, args)
    {
        if (args[0] === '??')
        {
            let status = await Command.toggleNotif(msg.author.id, false);
            if (status === undefined)
                return msg.channel.send("Couldn't find player");
            else
                return msg.channel.send(`Notifications currently set to: ${!!status}`);
        }
        else if (args.length === 0)
        {
            let status = await Command.toggleNotif(msg.author.id);
            if (status === undefined)
                return msg.channel.send("Couldn't update your notification status");
            else
                return msg.channel.send(`Toggled notifications to: ${!!status}`);
        }
    },

    /**
     * Adds a map to the player's pool
     * @param {Discord.Message} msg
     * @param {string[]} args
     */
    async add(msg, args)
    {
        // Ignore commands with too many args
        if (args.length < 1 || args.length > 2)
            return;
        let mapid = helpers.parseMapId(args[0]);
        if (!mapid)
            return msg.channel.send("Couldn't recognise beatmap id");
        let mods = helpers.parseMod(args[1]);
        let cm = false;
        if (args[1])
            cm = args[1].toUpperCase().includes("CM");
        let result = await Command.addMap(mapid, mods, cm, msg.author.id);
        console.log("Result of addMap command:");
        console.log(result);
        // Show the results of adding the map
        if (result.added)
            return msg.channel.send((result.replaced ? `Replaced ${helpers.mapString(result.replaced)} (${result.replaced.bid})\n` : "") +
                `Added ${helpers.mapString(result.beatmap)} to ${result.beatmap.pool.toUpperCase()} mod pool.\n` +
                `Map approval status: ${result.beatmap.status}\n` +
                `Current __${helpers.modString(result.beatmap.mods)}__ maps:` +
                result.current.reduce((str, map) =>
                    `${str}\n${helpers.mapString(map)} ${map.pool === "cm" ? "CM" : ""}`
                , '')
            );
        else if (result.result.passed)
            return msg.channel.send(
                `Couldn't add ${result.beatmap ? helpers.mapString(result.beatmap) : "unknown beatmap"}\n` +
                `Message: ${result.result.message}`
            );
        else
            return msg.channel.send(
                `Rejected ${helpers.mapString(result.beatmap)}:\n` +
                `Message: ${result.result.message}`
            );
    },

    /**
     * Adds multiple maps to the player's pool
     * @param {Discord.Message} msg 
     */
    async addbulk(msg)
    {
        // Skip over the !addbulk command and split into lines
        let lines = msg.content.substr("!addbulk ".length).split('\n');
        console.log(lines);
        let maps = lines.reduce((arr, line) => {
            let lineargs = line.split(' ');
            // try to get mapid and mods
            let mapid = helpers.parseMapId(lineargs[0]);
            let mods, cm;
            if (mapid)
            {
                mods = helpers.parseMod(lineargs[1]);
                cm = (lineargs[1] || '').toUpperCase().includes("CM");
            }
            else
            {
                mapid = helpers.parseMapId(lineargs[1]);
                mods = helpers.parseMod(lineargs[0]);
                cm = (lineargs[0] || '').toUpperCase().includes("CM");
            }
            if (mapid)
                arr.push({
                    mapid, mods, cm
                });
            return arr;
        }, []);
        let result = await Command.addBulk(maps, msg.author.id);
        if (result.error)
            return msg.channel.send(result.error);
        else
            return msg.channel.send(`Added ${result.added} maps`);
    },

    /**
     * Removes a map from the player's pool
     * @param {Discord.Message} msg 
     * @param {string[]} args 
     */
    async remove(msg, args)
    {
        // args should be mapid/all, mod
        if (args.length < 1 || args.length > 2)
            return;
        // Special case for removing all maps
        if (args[0].toLowerCase() === "all" && args.length === 1)
        {
            let conf = await getConfirmation(msg,
                "This will remove __ALL__ maps from your pool, there is no undo. Are you sure?");
            if (conf.aborted)
                return msg.channel.send(conf.err + "Maps not removed");
            else
            {
                // Remove all maps and return
                let result = await Command.removeMap('all', {
                    discordid: msg.author.id
                });
                if (result.error)
                    return msg.channel.send(result.error);
                else if (result.removed.length > 0)
                    return msg.channel.send(`Removed ${result.removed.length} maps`);
                else
                    return msg.channel.send("No maps to remove.");
            }
        }
        // Get the map id
        let mapid = helpers.parseMapId(args[0]);
        if (!mapid)
            return msg.channel.send("Couldn't recognise the beatmap id");

        // Get the mod pool and mods
        let mods;
        let modpool;
        if (args.length > 1)
        {
            args[1] = args[1].toUpperCase();
            // If CM is present, regardless of other mods
            if (args[1].includes("CM"))
                modpool = "cm";
            // Only if other mods are present
            if (args[1] !== "CM")
                mods = helpers.parseMod(args[1]);
        }

        let result = await Command.removeMap(mapid, {
            mods,
            cm: modpool === 'cm',
            discordid: msg.author.id
        });
        if (result.error)
            return msg.channel.send(result.error);
        else if (result.removed.length === 0)
            return msg.channel.send("Map not found");
        else
        {
            let map = result.removed[0];
            return msg.channel.send(`Removed ${helpers.mapString(map)}${
                map.pool === "cm"
                ? ` +${helpers.modString(map.mods)}`
                : ""
            } from ${map.pool.toUpperCase()} pool`);
        }
    },

    /**
     * Views current maps in the team's pool
     * @param {Discord.Message} msg 
     * @param {string[]} args
     */
    async viewpool(msg, args)
    {
        if (args.length > 1)
            return;
        
        // Split the first argument into modpools
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

        // Get the pool
        let result = await Command.viewPool(msg.author.id, mods);
        if (result.error)
            return msg.channel.send(result.error);
        else
            return msg.channel.send(result.poolstr);
    },

    /**
     * Adds a pass
     * @param {Discord.Message} msg 
     * @param {string[]} args 
     * @param {Discord.Client} client
     */
    async addpass(msg, args, client)
    {
        // 2 because some people are including the mod, I'll let them include it,
        // but if they include more I'll ignore the command
        if (args.length > 2)
            return;

        // Make sure there's something to update with
        if (msg.attachments.size == 0 && (args.length === 1 || !args[1].includes("http")))
            return msg.channel.send("Please include a link or image attachment");
        // Get the beatmap id
        let mapid = helpers.parseMapId(args[0]);
        if (!mapid)
            return msg.channel.send(`Couldn't recognise beatmap id`);

        // Forward the screenshot to the proper channel
        const passChannel = client.channels.get(process.env.CHANNEL_SCREENSHOTS);
        let passReference;
        if (passChannel && passChannel.type === "text")
        {
            // Always include the attachment if there is one
            if (msg.attachments.size > 0)
            {
                let attach = msg.attachments.first();
                let attachment = new Discord.Attachment(attach.url, attach.filename);
                passReference = await passChannel.send(`Screenshot for https://osu.ppy.sh/b/${mapid} from ${result.player}`,
                    attachment);
            }
            else
                // Copy the link/image to the screenshots channel
                passReference = await passChannel.send(`Screenshot for https://osu.ppy.sh/b/${mapid} from ${result.player}\n` +
                    args[1]);
        }
        else
            return msg.channel.send("Couldn't find screenshots channel. " +
                `Found ${passChannel} instead.\n` +
                "This is not a good thing, please tell Malikil.");

        // Attempt to update the map status
        let result = await Command.addPass(mapid, msg.author.id, passReference.url);
        if (result.error)
            return msg.channel.send(result.error);

        // Screenshot should be updated by this point
        if (result.added)
            return msg.channel.send("Screenshot added");
        else
            return msg.channel.send("Screenshot updated");
    },
    //#endregion
    //#region ============================== Approver ==============================
    /**
     * Manually add a map to someone's pool, used if the star rating/drain
     * time is being a big pain
     * @param {Discord.Message} msg 
     * @param {string[]} args 
     */
    async manualadd(msg, args) {
        // Args: userid, map, [mods]
        if (args.length > 3 || args.length < 2)
            return;
        let matches = args[0].match(/[0-9]+/);
        let playerid = args[0];
        if (matches)
            playerid = matches.pop();
        let mapid = helpers.parseMapId(args[1]);
        let mods = helpers.parseMod(args[2] || 'NM');
        let cm = (args[2] || '').toUpperCase().includes("CM");

        if (!mapid)
            return msg.channel.send("Couldn't find beatmap id");

        return msg.channel.send(await Command.manualAddMap(playerid, mapid, mods, cm));
    },
    
    /**
     * Approves a map/mod combination
     * @param {Discord.Message} msg 
     * @param {string[]} args 
     */
    async approve(msg, args)
    {
        // Args should me mapid, then mods
        if (args.length > 2)
            return;

        let mapid = helpers.parseMapId(args[0]);
        let mods = helpers.parseMod(args[1] || "NM");

        if (!mapid)
            return msg.channel.send("Couldn't find beatmap id");
        
        let result = await Command.approveMap(mapid, mods);
        return msg.channel.send(`Approved maps for ${result} teams`);
    },

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
     * Views all currently pending maps
     * @param {Discord.Message} msg 
     * @param {string[]} args
     */
    async pending(msg, args)
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

        let maps = await Command.viewPending(mods);
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
            str = "No pending maps";
        return msg.channel.send(str);
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
    //#region ============================== Admin ==============================

    /**
     * Updates teams each week.  
     * 
     * Export maps
     * Move maps to 'old pools'
     * @param {Discord.Message} msg
     * @param {string[]} args
     * @param {Discord.Client} client
     */
    async update(msg, args, client)
    {
        let updateCount = await Command.recheckMaps();
    }
    //#endregion
}
const comnames = Object.keys(commands);
//#region Command permissions
commands.osuname.permissions = "player";
commands.notif.permissions = "player";
commands.add.permissions = "player";
commands.addbulk.permissions = "player";
commands.remove.permissions = "player";
commands.viewpool.permissions = "player";
commands.addpass.permissions = "player";

commands.approve.permissions = "approver";
commands.pending.permissions = "approver";
commands.missing.permissions = "approver";
commands.reject.permissions = "approver";
commands.manualadd.permissions = "approver";
commands.autoapproved.permissions = "approver";

commands.update.permissions = "admin";
//#endregion
//#region Aliases
// ========== Public ==========
commands.commands = commands.help;
commands.checkmap = commands.check;
commands.map = commands.check;
commands.req = commands.requirements;
// ========== Player ==========
commands.addmap = commands.add;
commands.bulkadd = commands.addbulk;
commands.removemap = commands.remove;
commands.rem = commands.remove;
commands.view = commands.viewpool;
commands.list = commands.viewpool;
commands.pool = commands.viewpool;
commands.pass = commands.addpass;
// ========== Approver ==========
commands.accept = commands.approve;
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
    "Aliases: !req";
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
    "remove it first before adding another one. Rejected maps will be " +
    "replaced in preference to pending/accepted.\n"// +
    //"If you make a mistake you can use `!undo` within 10 seconds to " +
    //"return your maps to how they were before.";
commands.addbulk.help = "Use !addbulk, then include map id/links and mods one per line. eg:\n" +
    "    !addbulk <https://osu.ppy.sh/b/8708> NM\n    <https://osu.ppy.sh/b/8708> HD\n" +
    "    <https://osu.ppy.sh/b/75> HR\n    <https://osu.ppy.sh/b/75> DT\n";
commands.remove.help = "Usage: !remove <map> [mod]\n" +
    "map: Beatmap link or id. You can specify `all` instead to clear " +
    "all maps from your pool\n" +
    "(optional) mod: Which mod pool to remove the map from. Should be " +
    "some combination of NM|HD|HR|DT|CM. " +
    "If left blank will remove the first found copy of the map.\n" +
    "Aliases: !rem, !removemap\n\n"// +
    //"If you make a mistake you can use !undo within 10 seconds to " +
    //"return your maps to how they were before.";
commands.viewpool.help = "Usage: !viewpool [mod]\n" +
    "View maps in your pool and their statuses. " +
    "Optionally limit to a specific set of mods from NM|HD|HR|DT|CM\n" +
    "Aliases: !view, !list, !pool";
commands.addpass.help = "Usage: !addpass <map> [screenshot]\n" +
    "map: A map link or beatmap id\n" +
    "screenshot: A link to a screenshot of your pass on the map\n" +
    "You can upload your screenshot as a message attachment in discord " +
    "instead of using a link if you prefer. You still need to include " +
    "the map link/id regardless.\n" +
    "Aliases: !pass";
commands.notif.help = "Usage: !notif\n" +
    "Toggles whether the bot will DM you if one of your maps is rejected\n" +
    "Use `!notif ??` to view the current setting";
// ============================== Approver ==============================
commands.approve.help = "Usage: !approve <map> [mod]\n" +
    "Map: Map link or id to approve\n" +
    "(optional) mod: What mods are used. Should be some combination of " +
    "HD|HR|DT|HT|EZ. Default is nomod, unrecognised items are ignored.\n" +
    "Aliases: !accept";
commands.reject.help = "Usage: !reject <map> <mod> <message>\n" +
    "Map: Map link or id to reject\n" +
    "mod: What mods are used. Should be some combination of NM|CM|HD|HR|DT|HT|EZ." +
    " It is required even for nomod.\n" +
    "Message: A rejection message so the player knows why the map was rejected. " +
    "Including quotes around the message isn't required, everything after the " +
    "mod string will be captured.";
commands.pending.help = "Usage: !pending [pool]\n" +
    "Shows all maps with a pending status, " +
    "waiting to be approved.\n" +
    "(optional) pool: Only show maps from the listed modpool. NM|HD|HR|DT|CM";
commands.missing.help = "Usage: !missing\n" +
    "Shows how many map slots need to be filled for each mod " +
    "in either division.";
commands.manualadd.help = "Usage: !manualadd <player> <map> [mods]\n" +
    "Adds the map to the player's pool, bypassing map checks and automatically " +
    "approving it. This should only be used for cases such as the bot is " +
    "calculating a different star rating from what's shown in-game.";
// ============================== Admin ==============================
commands.update.help = "Updates map rejections with new star range";
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
    if (com.permissions === "approver" && !msg.member.roles.has(APPROVER))
        return msg.channel.send("This command is only available in the server to Map Approvers");
    else if (com.permissions === "admin" && !msg.member.roles.has(ADMIN))
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