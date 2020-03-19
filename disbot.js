/*
This will be the main entry point.
Connection to discord should be handled here. Commands should be handled with
the 'commands' module, but those methods will be called from here.
*/
const Discord = require('discord.js');
const commands = require('./commands');
const util = require('util');
const client = new Discord.Client();

const ADMIN = process.env.ROLE_ADMIN;
const APPROVER = process.env.ROLE_MAP_APPROVER;
/** @type {Discord.TextChannel} */
var passChannel;
/** @type {Discord.Collection<string, Discord.GuildMember>} */
var userlist;

/**
 * Makes sure the sender is a map approver before executing the command
 * @param {Discord.Message} msg 
 * @param {function(Discord.Message) =>
 * Promise<Discord.Message|Discord.Message[]>} command 
 */
async function approverCommand(msg, command, ...args)
{
    let member = msg.member;
    if (!member || !member.roles.has(APPROVER))
        return msg.channel.send("This command is only available in the server to Map Approvers");
    else if (args.length > 0)
        return command(msg, ...args);
    else
        return command(msg);
}
/**
 * Makes sure the sender is an admin before executing the command
 * @param {Discord.Message} msg 
 * @param {function(Discord.Message) =>
 * Promise<Discord.Message|Discord.Message[]>} command 
 */
async function adminCommand(msg, command, ...args)
{
    let member = msg.member;
    if (!member || !member.roles.has(ADMIN))
        return msg.channel.send("This command is only available to admins");
    else if (args.length > 0)
        return command(msg, ...args);
    else
        return command(msg);
}

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

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    let guild = client.guilds.get(process.env.DISCORD_GUILD);
    passChannel = guild.channels.get(process.env.CHANNEL_SCREENSHOTS);
    userlist = guild.members;
});

client.on('message', msg => {
    if (msg.author.bot || msg.content[0] != '!')
        return;
    console.log(`\x1b[36mReceived message:\x1b[0m ${msg.content}`);
    let response;
    if (msg.content === '!ping') msg.reply('Pong!');
    else if (msg.content === '!commands'
            || msg.content === '!help')
        response = commands.commands(msg);
    else if (msg.content.startsWith('!check ')
            || msg.content.startsWith('!map '))
        response = commands.checkMap(msg, getArgs(msg.content));
    else if (msg.content.startsWith('!requirements')
            || msg.content.startsWith('!req'))
        response = commands.viewRequirements(msg, getArgs(msg.content));
    else if (msg.content.startsWith('!teams')
            || msg.content.startsWith('!players'))
        response = commands.viewTeamPlayers(msg, getArgs(msg.content));
    else if (msg.content.startsWith("!osuname"))
        response = commands.updatePlayerName(msg, getArgs(msg.content));
    // Team/player management
    else if (msg.content.startsWith('!addteam '))
        response = adminCommand(msg, commands.addTeam);
    else if (msg.content.startsWith('!addplayer ')
            || msg.content.startsWith('!ap '))
        response = adminCommand(msg, commands.addPlayer, getArgs(msg.content));
    else if (msg.content.startsWith('!removeplayer ')
            || msg.content.startsWith('!rp '))
        response = adminCommand(msg, commands.removePlayer, getArgs(msg.content));
    else if (msg.content.startsWith('!moveplayer ')
            || msg.content.startsWith('!mp '))
        response = adminCommand(msg, commands.movePlayer, getArgs(msg.content));
    else if (msg.content.startsWith('!notif'))
        response = commands.toggleNotif(msg);
    // Map management
    else if (msg.content.startsWith('!addmap ')
            || msg.content.startsWith('!add '))
        response = commands.addMap(msg, passChannel, getArgs(msg.content));
    else if (msg.content.startsWith('!removemap ')
            || msg.content.startsWith('!remove ')
            || msg.content.startsWith('!rem '))
        response = commands.removeMap(msg, getArgs(msg.content));
    else if (msg.content.startsWith('!viewpool')
            || msg.content.startsWith('!view')
            || msg.content.startsWith('!list'))
        response = commands.viewPool(msg, getArgs(msg.content));
    else if (msg.content.startsWith('!addpass ')
            || msg.content.startsWith('!pass '))
        response = commands.addPass(msg, passChannel, getArgs(msg.content));
    // Map approvers
    else if (msg.content.startsWith("!pending"))
        response = approverCommand(msg, commands.viewPending, getArgs(msg.content));
    else if (msg.content.startsWith("!ssrequired"))
        response = approverCommand(msg, commands.viewNoScreenshot, getArgs(msg.content));
    else if (msg.content.startsWith("!missing"))
        response = approverCommand(msg, commands.viewMissingMaps);
    else if (msg.content.startsWith('!approve ')
            || msg.content.startsWith('!accept '))
        response = approverCommand(msg, commands.approveMap, getArgs(msg.content));
    else if (msg.content.startsWith('!reject '))
        response = approverCommand(msg, commands.rejectMap,
            userlist, getArgs(msg.content));
    else if (msg.content.startsWith('!clearss ')
            || msg.content.startsWith('!unpass '))
        response = approverCommand(msg, commands.rejectScreenshot,
            userlist, getArgs(msg.content));
    // General admin
    else if (msg.content === "!lock")
        response = adminCommand(msg, commands.lockSubmissions);
    else if (msg.content === "!export")
        response = adminCommand(msg, commands.exportMaps);
    else if (msg.content === "!updateMaps" ||
                msg.content === "!update")
        response = adminCommand(msg, commands.recheckMaps);
    
    if (response)
        response.catch(reason => {
            msg.channel.send("Malikil did a stupid, and so the bot broke. " +
            "Please tell him what you were trying to do and send him this:\n" +
            "```" + util.inspect(reason).slice(0, 1000) + "```");
    });
});

client.login(process.env.DISCORD_TOKEN);

//module.exports = client;
