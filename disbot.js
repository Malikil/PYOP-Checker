/*
This will be the main entry point.
Connection to discord should be handled here. Commands should be handled with
the 'commands' module, but those methods will be called from here.
*/
const Discord = require('discord.js');
const commands = require('./discord_commands');
const util = require('util');
const client = new Discord.Client();
global.locked = false;

/** @type {Discord.Collection<string, Discord.GuildMember>} */
var userlist;

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    let guild = client.guilds.get(process.env.DISCORD_GUILD);
    userlist = guild.members;
});

client.on('message', msg => {
    if (msg.author.bot || msg.content[0] !== '!')
        return;
    if (msg.content === "!ping") msg.reply("Pong!");

    console.log(`\x1b[36mReceived message:\x1b[0m ${msg.content}`);
    let commandNames = Object.keys(commands);
    let commandArgs = msg.content.split(' ');
    let command = commandArgs[0].slice(1);
    if (commandNames.includes(command))
        // Check if this is a help message or not
        if (commandArgs[1] === '?')
            msg.channel.send(commands.commands[command].help)
                .catch(() => msg.channel.send("No help available"));
        else
            commands.run(command, msg, client)
                .catch(reason => msg.channel.send("Malikil did a stupid, and so the bot broke. " +
                    "Please tell him what you were trying to do and send him this:\n" +
                    "```" + util.inspect(reason).slice(0, 1000) + "...```"));
    
    /*
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
    */
});

// ============================================================================
// ======================== Set up the osu client here ========================
// ============================================================================
new (require('./boat'))(
    process.env.BANCHO_USER,
    process.env.BANCHO_PASS
);

// Log in with discord
client.login(process.env.DISCORD_TOKEN);

