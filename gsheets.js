const {google} = require('googleapis');
const util = require('util');
const sheets = google.sheets('v4');

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

function simpleGet()
{
    sheets.spreadsheets.get({
        auth,
        spreadsheetId: process.env.SPREADSHEET_ID,
        includeGridData: true
    }, (err, range) => {
        if (err)
            console.log(err);
        else
            console.log(range.data.sheets);
    });
}

module.exports = {
    simpleGet
}