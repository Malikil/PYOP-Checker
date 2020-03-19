const Banchojs = require('bancho.js');

module.exports = class OsuClient
{
    constructor(user, pass, commands)
    {
        this.client = new Banchojs.BanchoClient({
            username: user,
            password: pass
        });
        this.commands = commands;
        this.lastMap = {};

        this.client.connect().then(() => {
            console.log("Connected to osu!bancho");
            this.client.on("PM", message => {
                // Sort the message here
                if (message.message.startsWith("!check "))
                    this.addMap(message);
                else
                    this.onNp(message);
            });
        });
    }

    /**
     * @param {Banchojs.PrivateMessage} message
     */
    onNp(message)
    {
        console.log(`${message.user.ircUsername}: ${message.message}`);
    }

    async checkMap(message)
    {
        this.commands.checkMap()
    }
}