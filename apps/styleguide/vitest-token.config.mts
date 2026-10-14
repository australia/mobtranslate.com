import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['tests/token-references.test.ts'],maxWorkers:1,fileParallelism:false}});
