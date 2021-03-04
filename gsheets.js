const { GoogleSpreadsheet } = require('google-spreadsheet');
//const util = require('util');
const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
const helpers = require('./helpers/helpers');
const db = require('./db-manager');
const { checkers, refreshCheckers } = require('./checkers');

var loaded = doc.useServiceAccountAuth(
    JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)
).then(
    () => doc.loadInfo()
).then(
    () => console.log(`Connected to sheet: ${doc.title}`)
).catch(
    err => console.error(err)
);

/**
 * Adds the maps from all players to the sheet
 */
async function exportAllMaps() {
    let sheet = doc.sheetsByIndex.find(s => s.title === "Exported");
    if (!sheet)
        sheet = await doc.addSheet({
            title: "Exported"
        });
    // Do I need to load cells twice?
    //await sheet.loadCells();
    await sheet.clear();
    await sheet.loadCells();
    // Parse players into the sheet
    // Insert into two sets of columns
    await db.reduce(async (rows, team) => {
        let baseCol = 0;
        let row = rows.div1;
        if (team.division === '10k') {
            baseCol = 9;
            row = rows.div2;
        }
        console.log(team.teamname);

        // Verify the pool doesn't have any issues
        const check = await checkers[team.division].checkPool(team.maps);
        sheet.getCell(row, baseCol).value = team.teamname;
        if (check.messages.length > 0)
            check.messages.forEach((m, i) => sheet.getCell(row, baseCol + 1 + i).value = m);
        
        // Sort the maps by mod and add them to the sheet
        team.maps.sort((a, b) => a.mods - b.mods).forEach((map, i) => {
            sheet.getCell(row + 1 + i, baseCol).value = helpers.modString(map.mods);
            sheet.getCell(row + 1 + i, baseCol + 1).value = map.creator;
            sheet.getCell(row + 1 + i, baseCol + 2).formula =
                `=HYPERLINK("${helpers.mapLink(map)}","${helpers.mapString(map).replace(/"/g, '"&CHAR(34)&"')}")`;
            sheet.getCell(row + 1 + i, baseCol + 3).value = map.stars;
            sheet.getCell(row + 1 + i, baseCol + 4).value = helpers.convertSeconds(map.drain);
            sheet.getCell(row + 1 + i, baseCol + 5).value = map.bpm;
            sheet.getCell(row + 1 + i, baseCol + 6).value = map.bid;
            sheet.getCell(row + 1 + i, baseCol + 7).value = map.status;
        });

        // Update the current row
        if (team.division === '10k')
            rows.div2 += team.maps.length + 1;
        else
            rows.div1 += team.maps.length + 1;
        return rows;
    }, { div1: 0, div2: 0 });
    
    // Save the sheet values and move maps to archive
    return Promise.all([
        sheet.saveUpdatedCells(),
        db.archiveMaps(),
        new Promise(() => refreshCheckers())
    ]);
}

module.exports = {
    exportAllMaps
}