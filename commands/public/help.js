const fs = require('fs');
const Discord = require('discord.js');

module.exports = {
    name: "help",
    description: "Shows available commands. " +
        "Use !help <command> for more details about the command",
    args: [
        { arg: 'any', name: 'command', description: "The command to get the details of" }
    ],
    alias: [ "commands" ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg) {
        const commandFolders = fs.readdirSync('./commands');
        
        const resultStr = commandFolders.map(folder => {
            const filestr = fs.readdirSync(`./commands/${folder}`)
                .filter(f => f.endsWith('.js'))
                .reduce((p, c) => {
                    if (c === "help.js")
                        return `${p}, help`;
                    else {
                        const { name } = require(`../${folder}/${c}`);
                        return `${p}, ${name}`
                    }
                }, '').slice(2);
            return `\`${folder}\` - ${filestr}`;
        }).reduce((p, c) => `${p}\n${c}`);
        return msg.channel.send(resultStr);
    }
}