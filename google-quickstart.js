const {google} = require('googleapis');
const util = require('util');
const sheets = google.sheets('v4');
process.env.GOOGLE_APPLICATION_CREDENTIALS = './gsheet-credentials.json';

const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

auth.getClient().then(authClient => {
    auth.getProjectId().then(project => {
        console.log(project);
    });
    sheets.spreadsheets.get({
        auth: authClient,
        spreadsheetId: process.env.SPREADSHEET_ID,
        ranges: ['15k Submissions!A2:Q'],
        includeGridData: true
    }, (err, range) => {
        console.log(err);
        let page = range.data.sheets[0];
        console.log(page.data[0].rowData);
        page.data[0].rowData.forEach(row => 
            console.log(util.inspect(row.values[0].formattedValue) + " " + util.inspect(row.values[1].formattedValue))
        );
    });
});


