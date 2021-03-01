const fs = require('fs');
const Discord = require('discord.js');

module.exports = {
    name: "help",
    description: "Shows available commands",

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg) {
        const commandFolders = fs.readdirSync('..');
        const commands = {};
        commandFolders.forEach(folder => {
            fs.readdir()
        })
        return msg.channel.send("Not implemented yet");
    }
}