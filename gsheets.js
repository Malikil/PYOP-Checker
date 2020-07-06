const { GoogleSpreadsheet } = require('google-spreadsheet');
//const util = require('util');
const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
const helpers = require('./helpers');
const { DbPlayer } = require('./types');
const { checkPool } = require('./checker');

/*const authFactory = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const auth = authFactory.fromJSON(
    JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)
);
auth.authorize((err, cred) => {
    if (err)
        console.error(err);
    else
        console.log("Connected to google api");
});*/
var loaded = doc.useServiceAccountAuth(
    JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)
).then(
    () => doc.loadInfo()
).then(
    () => console.log(`Connected to sheet: ${doc.title}`)
).catch(
    err => console.error(err)
);
//#region Old googleapis functions, kept for reference
/**
 * Puts the maps from a single team into an array
 * which can be pushed to google sheets
 * @param {{
 *  name: string,
 *  players: {
 *      osuid: number,
 *      osuname: string,
 *      discordid: string
 *  }[],
 *  maps: {
 *      id: number,
 *      status: string,
 *      drain: number,
 *      stars: number,
 *      bpm: number,
 *      artist: string,
 *      title: string,
 *      version: string,
 *      creator: string,
 *      mod: number,
 *      pool: "nm"|"hd"|"hr"|"dt"|"cm"
 *  }
 * }} team A team to get the maps from
 */
/*async function getSheetData(team)
{
    
    let rowdata = [];
    rowdata.push({
        values: [
            { userEnteredValue: { stringValue: team.name } },
            { userEnteredValue: { stringValue: '' } }
        ]
    });
    // Get players from the team, and push them to the first row
    team.players.forEach(player => {
        rowdata[0].values.push(
            { userEnteredValue: { stringValue: player.osuname } }
        );
    });
    // Map header row
    rowdata.push({ values: [
        { userEnteredValue: { stringValue: "Mod" } },
        { userEnteredValue: { stringValue: "Mapper" } },
        { userEnteredValue: { stringValue: "Map" } },
        { userEnteredValue: { stringValue: "Stars" } },
        { userEnteredValue: { stringValue: "Drain" } },
        { userEnteredValue: { stringValue: "BPM" } },
        { userEnteredValue: { stringValue: "ID" } }
    ]});
    // Map info
    team.maps.sort((a, b) => a.mod - b.mod).forEach(map =>
        rowdata.push({ values: [
            { userEnteredValue: { stringValue: modString(map.mod) } },
            { userEnteredValue: { stringValue: map.creator } },
            { userEnteredValue: { formulaValue: `=HYPERLINK("${mapLink(map)}","${mapString(map).replace(
                '"', '"&CHAR(34)&"'
            )}")` } },
            { userEnteredValue: { numberValue: map.stars } },
            { userEnteredValue: { stringValue: convertSeconds(map.drain) } },
            { userEnteredValue: { numberValue: map.bpm } },
            { userEnteredValue: { numberValue: map.id } },
            { userEnteredValue: { stringValue: map.status } }
        ]})
    );
    return rowdata;
}*/

/**
 * Pushes an array of maps to a new tab in the sheet
 * @param {*[]} maplist Array of teams in format from database
 */
/*async function pushMaps(rowdata)
{
    let doc = await sheets.spreadsheets.get({
        auth, spreadsheetId
    });
    let sheet = doc.data.sheets.find(s => s.properties.title === 'Exported');
    let sheetid;
    if (!sheet)
    {
        console.log("Sheet not found, creating sheet");
        let response = await sheets.spreadsheets.batchUpdate({
            auth, spreadsheetId,
            requestBody: {
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title: "Exported"
                            }
                        }
                    }
                ]
            }
        });
        
        response.data.replies.forEach(item => console.log(item));
        sheetid = response.data.replies[0].addSheet.properties.sheetId;
    }
    else
        sheetid = sheet.properties.sheetId;
    console.log(`Sheet id: ${sheetid}`);
    return sheets.spreadsheets.batchUpdate({
        auth, spreadsheetId,
        requestBody: {
            requests: [
                {
                    updateCells: {
                        start: {
                            sheetId: sheetid,
                            rowIndex: 0,
                            columnIndex: 0
                        },
                        fields: "userEnteredValue",
                        rows: rowdata
                    }
                }
            ]
        }
    });
}*/
//#endregion
/**
 * Adds a player to google sheets
 * @param {DbPlayer} player 
 */
async function addPlayer(player) {
    await loaded;
    let sheet = doc.sheetsByIndex.find(s => s.title === "PlayerList");
    console.log(sheet.title);
    await sheet.loadCells();
    // Player output range in cells 2,14 to n,16
    // Find which row to add the player to
    let playerRow = 2;
    let playerIdCell;
    // Increment playerRow until an empty row is found (value == '')
    while ((playerIdCell = sheet.getCell(playerRow, 14)).value) playerRow++;
    // Set cell contents
    playerIdCell.value = player.osuid;
    sheet.getCell(playerRow, 15).value = player.utc;
    sheet.getCell(playerRow, 16).value = player.division;
    // Save changes
    return sheet.saveUpdatedCells();
}

/**
 * Adds the maps from all players to the sheet
 * @param {DbPlayer[]} players 
 */
async function pushMaps(players) {
    let sheet = doc.sheetsByIndex.find(s => s.title === "Exported");
    if (!sheet)
        sheet = await doc.addSheet({
            title: "Exported"
        });
    // Not sure if this will load the sheet,
    // but if I can both load and clear in a single step that's great
    await sheet.clear();
    // Parse players into the sheet
    // Insert into two sets of columns
    var openRow = 0;
    var fiftRow = 0;
    let exports = players.map(async player => {
        let baseCol = 0;
        let row = openRow;
        if (player.division === '15k')
        {
            baseCol = 8;
            row = fiftRow;
        }
        // Verify the pool doesn't have any issues
        let check = await checkPool(player.maps);
        // Player's name and list pool properties
        sheet.getCell(row, baseCol).value = player.osuname;
        check.message.forEach((m, i) => sheet.getCell(row, baseCol + i + 1).value = m);
        // Sort the maps by mod and add them to sheet
        player.maps.sort((a, b) => a.mods - b.mods).forEach((map, i) => {
            sheet.getCell(row + 1 + i, baseCol).value = helpers.modString(map.mods);
            sheet.getCell(row + 1 + i, baseCol + 1).value = map.creator;
            sheet.getCell(row + 1 + i, baseCol + 2).value = helpers.mapString(map);
            sheet.getCell(row + 1 + i, baseCol + 3).value = map.stars;
            sheet.getCell(row + 1 + i, baseCol + 4).value = helpers.convertSeconds(map.drain);
            sheet.getCell(row + 1 + i, baseCol + 5).value = map.bpm;
            sheet.getCell(row + 1 + i, baseCol + 6).value = map.bid;
        });
        // Update the current row
        if (player.division === '15k')
            fiftRow += player.maps.length + 1;
        else
            openRow += player.maps.length + 1;
    });
    await Promise.all(exports);
    // Save the sheet values
    return sheet.saveUpdatedCells();
}

async function createExportInterface() {
    var sheet = doc.sheetsByIndex.find(s => s.title === "Exported");
    if (!sheet)
        sheet = await doc.addSheet({
            title: "Exported"
        });
    // Load the cells
    await sheet.loadCells();
    // Insert into two sets of columns
    // Track the rows for each
    var openRow = 0;
    var fiftRow = 0;
    return {
        /**
         * @param {DbPlayer} player
         */
        parsePlayer: async player => {
            try
            {
                let baseCol = 0;
                let row = openRow;
                if (player.division === '15k')
                {
                    baseCol = 8;
                    row = fiftRow;
                }
                // Verify the pool doesn't have any issues
                let check = await checkPool(player.maps);
                // Player's name and list pool properties
                sheet.getCell(row, baseCol).value = player.osuname;
                check.message.forEach((m, i) => sheet.getCell(row, baseCol + i + 1).value = m);
                // Sort the maps by mod and add them to sheet
                player.maps.sort((a, b) => a.mods - b.mods).forEach((map, i) => {
                    sheet.getCell(row + 1 + i, baseCol).value = helpers.modString(map.mods);
                    sheet.getCell(row + 1 + i, baseCol + 1).value = map.creator;
                    sheet.getCell(row + 1 + i, baseCol + 2).formula =
                        `=HYPERLINK("${helpers.mapLink(map)}","${helpers.mapString(map).replace(/"/g, '"&CHAR(34)&"')}")`;
                    sheet.getCell(row + 1 + i, baseCol + 3).value = map.stars;
                    sheet.getCell(row + 1 + i, baseCol + 4).value = helpers.convertSeconds(map.drain);
                    sheet.getCell(row + 1 + i, baseCol + 5).value = map.bpm;
                    sheet.getCell(row + 1 + i, baseCol + 6).value = map.bid;
                });
                // Update the current row
                if (player.division === '15k')
                    fiftRow += player.maps.length + 1;
                else
                    openRow += player.maps.length + 1;
                // Player's name, for logging
                return player.osuname;
            }
            catch (err) { return Promise.reject(err); }
        },
        commitChanges: async () => sheet.saveUpdatedCells()
    };
}

module.exports = {
    //getSheetData,
    //pushMaps,
    createExportInterface,
    pushMaps,
    addPlayer
}