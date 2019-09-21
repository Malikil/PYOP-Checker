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
    else if (msg.content === '!commands')   commands.commands(msg);
    else if (msg.content.startsWith('!check ')
            || msg.content.startsWith('!map '))
        commands.checkMap(msg);
    // Team/player management
    else if (msg.content.startsWith('!addTeam '))
        commands.addTeam(msg);
    else if (msg.content.startsWith('!addPlayer ')
            || msg.content.startsWith('!ap '))
        commands.addPlayer(msg);
    else if (msg.content.startsWith('!removePlayer ')
            || msg.content.startsWith('!rp '))
        commands.removePlayer(msg);
    else if (msg.content.startsWith('!movePlayer ')
            || msg.content.startsWith('!mp '))
        commands.movePlayer(msg);
    // Map management
});

client.login(process.env.DISCORD_TOKEN);

//module.exports = client;
