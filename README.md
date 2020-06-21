Pick Your Own Pool Tournament Bot
===

This bot was initially made to help check and manage maps for the Pick Your Own Pool tournament that I've hosted for the last few years. But I'm trying to make it more versatile and useable for various situations where having players pick their maps is a core theme of the tournament.

## Setup
The bot isn't server smart, so using it will require you to set up a discord bot account, a mongodb database, and something like heroku for hosting. This process is a little involved, especially if you're not familiar with these kinds of platforms already.

### Creating the discord bot
1. Go to https://discord.com/developers/applications to create an application
2. Go to the `Bot` tab to create a bot account for the app
3. Add the bot to your server by going to the `OAuth2` tab
    1. Select `bot` from the scopes box
    2. Select `Send Messages` from the permissions box
    3. Copy the generated link and paste it in your browser
    4. Select which server to add the bot to

### Setting up Mongodb
1. Go to https://cloud.mongodb.com/user#/atlas/login and make an account
2. Make an organization, and a project in that org
3. Create a cluster for your org.
    * US East from AWS should theoretically give the best performance when hosting on Heroku
    * Sandbox (M0) should be enough to store the player/map info
    * Choose a name for the cluster
4. Go to `Database Access` to create access credentials for the bot
    * Make sure your passwords are secure. Don't be an idiot. You don't even need to remember this to use to log in.
5. Go to `Network Access` to set what IP addresses will be allowed to try to access the database.  
    Heroku doesn't have a static IP by default, and from what I saw you can't guarantee the ip will come from any specific range either.  
    So even though I _probably_ shouldn't have, add 0.0.0.0/0 as an allowed IP (that means all IPs are allowed)

### Setting up Heroku
I've used Heroku to host the bot for PYOP, you're free to host on whatever platform you want or even on your own computer. But this is where I've done it.

TODO

### Setting up Google Sheets

TODO

## Environment Variables
The bot uses the following environment variables. Heroku will load these from .env when running locally, or from the app's settings when running online.  
A lot of these are planned to eventually be phased out when I get a better system for doing divisions and generating rules, possibly through the bot on discord

The .env file is just a bunch of key/value pairs, it will look something like this:  
```
OSUAPI=https://osu.ppy.sh/api
OSUKEY=1234567890ABCDEF
MIN_STAR=5.0
MAX_STAR=6.0
...
```
* `OSUAPI` Just set to `https://osu.ppy.sh/api`, I'll remove the need for this eventually.  
    Or otherwise make it actually useful, possibly for alternate server support. I haven't looked at how api access to alternate servers works
* `OSUKEY` This is your osu api key
* `MIN_STAR` The lower limit on star range for open division. See note on rules/divisions going forward
* `MAX_STAR` The upper limit on star range for open division
* `FIFT_MIN` The lower limit on star range for 15k division
* `FIFT_MAX` The upper limit on star range for 15k division
* `MIN_LENGTH` The shortest normally allowed drain time for maps, in seconds
* `MAX_LENGTH` The longest normally allowed drain time (seconds)
* `ABSOLUTE_MAX` The longest total length a map can have, including intro time (seconds)
* `MIN_TOTAL` The minimum average drain time for maps in the pool (seconds)
* `MAX_TOTAL` The maximum average drain for maps (seconds)
* `OVER_UNDER_MAX` How many maps can be outside the drain limits in MIN_LENGTH and MAX_LENGTH
* `DRAIN_BUFFER` How many seconds above/below the drain limit can maps be
* `LEADERBOARD` How many scores with the selected mod are needed on the leaderboard for a map to be accepted automatically, for open division
* `FIFT_LEADERBOARD` How many scores on the leaderboard for 15k division
* `MONGO_USER` The username to use for mongodb
* `MONGO_PASS` The password for mongodb. There's a button on the access management page to copy the password for a created user
* `MONGO_URI` The service account link for mongodb. Click 'connect' on the cluser's summary and pick 'Connect your application'. The next page will have a connection string, the part after the @ sign goes here. Replace &lt;dbname&gt; with the name of the database
* `DISCORD_TOKEN` This is the token from the bot tab on the application's developer page. It's not shown on the page by default, you click a button to copy it. After you copy it should look something like `xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxx`
* `DISCORD_GUILD` This is the discord server's ID that you're adding the bot to. Right click on the server and click "Copy ID"
* `ROLE_MAP_APPROVER` This is the role ID for who's going to be checking maps and approving them. Right click the role in the role management page for the server or from the roles of someone who has it and pick Copy ID.
* `ROLE_ADMIN` This is who has access to the admin commands for the bot. Things like locking pools or exporting maps
* `CHANNEL_SCREENSHOTS` Which channel to copy screenshots to when a player submits one. Right click the channel in the channel list and pick Copy ID.
* `GOOGLE_APPLICATION_CREDENTIALS` This is the content of the json file Google gave you when setting up a service account to edit sheets. (Need to figure out how to generate this again, and how to shove it into heroku)
* `SPREADSHEET_ID` The spreadsheet id to push maps to. You can copy this from the link when you've got the sheet open. It's the part between `/d/` and `/edit`
* `BANCHO_USER` Your osu username, or whatever account the bot will be run on
* `BANCHO_PASS` The IRC password for the account the bot uses. Keep in mind this is different from your normal osu password. Get your irc password from https://osu.ppy.sh/p/irc