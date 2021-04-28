const fs = require('fs');
const Discord = require('discord.js');
const validator = require('../../validator');

module.exports = {
    name: "help",
    description: "Shows available commands. " +
        "Use !help [command] for more details about the command",
    args: [
        { arg: 'any', name: 'command', description: "The command to get the details of" }
    ],
    alias: [ "commands" ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { command }) {
        const commandFolders = fs.readdirSync('./dist/commands');
        const commands = {};
        commandFolders.forEach(folder => {
            const subCommands = fs.readdirSync(`./dist/commands/${folder}`)
            .filter(f => f.endsWith('.js'))
            .map(file => {
                if (file === "help.js")
                    return this;
                else
                    return require(`../${folder}/${file}`);
            });
            commands[folder] = subCommands;
        });
        // If a command is given, find that command and show the description.
        let resultStr;
        if (command)
            Object.keys(commands).find(folder => {
                const comm = commands[folder].find(c =>
                    c.name === command || (c.alias && c.alias.includes(command))
                );
                if (!comm)
                    return false;
                
                // Instead of finding the command from the list again,
                // just get the string here and return.
                // Kinda jank but whatever
                resultStr = validator.usageString(comm);
                return true;
            });
        else
            resultStr = Object.keys(commands).map(folder => {
                const comstr = commands[folder].reduce((p, c) =>
                        `${p}, ${c.name}`
                    , '').slice(2);
                return `\`${folder}\` - ${comstr}`;
            }).reduce((p, c) => `${p}\n${c}`);

        return msg.channel.send(resultStr || "No content");
    }
}