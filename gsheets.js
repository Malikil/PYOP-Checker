const { GoogleSpreadsheet } = require('google-spreadsheet');
//const util = require('util');
const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
const helpers = require('./helpers');
const { DbPlayer } = require('./types');

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
async function getSheetData(team)
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
}

/**
 * Pushes an array of maps to a new tab in the sheet
 * @param {*[]} maplist Array of teams in format from database
 */
async function pushMaps(rowdata)
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
}

/**
 * Adds a player to google sheets
 * @param {DbPlayer} player 
 */
async function addPlayer(player) {
    await loaded;
    let sheet = doc.sheetsByIndex.find(s => s.title === "PlayerList");
    console.log(sheet);
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

module.exports = {
    getSheetData,
    pushMaps,
    addPlayer
}