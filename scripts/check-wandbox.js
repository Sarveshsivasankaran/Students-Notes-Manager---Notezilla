const compilerService = require('../compiler-service');

const checks = [
    {
        language: 'python',
        code: 'import sys\nvalues = sys.stdin.read().strip().split()\nprint(" ".join(reversed(values)))',
        input: '5 -2 8 0',
        expected_output: '0 8 -2 5'
    },
    {
        language: 'c',
        code: '#include <stdio.h>\nint main(void){int values[1000],count=0; while(count<1000 && scanf("%d",&values[count])==1)count++; for(int i=count-1;i>=0;i--){if(i<count-1)printf(" "); printf("%d",values[i]);} printf("\\n"); return 0;}',
        input: '5 -2 8 0',
        expected_output: '0 8 -2 5'
    },
    {
        language: 'cpp',
        code: '#include <algorithm>\n#include <iostream>\n#include <vector>\nusing namespace std; int main(){vector<long long> values; long long value; while(cin>>value)values.push_back(value); reverse(values.begin(),values.end()); for(size_t i=0;i<values.size();i++){if(i)cout<<" "; cout<<values[i];} cout<<"\\n"; return 0;}',
        input: '5 -2 8 0',
        expected_output: '0 8 -2 5'
    },
    {
        language: 'java',
        code: 'import java.util.*; public class Main { public static void main(String[] args) { Scanner scanner = new Scanner(System.in); List<String> values = new ArrayList<>(); while(scanner.hasNext()) values.add(scanner.next()); Collections.reverse(values); System.out.println(String.join(" ", values)); } }',
        input: '5 -2 8 0',
        expected_output: '0 8 -2 5'
    }
];

(async () => {
    for (const check of checks) {
        const startedAt = Date.now();
        const execution = await compilerService.executeCode(check.code, check.language, [check]);
        const result = execution.results[0];
        if (!result?.passed) {
            throw new Error(`${check.language} failed with ${result?.status}: ${result?.stderr || result?.stdout || 'no output'}`);
        }
        console.log(`${check.language}: PASS (${execution.compiler}, ${Date.now() - startedAt}ms)`);
    }
    console.log('Wandbox compiler sandbox is healthy.');
})().catch(error => {
    console.error(`Wandbox check failed: ${error.message}`);
    process.exitCode = 1;
});
