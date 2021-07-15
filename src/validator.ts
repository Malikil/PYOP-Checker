import { CommandArg, Command } from './types/commands';
import helpers from './helpers/helpers';

/**
 * Validates and converts a string into an args object based on the provided
 * expected args
 */
export function validateArgs(expected: CommandArg[], actual: string) {
    const cmdargs = getArgs(actual).slice(1);
    const validation: {
        rejected: boolean,
        args: { [key: string]: any },
        error?: string
    } = {
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
            // If we have a validation for the arg, perform that validation
            const argValid = valid[arg.arg];
            if (argValid) {
                const value = argValid.validate(cmdargs[i]);
                if (value || value === 0) {
                    // If we haven't seen this arg yet, add it
                    if (!validation.args[arg.arg])
                        validation.args[arg.arg] = [ value ];
                    else
                        validation.args[arg.arg].push(value);
                }
                else {
                    validation.rejected = true;
                    validation.error = argValid.error;
                }
            }
            // unknown argument types
            else if (!validation.args[arg.arg])
                validation.args[arg.arg] = [ cmdargs[i] ];
            else
                validation.args[arg.arg].push(cmdargs[i]);
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
 * @param command Name of the command
 */
export function usageString(command: Command) {
    const seen = [];
    let header = "";
    let description = "";
    let alias = "";
    if (command.args)
        command.args.forEach(arg => {
            // If the arg isn't known by the validator it needs to provide its own usage string
            const argValid = valid[arg.arg];
            if (argValid) {
                if (arg.required)
                    header += ` <${arg.arg}>`;
                else {
                    header += ` [${arg.arg}]`;
                    if (!seen.includes(arg.arg))
                        description += `(Optional) `;
                }
                if (!seen.includes(arg.arg)) {
                    description += `${arg.arg}: ${argValid.description}\n`;
                    seen.push(arg.arg);
                }
            }
            // 'any' argument type
            else if (arg.required) {
                header += ` <${arg.arg}>`;
                if (!seen.includes(arg.arg)) {
                    description += `${arg.arg}: ${arg.description || "No description available."}\n`;
                    seen.push(arg.arg);
                }
            }
            else {
                header += ` [${arg.arg}]`;
                if (!seen.includes(arg.arg)) {
                    description += `(Optional) ${arg.arg}: ${arg.description || "No description available."}\n`;
                    seen.push(arg.arg);
                }
            }
        });
    if (command.alias)
        alias = "Aliases: " + command.alias.reduce((p, c) => `${p}, ${c}`);
    return `Usage: !${command.name}${header}\n${command.description}\n${description}${alias}`;
}

const valid: {
    [key: string]: {
        validate: (input: string) => any,
        description: string,
        error: string
    }
} = {
    map: {
        validate: mapString => helpers.parseMapId(mapString),
        description: "Beatmap id or link",
        error: "Couldn't recognise beatmap id"
    },
    mods: {
        validate: modstr => helpers.parseMod(modstr),
        description: "Some combination of HD|HR|DT|NM|HT|EZ",
        error: "Couldn't parse mod string"
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
 */
function getArgs(s: string)
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
            
            return p;
        }, { a: [''], quote: undefined }).a;
        return arr.concat(args.reduce((p, c) => c ? p.concat(c) : p, []));
    }, []);
    //str.match(/(?:[^\s"]+|"[^"]*")+/g);
}
