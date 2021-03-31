const Discord = require('discord.js');

module.exports = {
    name: "register",
    description: "The team captain should register for the whole team, please " +
        "make sure all items are in the correct order.\n" +
        "Divisions are open or 10k.\n" +
        "You can use either the link to your osu profile or your osu username. If using username " +
        "all spaces should be replaced with underscore. Eg 'Example User Name' becomes 'Example\\_User\\_Name'\n" +
        "UTC times should be some sort of offset from utc, eg UTC-7 or just -7. If one of your players " +
        "doesn't want their time zone considered while scheduling enter a single underscore instead. Eg " +
        "`@Malikil Malikil _`\nIf you need to make changes to your team, please let Malikil know.",
    args: [],
    skipValidation: true,

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg) {
        return msg.channel.send("Registrations are closed");

        // !!!!!!!!!!!!!! NOT UPDATED FROM OLD SYSTEM !!!! VERY BROKEN !!!!!!!!!!!!!!!

        // Verify arguments
        let division = args[0].toLowerCase();
        if (!divInfo.find(d => d.division === division))
            return msg.channel.send("Division not found");
        const parseProfile = p => {
            let items = p.split('/');
            let pid = items.pop();
            if (["osu", "taiko", "mania", "fruits"].includes(pid))
                pid = items.pop();
            let asInt = parseInt(pid);
            if (asInt)
                pid = asInt;
            else
                pid = pid.replace(/ /g, '_');
            return pid;
        }
        let players = [];
        try {
            players = [
                { // P1
                    discordid: msg.author.id,
                    osuid: parseProfile(args[1]),
                    utc: args[2]
                },
                { // P2
                    discordid: args[3].match(/[0-9]+/)[0],
                    osuid: parseProfile(args[4]),
                    utc: args[5]
                }
            ];
            // Possible player 3
            let p3id = args[6].match(/<@!?[0-9]+>/);
            if (p3id && p3id[0])
                players.push({
                    discordid: p3id[0].match(/[0-9]+/)[0],
                    osuid: parseProfile(args[7]),
                    utc: args[8]
                });
        }
        catch (err) {
            return msg.channel.send("Couldn't recognise player profiles");
        }
        // The remaining args make up the team name
        let teamName = '';
        for (let i = players.length * 3; i < args.length; i++)
            teamName += args[i] + ' ';
        teamName = teamName.trim();
        if (!teamName)
            return msg.channel.send("Couldn't register: No team name given");
        
        console.log(players);
        let result = await Command.addTeam(division, teamName, players);
        if (result.added)
            return msg.channel.send(
                `Registered **${teamName}**\n` +
                `__Captain__: ${result.players[0].osuname} <@!${result.players[0].discordid}>\n` +
                `__Players__: ${result.players.reduce((p, c) => ({osuname: `${p.osuname}, ${c.osuname}`})).osuname}`
            );
        else
            return msg.channel.send(`Could not add team: ${result.message}`);

        /* From Commands.js
        // Make sure none of the players are already on a team
        let team = await db.getTeamByPlayerlist(players);
        if (team)
            return {
                added: false,
                message: "Some players are already on a team. Please let Malikil know " +
                    "if you need to make changes to an existing team."
            };
        // Find division requirements
        let div = divInfo.find(d => d.division === division);
        // Verify the players
        let apiplayers = await Promise.all(
            players.map(p => ApiPlayer.buildFromApi(p.osuid))
        );
        
        // Make sure the players are in rank range
        let allowed = apiplayers.reduce((p, c) => p &&
                c.pp_rank >= div.ranklimits.high &&
                c.pp_rank < div.ranklimits.low
        , true);
        if (!allowed)
            return {
                added: false,
                message: "Some players don't meet rank requirements"
            };
        
        // Convert players to db format
        let playerlist = apiplayers.map(apip => {
            let player = players.find(p =>
                p.osuid.toString().toLowerCase() === apip.username.toLowerCase().replace(/ /g, '_') ||
                p.osuid === apip.user_id
            );
            console.log(`Looking for ${apip.username}`);
            console.log(player);
            let obj = {
                osuid: apip.user_id,
                osuname: apip.username,
                discordid: player.discordid
            };
            if (player.utc !== "_")
                obj.utc = player.utc;
            return obj;
        });
        console.log(playerlist);

        // Add the team to the db
        let result = await db.addTeam(teamname, division, playerlist);
        if (result)
            return {
                added: true,
                players: playerlist
            };
        else
            return {
                added: false,
                message: "Error writing to database"
            };
        */
    }
}