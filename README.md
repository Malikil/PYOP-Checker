Pick Your Own Pool Tournament Bot
===

This bot was initially made to help check and manage maps for the Pick Your Own Pool tournament that I've hosted for the last few years. But I'm trying to make it more versatile and useable for various situations where having players pick their maps is a core theme of the tournament.

## Setup
The bot isn't server smart, so using it will require you to set up a discord bot account, a mongodb database, and something like heroku for hosting. This process is a little involved, especially if you're not familiar with these kinds of platforms already.  
I'll be using Heroku and MongoDB Atlas here, but if you have different services you prefer you can use them instead.  

### Creating the discord bot
1. Go to https://discord.com/developers/applications to create an application
2. Go to the `Bot` tab to create a bot account for the app
3. Add the bot to your server by going to the `OAuth2` tab
    1. Select `bot` from the scopes box
    2. Copy the generated link and paste it in your browser
    3. Select which server to add the bot to

### Setting up Mongodb
1. Go to https://cloud.mongodb.com/user#/atlas/login and log in or make an account
2. Make an organization, and a project in that org
3. Create a cluster for your org.
    * The default free cluster should be enough for player/map information
    * Choose a name for the cluster
4. Go to `Database Access` to create access credentials for the bot
    * Make a note of the username and password used, you will add them to a file later
    * Other than that you won't need to remember them, so a secure password is good
5. Go to `Network Access` to set what IP addresses will be allowed to try to access the database.  
    Heroku doesn't have a static IP by default, and from what I saw you can't guarantee the ip will come from any specific range either.  
    So add 0.0.0.0/0 as an allowed IP

### Setting up Heroku
1. Go to https://www.heroku.com/ and log in or sign up
2. From the dashboard, create a new app
    * The name isn't important, use whatever you want or leave the box blank for a generated name
3. In `Settings` reveal config vars and add all the environment variables below
    * If you have the Heroku CLI you can add multiple vars at a time using command line.  
        To do so, clone the repo first and add heroku as a remote. Then use the command `heroku config:set KEY=VALUE KEY=VALUE ...`
4. There are two ways to deploy the code, you can download this repo to your computer then push to Heroku, or fork this repo and let Heroku find it on its own.
    * If you have [git](https://git-scm.com/) installed:
        1. clone this repo to your own computer
        2. add `https://git.heroku.com/<app name>.git` as a remote
        3. push to heroku

        Using git is a bit more detailed than I want to get into here. If you don't know what to do then look it up or ask someone for help.
    * If you don't have git or if you want to fork:
        1. In the top right corner of the GitHub page there's a button to fork the repo
        2. In Heroku under `Deploy`, select "Connect to GitHub" as the deployment method
        3. Connect your GitHub account. Search for and connect your forked repo
        4. Click "Deploy Branch" at the bottom

Heroku limits how many free hours you get per month. The base amount isn't enough to run an app all the time. Adding a credit card to your Heroku account doubles the amount of free hours you get so there is enough to run an app 24/7, and the `Resources` tab will let you turn off the app when it's not needed.

### Setting up Google Sheets

TODO

## Environment Variables
The bot uses the following environment variables. Heroku will load these from .env when running locally, or from the app's settings when running online.

The .env file is just a bunch of key/value pairs, it will look something like this:  
```
BANCHO_PASS=123456789
BANCHO_USER=Malikil
CHALLONGE_KEY=123456789
CHANNEL_ANNOUNCEMENTS=123456789
...
```

* `BANCHO_PASS` The IRC password for the account the bot uses. Keep in mind this is different from your normal osu password. Get your irc password from https://osu.ppy.sh/p/irc
* `BANCHO_USER` Your osu username, or whatever account the bot will be run on
* `CHALLONGE_KEY` Your challonge api key, available from https://challonge.com/settings/developer
* `CHANNEL_ANNOUNCEMENTS` The Discord Channel ID for which channel to make announcements in
* `CHANNEL_SCREENSHOTS` The channel where the bot will post screenshots which players submit for maps
* `CHANNEL_MAPPOOLS` The channel where approver commands are available
* `DISCORD_GUILD` This is the discord server's ID that you're adding the bot to
* `DISCORD_TOKEN` This is the token from the bot tab on the application's developer page. It's not shown on the page by default, you click a button to copy it. After you copy it should look something like `xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxx`
* `DRAIN_BUFFER` How many seconds above/below the drain limit can maps be
* `FIRST_POOLS_DUE` The date in ISO format for when the first week's pool submission should close. ISO format looks like this `yyyy-mm-ddThh:mm:ssZ` for UTC time
* `GOOGLE_APPLICATION_CREDENTIALS` This is the content of the json file Google gave you when setting up a service account to edit sheets. (Need to figure out how to generate this again, and how to shove it into heroku)
* `MONGO_PASS` The password for mongodb. There's a button on the access management page to copy the password for a created user
* `MONGO_URI` The service account link for mongodb. Click 'connect' on the cluser's summary and pick 'Connect your application'. The next page will have a connection string, the part after the @ sign goes here. Replace &lt;dbname&gt; with the name of the database
* `MONGO_USER` The username to use for mongodb
* `OSUKEY` This is your osu api key
* `ROLE_ADMIN` This is the role ID for who has access to the admin commands for the bot
* `ROLE_MAP_APPROVER` This is the role for who has access to approver commands
* `ROLE_PLAYER` This is the role to ping when the bot makes an announcement
* `SPREADSHEET_ID` The spreadsheet id to push maps to. You can copy this from the link when you've got the sheet open. It's the part between `/d/` and `/edit`
