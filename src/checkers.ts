import { Checker, Rule } from './beatmap_checker';
import { getDivisions } from './database/db-divisions';
import { ready as dbReady } from './database/mdb';
import helpers from './helpers/helpers';

export const checkers: { [key: string]: Checker } = {};
dbReady.then(() => {
    refreshCheckers();
    console.log("Loaded division rules");
});

// Create map checkers
export function refreshCheckers() {
    getDivisions().then(divs => {
        divs.forEach(div => {
            const checker = new Checker(
                div.rules.map(r => (
                    { type: r.type, limit: helpers.currentWeek(r.limits), strict: r.strict}
                )),
                div.poolRules
            );
            checkers[div.division] = checker;
        });
    });
}
