/*
This is the main entry point for the app.
Connection to discord should be handled here. Commands should be handled with
the 'commands' module, but those methods will be called from here.
*/
const Discord = require('discord.js');
const commands = require('./commands');
const client = new Discord.Client();

const guildId = process.env.DISCORD_GUILD;
const channelId = process.env.DISCORD_CHANNEL;

/** @type {Discord.Guild} */
var guild;
/** @type {Discord.GuildChannel} */
var channel;

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}.`);
    guild = client.guilds.get(guildId);
    channel = guild.channels.get(channelId);
});

client.on('message', msg => {
    if (msg.content === 'ping')
        msg.reply('Pong!');
    else if (msg.content.startsWith('!check'))
        commands.checkMap(msg);
});

/**
 * Send a message in the map rejection channel to tell user about rejected maps
 * @param {String} name Player name
 * @param {Array} rejects Array of json objects giving pass/fail status
 */
function rejectMaps(name, rejects)
{
    return new Promise((resolve, reject) => {
        try
        {
            let modmanager = new Mod();
            let member = guild.members.find(member => 
                ((!!member.nickname && member.nickname.toLowerCase().includes(name.toLowerCase()))
                    || (!!!member.nickname && member.user.username.toLowerCase().includes(name.toLowerCase()))));
            let rejectMessage = !!member ? `${member}\n` : `@${name}\n`;
            rejects.forEach(item => {
                if (item.passed === false)
                {
                    if (!!item.reject.map)
                        rejectMessage += `**Map:** <https://osu.ppy.sh/b/${item.reject.map.id}> +${modmanager.modBitwiseToString(item.reject.map.mod)}\n**Reason:** `;
                    rejectMessage += `${item.reject.reason}\n\n`;
                }
            });
            if (rejectMessage.lastIndexOf('\n') !== rejectMessage.indexOf('\n'))
                channel.send(rejectMessage);
            resolve();
        }
        catch (error)
        {
            reject(error);
        }
    });
}

client.login(process.env.DISCORD_TOKEN);