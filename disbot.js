/*
This will be the main entry point.
Connection to discord should be handled here. Commands should be handled with
the 'commands' module, but those methods will be called from here.
*/
const fs = require('fs');
const Discord = require('discord.js');
const validator = require('./validator');
const util = require('util');
const client = new Discord.Client();
const { closingTimes } = require('./helpers/helpers');
const sheet = require('./gsheets');

// Load commands from files
client.commands = new Discord.Collection();
fs.readdir('./commands',
    (_, folders) => folders.forEach(folder => {
        fs.readdir(`./commands/${folder}`,
            (_, files) => {
                files.filter(f => f.endsWith('.js')).forEach(file => {
                    const command = require(`./commands/${folder}/${file}`);
                    client.commands.set(command.name, command);
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
    const command = client.commands.get(commandName)
        || client.commands.find(comm => comm.alias && comm.alias.includes(commandName));

    if (command) {
        // Verify permissions
        if (command.permissions && command.permissions.length > 0) {
            const member = msg.member;
            if (!member)
                return msg.channel.send("This command is only available in the server");
            const roles = member.roles.cache;
            if (!command.permissions.every(perm => roles.has(perm)))
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
                "```" + util.inspect(err).slice(0, 1000) + "...```");
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
.then(() => {
    // Find the next closing date
    const { lastClose, nextClose, now } = closingTimes();
    
    const timeDiff = (ms) => `${(ms / (1000 * 60 * 60)).toFixed(2)} hours`; // Debug
    // Set announcement timers
    const closeTimer = nextClose - now;
    console.log(`Pools closing in ${timeDiff(closeTimer)}`);
    // Warn of pools 6 hours earlier
    const warnTimer = closeTimer - (1000 * 60 * 60 * 6);
    console.log(`Warning of pool closure in ${timeDiff(warnTimer)}`);
    // Export maps 2 hours later
    let exportTimer = closeTimer + (1000 * 60 * 60 * 2);
    console.log(`Exporting maps in ${timeDiff(exportTimer)}`);
    // If the export hasn't happened yet, we need to update this value
    console.log(`Last pools closed ${timeDiff(now - lastClose)} ago`);
    if ((now - lastClose) < (1000 * 60 * 60 * 2))
        exportTimer -= (1000 * 60 * 60 * 24 * 7);
    console.log(`Exporting maps in ${timeDiff(exportTimer)}`);
    
    // Set up timers
    if (warnTimer > 0)
        setTimeout(() => {
            console.log("\x1b[33mPools:\x1b[0m Warning of pool closure");
            const guild = client.guilds.cache.get(process.env.DISCORD_GUILD);
            const announceChannel = guild.channels.cache.get(process.env.CHANNEL_ANNOUNCEMENTS);
            const playerRole = guild.roles.cache.get(process.env.ROLE_PLAYER);
            const announcement = `${playerRole} Pools will be closing in 6 hours. Make sure to submit ` +
                `your pools if you haven't done so already. Also don't forget to submit screenshots ` +
                `for any unranked maps or maps without enough scores on the leaderboard.\nIf some of ` +
                `your maps needed screenshots of passes and you didn't submit passes from two ` +
                `different players, there is no guarantee that we will include them in your final pool.`;
            if (announceChannel)
                announceChannel.send(announcement);
            else
                console.error("Announcement channel not found");
        }, warnTimer);
    if (closeTimer > 0)
        setTimeout(() => {
            console.log("\x1b[33mPools:\x1b[0m Closing pools");
            const guild = client.guilds.cache.get(process.env.DISCORD_GUILD);
            const announceChannel = guild.channels.cache.get(process.env.CHANNEL_ANNOUNCEMENTS);
            //const playerRole = guild.roles.cache.get(process.env.ROLE_PLAYER);
            const announcement = `Pools are now closed! You can still submit passes ` +
                `through the bot for another hour, but current maps are locked. If a map gets rejected ` +
                `you will still have the opportunity to replace it. If a map that needed screenshots ` +
                `gets rejected we'll just replace it, you won't get to pick a new map.\n` +
                `Pools will be released around 18:00.`;
            if (announceChannel)
                announceChannel.send(announcement);
            else
                console.error("Announcement channel not found");
        }, closeTimer);
    if (exportTimer > 0)
        setTimeout(() => {
            console.log("\x1b[33mPools:\x1b[0m Exporting maps");
            const guild = client.guilds.cache.get(process.env.DISCORD_GUILD);
            const mappoolChannel = guild.channels.cache.get(process.env.CHANNEL_MAPPOOLS);
            const announcement = `Exporting maps to sheets and clearing current pools.`;
            if (mappoolChannel)
                mappoolChannel.send(announcement);
            else
                console.error("Mappools channel not found");
            // Export the maps
            sheet.exportAllMaps()
            .catch(err => {
                console.error(err);
                if (mappoolChannel)
                    mappoolChannel.send(`\`\`\`${util.inspect(err).slice(0, 1200)}\`\`\``);
            });
        }, exportTimer);

    // I think heroku restarts itself every day, so I can cheat a bit and
    // not actually add these as recurring intervals.
    // If it turns out I'm wrong then I'll have to fix it somehow.
});
