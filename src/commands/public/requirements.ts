import { Message } from "discord.js";
import { Command } from "../../types/commands";
import helpers from '../../helpers/helpers';
import { getDivisions } from '../../database/db-divisions';
import teamsDb from '../../database/db-manager';

export default class implements Command {
    name = "requirements";
    description = "Shows requirements for the current week";
    alias = [ "req" ];

    async run(msg: Message) {
        const divInfo = await getDivisions();
        // Find which division the user is in, or use the first division if they're not found
        let currentDiv = divInfo[0];
        const team = await teamsDb.getTeamByPlayerid(msg.author.id);
        if (team)
            currentDiv = divInfo.find(div => div.division === team.division);
        
        // Rule restrictions
        const rules = currentDiv.rules.reduce((str, rule) => {
            const limits = helpers.currentWeek(rule.limits);
            return `${str}\n${rule.type}: ${
                limits.min !== undefined ? limits.min : "Less than"}${
                limits.min !== undefined && limits.max !== undefined ? " - " : " "}${
                limits.max !== undefined ? limits.max : "or more"}`;
        }, 'Restrictions for each map:');
        // Aggregate restrictions
        const mapCount = currentDiv.pools.reduce((sum, cur) => sum + cur.count, 0);
        const aggregateStrs = currentDiv.poolRules.reduce((str, agg) => {
            return `${str}\n${agg.type}: ${
                agg.limits.min !== undefined ? agg.limits.min * mapCount : "Less than"}${
                agg.limits.min !== undefined && agg.limits.max !== undefined ? " - " : " "}${
                agg.limits.max !== undefined ? agg.limits.max * mapCount : "or more"}`;
        }, 'Restrictions for the whole pool:');

        return msg.channel.send(
            `Requirements for __week ${helpers.currentWeek() + 1}__\n${rules}\n\n${aggregateStrs}`
        );
    }
}