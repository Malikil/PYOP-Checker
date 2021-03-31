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

module.exports = {
    getParticipants,
    getOpenMatches
}