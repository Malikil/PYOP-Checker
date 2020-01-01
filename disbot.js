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

/**
 * Makes sure the sender is a map approver before executing the command
 * @param {Discord.Message} msg 
 * @param {function(Discord.Message) =>
 * Promise<Discord.Message|Discord.Message[]>} command 
 */
async function approverCommand(msg, command)
{
    let member = msg.member;
    if (!member || !member.roles.has(APPROVER))
        return msg.channel.send("This command is only available in the server to Map Approvers");
    else
        return command(msg);
}
/**
 * Makes sure the sender is an admin before executing the command
 * @param {Discord.Message} msg 
 * @param {function(Discord.Message) =>
 * Promise<Discord.Message|Discord.Message[]>} command 
 */
async function adminCommand(msg, command)
{
    let member = msg.member;
    if (!member || !member.roles.has(ADMIN))
        return msg.channel.send("This command is only available to admins");
    else
        return command(msg);
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    let guild = client.guilds.get(process.env.DISCORD_GUILD);
    passChannel = guild.channels.get(process.env.CHANNEL_SCREENSHOTS);
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
        response = commands.checkMap(msg);
    else if (msg.content.startsWith('!requirements')
            || msg.content.startsWith('!req'))
        response = commands.viewRequirements(msg);
    else if (msg.content ==='!teams')
        response = commands.viewTeams(msg);
    else if (msg.content === '!players')
        response = commands.viewTeamPlayers(msg);
    // Team/player management
    else if (msg.content.startsWith('!addteam '))
        response = adminCommand(msg, commands.addTeam);
    else if (msg.content.startsWith('!addplayer ')
            || msg.content.startsWith('!ap '))
        response = adminCommand(msg, commands.addPlayer);
    else if (msg.content.startsWith('!removeplayer ')
            || msg.content.startsWith('!rp '))
        response = adminCommand(msg, commands.removePlayer);
    else if (msg.content.startsWith('!moveplayer ')
            || msg.content.startsWith('!mp '))
        response = adminCommand(msg, commands.movePlayer);
    // Map management
    else if (msg.content.startsWith('!addmap ')
            || msg.content.startsWith('!add '))
        response = commands.addMap(msg);
    else if (msg.content.startsWith('!removemap ')
            || msg.content.startsWith('!remove ')
            || msg.content.startsWith('!rem '))
        response = commands.removeMap(msg);
    else if (msg.content.startsWith('!viewpool')
            || msg.content.startsWith('!view')
            || msg.content.startsWith('!list'))
        response = commands.viewPool(msg);
    else if (msg.content.startsWith('!addpass ')
            || msg.content.startsWith('!pass '))
        response = commands.addPass(msg, passChannel);
    // Map approvers
    else if (msg.content === "!pending")
        response = approverCommand(msg, commands.viewPending);
    else if (msg.content.startsWith('!approve ')
            || msg.content.startsWith('!accept '))
        response = approverCommand(msg, commands.approveMap);
    else if (msg.content.startsWith('!reject '))
        response = approverCommand(msg, commands.rejectMap);
    else if (msg.content.startsWith('!clearss ')
            || msg.content.startsWith('!unpass '))
        response = approverCommand(msg, commands.rejectScreenshot);
    // General admin
    else if (msg.content === "!lock")
        response = adminCommand(msg, commands.lockSubmissions);
    else if (msg.content === "!export")
        response = adminCommand(msg, commands.exportMaps);
    else if (msg.content === "!updateMaps")
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
