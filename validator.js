const MODS = require('./helpers/bitwise');
const divInfo = require('./divisions.json');

/**
 * Validates and converts a string into an args object based on the provided
 * expected args
 * @param {{
 *  arg: string,
 *  required: boolean
 * }[]} expected 
 * @param {string} actual 
 */
function validateArgs(expected, actual) {
    const cmdargs = getArgs(actual).slice(1);
    const validation = {
        rejected: false,
        args: {}
    };
    if (!expected)
        expected = [];

    if (cmdargs.length > expected.length)
        validation.rejected = true;

    // Run through the expected args
    // make sure the required args are present, and all provided args are valid
    expected.forEach((arg, i) => {
        // Arg is required
            // Arg exists        => Validate
            // Arg doesn't exist => Error
        // Arg is not required
            // Arg exists        => Validate
            // Arg doesn't exist => Ignore
            
        if (i < cmdargs.length) {
            // Special 'any' argument type doesn't need to be validated
            if (arg.arg !== 'any') {
                const value = valid[arg.arg].validate(cmdargs[i]);
                if (value || value === 0) {
                    // If we haven't seen this arg yet, add it
                    if (!validation.args[arg.arg])
                        validation.args[arg.arg] = [ value ];
                    else
                        validation.args[arg.arg].push(value);
                }
                else {
                    validation.rejected = true;
                    validation.error = valid[arg.arg].error;
                }
            }
            // 'any' argument type
            else if (!validation.args[arg.name])
                validation.args[arg.name] = [ cmdargs[i] ];
            else
                validation.args[arg.name].push(cmdargs[i]);
        }
        else if (arg.required)
            validation.rejected = true;
    });

    // Run through the args and take singles out of their arrays
    Object.keys(validation.args).forEach(key => {
        if (validation.args[key].length < 2)
            validation.args[key] = validation.args[key][0];
    });
    
    return validation;
}

/**
 * Constructs a useage string for a set of expected arguments
 * @param {{
 *  name: string,
 *  help: string,
 *  args?: {
 *      arg: string,
 *      required: boolean,
 *      name?: string,
 *      description?: string
 *  }[],
 *  alias?: string[]
 * }} command Name of the command
 */
function usageString(command) {
    const seen = [];
    let header = "";
    let description = "";
    let alias = "";
    if (command.args)
        command.args.forEach(arg => {
            // Special 'any' arg type will come with its own description
            if (arg.arg !== "any") {
                if (arg.required)
                    header += ` <${arg.arg}>`;
                else {
                    header += ` [${arg.arg}]`;
                    if (!seen.includes(arg.arg))
                        description += `(Optional) `;
                }
                if (!seen.includes(arg.arg)) {
                    description += `${arg.arg}: ${valid[arg.arg].description}\n`;
                    seen.push(arg.arg);
                }
            }
            // 'any' argument type
            else if (arg.required) {
                header += ` <${arg.name}>`;
                if (!seen.includes(arg.name)) {
                    description += `${arg.name}: ${arg.description}\n`;
                    seen.push(arg.name);
                }
            }
            else {
                header += ` [${arg.name}]`;
                if (!seen.includes(arg.name)) {
                    description += `(Optional) ${arg.name}: ${arg.description}\n`;
                    seen.push(arg.name);
                }
            }
        });
    if (command.alias)
        alias = "Aliases: " + command.alias.reduce((p, c) => `${p}, ${c}`);
    return `Usage: !${command.name}${header}\n${command.description}\n${description}${alias}`;
}

const valid = {
    map: {
        validate(mapString) {
            // If link is already a number then nothing needs to be done
            if (isNaN(mapString))
            {
                // If the link isn't to a beatmap, then ignore it
                // If the link is a /s/ link, ignore it
                // ...ppy.sh/beatmapsets...
                // ...ppy.sh/b/###
                if (mapString && mapString.includes("sh/b"))
                {
                    // Get everything after the last slash, this should be the beatmap id
                    mapString = mapString.substring(mapString.lastIndexOf("/") + 1);
                    // The parseInt function will convert the beginning of a string to a number
                    // until it finds a non-number character
                    mapString = parseInt(mapString);
                }
                else
                    return undefined;
            }
        
            return mapString | 0;
        },
        description: "Beatmap id or link",
        error: "Couldn't recognise beatmap id"
    },
    mods: {
        validate(modstr) {
            let mods = 0;
            modstr = modstr.toUpperCase();
            // Parse mods
            if (modstr.includes('HD'))      mods |= MODS.HD;
            if (modstr.includes('HR'))      mods |= MODS.HR;
            else if (modstr.includes('EZ')) mods |= MODS.EZ;
            if (modstr.includes('NC'))      mods |= MODS.DT | MODS.NC;
            else if (modstr.includes('DT')) mods |= MODS.DT;
            else if (modstr.includes('HT')) mods |= MODS.HT;
            
            return mods;
        },
        description: "Some combination of HD|HR|DT|NM|HT|EZ",
        error: "Couldn't parse mod string"
    },
    division: {
        validate(arg) {
            arg = arg.toLowerCase();
            return divInfo.find(div => div.division === arg);
        },
        description: "open or 10k",
        error: "Invalid division"
    },
    setting: {
        description: "on or off",
        error: "",
        validate(arg) {
            arg = arg.toLowerCase();
            if (["on", "off"].includes(arg))
                return arg;
        }
    },
    playerid: {
        description: "A player ping or osu id or username",
        error: "Could not parse player id",
        validate(playerid) {
            // Id could be a discord mention/ping
            const matches = playerid.match(/^<@!?([0-9]+)>$/);
            if (matches)
                playerid = matches[1];
            // Otherwise just return it as-is. We can't really do anything extra
            return playerid;
        }
    }
}

/**
 * Splits a string into args
 * @param {string} s 
 */
function getArgs(s)
{
    // Handle multiple lines
    let lines = s.split('\n');
    return lines.reduce((arr, str) => {
        let args = str.match(/\\?.|^$/g).reduce((p, c) => {
            if (c === '"')
                p.quote ^= 1;
            else if (!p.quote && c === ' ')
                p.a.push('');
            else
                p.a[p.a.length - 1] += c.replace(/\\(.)/, "$1");
            
            return  p;
        }, { a: [''] }).a;
        return arr.concat(args.reduce((p, c) => c ? p.concat(c) : p, []));
    }, []);
    //str.match(/(?:[^\s"]+|"[^"]*")+/g);
}

module.exports = {
    validateArgs,
    usageString
}
