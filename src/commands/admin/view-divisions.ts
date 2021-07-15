import { Message } from "discord.js";
import { Command } from "../../types/commands";
import { getDivisions } from '../../database/db-divisions';
import { ready } from '../../database/mdb'

export default class implements Command {
    name = "viewdivisions";
    description = "Gets a list of existing divisions or rules details about a specified division";
    permissions = [ process.env.ROLE_ADMIN ];
    args = [
        { arg: "division", description: "Which division to get details of.", required: false }
    ]
    alias = [ "viewdivs", "viewdiv", "getdiv" ];
    async run(msg: Message) {
        return msg.channel.send(`Not implemented yet. Arg description is ${this.args[0].description}`);
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