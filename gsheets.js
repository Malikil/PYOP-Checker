const {google} = require('googleapis');
const util = require('util');
const sheets = google.sheets('v4');
const spreadsheetId = process.env.SPREADSHEET_ID;
const {convertSeconds} = require('./checker');
const {MODS} = require('./checker');

// Copied from commands.js (import didn't seem to work)
const mapString = map => `${map.artist} - ${map.title} [${map.version}]`;
const mapLink = map => `https://osu.ppy.sh/b/${map.id}`;
function modString(mod)
{
    let str = '';
    if (mod & MODS.HD)      str += 'HD';
    if (mod & MODS.HR)      str += 'HR';
    else if (mod & MODS.EZ) str += 'EZ';
    if (mod & MODS.DT)      str += 'DT';
    else if (mod & MODS.HT) str += 'HT';
    if (str == '')                  str = 'NM';
    return str;
}

const authFactory = new google.auth.GoogleAuth({
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
});

/**
 * Pushes an array of maps to a new tab in the sheet
 * @param {*[]} maplist Array of teams in format from database
 */
async function pushMaps(maplist)
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
    let rowdata = [];
    maplist.forEach(team => {
        rowdata.push({
            values: [{ userEnteredValue: { stringValue: team.name } }]
        });
        rowdata.push({ values: [
            { userEnteredValue: { stringValue: "Mod" } },
            { userEnteredValue: { stringValue: "Mapper" } },
            { userEnteredValue: { stringValue: "Map" } },
            { userEnteredValue: { stringValue: "Stars" } },
            { userEnteredValue: { stringValue: "Drain" } },
            { userEnteredValue: { stringValue: "BPM" } },
            { userEnteredValue: { stringValue: "ID" } }
        ]});
        let mods = [ "nm", "hd", "hr", "dt" ];
        mods.forEach((pool, i) => {
            team.maps[pool].forEach(map =>
                rowdata.push({ values: [
                    { userEnteredValue: { stringValue: mods[i].toUpperCase() } },
                    { userEnteredValue: { stringValue: map.creator } },
                    { userEnteredValue: { formulaValue: `=HYPERLINK("${mapLink(map)}","${mapString(map).replace(
                        '"', '"&CHAR(34)&"'
                    )}")` } },
                    { userEnteredValue: { numberValue: map.stars } },
                    { userEnteredValue: { stringValue: convertSeconds(map.drain) } },
                    { userEnteredValue: { numberValue: map.bpm } },
                    { userEnteredValue: { numberValue: map.id } }
                ]})
            );
        });
        team.maps.cm.forEach(map =>
            rowdata.push({ values: [
                { userEnteredValue: { stringValue: modString(map) } },
                { userEnteredValue: { stringValue: map.creator } },
                { userEnteredValue: { formulaValue: `=HYPERLINK("${mapLink(map)}","${mapString(map).replace(
                    '"', '"&CHAR(34)&"'
                )}")` } },
                { userEnteredValue: { numberValue: map.stars } },
                { userEnteredValue: { stringValue: convertSeconds(map.drain) } },
                { userEnteredValue: { numberValue: map.bpm } },
                { userEnteredValue: { numberValue: map.id } }
            ]})
        );
        rowdata.push();
    });
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

module.exports = {
    pushMaps
}