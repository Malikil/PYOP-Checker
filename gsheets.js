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
        console.log(cred);
});

function simpleGet()
{
    sheets.spreadsheets.get({
        auth,
        spreadsheetId: process.env.SPREADSHEET_ID,
        ranges: ['15k Submissions!A2:Q'],
        includeGridData: true
    }, (err, range) => {
        console.log(err);
        let page = range.data.sheets[0];
        console.log(page.data[0].rowData[0].values);
    });
}

module.exports = {

}