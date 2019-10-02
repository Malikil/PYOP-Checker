const {google} = require('googleapis');
const util = require('util');
const sheets = google.sheets('v4');

async function authorize()
{
    const authFactory = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const jwtClient = authFactory.fromJSON(
        JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    );
    await jwtClient.authorize();
    return jwtClient;
}

authorize().then(auth => {
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
});


