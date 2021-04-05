const divInfo = require('./divisions.json');
const challonge = require('challonge')
    .createClient({
        apiKey: process.env.CHALLONGE_KEY
    });

const PARTICIPANTS_KEY = Symbol.for("PYOP.participants");
const globalSymbols = Object.getOwnPropertySymbols(global);
const hasParticipants = (globalSymbols.indexOf(PARTICIPANTS_KEY) > -1);

if (!hasParticipants) {
    global[PARTICIPANTS_KEY] = {};
    divInfo.forEach(div =>
        challonge.participants.index({
            id: div.url,
            callback: (err, data) => {
                if (err)
                    console.error(err);
                else
                    global[PARTICIPANTS_KEY][div.division] =
                        Object.keys(data).map(i => data[i].participant);
            }
        })
    );
}

/**
 * Gets the list of participants of a division
 * @param {string} division division name
 * @returns {*[]}
 */
function getParticipants(division) {
    return global[PARTICIPANTS_KEY][division];
}

/**
 * @param {string} divId division url
 * @returns {Promise<*[]>}
 */
function getOpenMatches(divId) {
    return new Promise((resolve, reject) =>
        challonge.matches.index({
            id: divId,
            state: 'open',
            callback: (err, data) => {
                if (err)
                    reject(err);
                else
                    resolve(Object.keys(data).map(i => data[i].match));
            }
        })
    );
}

async function getNextMatches(divId) {
    const matches = await new Promise((resolve, reject) =>
        challonge.matches.index({
            id: divId,
            callback: (err, data) => {
                if (err)
                    reject(err);
                else
                    resolve(Object.keys(data).map(i => data[i].match));
            }
        })
    );

    // Split into current matches and pending matches
    // We don't care about past matches
    const open = {};
    const pending = [];
    matches.forEach(match => {
        if (match.state === "open")
            open[match.id] = match;
        else if (match.state === "pending")
            pending.push(match);
    });
    console.log(pending);
    // We only care about the pending matches that lead directly
    // from a currently open match.
    // That's actually the result of the call, so we can just return it
    return pending.filter(m => open[m.player1PrereqMatchId] || open[m.player2PrereqMatchId])
                .map(m => {
                    m.player1PrereqMatch = open[m.player1PrereqMatchId];
                    m.player2PrereqMatch = open[m.player2PrereqMatchId];
                    return m;
                });
}

module.exports = {
    getParticipants,
    getOpenMatches,
    getNextMatches
};