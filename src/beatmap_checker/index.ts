export { Rule } from './rule';
export { default as Checker } from './checker';
import fs = require('fs');
import { RuleConstructor } from './rule';

export const ruleClasses: { [type: string]: RuleConstructor } = {}
export const ruleKeys: string[] = [];
fs.readdir('./dist/beatmap_checker/rules',
    (_, files) => files.filter(f => f.endsWith('.js'))
        .forEach(ruleFile =>
            import(`./rules/${ruleFile}`)
            .then(rule => {
                ruleClasses[rule.type] = rule.default;
                ruleKeys.push(rule.type);
            })
        )
);
