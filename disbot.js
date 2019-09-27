/*
This will be the main entry point.
Connection to discord should be handled here. Commands should be handled with
the 'commands' module, but those methods will be called from here.
*/
const Discord = require('discord.js');
const commands = require('./commands');
const util = require('util');
const client = new Discord.Client();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
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
    // Team/player management
    else if (msg.content.startsWith('!addteam '))
        response = commands.addTeam(msg);
    else if (msg.content.startsWith('!addplayer ')
            || msg.content.startsWith('!ap '))
        response = commands.addPlayer(msg);
    else if (msg.content.startsWith('!removeplayer ')
            || msg.content.startsWith('!rp '))
        response = commands.removePlayer(msg);
    else if (msg.content.startsWith('!moveplayer ')
            || msg.content.startsWith('!mp '))
        response = commands.movePlayer(msg);
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
    // Map approvers
    else if (msg.content === "!pending")
        response = commands.viewPending(msg);
    else if (msg.content.startsWith('!approve '))
        response = commands.approveMap(msg);
    
    response.catch(reason => {
        msg.channel.send("Malikil did a stupid, and so the bot broke. " +
        "Please tell him what you were trying to do and send him this:\n" +
        "```" + util.inspect(reason) + "```");
    })
});

client.login(process.env.DISCORD_TOKEN);

//module.exports = client;
