const db = require('../../database/db-manager');
const scheduler = require('../../database/scheduler');

module.exports = {
    name: "schedule",
    description: "Finds a time for a match to happen",
    args: [
        { arg: 'any', name: "team", description: "Team name", required: true },
        { arg: 'any', name: "team", description: "Team name", required: true }
    ],
    
    /**
     * @param {import('discord.js').Message} msg 
     */
    async run(msg, { team }) {
        const team1 = await db.getTeamByName(team[0]);
        const team2 = await db.getTeamByName(team[1]);

        if (!team1 || !team2)
            return msg.channel.send("Teams not found");

        const str1 = team1.teamname + team1.players.reduce((p, c) => `${p} ${c.utc}`, '');
        const str2 = team2.teamname + team2.players.reduce((p, c) => `${p} ${c.utc}`, '');

        // Get offsets
        const offsets = team1.players.map(p => p.utc)
            .concat(team2.players.map(p => p.utc));

        const time = await scheduler.getTime(offsets);
        console.log(time);
        let result = "No time available";
        if (time) {
            const timestamp = t => {
                const hours = t | 0;
                const minutes = Math.round((t - hours) * 60);
                return `${hours}:${minutes < 10 ? "0" : ""}${minutes}`;
            }
            result = `Time: ${timestamp(time.time)} ±${timestamp(time.stdev)}`;
        }
        else {
            // Try finding a range of possible times
            const offs = offsets.map(n => parseInt(n))
                .reduce((p, c) => {
                    if (!isNaN(c) && !p.includes(c))
                        p.push(c);
                    return p;
                }, []);
            
            // Start from 0, move up until an invalid time is found
            const goodTime = utc =>
                offs.every(off => {
                    // The time is good if it's between 9am - 10pm
                    const localTime = ((utc + off) % 24 + 24) % 24;
                    return localTime >= 9 && localTime <= 22;
                })
            
            let base = -1;
            // Move to a bad time to start searching
            while (goodTime(++base));

            // Find a starting offset
            let start = 0;
            while (start < 24 && !goodTime(base + start))
                start++;
            // If we have a starting point, we can try to find an end point
            if (start < 24) {
                let end = 0;
                while (end < 24 && goodTime(base + start + end))
                    end++;

                // Display the found time range
                result = `${(base + start) % 24} - ${(base + start + end - 1) % 24}`;
            }
        }

        return msg.channel.send(`${str1}\n${str2}\n${result}`);
    }
}