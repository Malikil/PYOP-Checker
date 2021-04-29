import fs = require('fs');
import { Message } from 'discord.js';
import { usageString } from '../../validator';
import { Command } from '../../types/commands';

export default class implements Command {
    name = "help";
    description = "Shows available commands. " +
        "Use !help [command] for more details about the command";
    args = [
        { arg: 'any', name: 'command', description: "The command to get the details of", required: false }
    ];
    alias = [ "commands" ];

    async run(msg: Message, { command }: { command: string }) {
        const commandFolders = fs.readdirSync('./dist/commands');
        const commands: { [key: string]: Command[] } = {};
        commandFolders.forEach(folder => {
            const subCommands = fs.readdirSync(`./dist/commands/${folder}`)
            .filter(f => f.endsWith('.js'))
            .map(file => {
                if (file === "help.js")
                    return <Command>this;
                else
                    return <Command>new (require(`../${folder}/${file}`).default)();
            });
            commands[folder] = subCommands;
        });
        // If a command is given, find that command and show the description.
        let resultStr: string;
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
                resultStr = usageString(comm);
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