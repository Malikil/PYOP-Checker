import { Message } from 'discord.js';
import { Command } from '../../types/commands';
import { ruleKeys } from '../../beatmap_checker';
import { setRule } from '../../database/db-divisions';
import { ValueRange } from '../../types/rules';

export default class implements Command {
    name = "addrule";
    description = "Adds a rule to existing divisions.\n" +
        "Maps submitted before the date given in FIRST_POOLS_DUE from the configuration " +
        "file will use the week 1 rules. Maps submitted after the last known week for a " +
        "certain rule will use the final week's rule. As such if only a single 'week' is " +
        "given for a certain rule, that restriction will apply to every map regardless of " +
        "which week it currently is.\n";
        
    permissions = [ process.env.ROLE_ADMIN ];
    args = [
        {
            arg: "ruleType",
            description: `What type of rule is this. Available options are:\n    ${ruleKeys.join(', ')}`,
            required: true
        },
        {
            arg: "range",
            description: 'Surround with quotes `"`, separate values with spaces. ' +
                "Item order should be minimum, maximum, buffer (opt.), and buffer count (opt.)\n" +
                'Eg. `DrainTimeRule "60 300 15 2"` will require drain time to be between 1 and 5 ' +
                'minutes, while allowing two maps to be 15 seconds above or below that.',
            required: true
        },
        {
            arg: "division",
            description: "Which division does this rule apply to. " +
                "If left out it will apply to all currently existing divisions",
            required: false
        },
        {
            arg: "week",
            description: "Which week of the tournament does this rule apply to. " +
                "The given week will be overridden. Numbers less than 1 will add a new first " +
                "week. If left out or given a number above the current final week then a new " +
                "final week will be created.",
            required: false
        },
        {
            arg: "strict",
            description: "Whether to reject maps or simply require approval. Should be one of `Strict` " +
                "or `Approve`. The same setting applies to every week of a given rule. If the value for a " +
                "rule isn't known yet then strict is assumed.\n",
            required: false
        }
    ];
    alias = [ "setrule" ];
    async run(msg: Message, args: { ruleType: string, range: string, week?: string, division?: string, strict?: string }) {
        console.log(ruleKeys);
        console.log(args.ruleType);
        console.log(ruleKeys.includes(args.ruleType));
        if (!(ruleKeys.includes(args.ruleType)))
            return msg.channel.send("Unknown rule type.");

        const rangeVals = args.range.split(' ').map(v => parseFloat(v));
        const valueRange: ValueRange = {
            min: rangeVals[0],
            max: rangeVals[1]
        };
        if (rangeVals[2]) {
            valueRange.buffer = rangeVals[2];
            valueRange.bufferCount = rangeVals[3] || 1
        }

        const result = await setRule({
            type: args.ruleType,
            limits: [ valueRange ],
            strict: true
        }, args.division);

        if (result > -1)
            return msg.channel.send("Updated rule");
    };
}
