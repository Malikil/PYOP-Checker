const helpers = require('../../helpers/helpers');
const divInfo = require('../../divisions.json');

module.exports = {
    name: "requirements",
    description: "Shows requirements for the current week",
    alias: [ "req" ],

    async run(msg) {
        const minTotal = parseInt(process.env.MIN_TOTAL);       // Pool drain limit, per map
        const maxTotal = parseInt(process.env.MAX_TOTAL);       // Pool drain limit, per map
        const poolCount = 10; // 10 maps per pool
        let minPool = minTotal * poolCount;
        let maxPool = maxTotal * poolCount;
        // Cheating a little here, I assume all divisions are the same as the default division
        let defaultDiv = divInfo[0];
        let drains = helpers.currentWeek(defaultDiv.drainlimits);
        let maxLength = helpers.currentWeek(defaultDiv.lengthlimits).high;

        return msg.channel.send("Requirements for this week:\n" +
            "Star rating:\n" + divInfo.reduce((p, c) => {
                let sr = helpers.currentWeek(c.starlimits);
                return p + `    ${c.division}: ${sr.low.toFixed(2)} - ${sr.high.toFixed(2)}\n`
            }, '') +
            `Drain length: ${helpers.convertSeconds(drains.low)}` +
            ` - ${helpers.convertSeconds(drains.high)}\n` +
            `Total length must be less than ${helpers.convertSeconds(maxLength)}\n` +
            `Total pool drain time must be ${helpers.convertSeconds(minPool)}` +
            ` - ${helpers.convertSeconds(maxPool)}\n\n` +
            `Maps with less than a certain number of scores with the selected ` +
            `mod on the leaderboard will need to be submitted with a ` +
            `screenshot of a pass on the map. ` +
            `Maps without a leaderboard will always need a screenshot.\n` +
            `Auto accepted leaderboard scores:` + divInfo.reduce((p, c) => {
                let minLeaders = helpers.currentWeek(c.leaderboardlimits).low;
                return p + `\n    ${c.division}: ${minLeaders}`;
            }, '')
        );
    }
}