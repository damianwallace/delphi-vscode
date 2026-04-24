"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Custom Mocha reporter that writes a Markdown pass/fail report to
 * test/results/report.md after every test run.
 */
const Mocha = require("mocha");
const fs = require("fs");
const path = require("path");
const { EVENT_RUN_END, EVENT_TEST_FAIL, EVENT_TEST_PASS, EVENT_TEST_PENDING, EVENT_SUITE_BEGIN, } = Mocha.Runner.constants;
class MarkdownReporter extends Mocha.reporters.Base {
    constructor(runner, options) {
        super(runner, options);
        this.results = [];
        this.currentSuite = '';
        runner.on(EVENT_SUITE_BEGIN, (suite) => {
            if (suite.title)
                this.currentSuite = suite.title;
        });
        runner.on(EVENT_TEST_PASS, (test) => {
            this.results.push({
                suite: this.currentSuite,
                title: test.title,
                result: 'PASS',
                duration: test.duration ?? 0,
            });
        });
        runner.on(EVENT_TEST_FAIL, (test, err) => {
            this.results.push({
                suite: this.currentSuite,
                title: test.title,
                result: 'FAIL',
                duration: test.duration ?? 0,
                error: err.message,
            });
        });
        runner.on(EVENT_TEST_PENDING, (test) => {
            this.results.push({
                suite: this.currentSuite,
                title: test.title,
                result: 'PENDING',
                duration: 0,
            });
        });
        runner.once(EVENT_RUN_END, () => {
            this.writeReport();
        });
    }
    writeReport() {
        const passed = this.results.filter((r) => r.result === 'PASS').length;
        const failed = this.results.filter((r) => r.result === 'FAIL').length;
        const pending = this.results.filter((r) => r.result === 'PENDING').length;
        const total = this.results.length;
        const overall = failed === 0 ? 'PASS' : 'FAIL';
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        // Group results by suite
        const suites = new Map();
        for (const r of this.results) {
            const key = r.suite || '(root)';
            if (!suites.has(key))
                suites.set(key, []);
            suites.get(key).push(r);
        }
        let md = `# Delphi VSCode Extension — Test Results\n\n`;
        md += `**Run:** ${now}  \n`;
        md += `**Branch:** test/validate-all-fixes\n\n`;
        for (const [suiteName, tests] of suites.entries()) {
            md += `## ${suiteName}\n\n`;
            md += `| Test | Result | ms | Error |\n`;
            md += `|------|--------|----|-------|\n`;
            for (const t of tests) {
                const icon = t.result === 'PASS' ? '✅' : t.result === 'FAIL' ? '❌' : '⏭';
                const err = t.error ? t.error.replace(/\n/g, ' ').slice(0, 120) : '';
                md += `| ${t.title} | ${icon} ${t.result} | ${t.duration} | ${err} |\n`;
            }
            md += `\n`;
        }
        md += `## Summary\n\n`;
        md += `| Total | Passed | Failed | Pending |\n`;
        md += `|-------|--------|--------|----------|\n`;
        md += `| ${total} | ${passed} | ${failed} | ${pending} |\n\n`;
        md += `**Overall: ${overall}**\n`;
        const outDir = path.resolve(__dirname, '..', '..', 'test', 'results');
        fs.mkdirSync(outDir, { recursive: true });
        const outFile = path.join(outDir, 'report.md');
        fs.writeFileSync(outFile, md, 'utf8');
        console.log(`\nTest report written to: ${outFile}`);
    }
}
module.exports = MarkdownReporter;
//# sourceMappingURL=reporter.js.map