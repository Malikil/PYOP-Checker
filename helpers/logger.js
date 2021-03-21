const { inspect } = require('util');

module.exports = {
    log(message, tag) {
        let str = message;
        if (typeof str !== 'string')
            str = inspect(message, false, 3, true);
        if (tag)
            str = `\x1b[32m${tag}\x1b[0m  ${str}`;
        console.log(str);
    },

    error(message, tag) {
        let str = message;
        if (typeof str !== 'string')
            str = inspect(message, false, 3, true);
        if (tag)
            str = `\x1b[32m${tag}\x1b[0m  ${str}`;
        console.error(str);
    }
}