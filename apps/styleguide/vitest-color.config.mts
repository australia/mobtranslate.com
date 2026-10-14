import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['tests/color-model.test.ts'],pool:'threads',maxWorkers:1,fileParallelism:false,server:{deps:{inline:['@material/material-color-utilities']}}}});
