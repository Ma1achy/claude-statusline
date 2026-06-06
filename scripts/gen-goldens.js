// Regenerate test/golden/*.txt from the current built statusline.js.
// Run after an intentional behavior change:  node scripts/gen-goldens.js
'use strict';
const fs = require('fs');
const path = require('path');
const { setupFixture, cleanup, run, CASES } = require('../test/harness');

const dir = path.join(__dirname, '..', 'test', 'golden');
fs.mkdirSync(dir, { recursive: true });
const fix = setupFixture();
try {
  for (const [name, env] of CASES) {
    fs.writeFileSync(path.join(dir, `${name}.txt`), run(fix, env));
  }
} finally {
  cleanup(fix);
}
console.log(`wrote ${CASES.length} golden snapshots to test/golden/`);
