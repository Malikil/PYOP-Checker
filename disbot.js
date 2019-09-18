/*
Connection to discord should be handled here. Commands should be handled with
the 'commands' module, but those methods will be called from here.
*/
const Discord = require('discord.js');
const commands = require('./commands');
const client = new Discord.Client();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}.`);
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

/**
 * Send a message in the map rejection channel to tell user about rejected maps
 * @param {String} name Player name
 * @param {Array} rejects Array of json objects giving pass/fail status
 * @deprecated Do not use, kept only for reference
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

module.exports = client;
