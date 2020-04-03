const Discord = require('discord.js');
const helpers = require('./helpers');
const Command = require('./commands');
const { inspect } = require('util');
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
        let approver = msg.member.roles.has(process.env.ROLE_MAP_APPROVER);
        let admin = msg.member.roles.has(process.env.ROLE_ADMIN);
        msg.channel.send(
            Object.keys(sorted).reduce((prev, key) => {
                if ((!approver && key === 'approver')
                        || (!admin && key === 'admin'))
                    return prev;
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
    async check(msg, args)
    {
        // args order should be map, mod?, division?
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
    async players(msg, args)
    {
        let div;
        if (args[0])
            div = args[0].toLowerCase();
        // If args is too long ignore it
        if (args.length > 1 || (div && div !== "open" && div !== "15k"))
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
                return msg.channel.send("Couldn't find which team you're on");
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
        // Check for locked here
        if (global.locked)
            return msg.channel.send("Submissions are currently locked. " +
                "If you're submitting a replacement for a map that was rejected " +
                "after submissions closed, please send it to Malikil directly.");
        let mapid = helpers.parseMapId(args[0]);
        if (!mapid)
            return msg.channel.send("Couldn't recognise beatmap id");
        let mods = helpers.parseMod(args[1]);
        let result = await Command.addMap(mapid, {
            mods,
            cm: args[1].toUpperCase().includes("CM"),
            discordid: msg.author.id
        });

        // Show the results of adding the map
        if (result.added)
            return msg.channel.send((result.replaced ? `Replaced ${helpers.mapString(result.replaced)}\n` : "") +
                `Added ${helpers.mapString(result.map)} to ${result.map.pool.toUpperCase()} mod pool.\n` +
                `Map approval status: ${result.map.status}\n` +
                `Current __${result.map.pool.toUpperCase()}__ maps:` +
                result.current.reduce((str, map) =>
                    `${str}\n${helpers.mapString(map)}${map.pool === "cm" ? "CM" : ""}`
                , '')
            );
        else
            return msg.channel.send(
                `Couldn't add ${result.map ? helpers.mapString(result.map) : "map"}\n` +
                `Message: ${result.error}`
            );
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
                else if (result.count > 0)
                    return msg.channel.send(`Removed ${result.count} maps`);
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
        else if (result.count === 0)
            return msg.channel.send("Map not found");
        else
        {
            let map = result.removed[0];
            return msg.channel.send(`Removed ${mapString(map)}${
                map.pool === "cm"
                ? ` +${helpers.modString(map.mod)}`
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
        // 3 because some people are including the mod, I'll let them include it,
        // but if they include more I'll ignore the command
        if (args.length > 3)
            return;

        // Make sure there's something to update with
        if (msg.attachments.size == 0 && (args.length === 1 || !args[1].includes("http")))
            return msg.channel.send("Please include a link or image attachment");
        // Get the beatmap id
        let mapid = helpers.parseMapId(args[1]);
        if (!mapid)
            return msg.channel.send(`Couldn't recognise beatmap id`);

        // Attempt to update the map status, this also gets the team name
        let result = await Command.addPass(mapid, msg.author.id);
        if (result.error)
            return msg.channel.send(result.error);
        // Forward the screenshot to the proper channel
        const passChannel = client.channels.get(process.env.CHANNEL_SCREENSHOTS);
        if (passChannel && passChannel.type === "text")
        {
            // Always include the attachment if there is one
            if (msg.attachments.size > 0)
            {
                let attach = msg.attachments.first();
                let attachment = new Discord.Attachment(attach.url, attach.filename);
                passChannel.send(`Screenshot for https://osu.ppy.sh/b/${mapid} from ${msg.author.username}; ${result.team.name}`,
                    attachment);
            }
            else
                // Copy the link/image to the screenshots channel
                passChannel.send(`Screenshot for https://osu.ppy.sh/b/${mapid} from ${team.name}\n` +
                    args[1]);
        }
        else
            return msg.channel.send("Couldn't find screenshots channel. " +
                `Found ${passChannel} instead.\n` +
                "This is not a good thing, please tell Malikil.");
        // Screenshot should be updated by this point
        return msg.channel.send("Screenshot updated");
    },
    //#endregion
    //#region ============================== Approver ==============================
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

        let pendstr = await Command.viewPending(mods);
        return msg.channel.send(pendstr);
    },

    /**
     * Clears a screenshot from a map, and notifies the team that it's happened
     * @param {Discord.Message} msg 
     * @param {string[]} args 
     * @param {Discord.Client} client 
     */
    async clearss(msg, args, client)
    {
        // Get mapid
        let mapid = helpers.parseMapId(args.shift());
        if (!mapid)
            return msg.channel.send("Didn't recognise beatmap id");
        let team = args.reduce((p, s) => `${p} ${s}`, '').slice(1);

        let result = await Command.rejectScreenshot(mapid, team);
        if (result.ok)
        {
            const guild = client.guilds.get(process.env.DISCORD_GUILD);
            let userlist = guild.members;

            // Tell players on the team that they need a new screenshot
            let dms = result.players.map(player => {
                if (player.notif === undefined)
                {
                    let member = userlist.get(player.discordid);
                    if (member)
                        return member.send("A screenshot for one of your maps was reset:\n" +
                            `https://osu.ppy.sh/b/${mapid}`);
                }
            });
            dms.push(msg.channel.send("Set status to \"Screenshot Required\""));
            return Promise.all(dms);
        }
        else
            return msg.channel.send("Team not found or no matching map");
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
     * Adds a player to a team, and creates the team if it doesn't already exist
     * @param {Discord.Message} msg 
     * @param {string[]} args
     */
    async addplayer(msg, args)
    {
        // First arg is team name
        let team = args.shift();
        // Then player osuid/discordid come in pairs
        // Starting in the second spot and using i - 1 so the last arg will be
        // ignored if there are an odd number
        let players = [];
        for (let i = 1; i < args.length; i += 2)
        {
            // Extract the number from the discord id
            let match = args[i].match(/[0-9]+/)[0];
            if (match || args[i] === '_')
                players.push({
                    osuid: args[i - 1],
                    discordid: match
                });
        }

        // If there are an odd number of args, the last one should be division
        let added;
        if (args.length % 2 === 1)
            added = await Command.addPlayer(team, players, args.pop());
        else
            added = await Command.addPlayer(team, players);
        
        return msg.channel.send(`Added ${added} players`);
    },

    /**
     * Removes a player from their team
     * @param {Discord.Message} msg 
     * @param {string[]} args 
     */
    async removeplayer(msg, args)
    {
        // Combine multiple words into one
        let osuname = args.reduce((p, c) => `${p} ${c}`, '').slice(1);
        let result = await Command.removePlayer(osuname);
        return msg.channel.send(`Removed ${osuname} from ${result} teams`);
    },

    /**
     * Moves an existing player to a different team
     * @param {Discord.Message} msg 
     * @param {string[]} args 
     */
    async moveplayer(msg, args)
    {
        if (args.length > 2)
            return;

        if ((await Command.movePlayer(args[0], args[1])) > 0)
            return msg.channel.send(`Moved ${args[0]} to ${args[1]}`);
        else
            return msg.channel.send("Couldn't move player");
    },

    /**
     * Toggles submissions locked
     * @param {Discord.Message} msg 
     */
    async lock(msg)
    {
        global.locked = !global.locked;
        return msg.channel.send(`Submissions ${global.locked ? "locked" : "unlocked"}`);
    },

    /**
     * Exports maps to google sheets
     * @param {Discord.Message} msg 
     */
    async export(msg)
    {
        let result = await Command.exportMaps();
        if (result.ok)
            return msg.channel.send("Maps exported");
        else
            return msg.channel.send(result.message);
    },

    /**
     * Updates maps with new weekly star range
     * @param {Discord.Message} msg 
     */
    async update(msg)
    {
        let updateCount = await Command.recheckMaps();
        if (updateCount)
            return msg.channel.send(`Updated ${updateCount} teams`);
        else
            return msg.channel.send("No teams updated");
    }
    //#endregion
}
const comnames = Object.keys(commands);
//#region Command permissions
commands.osuname.permissions = "player";
commands.notif.permissions = "player";
commands.add.permissions = "player";
commands.remove.permissions = "player";
commands.viewpool.permissions = "player";
commands.addpass.permissions = "player";

commands.approve.permissions = "approver";
commands.pending.permissions = "approver";
commands.missing.permissions = "approver";
commands.reject.permissions = "approver";
commands.clearss.permissions = "approver";

commands.addplayer.permissions = "admin";
commands.removeplayer.permissions = "admin";
commands.moveplayer.permissions = "admin";
commands.lock.permissions = "admin";
commands.export.permissions = "admin";
commands.update.permissions = "admin";
//#endregion
//#region Aliases
// ========== Public ==========
commands.commands = commands.help;
commands.checkmap = commands.check;
commands.map = commands.check;
commands.req = commands.requirements;
commands.teams = commands.players;
// ========== Player ==========
commands.addmap = commands.add;
commands.removemap = commands.remove;
commands.rem = commands.remove;
commands.view = commands.viewpool;
commands.list = commands.viewpool;
commands.pass = commands.addpass;
// ========== Approver ==========
commands.accept = commands.approve;
commands.unpass = commands.clearss;
// ========== Admin ==========
commands.ap = commands.addplayer;
commands.rp = commands.removeplayer;
commands.mp = commands.moveplayer;
commands.updatemaps = commands.update;
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
    "remove it first before adding another one. Rejected maps will be " +
    "replaced in preference to pending/accepted.\n"// +
    //"If you make a mistake you can use `!undo` within 10 seconds to " +
    //"return your maps to how they were before.";
commands.remove.help = "Usage: !remove <map> [mod]\n" +
    "map: Beatmap link or id. You can specify `all` instead to clear " +
    "all maps from your pool\n" +
    "(optional) mod: Which mod pool to remove the map from. Should be " +
    "some combination of NM|HD|HR|DT|CM. " +
    "If left blank will remove the first found copy of the map.\n" +
    "Aliases: !rem, !removemap\n\n"// +
    //"If you make a mistake you can use !undo within 10 seconds to " +
    //"return your maps to how they were before.";
commands.viewpool.help = "Usage: !view [mod]\n" +
    "View maps in your pool and their statuses. " +
    "Optionally limit to a specific set of mods from NM|HD|HR|DT|CM\n" +
    "Aliases: !viewpool, !list";
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
commands.clearss.help = "Usage: !clearss <map> <team>\n" +
    "Map: Map link or id to reject\n" +
    "Team: The team name\n" +
    "Aliases: !unpass";
commands.missing.help = "Usage: !missing\n" +
    "Shows how many map slots need to be filled for each mod " +
    "in either division.";
// ============================== Admin ==============================
commands.addplayer.help = "Adds a player to a team. If the team " +
    "doesn't already exist it is created.\n" +
    "!addPlayer \"Team Name\" (<osu name/id> <discordid/@/_>)...";
commands.removeplayer.help = "Removes a player from all teams they might be on.\n" +
    "!removePlayer osuname";
commands.moveplayer.help = "Moves an existing player to a different team.\n" +
    "!movePlayer <player> <TeamName>";
commands.update.help = "Updates map rejections with new star range";
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
    console.log(`Running command ${comname}`);
    const APPROVER = process.env.ROLE_MAP_APPROVER;
    const ADMIN = process.env.ROLE_ADMIN;
    let com = commands[comname];
    if (com.permissions === "approver" && !msg.member.roles.has(APPROVER))
        return msg.channel.send("This command is only available in the server to Map Approvers");
    else if (com.permissions === "admin" && !msg.member.roles.has(ADMIN))
        return msg.channel.send("This command is only available in the server to Admins");
    else
        return com(msg, getArgs(msg.content).slice(1), client);
}

module.exports = {
    commands,
    run
};