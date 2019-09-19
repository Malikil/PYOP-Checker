/*
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

    if (msg.content === '!ping')
        msg.reply('Pong!');
    else if (msg.content.startsWith('!check'))
        commands.checkMap(msg);
    else if (msg.content === '!list')
        commands.listDb(msg);
});

client.login(process.env.DISCORD_TOKEN)
.then(val => console.log(val));

module.exports = client;
