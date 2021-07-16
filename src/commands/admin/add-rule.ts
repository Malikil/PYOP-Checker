import { Message } from 'discord.js';
import { Command } from '../../types/commands';
import { ruleKeys } from '../../beatmap_checker';
import { getDivision, getDivisions, setRule } from '../../database/db-divisions';
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
            description: 'Eg. `DrainTimeRule "60 300 15 2"` will require drain time to be between 1 and 5 ' +
                'minutes, while allowing two maps to be 15 seconds above or below that.',
            required: true
        },
        {
            arg: "division",
            description: "Which division does this rule apply to. " +
                "If left out it will apply to all currently existing divisions. Using a division " +
                "called 'open' or the first division in the list as a starting point.",
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
    async run(msg: Message, args: { ruleType: string, range: ValueRange, week?: string, division?: string, strict?: string }) {
        if (!(ruleKeys.includes(args.ruleType)))
            return msg.channel.send("Unknown rule type.");

        // Try to get the division, if there's no division given then make sure all divisions would be
        // compatible with this change
        let div = await getDivision(args.division || "open");
        if (!div)
            if (args.division)
                return msg.channel.send("Unknown division.");
            else
                div = (await getDivisions())[0];

        // Figure out where the new rule slots in
        const existingRule = div.rules.find(r => r.type === args.ruleType);
        let result: -1 | 0 | 1;
        if (!existingRule) {
            // The rule doesn't exist yet, it can just be added as-is
            result = await setRule({
                type: args.ruleType,
                limits: [ args.range ],
                strict: (args.strict || "strict").toLowerCase() !== "approve"
            }, args.division);
        }
        else {
            // Update the existing rule to account for the new value
            const week = parseInt(args.week) - 1;
            if (week < 0)
                existingRule.limits.unshift(args.range);
            else if (week >= existingRule.limits.length || !week)
                existingRule.limits.push(args.range);
            else
                existingRule.limits[week] = args.range;
            // Update with the new values
            result = await setRule(existingRule, args.division);
        }

        // Indicate success
        if (result > -1)
            return msg.channel.send("Updated rule");
        else
            return msg.channel.send("Couldn't update rule");
    };
}
