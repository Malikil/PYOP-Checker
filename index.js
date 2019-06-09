const express = require('express');
const bodyparser = require('body-parser');
const util = require('util');
const disbot = require('./disbot');
const checker = require('./checker');
const app = express();
const port = process.env.PORT || 1337;

// ==============================================================
// ========== These values should be updated each week ==========
// ==============================================================
const minLength = parseInt(process.env.MIN_LENGTH);
const maxLength = parseInt(process.env.MAX_LENGTH);
const absoluteMax = parseInt(process.env.ABSOLUTE_MAX);
const minTotal = parseInt(process.env.MIN_TOTAL);
const maxTotal = parseInt(process.env.MAX_TOTAL);
const overUnderMax = parseInt(process.env.OVER_UNDER_MAX);
const drainBuffer = parseInt(process.env.DRAIN_BUFFER);
const poolSize = parseInt(process.env.POOL_SIZE);
// ==============================================================
// ==============================================================

app.use(bodyparser.json());
app.use(bodyparser.urlencoded({
    extended: true
}));

app.post('/', (req, res) => {
    console.log(`\x1b[36mGot request:\x1b[0m ${util.inspect(req.body)}`);
    var totalDrain = 0;
    Promise.all(req.body.maps.map(info => checker.checkMap(info, req.body.range)))
    .then(results => checker.checkPool(results))
    .then(results => {
        let missing = poolSize - results.length;
        if (totalDrain < (minTotal - (missing * (maxLength - drainBuffer))))
            results.push({
                passed: false,
                reject: {
                    reason: `Total pool drain time is under the ${convertSeconds(minTotal)} minimum. (${convertSeconds(totalDrain)})`
                }
            });
        else if (totalDrain > (maxTotal + (missing * (minLength + drainBuffer))))
            results.push({
                passed: false,
                reject: {
                    reason: `Total pool drain time is above the ${convertSeconds(maxTotal)} maximum. (${convertSeconds(totalDrain)})`
                }
            });
        disbot.rejectMaps(req.body.name, results);
        console.log(`\x1b[32mSent response:\x1b[0m ${util.inspect(results, { depth: 3 })}`);
        res.status(200).json(results);
    }).catch(failed => {
        console.log(failed);
        res.status(500).json(failed);
    });
});

app.listen(port, () => console.log(`Listening on port ${port}`));