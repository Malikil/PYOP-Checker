const Banchojs = require('bancho.js');

class Logger
{
    static log(str)
    {
        console.log(`\x1b[95m${str}\x1b[0m`);
    }

    static inspect(obj)
    {
        console.log("\x1b[95m");
        console.log(obj);
        console.log("\x1b[0m");
    }
}

module.exports = class OsuClient
{
    constructor(user, pass, commands)
    {
        this.client = new Banchojs.BanchoClient({
            username: user,
            password: pass
        });
        this.commands = commands;
        this.currentMap = {};

        this.client.connect().then(() => {
            console.log("Connected to osu!bancho");
            this.client.on("PM", async message => {
                let response;
                // Sort the message here
                if (message.message.startsWith("!with "))
                    response = await this.checkMap(message);
                else if (message.message.startsWith("ACTION is listening to [", 1))
                    response = await this.onListening(message);
                else if (message.message.startsWith("ACTION is playing [", 1))
                    response = this.onPlaying(message);

                // Give the response, if needed
                if (response)
                    message.user.sendMessage(response)
                        .catch(err => console.error(err));
            });
        });
    }

    /*
    np messages appear as follows:
    \u0001ACTION is listening to [link str]\u0001
    \u0001ACTION is playing [link str]\u0001
    \u0001ACTION is playing [link str] +Mod\u0001
    \u0001ACTION is playing [link str] +Mod1 +Mod2 +Mod3\u0001
    */
    /**
     * @param {Banchojs.PrivateMessage} message
     */
    async onListening(message)
    {
        // Get the song id
        Logger.log(`${message.user.ircUsername}: ${message.message}`);
        let begin = message.message.indexOf("/b/");
        let end = message.message.indexOf(' ', begin);
        let bid = message.message.substring(begin + 3, end);
        Logger.log(`bid: ${bid}`);
        // Set the user's latest song to this one
        // Always set the mod back to 0
        this.currentMap[message.user.id] = {
            bid: bid,
            mods: 0
        };
        // Do I want to do a checkMap here?
        // Yes, then return a message
        return this.commands.checkMap(bid, { osuid: message.user.id });
    }

    /**
     * @param {Banchojs.PrivateMessage} message
     */
    onPlaying(message)
    {
        this.onListening(message);
        // Extract the mods, if they exist
        let begin = message.message.indexOf("]] +");
        let mod = "NoMod";
        if (begin > 0)
            mod = message.message.substr(begin + 4);
    }

   /**
    * 
    * @param {Banchojs.PrivateMessage} message 
    */
    async checkMap(message)
    {
        Logger.log(`${message.user.ircUsername}: ${message.message}`);
        // Get mods from the message
        let args = message.message.split(' ');
        if (args[1] === '?')
            return "Use !with <mods> where mods is some combination of NM|HD|HR|DT|EZ|HT";
        
        // Get the map/mod info from current maps
        
    }
}