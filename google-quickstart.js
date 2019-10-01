const {google} = require('googleapis');
const sheets = google.sheets('v4');
process.env.GOOGLE_APPLICATION_CREDENTIALS = './gsheet-credentials.json';

const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

auth.getClient().then(authClient => {
    auth.getProjectId().then(project => {
        console.log(project);
    });
    console.log(authClient);
});

