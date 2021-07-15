import { Message, MessageEmbed } from "discord.js";
import { Command } from "../../types/commands";
import { getDivisions, getDivision } from '../../database/db-divisions';
import { ready } from '../../database/mdb'
import { randomColour } from "../../helpers/helpers";

export default class implements Command {
    name = "viewdivisions";
    description = "Gets a list of existing divisions or rules details about a specified division";
    permissions = [ process.env.ROLE_ADMIN ];
    args = [
        { arg: "division", description: "Which division to get details of.", required: false }
    ]
    alias = [ "viewdivs", "viewdiv", "getdiv", "divs" ];
    async run(msg: Message, { division }: { division?: string }) {
        const embed = new MessageEmbed();
        embed.setColor(randomColour());
        if (division) {
            // Get the details of the division
            const div = await getDivision(division);
            if (!div)
                return msg.channel.send("Unknown division");

            embed.setTitle(`${div.division[0].toUpperCase()}${div.division.slice(1)} division`);
            let desc = "Rank limit: ";
            if (div.rankLimits)
                desc += `${div.rankLimits.max} - ${div.rankLimits.min}`;
            else
                desc += "No rank limit";
            if (div.url)
                desc += `\n[Challonge](https://challonge.com/${div.url})`
            if (desc)
                embed.setDescription(desc);

            if (div.rules.length > 0) {
                // Display rules in columns made by embed fields.
                let typeField = {
                    name: "Rule Type",
                    inline: true,
                    value: ""
                };
                let rangeField = {
                    name: "Range/Buffer",
                    inline: true,
                    value: ""
                };
                let strictField = {
                    name: "Restriction",
                    inline: true,
                    value: ""
                };

                div.rules.forEach(rule => {
                    typeField.value += rule.type;
                    strictField.value += rule.strict ? "Reject caught maps" : "Require approval";
                    rule.limits.forEach((lim, i) => {
                        let rangeVal = `Week ${i + 1}: `;
                        if (lim.min) {
                            if (lim.max)
                                rangeVal = `${lim.min} - ${lim.max}`;
                            else
                                rangeVal = `>${lim.min}`;
                        }
                        else // There must be max
                            rangeVal = `<${lim.max}`;
                        rangeField.value += rangeVal;

                        if (lim.buffer)
                            rangeField.value += `, ±${lim.buffer} buffer ${lim.bufferCount}`;
                        
                        typeField.value += "\n";
                        rangeField.value += "\n";
                        strictField.value += "\n";
                    });
                });

                embed.addFields(typeField, rangeField, strictField);
            }

            msg.channel.send(embed);
        }
        else {
            // Get a list of divisions
            const divList = await getDivisions();
            return msg.channel.send(`Available divisions:\n${divList.map(div => {
                let divstr = `    ${div.division}: `;
                if (div.rankLimits)
                    divstr += `${div.rankLimits.max} - ${div.rankLimits.min}`;
                else
                    divstr += "No rank limit";
                return divstr;
            }).join("\n")}`);
        }
    };

    constructor() {
        ready.then(_ => getDivisions())
        .then(divList => {
            const divstr = divList.reduce((p, div) => {
                return `${p}, ${div.division}`;
            }, "").slice(2);
            this.args[0].description =
                `Which division to get details of. Valid divisions are:\n    ${divstr}`;
            console.log(`view-divisions.ts # set arg description to ${this.args[0].description}`);
        });
    }
}