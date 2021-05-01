import db from './mdb';
import { Division } from '../types/divisions';
import { Mods } from '../types/bancho';
import { ValueRange } from '../types/rules';
import { Rule } from '../beatmap_checker/rule';

//#region ========== Division Management ==========
export async function createDivision(divName: string) {
    const res = await db.collection<Division>("divisions").updateOne(
        { division: divName },
        { $setOnInsert: {
            division: divName,
            pools: [],
            rules: [],
            poolRules: []
        } },
        { upsert: true }
    );
    return res.result;
}

export async function removeDivision(divName: string) {
    const res = await db.collection<Division>('divisions').deleteOne({
        division: divName
    });
    return res.deletedCount;
}

export async function getDivisions() {
    const divs = db.collection<Division>('divisions').find();
    return divs.toArray();
}

export async function getDivision(divName: string) {
    return db.collection<Division>('divisions').findOne({ division: divName });
}

export async function setDivisionUrl(divName: string, url: string) {
    const res = await db.collection<Division>('divisions').updateOne(
        { division: divName },
        { $set: { url } }
    );
    return res.modifiedCount;
}

export async function setRankLimit(divName: string, limits: ValueRange) {
    const res = await db.collection<Division>('divisions').updateOne(
        { division: divName },
        { $set: { rankLimits: limits } }
    );
    return res.modifiedCount;
}
//#endregion
//#region ========== Rules/Pool Management ==========
export async function setModpool(mods: Mods | "Custom", count: number, divName?: string) {
    // If this modpool has already been specified update the count
    const filter: {
        division?: string
    } = {};
    if (divName)
        filter.division = divName;

    // This query made my head hurt :c
    const res = await db.collection('divisions').updateMany(
        filter,
        [
            // Use $set aggregate operator to update based on a condition
            { $set: {
                // Updating pools array
                pools: {
                    $cond: [
                        // If mods is already in the array
                        { $in: [ mods, "$pools.mods" ] },
                        // Update the existing element
                        { $map: {
                            input: "$pools",
                            as: "modpool",
                            in: {
                                $cond: [
                                    // If this is the object to update
                                    { $eq: [ "$$modpool.mods", mods ] },
                                    // Use the updated object
                                    { mods, count },
                                    // Keep the old object
                                    "$$modpool"
                                ]
                            }
                        } },
                        // Push the new element to the array
                        { $concatArrays: [ "$pools", [ { mods, count } ] ] }
                    ]
                }
            } }
        ]
    );
    return res.matchedCount;
}

export async function removeModpool(mods: Mods | "Custom", divName?: string) {
    const filter: { division?: string } = {};
    if (divName)
        filter.division = divName;
    // There should only be one of a given modpool, but if there is somehow more than
    // one they should all be removed anyways
    const res = await db.collection<Division>('divisions').updateMany(
        filter,
        { $pull: { pools: { mods } } }
    );
    return res.matchedCount;
}

export async function addRule(rule: Rule, divName?: string) {
    throw new Error("Not implemented yet");
}

/**
 * Gets all rules for a given division. If no division is specified will get rules that
 * exist in all divisions.
 */
export async function getRules(divName?: string): Promise<Rule[]> {
    throw new Error("Not implemented yet");
}
//#endregion
