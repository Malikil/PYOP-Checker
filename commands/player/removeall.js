const Discord = require('discord.js');
const db = require('../../db-manager');

module.exports = {
    name: "removeall",
    description: "Removes all maps from your pool.",
    alias: [ 'remall' ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg) {
        // Find the player's team
        const team = await db.getTeamByPlayerid(msg.author.id);
        if (!team)
            return msg.channel.send("Player not found");

        // Make sure the command will actually do something
        if (team.maps.length < 1)
            return msg.channel.send("No maps to remove");

        // Make sure the player is sure
        await msg.channel.send(`This will remove __all__ maps from your pool, there is no undo. Are you sure? (y/yes/n/no)`);
        let err = "";
        let aborted = await msg.channel.awaitMessages(
            message => message.author.equals(msg.author)
                && ['y', 'yes', 'n', 'no'].includes(message.content.toLowerCase()),
            { max: 1, time: 10000, errors: ['time'] }
        ).then(results => {
            let response = results.first();
            return ['n', 'no'].includes(response.content.toLowerCase());
        }).catch(reason => {
            console.log("Response timer expired");
            err = "Timed out. ";
            return true;
        });
        console.log(`Aborted? ${aborted}`);
        if (aborted)
            return msg.channel.send(`${err}Maps not removed.`);

        // Remove all the player's maps
        db.removeAllMaps(team.teamname);
        return msg.channel.send(`Removed ${team.maps.length} maps`);
    }
}