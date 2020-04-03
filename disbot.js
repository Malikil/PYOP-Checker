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

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('message', msg => {
    if (msg.author.bot || msg.content[0] !== '!')
        return;
    if (msg.content === "!ping")
        return msg.reply("Pong!");

    console.log(`\x1b[36mReceived message:\x1b[0m ${msg.content}`);
    let commandNames = Object.keys(commands.commands);
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

