const Discord = require('discord.js');
const db = require('../../db-manager');

module.exports = {
    name: "notify",
    description: "Sets whether the bot will DM you when a map is rejected",
    args: [
        { arg: "setting" }
    ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { setting }) {
        if (setting === "off")
            setting = false;
        else if (setting === "on")
            setting = true;
        // If an argument for setting is given, update the setting
        let notify = await db.setNotify(msg.author.id, setting);

        // Display the current setting regardless
        return msg.channel.send(
            `${this.description}. Toggle with on/off\n` +
            `Currently set to: ${notify}`
        );
    }
}