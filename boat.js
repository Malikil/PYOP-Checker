const Banchojs = require('bancho.js');

module.exports = class OsuClient
{
    constructor(user, pass, commandOptions)
    {
        this.client = new Banchojs.BanchoClient({
            username: user,
            password: pass
        });

        this.client.connect().then(() => {
            console.log("Connected to osu!bancho");
            this.client.on("PM", message => {
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
}