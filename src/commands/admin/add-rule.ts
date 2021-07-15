import { Message } from 'discord.js';
import { Command } from '../../types/commands';
import { ruleKeys } from '../../beatmap_checker/checker';

export default class implements Command {
    name = "addrule";
    description = "Adds a rule to existing divisions";
    permissions = [ process.env.ROLE_ADMIN ];
    args = [
        {
            arg: "ruleType",
            description: `What type of rule is this. Available options are:\n${ruleKeys.join(', ')}`,
            required: true
        }
    ];
    alias = [ "setrule" ];
    async run(msg: Message, args: any) {
        return msg.channel.send("Not implemented yet");
    };
}
