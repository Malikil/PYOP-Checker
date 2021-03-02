const MODS = require('./helpers/bitwise');

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
    const args = {
        rejected: false
    };
    if (!expected)
        expected = [];

    if (cmdargs.length > expected.length)
        args.rejected = true;

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
            const value = valid[arg.arg].validate(cmdargs[i]);
            if (value)
                args[arg.arg] = value;
            else {
                args.rejected = true;
                args.error = valid[arg.arg].error;
            }
        }
        else if (arg.required)
            args.rejected = true;
    });
    
    return args;
}

/**
 * Constructs a useage string for a set of expected arguments
 * @param {{
 *  name: string,
 *  help: string,
 *  args?: {
 *      arg: string,
 *      required?: boolean
 *  }[],
 *  alias?: string[]
 * }} command Name of the command
 */
function usageString(command) {
    let header = "";
    let description = "";
    let alias = "";
    if (command.args)
        command.args.forEach(arg => {
            if (arg.required) {
                header += ` <${arg.arg}>`;
                description += `\n${arg.arg}: ${valid[arg.arg].description}`;
            }
            else {
                header += ` [${arg.arg}]`;
                description += `\n(Optional) ${arg.arg}: ${valid[arg.arg].description}`;
            }
        });
    if (command.alias)
        alias = "\nAliases: " + command.alias.reduce((p, c) => `${p}, ${c}`);
    return `Usage: !${command.name}${header}\n${command.description}${description}${alias}`;
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
            if (modstr.includes('DT'))      mods |= MODS.DT;
            else if (modstr.includes('NC')) mods |= MODS.NC | MODS.DT;
            else if (modstr.includes('HT')) mods |= MODS.HT;
            
            let pool = 'cm';
            if (!modstr.includes("CM"))
                switch (mods)
                {
                    case 0:       pool = "nm"; break;
                    case MODS.HD: pool = "hd"; break;
                    case MODS.HR: pool = "hr"; break;
                    case MODS.DT: pool = "dt"; break;
                }

            return { mods, pool };
        },
        description: "Some combination of HD|HR|DT|CM|NM|HT|EZ",
        error: "Couldn't parse mod string"
    },
    division: {
        validate(arg) {
            arg = arg.toLowerCase();
            if (["open", "10k"].includes(arg))
                return arg;
            else
                return undefined;
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
            else
                return undefined;
        }
    },
    link: {
        description: "",
        error: "Link not recognised",
        validate(arg) {
            if (arg.includes("http"))
                return arg;
            else
                return undefined;
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
