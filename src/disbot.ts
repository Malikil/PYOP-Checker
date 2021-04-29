/*
This will be the main entry point.
Connection to discord should be handled here. Commands should be handled with
the 'commands' module, but those methods will be called from here.
*/
import fs = require('fs');
import { Client, Collection } from 'discord.js';
import validator = require('./validator');
import { inspect } from 'util';
import { Command } from './types/commands';
import actions from './actions';
const client = new Client();

// Load commands from files
const commands = new Collection<string, Command>();
fs.readdir('./dist/commands',
    (_, folders) => folders.forEach(folder => {
        fs.readdir(`./dist/commands/${folder}`,
            (_, files) => {
                files.filter(f => f.endsWith('.js')).forEach(file => {
                    import(`./commands/${folder}/${file}`)
                    .then(com => new com.default())
                    .then((command: Command) => commands.set(command.name, command))
                    .catch(err => console.error(err))
                });
            }
        );
    })
);

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('message', msg => {
    if (msg.author.bot || msg.content[0] !== '!')
        return;
    if (msg.content === "!ping")
        return msg.reply("Pong!");

    console.log(`\x1b[36mReceived message:\x1b[0m ${msg.content}`);

    // Handle commands
    const simpleArgs = msg.content.slice(1).split(' ');
    const commandName = simpleArgs.shift().toLowerCase();
    const command = commands.get(commandName)
        || commands.find(comm => comm.alias && comm.alias.includes(commandName));

    if (command) {
        // Verify permissions
        if (command.permissions && command.permissions.length > 0) {
            const member = msg.member;
            if (!member)
                return msg.channel.send("This command is only available in the server");
            const roles = member.roles.cache;
            if (!command.permissions.every(perm => roles.has(perm.toString())))
                return msg.channel.send("You don't have the required role to access this command");
        }
        // Validate args
        const validation = validator.validateArgs(command.args, msg.content);
        if (validation.rejected && !command.skipValidation)
            return msg.channel.send(`${validation.error || ""}\n\n${validator.usageString(command)}`);
        // Run command
        command.run(msg, validation.args)
        .catch(err => {
            console.error(err);
            msg.channel.send("Malikil did a stupid, and so the bot broke. " +
                "Please tell him what you were trying to do and send him this:\n" +
                "```" + inspect(err).slice(0, 1000) + "...```");
        });
    }
});

/*/ Set up the osu client here
new (require('./boat'))(
    process.env.BANCHO_USER,
    process.env.BANCHO_PASS
);//*/

// Log in with discord
client.login(process.env.DISCORD_TOKEN)
.catch(err => {
    console.error("Discord bot crashed");
    console.error(err);
})
.then(() => actions(client))
.catch(err => {
    console.error("Couldn't set up actions");
    console.error(err);
});
