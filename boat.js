const Banchojs = require('bancho.js');
const helpers = require('./helpers');
const commands = require('./bancho_commands');
const util = require('util');

class Logger
{
    static log(str)
    {
        console.log(`\x1b[95m${str}\x1b[0m`);
    }

    static inspect(obj)
    {
        console.log(`\x1b[95m${util.inspect(obj)}\x1b[0m`);
    }
}

module.exports = class OsuClient
{
    constructor(username, password)
    {
        this.client = new Banchojs.BanchoClient({
            username,
            password
        });

        this.client.on("PM", async msg => {
            if (msg.message[0] !== '\u0001' && msg.message[0] !== '!')
                return;
            console.log(`\x1b[95mReceived message:\x1b[0m ${msg.message}`);
            let commandNames = Object.keys(commands);
            let commandArgs = msg.message.split(' ');
            let command = commandArgs[0].slice(1);
            if (commandNames.includes(command))
                // Check if this is a help message or not
                if (commandArgs[1] === '?')
                    msg.user.sendMessage(commands[command].help);
                else
                    commands[command](msg, this.client)
                        .catch(reason => {
                            msg.user.sendMessage("Something went wrong, please tell Malikil what you were trying to do");
                            console.error(reason);
                        });
        });

        this.client.connect().then(() => {
            console.log("Connected to osu!bancho");
        });
    }

    /*
    np messages appear as follows:
    \u0001ACTION is listening to [link str]\u0001
    \u0001ACTION is playing [link str]\u0001
    \u0001ACTION is playing [link str] +Mod\u0001
    \u0001ACTION is playing [link str] +Mod1 +Mod2 +Mod3\u0001
    */
}