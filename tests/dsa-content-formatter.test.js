const assert = require('assert');
const formatter = require('../public/dsa-content-formatter');

assert.strictEqual(
    formatter.toSafeHtml('****Expression Evaluation:\\*\\* Use a stack.'),
    '<strong>Expression Evaluation:</strong> Use a stack.'
);
assert.strictEqual(
    formatter.toSafeHtml('**Time complexity:** `O(n)`'),
    '<strong>Time complexity:</strong> <code>O(n)</code>'
);
assert.strictEqual(
    formatter.toSafeHtml('<img src=x onerror=alert(1)> **safe**'),
    '&lt;img src=x onerror=alert(1)&gt; <strong>safe</strong>'
);

console.log('DSA content formatting tests passed.');
