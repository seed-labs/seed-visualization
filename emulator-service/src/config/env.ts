import path from 'path';
import dotenv from 'dotenv';

let loaded = false;

function loadEnvFile(filePath: string, override: boolean) {
    dotenv.config({
        path: filePath,
        override,
        quiet: true,
    });
}

export function getBackendMode(env: NodeJS.ProcessEnv = process.env): string {
    if (env.BACKEND_ENV) return env.BACKEND_ENV;
    if (env.NODE_ENV && env.NODE_ENV !== 'test') return env.NODE_ENV;
    return 'development';
}

export function loadBackendEnv(env: NodeJS.ProcessEnv = process.env) {
    if (loaded) return;

    const envDir = env.BACKEND_ENV_DIR || path.resolve(process.cwd(), 'env');
    const mode = getBackendMode(env);
    const originalValues = {...env};

    loadEnvFile(path.join(envDir, '.env'), false);
    loadEnvFile(path.join(envDir, `.env.${mode}`), true);

    Object.keys(originalValues).forEach((key) => {
        env[key] = originalValues[key];
    });

    loaded = true;
}
