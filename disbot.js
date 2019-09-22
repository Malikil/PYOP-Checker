/*
This will be the main entry point.
Connection to discord should be handled here. Commands should be handled with
the 'commands' module, but those methods will be called from here.
*/
const Discord = require('discord.js');
const commands = require('./commands');
const client = new Discord.Client();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('message', msg => {
    if (msg.author.bot || msg.content[0] != '!')
        return;
    console.log(`\x1b[36mReceived message:\x1b[0m ${msg.content}`);

    if (msg.content === '!ping')            msg.reply('Pong!');
    else if (msg.content === '!commands'
            || msg.content === '!help')
        commands.commands(msg);
    else if (msg.content.startsWith('!check ')
            || msg.content.startsWith('!map '))
        commands.checkMap(msg);
    // Team/player management
    else if (msg.content.startsWith('!addteam '))
        commands.addTeam(msg);
    else if (msg.content.startsWith('!addplayer ')
            || msg.content.startsWith('!ap '))
        commands.addPlayer(msg);
    else if (msg.content.startsWith('!removeplayer ')
            || msg.content.startsWith('!rp '))
        commands.removePlayer(msg);
    else if (msg.content.startsWith('!moveplayer ')
            || msg.content.startsWith('!mp '))
        commands.movePlayer(msg);
    // Map management
    else if (msg.content.startsWith('!addmap ')
            || msg.content.startsWith('!add '))
        commands.addMap(msg);
    else if (msg.content.startsWith('!removemap ')
            || msg.content.startsWith('!remove ')
            || msg.content.startsWith('!rem '))
        commands.removeMap(msg);
    else if (msg.content.startsWith('!viewpool')
            || msg.content.startsWith('!view'))
        commands.viewPool(msg);
});

client.login(process.env.DISCORD_TOKEN);

//module.exports = client;
