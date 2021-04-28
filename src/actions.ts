import { Client } from 'discord.js';
import helpers from './helpers/helpers';
import { hours, days } from './helpers/mstime';
import { exportAllMaps } from './gsheets';
import { inspect } from 'util';
import db from './database/db-manager';

export default function (client: Client) {
    // Find the next closing date
    const { lastClose, nextClose, now } = helpers.closingTimes();
    
    const timeDiff = (ms: number) => `${(ms / hours(1)).toFixed(2)} hours`; // Debug
    // Set announcement timers
    const closeTimer = nextClose.getTime() - now.getTime();
    console.log(`Pools closing in ${timeDiff(closeTimer)}`);
    // Warn of pools 6 hours earlier
    const warnTimer = closeTimer - hours(6);
    console.log(`Warning of pool closure in ${timeDiff(warnTimer)}`);
    // Export maps 2 hours later
    let exportTimer = closeTimer + hours(2);
    console.log(`Exporting maps in ${timeDiff(exportTimer)}`);
    // Clear pools 16 hours after closing
    let clearTimer = closeTimer + hours(16);
    console.log(`Clearing pools in ${timeDiff(clearTimer)}`);

    // If these timers haven't happened yet, we need to update the values
    console.log(`Last pools closed ${timeDiff(now.getTime() - lastClose.getTime())} ago`);
    if ((now.getTime() - lastClose.getTime()) < hours(2)) {
        exportTimer -= days(7);
        console.log(`Exporting maps in ${timeDiff(exportTimer)}`);
    }
    if ((now.getTime() - lastClose.getTime()) < hours(16)) {
        clearTimer -= days(7);
        console.log(`Clearing pools in ${timeDiff(clearTimer)}`);
    }
    
    // Set up timers
    if (warnTimer > 0)
        setTimeout(() => {
            console.log("\x1b[33mPools:\x1b[0m Warning of pool closure");
            const guild = client.guilds.cache.get(process.env.DISCORD_GUILD);
            const announceChannel = guild.channels.cache.get(process.env.CHANNEL_ANNOUNCEMENTS);
            const playerRole = guild.roles.cache.get(process.env.ROLE_PLAYER);
            const announcement = `${playerRole} Pools will be closing in 6 hours. Make sure to submit ` +
                `your pools if you haven't done so already. Also don't forget to submit screenshots ` +
                `for any unranked maps or maps without enough scores on the leaderboard.\nIf some of ` +
                `your maps needed screenshots of passes and you didn't submit passes from two ` +
                `different players, there is no guarantee that we will include them in your final pool.`;
            if (announceChannel && announceChannel.isText())
                announceChannel.send(announcement);
            else
                console.error("Announcement channel not found");
        }, warnTimer);
    if (closeTimer > 0)
        setTimeout(() => {
            console.log("\x1b[33mPools:\x1b[0m Closing pools");
            const guild = client.guilds.cache.get(process.env.DISCORD_GUILD);
            const announceChannel = guild.channels.cache.get(process.env.CHANNEL_ANNOUNCEMENTS);
            //const playerRole = guild.roles.cache.get(process.env.ROLE_PLAYER);
            const announcement = `Pools are now closed! You can still submit passes ` +
                `through the bot for another hour, but current maps are locked. If a map gets rejected ` +
                `you will still have the opportunity to replace it. If a map that needed screenshots ` +
                `gets rejected we'll just replace it, you won't get to pick a new map.\n` +
                `Pools will be released around 17:00.`;
            if (announceChannel && announceChannel.isText())
                announceChannel.send(announcement);
            else
                console.error("Announcement channel not found");
        }, closeTimer);
    if (exportTimer > 0)
        setTimeout(() => {
            console.log("\x1b[33mPools:\x1b[0m Exporting maps");
            const guild = client.guilds.cache.get(process.env.DISCORD_GUILD);
            const mappoolChannel = guild.channels.cache.get(process.env.CHANNEL_MAPPOOLS);
            const announcement = `Exporting maps to sheets.`;
            if (mappoolChannel && mappoolChannel.isText())
                mappoolChannel.send(announcement);
            else
                console.error("Mappools channel not found");
            // Export the maps
            exportAllMaps()
            .catch(err => {
                console.error(err);
                if (mappoolChannel && mappoolChannel.isText())
                    mappoolChannel.send(`\`\`\`${inspect(err).slice(0, 1200)}\`\`\``);
            });
        }, exportTimer);
    if (clearTimer > 0)
        setTimeout(() => {
            console.log("\x1b[33mPools:\x1b[0m Clearing pools");
            const guild = client.guilds.cache.get(process.env.DISCORD_GUILD);
            const mappoolChannel = guild.channels.cache.get(process.env.CHANNEL_MAPPOOLS);
            const announcement = "Clearing old pools";
            if (mappoolChannel && mappoolChannel.isText())
                mappoolChannel.send(announcement);
            else
                console.error("Mappools channel not found");

            // Clear the pools
            db.archiveMaps()
            .catch(err => {
                console.error(err);
                if (mappoolChannel && mappoolChannel.isText())
                    mappoolChannel.send(`\`\`\`${inspect(err).slice(0, 1200)}\`\`\``);
            });
        }, clearTimer);

    // I think heroku restarts itself every day, so I can cheat a bit and
    // not actually add these as recurring intervals.
    // If it turns out I'm wrong then I'll have to fix it somehow.
}