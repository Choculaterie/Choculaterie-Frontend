import { defineConfig } from 'orval';

export default defineConfig({
    backend: {
        input: {
            target: 'http://localhost:5289/openapi/v1.json',
        },
        output: {
            target: './src/app/api/generated.ts',
            client: 'angular',
            mode: 'tags',
        },
    },
});
